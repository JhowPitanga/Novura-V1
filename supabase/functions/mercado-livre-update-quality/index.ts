// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// AES-GCM helpers for token encryption/decryption when available
function uint8ToB64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function b64ToUint8(b64: string): Uint8Array { return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0))); }
async function importAesGcmKey(b64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(b64Key); return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(new Uint8Array(ct))}`; }

type UpdateBody = {
  organizationId?: string; // pass '*' to update all orgs
  itemIds?: string[];
  meliAccessToken?: string; // fallback if not stored
};

serve(async (req) => {
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
    console.log('[ml-quality]', rid, 'method', req.method, 'ct', contentType, 'qpOrg', qpOrg, 'url', req.url);
    console.log('[ml-quality]', rid, 'headers(apikey?)', !!req.headers.get('apikey'), 'auth?', !!req.headers.get('authorization'));
    console.log('[ml-quality]', rid, 'raw', raw?.slice(0, 500));
    console.log('[ml-quality]', rid, 'body', { organizationId, itemIdsCount: itemIds?.length || 0, providedToken: !!meliAccessToken });
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organizationId required", rid, note: "Send JSON body: { organizationId: '...' } with content-type application/json" }), { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || '';
    const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID") || '';
    const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET") || '';
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || '';
    const authHeader = req.headers.get("Authorization") || undefined;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const admin = createClient(supabaseUrl, (supabaseServiceKey || supabaseAnonKey), {});
    // Sanity check on DB connectivity
    try {
      const ping = await admin.from('marketplace_items').select('id').limit(1);
      console.log('[ml-quality]', rid, 'db ping ok?', !ping.error);
      if (ping.error) console.warn('[ml-quality]', rid, 'db ping error', ping.error.message);
    } catch (e) {
      console.warn('[ml-quality]', rid, 'db ping exception', (e as any)?.message || e);
    }
    console.log('[ml-quality]', rid, 'auth header present?', !!authHeader, 'hasServiceKey?', !!supabaseServiceKey);

    const orgIds: string[] = [];
    if (organizationId === '*') {
      const { data: orgRows, error: orgErr } = await admin
        .from('marketplace_items')
        .select('organizations_id')
        .eq('marketplace_name', 'Mercado Livre')
        .not('organizations_id', 'is', null)
        .limit(1000);
      if (orgErr) { console.error('[ml-quality]', rid, 'org query error', orgErr.message); throw orgErr; }
      const distinct = new Set<string>((orgRows || []).map((r: any) => r.organizations_id));
      orgIds.push(...Array.from(distinct));
      console.log('[ml-quality]', rid, 'orgIds from DB * count', orgIds.length);
    } else {
      orgIds.push(organizationId);
      console.log('[ml-quality]', rid, 'single orgId', organizationId);
    }

    const toScore = (level: string | null | undefined): number => {
      const lv = (level || '').toLowerCase();
      if (!lv) return 0;
      if (lv.includes('profissional') || lv.includes('professional')) return 100;
      if (lv.includes('satisfat') || lv.includes('estándar') || lv.includes('standard')) return 66;
      if (lv.includes('básica') || lv.includes('basic')) return 33;
      return 0;
    };

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
          console.warn('[ml-quality]', rid, 'refresh failed', r.status, t?.slice(0,300));
          return currentToken;
        }
        const newToken = js.access_token as string;
        const newRefresh = js.refresh_token as (string | undefined);
        if (ENC_KEY_B64) {
          try {
            const aes = await importAesGcmKey(ENC_KEY_B64);
            const encAccess = await aesGcmEncryptToString(aes, newToken);
            const encRefresh = newRefresh ? await aesGcmEncryptToString(aes, newRefresh) : undefined;
            await admin.from('marketplace_integrations').update({ access_token: encAccess, refresh_token: encRefresh ?? refreshToken }).eq('organizations_id', orgId).eq('marketplace_name', 'Mercado Livre');
          } catch {
            // fallback: do not persist if encryption fails
          }
        }
        console.log('[ml-quality]', rid, 'token refreshed for org', orgId);
        return newToken;
      } catch (e) {
        console.warn('[ml-quality]', rid, 'refresh exception', (e as any)?.message || e);
        return currentToken;
      }
    };

    const nowIso = new Date().toISOString();
    let updated = 0;

    // Limit concurrency to avoid rate limits
    const MAX_CONCURRENCY = 3; // Reduzido para evitar rate limiting
    let i = 0;
    const runOne = async (id: string, accessToken: string, orgIdForUpdate: string, refreshTok?: string) => {
      try {
        // Primary: item/{id}/performance
        const itemUrl = `https://api.mercadolibre.com/item/${encodeURIComponent(id)}/performance`;
        let used = 'item';
        let { resp, json, text } = await doGetWithBackoff(itemUrl, accessToken);
        if (!resp.ok) {
          console.warn('[ml-quality]', rid, 'item/performance not ok', id, resp.status, text?.slice(0,500));
          // If unauthorized/expired/forbidden, try refreshing
          if (resp.status === 401 || resp.status === 400 || resp.status === 403) {
            const newTok = await refreshTokenIfNeeded(orgIdForUpdate, accessToken, refreshTok);
            if (newTok !== accessToken) {
              ({ resp, json, text } = await doGetWithBackoff(itemUrl, newTok));
              if (!resp.ok) console.warn('[ml-quality]', rid, 'retry item/performance not ok', id, resp.status, text?.slice(0,500));
              else accessToken = newTok;
            }
          }
        }
        if (!resp.ok) {
          // Fallback: user-product/{id}/performance
          const upUrl = `https://api.mercadolibre.com/user-product/${encodeURIComponent(id)}/performance`;
          used = 'user-product';
          ({ resp, json, text } = await doGetWithBackoff(upUrl, accessToken));
          if (!resp.ok && (resp.status === 401 || resp.status === 400 || resp.status === 403)) {
            const newTok = await refreshTokenIfNeeded(orgIdForUpdate, accessToken, refreshTok);
            if (newTok !== accessToken) {
              ({ resp, json, text } = await doGetWithBackoff(upUrl, newTok));
              if (!resp.ok) console.warn('[ml-quality]', rid, 'retry user-product/performance not ok', id, resp.status, text?.slice(0,500));
              else accessToken = newTok;
            }
          }
          if (!resp.ok) {
            console.warn('[ml-quality]', rid, 'user-product/performance not ok', id, resp.status, text?.slice(0,500));
            // Se 405 na origin, isso é CORS no frontend; a função não executa fetch no browser.
            // Retornar sem erro para não quebrar lote, mas logado acima.
            return;
          }
        }
        const data = json ?? await resp.json().catch(() => null as any);
        const level: string | null = data?.level_wording || data?.level || null;
        const scoreRaw = Number(data?.score);
        const score = isNaN(scoreRaw) ? toScore(level) : Math.max(0, Math.min(100, scoreRaw));
        // Update marketplace_items table (legacy)
        const { error: upErr } = await admin
          .from("marketplace_items")
          .update({ listing_quality: score, quality_level: level, last_quality_update: nowIso })
          .eq("marketplace_item_id", id)
          .eq("organizations_id", orgIdForUpdate);
        
        // Also update marketplace_metrics table (new structure)
        const metricsData = {
          organizations_id: orgIdForUpdate,
          marketplace_item_id: id,
          marketplace_name: 'Mercado Livre',
          listing_quality: score,
          quality_level: level,
          performance_data: data || null,
          last_quality_update: nowIso,
          last_updated: nowIso,
          updated_at: nowIso
        };

        const { error: metricsErr } = await admin
          .from("marketplace_metrics")
          .upsert(metricsData, { 
            onConflict: "organizations_id,marketplace_name,marketplace_item_id",
            ignoreDuplicates: false 
          });

        if (!upErr && !metricsErr) {
          updated += 1;
          console.log('[ml-quality]', rid, 'updated', id, 'score', score, 'level', level, 'via', used);
        } else {
          if (upErr) console.warn('[ml-quality]', rid, 'legacy update error', id, upErr.message);
          if (metricsErr) console.warn('[ml-quality]', rid, 'metrics update error', id, metricsErr.message);
        }
      } catch (e) { console.warn('[ml-quality]', rid, 'worker error', (e as any)?.message || e); }
    };

    for (const orgId of orgIds) {
      console.log('[ml-quality]', rid, 'processing org', orgId);
      // Resolve token per org (or use provided for single-org)
      let resolvedToken = meliAccessToken || "";
      let refreshTok: string | undefined = undefined;
      let aesKey: CryptoKey | null = null;
      if (ENC_KEY_B64) { try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch { aesKey = null; } }
      if (!resolvedToken) {
        const { data: integ, error: integErr } = await admin
          .from("marketplace_integrations")
          .select("access_token, refresh_token")
          .eq("organizations_id", orgId)
          .eq("marketplace_name", "Mercado Livre")
          .maybeSingle();
        if (integErr) console.warn('[ml-quality]', rid, 'token lookup error', integErr.message);
        if (aesKey && (integ as any)?.access_token?.startsWith('enc:gcm:')) {
          try { resolvedToken = await aesGcmDecryptFromString(aesKey, (integ as any).access_token); } catch { resolvedToken = (integ as any)?.access_token || ""; }
        } else {
          resolvedToken = (integ as any)?.access_token || "";
        }
        if (aesKey && (integ as any)?.refresh_token?.startsWith('enc:gcm:')) {
          try { refreshTok = await aesGcmDecryptFromString(aesKey, (integ as any).refresh_token); } catch { refreshTok = (integ as any)?.refresh_token || undefined; }
        } else {
          refreshTok = (integ as any)?.refresh_token || undefined;
        }
      }
      if (!resolvedToken) {
        console.warn('[ml-quality]', rid, 'skipping org, missing token', orgId);
        continue;
      }

      // Validate token before processing
      const isValidToken = await validateToken(resolvedToken);
      if (!isValidToken) {
        console.warn('[ml-quality]', rid, 'invalid token for org', orgId, 'attempting refresh');
        if (refreshTok) {
          const newToken = await refreshTokenIfNeeded(orgId, resolvedToken, refreshTok);
          if (newToken !== resolvedToken) {
            resolvedToken = newToken;
            console.log('[ml-quality]', rid, 'token refreshed for org', orgId);
          } else {
            console.warn('[ml-quality]', rid, 'failed to refresh token for org', orgId);
            continue;
          }
        } else {
          console.warn('[ml-quality]', rid, 'no refresh token available for org', orgId);
          continue;
        }
      }
      // Load item ids if not provided, then apply TTL filter using marketplace_metrics.last_quality_update
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
        if (error) { console.error('[ml-quality]', rid, 'items query error', error.message); throw error; }
        ids = (rows || []).map((r: any) => r.marketplace_item_id).filter(Boolean);
      }
      // Fetch recent metrics and filter
      const { data: metricRows } = await admin
        .from("marketplace_metrics")
        .select("marketplace_item_id,last_quality_update")
        .eq("organizations_id", orgId)
        .eq("marketplace_name", "Mercado Livre")
        .in("marketplace_item_id", ids.slice(0, 10000));
      const recent = new Set<string>((metricRows || []).filter((m: any) => m?.last_quality_update && String(m.last_quality_update) >= cutoffIso).map((m: any) => String(m.marketplace_item_id)));
      ids = ids.filter((id) => !recent.has(String(id)));
      console.log('[ml-quality]', rid, 'items', ids.length);
      if (!ids.length) { console.log('[ml-quality]', rid, 'no items for org', orgId, 'skipping'); continue; }

      i = 0;
      const workers: Promise<void>[] = [];
      console.log('[ml-quality]', rid, 'starting workers with concurrency', MAX_CONCURRENCY);
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
      console.log('[ml-quality]', rid, 'finished org', orgId);
    }

    return new Response(JSON.stringify({ ok: true, updated, rid }), { status: 200 });
  } catch (e: any) {
    console.error('[ml-quality] fatal', e?.message, e?.stack || e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error", hint: "Check headers, body JSON and marketplace_integrations token", rid: (crypto as any)?.randomUUID?.() || '' }), { status: 500 });
  }
});


