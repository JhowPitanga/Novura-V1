import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getStr } from "../_shared/adapters/object-utils.ts";

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}


serve(async (req) => {
  try {
    const preCorrId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const hdrLog = {
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
      "x-internal-call": req.headers.get("x-internal-call") || null,
    };
    try { console.log("inventory-jobs-worker inbound", { correlationId: preCorrId, method: req.method, url: req.url, headers: hdrLog }); } catch (_) {}
  } catch (_) {}
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  const admin = createAdminClient() as any;

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    try { console.log("inventory-jobs-worker body_preview", { correlationId, preview: bodyText.slice(0, 1000) }); } catch (_) {}
    const body = tryParseJson(bodyText) ?? {};
    const orderIdFilter = getStr(body, ["order_id"]);
    const limitStr = getStr(body, ["limit"]);
    const limit = Math.max(1, Math.min(50, Number(limitStr || "10")));

    const nowIso = new Date().toISOString();
    let query = admin
      .from("inventory_jobs")
      .select("*")
      .in("status", ["pending","failed"])
      .order("created_at", { ascending: true })
      .limit(limit);
    if (orderIdFilter) query = query.eq("order_id", orderIdFilter);
    const { data: jobs, error: jErr } = await query;
    if (jErr) return jsonResponse({ ok: false, error: jErr.message }, 400);
    if (!Array.isArray(jobs) || jobs.length === 0) return jsonResponse({ ok: true, processed: 0 }, 200);

    let processed = 0;
    const results: any[] = [];

    for (const job of jobs) {
      const id = job.id as string;
      const orderId = job.order_id as string;
      const jobType = String(job.job_type || "");
      const attempts = Number(job.attempts || 0);
      const canRun = job.status === "pending" || (job.status === "failed" && (!job.next_attempt_at || String(job.next_attempt_at) <= nowIso));
      if (!canRun) continue;

      const updStart = await admin
        .from("inventory_jobs")
        .update({ status: "processing", attempts: attempts + 1, last_attempt_at: nowIso })
        .eq("id", id)
        .eq("status", job.status);
      if (updStart.error) {
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: updStart.error.message });
        continue;
      }

      const { data: presented, error: pErr } = await admin
        .from("marketplace_orders_presented_new")
        .select("organizations_id")
        .eq("id", orderId)
        .maybeSingle();
      if (pErr || !presented) {
        const backoffMs = Math.min(15 * 60_000, 10_000 * Math.max(1, attempts));
        const nextAttemptIso = new Date(Date.now() + backoffMs).toISOString();
        await admin
          .from("inventory_jobs")
          .update({ status: "failed", error_log: pErr?.message || "order_not_found", next_attempt_at: nextAttemptIso })
          .eq("id", id);
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: pErr?.message || "order_not_found" });
        continue;
      }

      const orgId = presented.organizations_id as string | null;
      if (!orgId) {
        await admin
          .from("inventory_jobs")
          .update({ status: "failed", error_log: "missing_org", next_attempt_at: new Date(Date.now() + 60_000).toISOString() })
          .eq("id", id);
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: "missing_org" });
        continue;
      }

      const { data: storageId, error: sErr } = await admin.rpc("fn_get_default_storage", { p_org_id: orgId });
      if (sErr || !storageId) {
        await admin
          .from("inventory_jobs")
          .update({ status: "failed", error_log: sErr?.message || "no_default_storage", next_attempt_at: new Date(Date.now() + 120_000).toISOString() })
          .eq("id", id);
        results.push({ id, order_id: orderId, job_type: jobType, ok: false, error: sErr?.message || "no_default_storage" });
        continue;
      }

      try {
        if (jobType === "reserve") {
          await admin.rpc("reserve_stock_for_order", { p_order_id: orderId, p_storage_id: storageId });
        } else if (jobType === "consume") {
          await admin.rpc("consume_reserved_stock_for_order", { p_order_id: orderId, p_storage_id: storageId });
        } else if (jobType === "refund") {
          await admin.rpc("refund_reserved_stock_for_order", { p_order_id: orderId, p_storage_id: storageId });
        } else {
          throw new Error("unsupported_job_type");
        }
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

