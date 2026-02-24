// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/adapters/token-utils.ts";

type UpdateBody = {
  organizationId?: string; // pass '*' to update all orgs
  itemIds?: string[];
  meliAccessToken?: string; // fallback if not stored
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const contentType = req.headers.get('content-type') || '';
    const raw = await req.text();
    let parsed: any = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
    let { organizationId, itemIds, meliAccessToken }: UpdateBody = parsed;
    const reqUrl = new URL(req.url);
    const qpOrg = reqUrl.searchParams.get('organizationId') || reqUrl.searchParams.get('org') || undefined;
    if (!organizationId && qpOrg) organizationId = qpOrg;
    console.log('[ml-reviews]', rid, 'method', req.method, 'ct', contentType, 'qpOrg', qpOrg, 'url', req.url);
    console.log('[ml-reviews]', rid, 'headers(apikey?)', !!req.headers.get('apikey'), 'auth?', !!req.headers.get('authorization'));
    console.log('[ml-reviews]', rid, 'raw', raw?.slice(0, 500));
    console.log('[ml-reviews]', rid, 'body', { organizationId, itemIdsCount: itemIds?.length || 0, providedToken: !!meliAccessToken });
    if (!organizationId) {
      return jsonResponse({ error: "organizationId required", rid, note: "Send JSON body: { organizationId: '...' } with content-type application/json" }, 400);
    }

    const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID") || '';
    const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET") || '';
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");

    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try {
        aesKey = await importAesGcmKey(ENC_KEY_B64);
      } catch (e) {
        console.warn('[ml-reviews]', rid, 'failed to import AES key:', (e as any)?.message || e);
      }
    }

    const admin = createAdminClient();
    try {
      const ping = await admin.from('marketplace_items').select('id').limit(1);
      console.log('[ml-reviews]', rid, 'db ping ok?', !ping.error);
      if (ping.error) console.warn('[ml-reviews]', rid, 'db ping error', ping.error.message);
    } catch (e) {
      console.warn('[ml-reviews]', rid, 'db ping exception', (e as any)?.message || e);
    }

    const orgIds: string[] = [];
    if (organizationId === '*') {
      const { data: orgRows, error: orgErr } = await admin
        .from('marketplace_items')
        .select('organizations_id')
        .eq('marketplace_name', 'Mercado Livre')
        .not('organizations_id', 'is', null)
        .limit(1000);
      if (orgErr) { console.error('[ml-reviews]', rid, 'org query error', orgErr.message); throw orgErr; }
      const distinct = new Set<string>((orgRows || []).map((r: any) => r.organizations_id));
      orgIds.push(...Array.from(distinct));
      console.log('[ml-reviews]', rid, 'orgIds from DB * count', orgIds.length);
    } else {
      orgIds.push(organizationId);
      console.log('[ml-reviews]', rid, 'single orgId', organizationId);
    }

    // Helper: perform authorized GET with Accept header and return JSON/body text
    const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
    const doGet = async (url: string, token: string) => {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      const text = await resp.text().catch(() => '');
      let json: any = null; try { json = text ? JSON.parse(text) : null; } catch {}
      return { resp, text, json } as const;
    };
    const doGetWithBackoff = async (url: string, token: string) => {
      let attempt = 0; let last: any = null;
      while (attempt < 3) {
        const r = await doGet(url, token); last = r;
        if (r.resp.status !== 429) return r;
        await sleep(300 * Math.pow(2, attempt));
        attempt++;
      }
      return last as ReturnType<typeof doGet>;
    };

    // Helper: validate token by making a simple API call
    const validateToken = async (token: string): Promise<boolean> => {
      try {
        const resp = await fetch('https://api.mercadolibre.com/users/me', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        });
        return resp.ok;
      } catch {
        return false;
      }
    };

    // Helper: refresh ML token if possible
    const refreshTokenIfNeeded = async (orgId: string, currentToken: string, refreshToken?: string): Promise<string> => {
      if (!refreshToken || !ML_CLIENT_ID || !ML_CLIENT_SECRET) return currentToken;
      try {
        const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_CLIENT_ID, client_secret: ML_CLIENT_SECRET, refresh_token: refreshToken });
        const r = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const t = await r.text(); let js: any = null; try { js = JSON.parse(t); } catch {}
        if (!r.ok || !js?.access_token) {
          console.warn('[ml-reviews]', rid, 'refresh failed', r.status, t?.slice(0,300));
          return currentToken;
        }
        const newToken = js.access_token as string;
        const newRefresh = js.refresh_token as (string | undefined);
        await admin.from('marketplace_integrations').update({ access_token: newToken, refresh_token: newRefresh ?? refreshToken }).eq('organizations_id', orgId).eq('marketplace_name', 'Mercado Livre');
        console.log('[ml-reviews]', rid, 'token refreshed for org', orgId);
        return newToken;
      } catch (e) {
        console.warn('[ml-reviews]', rid, 'refresh exception', (e as any)?.message || e);
        return currentToken;
      }
    };

    const nowIso = new Date().toISOString();
    let updated = 0;

    // Limit concurrency to avoid rate limits
    const MAX_CONCURRENCY = 3;
    let i = 0;
    const runOne = async (id: string, accessToken: string, orgIdForUpdate: string, refreshTok?: string) => {
      try {
        // Get reviews data from Mercado Livre API
        const reviewsUrl = `https://api.mercadolibre.com/reviews/item/${encodeURIComponent(id)}`;
        let { resp, json, text } = await doGetWithBackoff(reviewsUrl, accessToken);
        const rl = {
          limit: resp.headers.get('x-ratelimit-limit') || resp.headers.get('ratelimit-limit') || null,
          remaining: resp.headers.get('x-ratelimit-remaining') || resp.headers.get('ratelimit-remaining') || null,
          reset: resp.headers.get('x-ratelimit-reset') || resp.headers.get('ratelimit-reset') || null,
        };
        
        if (!resp.ok) {
          console.warn('[ml-reviews]', rid, 'reviews not ok', id, resp.status, text?.slice(0,500));
          // If unauthorized/expired/forbidden, try refreshing
          if (resp.status === 401 || resp.status === 400 || resp.status === 403) {
            const newTok = await refreshTokenIfNeeded(orgIdForUpdate, accessToken, refreshTok);
            if (newTok !== accessToken) {
              ({ resp, json, text } = await doGetWithBackoff(reviewsUrl, newTok));
              // update latest ratelimit info
              rl.limit = resp.headers.get('x-ratelimit-limit') || rl.limit;
              rl.remaining = resp.headers.get('x-ratelimit-remaining') || rl.remaining;
              rl.reset = resp.headers.get('x-ratelimit-reset') || rl.reset;
              if (!resp.ok) console.warn('[ml-reviews]', rid, 'retry reviews not ok', id, resp.status, text?.slice(0,500));
              else accessToken = newTok;
            }
          }
          if (!resp.ok) {
            // Enfileira para retentativa com backoff se 429/503
            if (resp.status === 429 || resp.status === 503) {
              try {
                await admin.from('ml_retry_queue').insert({
                  job_type: 'reviews',
                  organizations_id: orgIdForUpdate,
                  payload: { itemId: id },
                  attempts: 0,
                  max_attempts: 5,
                  next_retry_at: new Date(Date.now() + 30_000).toISOString(),
                  last_error: `HTTP ${resp.status}`
                });
              } catch {}
            }
            console.warn('[ml-reviews]', rid, 'reviews API failed', id, resp.status, text?.slice(0,500));
            return;
          }
        }
        
        const data = json ?? await resp.json().catch(() => null as any);
        const ratingAverage = typeof data?.rating_average === 'number' ? data.rating_average : null;
        const reviewsCount = typeof data?.reviews_count === 'number' ? data.reviews_count : 0;

        // Upsert into marketplace_metrics table
        const metricsData = {
          organizations_id: orgIdForUpdate,
          marketplace_item_id: id,
          marketplace_name: 'Mercado Livre',
          rating_average: ratingAverage,
          reviews_count: reviewsCount,
          reviews_data: data || null,
          last_reviews_update: nowIso,
          last_updated: nowIso,
          updated_at: nowIso
        };

        const { error: upErr } = await admin
          .from("marketplace_metrics")
          .upsert(metricsData, { 
            onConflict: "organizations_id,marketplace_name,marketplace_item_id",
            ignoreDuplicates: false 
          });

        if (!upErr) {
          updated += 1;
          console.log('[ml-reviews]', rid, 'updated reviews for', id, 'rating', ratingAverage, 'count', reviewsCount, 'ratelimit', rl);
        } else {
          console.warn('[ml-reviews]', rid, 'reviews update error', id, upErr.message);
        }

      } catch (e) { 
        console.warn('[ml-reviews]', rid, 'worker error', (e as any)?.message || e); 
      }
    };

    for (const orgId of orgIds) {
      console.log('[ml-reviews]', rid, 'processing org', orgId);
      // Resolve token per org (or use provided for single-org)
      let resolvedToken = meliAccessToken || "";
      let refreshTok: string | undefined = undefined;
      if (!resolvedToken) {
        const { data: integ, error: integErr } = await admin
          .from("marketplace_integrations")
          .select("access_token, refresh_token")
          .eq("organizations_id", orgId)
          .eq("marketplace_name", "Mercado Livre")
          .maybeSingle();
        if (integErr) console.warn('[ml-reviews]', rid, 'token lookup error', integErr.message);
        
        // Decrypt the access token if we have the AES key
        if (integ?.access_token && aesKey) {
          try {
            resolvedToken = await aesGcmDecryptFromString(aesKey, integ.access_token);
            console.log('[ml-reviews]', rid, 'token decrypted successfully');
          } catch (e) {
            console.warn('[ml-reviews]', rid, 'failed to decrypt access token:', (e as any)?.message || e);
            resolvedToken = "";
          }
        } else {
          resolvedToken = (integ as any)?.access_token || "";
        }
        
        // Decrypt refresh token if available
        if (integ?.refresh_token && aesKey) {
          try {
            refreshTok = await aesGcmDecryptFromString(aesKey, integ.refresh_token);
          } catch (e) {
            console.warn('[ml-reviews]', rid, 'failed to decrypt refresh token:', (e as any)?.message || e);
            refreshTok = undefined;
          }
        } else {
          refreshTok = (integ as any)?.refresh_token || undefined;
        }
      }
      if (!resolvedToken) {
        console.warn('[ml-reviews]', rid, 'skipping org, missing token', orgId);
        continue;
      }

      // Validate token before processing
      const isValidToken = await validateToken(resolvedToken);
      if (!isValidToken) {
        console.warn('[ml-reviews]', rid, 'invalid token for org', orgId, 'attempting refresh');
        if (refreshTok) {
          const newToken = await refreshTokenIfNeeded(orgId, resolvedToken, refreshTok);
          if (newToken !== resolvedToken) {
            resolvedToken = newToken;
            console.log('[ml-reviews]', rid, 'token refreshed for org', orgId);
          } else {
            console.warn('[ml-reviews]', rid, 'failed to refresh token for org', orgId);
            continue;
          }
        } else {
          console.warn('[ml-reviews]', rid, 'no refresh token available for org', orgId);
          continue;
        }
      }

      // Load item ids if not provided, then apply TTL using marketplace_metrics.last_reviews_update
      const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
      const cutoffIso = new Date(Date.now() - CACHE_TTL_MS).toISOString();
      let ids: string[] = (itemIds || []);
      if (!ids.length) {
        const { data: rows, error } = await admin
          .from("marketplace_items")
          .select("marketplace_item_id")
          .eq("organizations_id", orgId)
          .eq("marketplace_name", "Mercado Livre")
          .order("updated_at", { ascending: false })
          .limit(1000);
        if (error) { console.error('[ml-reviews]', rid, 'items query error', error.message); throw error; }
        ids = (rows || []).map((r: any) => r.marketplace_item_id).filter(Boolean);
      }
      const { data: metricRows } = await admin
        .from("marketplace_metrics")
        .select("marketplace_item_id,last_reviews_update")
        .eq("organizations_id", orgId)
        .eq("marketplace_name", "Mercado Livre")
        .in("marketplace_item_id", ids.slice(0, 10000));
      const recent = new Set<string>((metricRows || []).filter((m: any) => m?.last_reviews_update && String(m.last_reviews_update) >= cutoffIso).map((m: any) => String(m.marketplace_item_id)));
      ids = ids.filter((id) => !recent.has(String(id)));
      console.log('[ml-reviews]', rid, 'items', ids.length);
      if (!ids.length) { console.log('[ml-reviews]', rid, 'no items for org', orgId, 'skipping'); continue; }

      i = 0;
      const workers: Promise<void>[] = [];
      console.log('[ml-reviews]', rid, 'starting workers with concurrency', MAX_CONCURRENCY);
      while (i < ids.length) {
        while (workers.length < MAX_CONCURRENCY && i < ids.length) {
          workers.push(runOne(ids[i++], resolvedToken, orgId, refreshTok));
        }
        await Promise.all(workers).catch(() => {});
        workers.length = 0;
        // Add delay between batches to avoid rate limiting
        if (i < ids.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      console.log('[ml-reviews]', rid, 'finished org', orgId);
    }

    return jsonResponse({ ok: true, updated, rid });
  } catch (e: any) {
    console.error('[ml-reviews] fatal', e?.message, e?.stack || e);
    return jsonResponse({ error: e?.message || "Unknown error", hint: "Check headers, body JSON and marketplace_integrations token", rid: (crypto as any)?.randomUUID?.() || '' }, 500);
  }
});
