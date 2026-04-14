import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getStr } from "../_shared/adapters/infra/object-utils.ts";

/**
 * inventory-jobs-worker — processes pending consume/refund jobs.
 *
 * Supports both order tables:
 *   1. New:    public.orders            (orders-queue-worker pipeline)
 *   2. Legacy: marketplace_orders_presented_new  (older pipeline, still active)
 *
 * For new orders, storage_id is read from orders.storage_id (resolved by
 * ResolveOrderWarehouseUseCase). For legacy orders, fn_get_default_storage
 * is used as fallback.
 *
 * All stock RPCs (v2) are idempotent and have their own DEFAULT NULL fallback.
 */

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}

interface OrderLookupResult {
  orgId: string;
  storageId: string | null;
  source: "orders" | "legacy";
}

async function lookupOrder(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<OrderLookupResult | null> {
  // 1. Try new orders table first.
  const { data: newOrder } = await (admin as any)
    .from("orders")
    .select("organization_id, storage_id")
    .eq("id", orderId)
    .maybeSingle();

  if (newOrder?.organization_id) {
    return {
      orgId: newOrder.organization_id as string,
      storageId: (newOrder.storage_id as string | null) ?? null,
      source: "orders",
    };
  }

  // 2. Fall back to legacy table.
  const { data: legacyOrder } = await (admin as any)
    .from("marketplace_orders_presented_new")
    .select("organizations_id")
    .eq("id", orderId)
    .maybeSingle();

  if (legacyOrder?.organizations_id) {
    return {
      orgId: legacyOrder.organizations_id as string,
      storageId: null,
      source: "legacy",
    };
  }

  return null;
}

serve(async (req) => {
  const correlationId = req.headers.get("x-request-id") ?? req.headers.get("x-correlation-id") ?? crypto.randomUUID();
  console.log("inventory-jobs-worker inbound", { correlationId, method: req.method, url: req.url });

  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const admin = createAdminClient() as any;

  try {
    const bodyText = await req.text();
    const body = tryParseJson(bodyText) ?? {};
    const orderIdFilter = getStr(body, ["order_id"]);
    const limitStr = getStr(body, ["limit"]);
    const limit = Math.max(1, Math.min(50, Number(limitStr || "10")));

    const nowIso = new Date().toISOString();
    let query = admin
      .from("inventory_jobs")
      .select("*")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(limit);
    if (orderIdFilter) query = query.eq("order_id", orderIdFilter);

    const { data: jobs, error: jErr } = await query;
    if (jErr) return jsonResponse({ ok: false, error: jErr.message }, 400);
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return jsonResponse({ ok: true, processed: 0 }, 200);
    }

    let processed = 0;
    const results: Array<{ id: string; order_id: string; job_type: string; ok: boolean; error?: string }> = [];

    for (const job of jobs) {
      const id = job.id as string;
      const orderId = job.order_id as string;
      const jobType = String(job.job_type || "");
      const attempts = Number(job.attempts || 0);
      const canRun =
        job.status === "pending" ||
        (job.status === "failed" && (!job.next_attempt_at || String(job.next_attempt_at) <= nowIso));
      if (!canRun) continue;

      // Mark processing to prevent concurrent execution.
      const updStart = await admin
        .from("inventory_jobs")
        .update({ status: "processing", attempts: attempts + 1, last_attempt_at: nowIso })
        .eq("id", id)
        .eq("status", job.status);
      if (updStart.error) {
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: updStart.error.message });
        continue;
      }

      const orderInfo = await lookupOrder(admin, orderId);
      if (!orderInfo) {
        const backoffMs = Math.min(15 * 60_000, 10_000 * Math.max(1, attempts));
        await admin
          .from("inventory_jobs")
          .update({ status: "failed", error_log: "order_not_found", next_attempt_at: new Date(Date.now() + backoffMs).toISOString() })
          .eq("id", id);
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: "order_not_found" });
        continue;
      }

      // For legacy orders without storage_id, resolve from default storage.
      let storageId = orderInfo.storageId;
      if (!storageId) {
        const { data: defaultStorage } = await admin.rpc("fn_get_default_storage", { p_org_id: orderInfo.orgId });
        storageId = (defaultStorage as string | null) ?? null;
      }

      try {
        let rpcName: string;
        if (jobType === "reserve") {
          rpcName = "reserve_stock_for_order_v2";
        } else if (jobType === "consume") {
          rpcName = "consume_stock_for_order_v2";
        } else if (jobType === "refund") {
          rpcName = "refund_stock_for_order_v2";
        } else {
          throw new Error("unsupported_job_type");
        }

        const { error: rpcErr } = await admin.rpc(rpcName, {
          p_order_id: orderId,
          p_storage_id: storageId ?? null,
        });
        if (rpcErr) throw new Error(rpcErr.message);

        await admin
          .from("inventory_jobs")
          .update({ status: "done", error_log: null })
          .eq("id", id);
        processed++;
        results.push({ id, order_id: orderId, job_type: jobType, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const backoffMs = Math.min(30 * 60_000, 30_000 * Math.max(1, attempts));
        const nextAttemptIso = new Date(Date.now() + backoffMs).toISOString();
        await admin
          .from("inventory_jobs")
          .update({ status: "failed", error_log: msg, next_attempt_at: nextAttemptIso })
          .eq("id", id);
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: msg });
      }
    }

    return jsonResponse({ ok: true, processed, results }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
