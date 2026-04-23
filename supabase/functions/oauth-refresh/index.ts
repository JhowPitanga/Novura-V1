// Generic OAuth refresh enqueuer Edge Function.
// This function does NOT perform token refreshes itself. It acts as an
// orchestrator that schedules refresh jobs into oauth_refresh_jobs.
// The actual refresh is performed by oauth-refresh-worker (called by pg_cron or queue).
//
// Mode 1 — single integration (POST { integrationId }):
//   Schedules a refresh job for one specific integration immediately.
//
// Mode 2 — batch (POST {} or cron invocation):
//   Finds all active integrations whose token will expire within their provider's
//   refresh_threshold_minutes and enqueues a refresh job for each.

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const admin = createAdminClient();

    let body: { integrationId?: string } = {};
    if (req.method === "POST" && Number(req.headers.get("content-length") ?? 0) > 0) {
      try {
        body = await req.json();
      } catch {
        body = {};
      }
    }

    if (body.integrationId) {
      // Mode 1: enqueue single refresh
      const jobId = await enqueueSingle(admin, body.integrationId);
      await triggerWorkerIfNeeded(1);
      return Response.json({ enqueued: 1, job_id: jobId }, { headers: CORS });
    }

    // Mode 2: batch — find integrations due for refresh
    const count = await enqueueBatch(admin);
    await triggerWorkerIfNeeded(count);
    return Response.json({ enqueued: count }, { headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[oauth-refresh] error:", msg);
    return Response.json({ error: msg }, { status: 500, headers: CORS });
  }
});

// ---------------------------------------------------------------------------
// Enqueue single integration
// ---------------------------------------------------------------------------

async function enqueueSingle(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<string> {
  const { data, error } = await admin
    .from("oauth_refresh_jobs")
    .insert({
      integration_id: integrationId,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert_job_failed");
  return data.id;
}

// ---------------------------------------------------------------------------
// Batch enqueue: integrations expiring soon across all providers
// ---------------------------------------------------------------------------

async function enqueueBatch(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  // Get integrations that will expire before (now + threshold_minutes).
  // Each provider has its own refresh_threshold_minutes.
  const { data: integrations, error } = await admin
    .from("marketplace_integrations")
    .select(
      "id, expires_at, provider_id, marketplace_providers!inner(refresh_threshold_minutes)",
    )
    .eq("status", "active")
    .is("deactivated_at", null);

  if (error) throw new Error(error.message);
  if (!integrations?.length) return 0;

  const now = Date.now();

  // Identify integrations due for refresh (expires_at - threshold <= now)
  const due = integrations.filter((row) => {
    if (!row.expires_at) return false;
    // deno-lint-ignore no-explicit-any
    const threshold = (row as any)?.marketplace_providers?.refresh_threshold_minutes ?? 30;
    const expiresMs = new Date(row.expires_at).getTime();
    const refreshAt = expiresMs - threshold * 60 * 1000;
    return refreshAt <= now;
  });

  if (!due.length) return 0;

  // Find integrations that already have a pending/processing job to avoid duplicates
  const dueIds = due.map((r) => r.id);
  const { data: existingJobs } = await admin
    .from("oauth_refresh_jobs")
    .select("integration_id")
    .in("integration_id", dueIds)
    .in("status", ["pending", "processing"]);

  const alreadyQueued = new Set(
    (existingJobs ?? []).map((j) => j.integration_id),
  );

  const toEnqueue = due.filter((r) => !alreadyQueued.has(r.id));
  if (!toEnqueue.length) return 0;

  const { error: insErr } = await admin.from("oauth_refresh_jobs").insert(
    toEnqueue.map((r) => ({
      integration_id: r.id,
      status: "pending",
      scheduled_at: new Date().toISOString(),
    })),
  );

  if (insErr) throw new Error(insErr.message);
  return toEnqueue.length;
}

async function triggerWorkerIfNeeded(enqueuedCount: number): Promise<void> {
  if (enqueuedCount <= 0) return;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return;

  // Fire one worker invocation to reduce queue latency.
  // If this call fails, pg_cron will still drain jobs.
  try {
    await fetch(`${supabaseUrl}/functions/v1/oauth-refresh-worker?batchSize=50`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRole}`,
      },
      body: "{}",
    });
  } catch (err) {
    console.warn("[oauth-refresh] worker trigger failed:", err);
  }
}
