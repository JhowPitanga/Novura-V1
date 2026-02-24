// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";

// Simple retry worker: pick due jobs, try, requeue with exponential backoff or send to DLQ
serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const nowIso = new Date().toISOString();
    const { data: jobs, error } = await admin
      .from('ml_retry_queue')
      .select('*')
      .lte('next_retry_at', nowIso)
      .order('next_retry_at', { ascending: true })
      .limit(25);
    if (error) return jsonResponse({ error: error.message }, 500);

    let processed = 0, movedToDlq = 0, requeued = 0;

    const tryJob = async (job: any) => {
      try {
        if (job.job_type === 'reviews') {
          const { error: err } = await admin.functions.invoke('mercado-livre-update-reviews', { body: { organizationId: job.organizations_id } });
          if (err) throw new Error(String(err?.message || err));
        } else if (job.job_type === 'metrics') {
          const { error: err } = await admin.functions.invoke('mercado-livre-update-metrics', { body: { organizationId: job.organizations_id } });
          if (err) throw new Error(String(err?.message || err));
        } else if (job.job_type === 'reviews-batch') {
          const { error: err } = await admin.functions.invoke('mercado-livre-update-reviews', { body: { organizationId: job.organizations_id } });
          if (err) throw new Error(String(err?.message || err));
        } else if (job.job_type === 'metrics-batch') {
          const { error: err } = await admin.functions.invoke('mercado-livre-update-metrics', { body: { organizationId: job.organizations_id } });
          if (err) throw new Error(String(err?.message || err));
        } else {
          // Unknown job type, move to DLQ immediately
          throw new Error('unknown job type');
        }

        // success => delete job
        await admin.from('ml_retry_queue').delete().eq('id', job.id);
        processed++;
      } catch (e) {
        const attempts = (job.attempts || 0) + 1;
        const baseDelayMs = 30_000; // 30s
        const nextDelay = baseDelayMs * Math.pow(2, Math.min(attempts - 1, 4)); // capped backoff
        if (attempts >= (job.max_attempts || 5)) {
          await admin.from('ml_dead_letter_queue').insert({
            job_type: job.job_type,
            organizations_id: job.organizations_id,
            payload: job.payload,
            attempts,
            last_error: (e instanceof Error ? e.message : String(e))
          });
          await admin.from('ml_retry_queue').delete().eq('id', job.id);
          movedToDlq++;
        } else {
          await admin.from('ml_retry_queue').update({
            attempts,
            last_error: (e instanceof Error ? e.message : String(e)),
            next_retry_at: new Date(Date.now() + nextDelay).toISOString(),
            updated_at: new Date().toISOString()
          }).eq('id', job.id);
          requeued++;
        }
      }
    };

    await Promise.all((jobs || []).map(tryJob));

    return jsonResponse({ ok: true, processed, requeued, movedToDlq, picked: (jobs || []).length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});


