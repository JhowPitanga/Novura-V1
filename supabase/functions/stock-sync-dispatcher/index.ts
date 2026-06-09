/**
 * stock-sync-dispatcher — reads stock_sync_outbox and fans out to PGMQ channel queues.
 *
 * Triggered by pg_cron every 30 seconds.
 *
 * For each unprocessed outbox entry:
 *   1. Resolve marketplace_item_product_links (gate): if no link exists, discard and audit.
 *   2. For each linked channel, enqueue a typed event to the corresponding PGMQ queue.
 *   3. Enqueue a copy to fila_auditoria_estoque for full traceability.
 *   4. Mark outbox entry as processed.
 *
 * CRITICAL: This function NEVER calculates stock. It reads available_snapshot from
 * stock_sync_outbox (already computed by the Core ERP) and forwards it verbatim.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";

const CHANNEL_QUEUE_MAP: Record<string, string> = {
  "Shopee":        "fila_sincronizacao_shopee",
  "Mercado Livre": "fila_sincronizacao_mercadolivre",
};

const AUDIT_QUEUE   = "fila_auditoria_estoque";
const BATCH_SIZE    = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  const stats = { dispatched: 0, discarded: 0, errors: 0 };

  try {
    const entries = await fetchPendingOutbox(admin);
    for (const entry of entries) {
      await processEntry(admin, entry, stats);
    }
    console.log("[stock-sync-dispatcher] batch complete", stats);
    return jsonResponse({ ok: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stock-sync-dispatcher] fatal error", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});

// ── Core logic ────────────────────────────────────────────────────────────────

async function processEntry(
  admin: ReturnType<typeof createAdminClient>,
  entry: OutboxRow,
  stats: { dispatched: number; discarded: number; errors: number },
): Promise<void> {
  try {
    // Mark as processing to prevent duplicate dispatch under concurrent invocations.
    await admin.from("stock_sync_outbox")
      .update({ processing_at: new Date().toISOString() })
      .eq("id", entry.id)
      .is("processing_at", null);

    const links = await resolveLinks(admin, entry.product_id, entry.organization_id);

    if (!links.length) {
      await auditNoLink(admin, entry);
      await markProcessed(admin, entry.id);
      stats.discarded++;
      return;
    }

    for (const link of links) {
      const queueName = CHANNEL_QUEUE_MAP[link.marketplace_name];
      if (!queueName) continue;

      const event = buildEvent(entry, link);
      await pgmqSend(admin, queueName, event);
    }

    await pgmqSend(admin, AUDIT_QUEUE, buildAuditEvent(entry, links));
    await markProcessed(admin, entry.id);
    stats.dispatched++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stock-sync-dispatcher] entry error", { id: entry.id, error: msg });
    stats.errors++;
  }
}

// ── Database helpers ──────────────────────────────────────────────────────────

interface OutboxRow {
  id: string;
  organization_id: string;
  product_id: string;
  storage_id: string;
  available_snapshot: number;
  version: number;
}

interface LinkRow {
  marketplace_name: string;
  marketplace_item_id: string;
  variation_id: string;
  organizations_id: string;
}

async function fetchPendingOutbox(admin: ReturnType<typeof createAdminClient>): Promise<OutboxRow[]> {
  const { data, error } = await admin
    .from("stock_sync_outbox")
    .select("id, organization_id, product_id, storage_id, available_snapshot, version")
    .eq("processed", false)
    .is("processing_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(`fetchPendingOutbox: ${error.message}`);
  return (data ?? []) as OutboxRow[];
}

async function resolveLinks(
  admin: ReturnType<typeof createAdminClient>,
  productId: string,
  organizationId: string,
): Promise<LinkRow[]> {
  const { data, error } = await admin
    .from("marketplace_item_product_links")
    .select("marketplace_name, marketplace_item_id, variation_id, organizations_id")
    .eq("product_id", productId)
    .eq("organizations_id", organizationId);

  if (error) {
    console.error("[stock-sync-dispatcher] resolveLinks error", error.message);
    return [];
  }
  return (data ?? []) as LinkRow[];
}

async function auditNoLink(
  admin: ReturnType<typeof createAdminClient>,
  entry: OutboxRow,
): Promise<void> {
  console.warn("[stock-sync-dispatcher] sem_vinculo", {
    product_id: entry.product_id,
    organization_id: entry.organization_id,
    available_snapshot: entry.available_snapshot,
  });
  // Audit record for observability (best-effort, non-blocking).
  await admin.from("inventory_transactions")
    .insert({
      organizations_id: entry.organization_id,
      product_id:       entry.product_id,
      storage_id:       entry.storage_id,
      movement_type:    "SAIDA",   // closest available type; reason_code identifies the real intent
      quantity_change:  0,
      timestamp:        new Date().toISOString(),
      source_ref:       `SYNC_DESCARTADO[sem_vinculo][product=${entry.product_id}]`,
    })
    .throwOnError()
    .then(() => {})
    .catch((e) => console.warn("[stock-sync-dispatcher] audit insert failed", e?.message));
}

async function markProcessed(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<void> {
  await admin.from("stock_sync_outbox")
    .update({ processed: true, updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function pgmqSend(
  admin: ReturnType<typeof createAdminClient>,
  queue: string,
  message: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.rpc("pgmq_send", { queue_name: queue, msg: message });
  if (error) throw new Error(`pgmq_send to ${queue} failed: ${error.message}`);
}

// ── Event builders ────────────────────────────────────────────────────────────

function buildEvent(entry: OutboxRow, link: LinkRow): Record<string, unknown> {
  return {
    event_id:            crypto.randomUUID(),
    event_type:          "estoque.atualizado.v1",
    schema_version:      1,
    organization_id:     entry.organization_id,
    product_id:          entry.product_id,
    storage_id:          entry.storage_id,
    marketplace_name:    link.marketplace_name,
    marketplace_item_id: link.marketplace_item_id,
    variation_id:        link.variation_id ?? "",
    // available is always the Core ERP snapshot — never recalculated here.
    available:           entry.available_snapshot,
    version:             entry.version,
    source_outbox_id:    entry.id,
    emitted_at:          new Date().toISOString(),
  };
}

function buildAuditEvent(entry: OutboxRow, links: LinkRow[]): Record<string, unknown> {
  return {
    event_type:      "estoque.auditoria.v1",
    organization_id: entry.organization_id,
    product_id:      entry.product_id,
    available:       entry.available_snapshot,
    version:         entry.version,
    channels:        links.map(l => l.marketplace_name),
    emitted_at:      new Date().toISOString(),
  };
}
