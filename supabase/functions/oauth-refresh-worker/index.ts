// OAuth refresh worker Edge Function.
// Batch worker with controlled concurrency and SKIP LOCKED claiming.
// Called by pg_cron (or by oauth-refresh enqueuer when new jobs are created).
//
// On each invocation:
//  1. Claim a batch of pending jobs via claim_oauth_refresh_jobs(batch_size)
//  2. Process jobs in parallel with bounded concurrency
//  3. Repeat until no jobs or time budget exhausted

import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getProvider } from "../_shared/adapters/oauth/registry.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import {
  aesGcmEncryptToString,
  importAesGcmKey,
} from "../_shared/adapters/infra/token-utils.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_CONCURRENCY = 10;
const TIME_BUDGET_MS = 45_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const admin = createAdminClient();
  const url = new URL(req.url);
  const batchSize = Number(url.searchParams.get("batchSize") ?? DEFAULT_BATCH_SIZE);
  const startTs = Date.now();
  let totalClaimed = 0;
  let totalDone = 0;
  let totalFailed = 0;

  while (Date.now() - startTs < TIME_BUDGET_MS) {
    const { data: jobs, error: claimErr } = await admin.rpc("claim_oauth_refresh_jobs", {
      p_batch_size: batchSize,
    });
    if (claimErr) {
      console.error("[oauth-refresh-worker] claim error:", claimErr.message);
      return Response.json({ error: claimErr.message }, { status: 500, headers: CORS });
    }
    if (!jobs || jobs.length === 0) break;

    totalClaimed += jobs.length;
    const results = await runWithConcurrency(
      jobs,
      MAX_CONCURRENCY,
      (job) => processJob(admin, job),
    );

    results.forEach((r) => {
      if (r.ok) totalDone += 1;
      else totalFailed += 1;
    });
  }

  return Response.json(
    {
      status: totalClaimed === 0 ? "no_pending_jobs" : "processed_batch",
      claimed: totalClaimed,
      done: totalDone,
      failed: totalFailed,
    },
    { headers: CORS },
  );
});

async function processJob(
  admin: ReturnType<typeof createAdminClient>,
  job: { id: string; integration_id: string; attempt_count: number; max_attempts: number },
): Promise<{ ok: boolean; jobId: string; integrationId: string; error?: string }> {
  const jobId = job.id;
  const integrationId = job.integration_id;
  const attempt = Number(job.attempt_count ?? 0) + 1;

  try {
    const { data: intRow, error: intErr } = await admin
      .from("marketplace_integrations")
      .select("*, marketplace_providers(key, display_name)")
      .eq("id", integrationId)
      .single();

    if (intErr || !intRow) throw new Error(intErr?.message ?? "integration_not_found");

    // deno-lint-ignore no-explicit-any
    const providerKey = (intRow as any)?.marketplace_providers?.key;
    // deno-lint-ignore no-explicit-any
    const displayName = (intRow as any)?.marketplace_providers?.display_name;
    if (!providerKey) throw new Error("integration_has_no_provider");

    const adapter = getProvider(providerKey);
    const credsAdapter = new SupabaseAppCredentialsAdapter(admin);
    let creds = await credsAdapter.getByName(providerKey);
    if (!creds && displayName) creds = await credsAdapter.getByName(displayName);
    if (!creds) throw new Error(`no_credentials:${providerKey}`);

    const tokens = await adapter.refreshTokens(intRow as never, {
      clientId: creds.client_id,
      clientSecret: creds.client_secret,
    });

    const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    const aesKey = await importAesGcmKey(encKey);
    const encAccess = await aesGcmEncryptToString(aesKey, tokens.accessToken);
    const encRefresh = tokens.refreshToken
      ? await aesGcmEncryptToString(aesKey, tokens.refreshToken)
      : null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + tokens.expiresInSeconds * 1000).toISOString();

    await admin
      .from("marketplace_integrations")
      .update({
        access_token: encAccess,
        refresh_token: encRefresh,
        expires_at: expiresAt,
        expires_in: String(tokens.expiresInSeconds),
        status: "active",
        last_refresh_at: now.toISOString(),
        last_refresh_error: null,
      })
      .eq("id", integrationId);

    await admin
      .from("oauth_refresh_jobs")
      .update({
        status: "done",
        completed_at: now.toISOString(),
        attempt_count: attempt,
        error_message: null,
      })
      .eq("id", jobId);

    return { ok: true, jobId, integrationId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isFinal = attempt >= Number(job.max_attempts ?? 3);

    await admin
      .from("oauth_refresh_jobs")
      .update({
        status: isFinal ? "failed" : "pending",
        attempt_count: attempt,
        error_message: msg,
        started_at: null,
        scheduled_at: isFinal
          ? new Date().toISOString()
          : new Date(Date.now() + attempt * 60_000).toISOString(),
      })
      .eq("id", jobId);

    if (isFinal) {
      await admin
        .from("marketplace_integrations")
        .update({ status: "error", last_refresh_error: msg })
        .eq("id", integrationId);
    }
    return { ok: false, jobId, integrationId, error: msg };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const out: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      out[idx] = await handler(items[idx]);
    }
  });

  await Promise.allSettled(workers);
  return out;
}
