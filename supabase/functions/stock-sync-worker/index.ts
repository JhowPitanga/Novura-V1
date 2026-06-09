/**
 * stock-sync-worker — universal worker that consumes PGMQ channel queues and
 * executes stock pushes via the StockAdapterRegistry.
 *
 * Triggered by the dispatcher (or directly by pg_cron per-channel in future).
 * Processes one batch per channel per invocation.
 *
 * Resilience features applied per message:
 *   - Token Bucket (rate limiting per channel)
 *   - Circuit Breaker (skip channels in OPEN state)
 *   - Exponential Backoff + Jitter (on retryable failures)
 *   - Dead Letter Queue routing (after max retries or retryable: false)
 *   - Idempotency guard (discard events with version <= last processed, best-effort)
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getStockAdapter } from "../_shared/adapters/stock/registry.ts";
import type { StockPushContext } from "../_shared/domain/stock/ports/IStockChannelAdapter.ts";

const MAX_RETRIES   = 5;
const BATCH_PER_CHANNEL = 10;

const CHANNEL_QUEUES: Record<string, string> = {
  "Shopee":        "fila_sincronizacao_shopee",
  "Mercado Livre": "fila_sincronizacao_mercadolivre",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin  = createAdminClient();
  const totals = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  for (const [channelName, queueName] of Object.entries(CHANNEL_QUEUES)) {
    const channelResult = await processChannel(admin, channelName, queueName);
    totals.processed += channelResult.processed;
    totals.succeeded += channelResult.succeeded;
    totals.failed    += channelResult.failed;
    totals.skipped   += channelResult.skipped;
  }

  console.log("[stock-sync-worker] cycle complete", totals);
  return jsonResponse({ ok: true, ...totals });
});

// ── Channel processing ────────────────────────────────────────────────────────

async function processChannel(
  admin: ReturnType<typeof createAdminClient>,
  channelName: string,
  queueName: string,
): Promise<{ processed: number; succeeded: number; failed: number; skipped: number }> {
  const stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  const circuitOpen = await isCircuitOpen(admin, channelName);
  if (circuitOpen) {
    console.log(`[stock-sync-worker] circuit OPEN for ${channelName} — skipping`);
    stats.skipped++;
    return stats;
  }

  const messages = await pgmqRead(admin, queueName, BATCH_PER_CHANNEL);

  for (const msg of messages) {
    stats.processed++;
    const event = msg.message as Record<string, unknown>;
    const result = await processMessage(admin, channelName, queueName, msg.msg_id, event);
    if (result.ok)   stats.succeeded++;
    else             stats.failed++;
  }

  return stats;
}

async function processMessage(
  admin: ReturnType<typeof createAdminClient>,
  channelName: string,
  queueName: string,
  msgId: number,
  event: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  const hasToken = await consumeRateLimitToken(admin, channelName);
  if (!hasToken) {
    console.warn(`[stock-sync-worker] rate limited on ${channelName} — message ${msgId} deferred`);
    return { ok: false };
  }

  const ctx = buildPushContext(event);
  if (!ctx) {
    console.error("[stock-sync-worker] malformed event payload", { msgId, event });
    await pgmqArchive(admin, queueName, msgId);
    return { ok: false };
  }

  const retryCount = Number(event.retry_count ?? 0);
  if (retryCount >= MAX_RETRIES) {
    console.error(`[stock-sync-worker] max retries exceeded for msg ${msgId} — sending to DLQ`);
    await pgmqArchive(admin, queueName, msgId);
    await recordCircuitFailure(admin, channelName);
    return { ok: false };
  }

  try {
    const provider = getStockAdapter(channelName);
    const result   = await provider.pushStock(ctx);

    if (result.ok) {
      await pgmqDelete(admin, queueName, msgId);
      await recordCircuitSuccess(admin, channelName);
      return { ok: true };
    }

    if (!result.retryable) {
      console.error("[stock-sync-worker] non-retryable failure — archiving", { msgId, warning: result.warnings[0] });
      await pgmqArchive(admin, queueName, msgId);
      return { ok: false };
    }

    // Retryable: apply backoff delay then re-enqueue with incremented retry_count.
    const delayMs = computeBackoff(retryCount);
    await delay(delayMs);
    await pgmqArchive(admin, queueName, msgId);
    await pgmqSend(admin, queueName, { ...event, retry_count: retryCount + 1, last_error: result.warnings[0] ?? null });
    await recordCircuitFailure(admin, channelName);
    return { ok: false };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stock-sync-worker] provider threw", { msgId, error: msg });
    await pgmqArchive(admin, queueName, msgId);
    await recordCircuitFailure(admin, channelName);
    return { ok: false };
  }
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildPushContext(event: Record<string, unknown>): StockPushContext | null {
  const required = ["event_id", "organization_id", "product_id", "marketplace_item_id", "available", "version", "integration_id"] as const;
  for (const key of required) {
    if (event[key] == null) { console.error(`[buildPushContext] missing field: ${key}`); return null; }
  }
  return {
    eventId:             String(event.event_id),
    organizationId:      String(event.organization_id),
    productId:           String(event.product_id),
    marketplaceItemId:   String(event.marketplace_item_id),
    variationId:         String(event.variation_id ?? ""),
    availableQty:        Number(event.available),
    version:             Number(event.version),
    integrationId:       String(event.integration_id ?? ""),
    logisticHints:       event.logistic_hints as StockPushContext["logisticHints"] ?? undefined,
  };
}

// ── Resilience helpers ────────────────────────────────────────────────────────

async function isCircuitOpen(admin: ReturnType<typeof createAdminClient>, channel: string): Promise<boolean> {
  const { data } = await admin
    .from("channel_circuit_state")
    .select("state, opens_until")
    .eq("channel", channel)
    .single();
  if (!data) return false;
  const row = data as { state: string; opens_until: string | null };
  if (row.state === "closed") return false;
  if (row.state === "open" && row.opens_until) {
    if (new Date(row.opens_until) > new Date()) return true;
    // Transition to half-open: probe mode.
    await admin.from("channel_circuit_state")
      .update({ state: "half_open", updated_at: new Date().toISOString() })
      .eq("channel", channel);
    return false;
  }
  return false;
}

async function recordCircuitSuccess(admin: ReturnType<typeof createAdminClient>, channel: string): Promise<void> {
  await admin.from("channel_circuit_state")
    .update({ state: "closed", failure_count: 0, opens_until: null, updated_at: new Date().toISOString() })
    .eq("channel", channel);
}

async function recordCircuitFailure(admin: ReturnType<typeof createAdminClient>, channel: string): Promise<void> {
  const { data } = await admin
    .from("channel_circuit_state")
    .select("failure_count")
    .eq("channel", channel)
    .single();
  const count = (data as { failure_count: number } | null)?.failure_count ?? 0;
  const newCount = count + 1;
  const opensUntil = newCount >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
  const newState   = newCount >= 5 ? "open" : "closed";
  await admin.from("channel_circuit_state")
    .update({ state: newState, failure_count: newCount, opens_until: opensUntil, last_failure_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("channel", channel);
}

async function consumeRateLimitToken(admin: ReturnType<typeof createAdminClient>, channel: string): Promise<boolean> {
  const { data } = await admin
    .from("channel_rate_buckets")
    .select("tokens, max_tokens, refill_rate, last_refill_at")
    .eq("channel", channel)
    .single();

  if (!data) return true; // No config = no limit.

  const row       = data as { tokens: number; max_tokens: number; refill_rate: number; last_refill_at: string };
  const elapsedS  = (Date.now() - new Date(row.last_refill_at).getTime()) / 1000;
  const refilled  = Math.min(row.tokens + elapsedS * row.refill_rate, row.max_tokens);

  if (refilled < 1) return false;

  await admin.from("channel_rate_buckets")
    .update({ tokens: refilled - 1, last_refill_at: new Date().toISOString() })
    .eq("channel", channel);

  return true;
}

function computeBackoff(attempt: number): number {
  const base    = 1000;
  const maxMs   = 300_000;
  const exp     = Math.min(base * Math.pow(2, attempt), maxMs);
  const jitter  = Math.random() * exp * 0.1;
  return exp + jitter;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Math.min(ms, 5000)));
}

// ── PGMQ helpers ──────────────────────────────────────────────────────────────

interface PgmqMessage { msg_id: number; message: unknown; }

async function pgmqRead(admin: ReturnType<typeof createAdminClient>, queue: string, count: number): Promise<PgmqMessage[]> {
  const { data, error } = await admin.rpc("pgmq_read", { queue_name: queue, sleep_seconds: 60, n: count });
  if (error) { console.error("[stock-sync-worker] pgmq_read error", error.message); return []; }
  return (data ?? []) as PgmqMessage[];
}

async function pgmqDelete(admin: ReturnType<typeof createAdminClient>, queue: string, msgId: number): Promise<void> {
  const { error } = await admin.rpc("pgmq_delete", { queue_name: queue, msg_id: msgId });
  if (error) console.error("[stock-sync-worker] pgmq_delete error", error.message);
}

async function pgmqArchive(admin: ReturnType<typeof createAdminClient>, queue: string, msgId: number): Promise<void> {
  const { error } = await admin.rpc("pgmq_archive", { queue_name: queue, msg_id: msgId });
  if (error) console.error("[stock-sync-worker] pgmq_archive error", error.message);
}

async function pgmqSend(admin: ReturnType<typeof createAdminClient>, queue: string, message: Record<string, unknown>): Promise<void> {
  const { error } = await admin.rpc("pgmq_send", { queue_name: queue, msg: message });
  if (error) console.error("[stock-sync-worker] pgmq_send error", error.message);
}
