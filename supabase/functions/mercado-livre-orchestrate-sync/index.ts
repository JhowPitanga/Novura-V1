// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const contentType = req.headers.get('content-type') || '';
    const raw = await req.text();
    let parsed: any = {}; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
    const organizationId = parsed?.organizationId || new URL(req.url).searchParams.get('organizationId');
    if (!organizationId) return jsonResponse({ error: "organizationId required", rid }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Sincroniza itens (IDs e detalhes via multiget dentro da função)
    const syncRes = await admin.functions.invoke('mercado-livre-sync-items', {
      body: { organizationId },
      headers: {
        Authorization: req.headers.get('authorization') || '',
        apikey: SERVICE_ROLE_KEY,
        'x-internal-call': '1'
      }
    });

    if (syncRes.error) {
      return jsonResponse({ error: 'sync-items failed', details: syncRes.error?.message || syncRes.error, rid }, 500);
    }

    // 2) Descrições e Qualidade em paralelo para preparar dados e minimizar chamadas duplicadas
    const [descRes, qualityRes] = await Promise.all([
      admin.functions.invoke('mercado-livre-sync-descriptions', {
        body: { organizationId },
        headers: { Authorization: req.headers.get('authorization') || '' }
      }),
      admin.functions.invoke('mercado-livre-update-quality', {
        body: { organizationId },
        headers: { Authorization: req.headers.get('authorization') || '' }
      })
    ]);

    // 3) Reviews e Métricas em paralelo (após qualidade) para atualizar visitas/commission e avaliações
    const [reviewsRes, metricsRes] = await Promise.all([
      admin.functions.invoke('mercado-livre-update-reviews', {
        body: { organizationId },
        headers: { Authorization: req.headers.get('authorization') || '' }
      }),
      admin.functions.invoke('mercado-livre-update-metrics', {
        body: { organizationId },
        headers: { Authorization: req.headers.get('authorization') || '' }
      })
    ]);

    // 4) Estoque distribuído e Preços/Comissão em paralelo para atualizar informações de estoque e pricing
    const [stockRes, pricesRes] = await Promise.all([
      admin.functions.invoke('mercado-livre-sync-stock-distribution', {
        body: { organizationId },
        headers: {
          Authorization: req.headers.get('authorization') || '',
          apikey: SERVICE_ROLE_KEY,
          'x-internal-call': '1'
        }
      }),
      admin.functions.invoke('mercado-livre-sync-prices', {
        body: { organizationId },
        headers: {
          Authorization: req.headers.get('authorization') || '',
          apikey: SERVICE_ROLE_KEY,
          'x-internal-call': '1'
        }
      })
    ]);

    // Se alguma falhar com erro transient, enfileirar um job agregado para retry
    const transientError = (e: any) => {
      const msg = (e?.message || '').toLowerCase();
      return msg.includes('429') || msg.includes('503') || msg.includes('rate');
    };
    if (descRes.error && transientError(descRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'descriptions-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(descRes.error?.message || descRes.error)
        });
      } catch {}
    }
    if (qualityRes.error && transientError(qualityRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'quality-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(qualityRes.error?.message || qualityRes.error)
        });
      } catch {}
    }
    if (reviewsRes.error && transientError(reviewsRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'reviews-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(reviewsRes.error?.message || reviewsRes.error)
        });
      } catch {}
    }
    if (metricsRes.error && transientError(metricsRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'metrics-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(metricsRes.error?.message || metricsRes.error)
        });
      } catch {}
    }
    if (stockRes.error && transientError(stockRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'stock-distribution-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(stockRes.error?.message || stockRes.error)
        });
      } catch {}
    }
    if (pricesRes.error && transientError(pricesRes.error)) {
      try {
        await admin.from('ml_retry_queue').insert({
          job_type: 'prices-batch',
          organizations_id: organizationId,
          payload: { organizationId },
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(Date.now() + 30_000).toISOString(),
          last_error: String(pricesRes.error?.message || pricesRes.error)
        });
      } catch {}
    }

    const summary = {
      ok: true,
      rid,
      sync: syncRes.data || null,
      descriptions: descRes.error ? { error: descRes.error?.message || String(descRes.error) } : (descRes.data || null),
      quality: qualityRes.error ? { error: qualityRes.error?.message || String(qualityRes.error) } : (qualityRes.data || null),
      reviews: reviewsRes.error ? { error: reviewsRes.error?.message || String(reviewsRes.error) } : (reviewsRes.data || null),
      metrics: metricsRes.error ? { error: metricsRes.error?.message || String(metricsRes.error) } : (metricsRes.data || null),
      stock_distribution: stockRes.error ? { error: stockRes.error?.message || String(stockRes.error) } : (stockRes.data || null),
      prices: pricesRes.error ? { error: pricesRes.error?.message || String(pricesRes.error) } : (pricesRes.data || null),
    };

    return jsonResponse(summary, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});


