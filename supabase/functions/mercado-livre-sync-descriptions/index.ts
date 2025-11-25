// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function json(body: any, status = 200) {
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

// AES-GCM helpers
function uint8ToB64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function b64ToUint8(b64: string): Uint8Array { return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0))); }
async function importAesGcmKey(b64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(b64Key); return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

type Body = {
  organizationId?: string;
  itemIds?: string[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return json(null, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const raw = await req.text(); let parsed: any = {}; try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
    let { organizationId, itemIds }: Body = parsed;
    const qpOrg = new URL(req.url).searchParams.get('organizationId') || undefined;
    if (!organizationId && qpOrg) organizationId = qpOrg;
    if (!organizationId) return json({ error: "organizationId required", rid }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || '';
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || '';
    const ML_CLIENT_ID = Deno.env.get("ML_CLIENT_ID") || '';
    const ML_CLIENT_SECRET = Deno.env.get("ML_CLIENT_SECRET") || '';
    const authHeader = req.headers.get("Authorization") || undefined;

    const aes = ENC_KEY_B64 ? await importAesGcmKey(ENC_KEY_B64) : null;
    const supabase = createClient(SUPABASE_URL, ANON, { global: { headers: authHeader ? { Authorization: authHeader } : {} } });
    const admin = createClient(SUPABASE_URL, (SERVICE || ANON));

    // Resolve token
    let accessToken = '';
    let refreshTok: string | undefined = undefined;
    const { data: integ, error: integErr } = await admin
      .from('marketplace_integrations')
      .select('access_token, refresh_token')
      .eq('organizations_id', organizationId)
      .eq('marketplace_name', 'Mercado Livre')
      .single();
    if (integErr || !integ) return json({ error: integErr?.message || 'Integration not found', rid }, 404);
    try {
      accessToken = aes ? await aesGcmDecryptFromString(aes!, String(integ.access_token)) : String(integ.access_token || '');
    } catch {
      accessToken = String(integ.access_token || '');
    }
    try { refreshTok = aes ? await aesGcmDecryptFromString(aes!, String(integ.refresh_token)) : String(integ.refresh_token || ''); } catch { refreshTok = String(integ.refresh_token || ''); }

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
    const refreshTokenIfNeeded = async (currentToken: string): Promise<string> => {
      if (!refreshTok || !ML_CLIENT_ID || !ML_CLIENT_SECRET) return currentToken;
      try {
        const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_CLIENT_ID, client_secret: ML_CLIENT_SECRET, refresh_token: refreshTok });
        const r = await fetch('https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
        const js = await r.json().catch(() => ({}));
        if (!r.ok || !js?.access_token) return currentToken;
        const newToken = js.access_token as string; accessToken = newToken;
        // Opcional: persistir tokens atualizados criptografados
        return newToken;
      } catch { return currentToken; }
    };

    // Carregar itens
    let ids: string[] = itemIds || [];
    if (!ids.length) {
      const { data: rows, error } = await admin
        .from('marketplace_items')
        .select('marketplace_item_id')
        .eq('organizations_id', organizationId)
        .eq('marketplace_name', 'Mercado Livre')
        .order('updated_at', { ascending: false })
        .limit(2000);
      if (error) return json({ error: error.message, rid }, 500);
      ids = (rows || []).map((r: any) => String(r.marketplace_item_id)).filter(Boolean);
    }

    // TTL 72h: tenta filtrar por marketplace_item_descriptions.updated_at; se falhar, tenta por marketplace_items.last_description_update; se falhar, não filtra TTL
    const TTL_MS = 72 * 60 * 60 * 1000;
    const cutoffIso = new Date(Date.now() - TTL_MS).toISOString();
    let filteredByTTL = false;
    try {
      const { data: descRows, error: descErr } = await admin
        .from('marketplace_item_descriptions')
        .select('marketplace_item_id, updated_at')
        .eq('organizations_id', organizationId)
        .eq('marketplace_name', 'Mercado Livre')
        .in('marketplace_item_id', ids.slice(0, 10000));
      if (!descErr && Array.isArray(descRows)) {
        const recent = new Set<string>((descRows || [])
          .filter((d: any) => d?.updated_at && String(d.updated_at) >= cutoffIso)
          .map((d: any) => String(d.marketplace_item_id)));
        ids = ids.filter((id) => !recent.has(id));
        filteredByTTL = true;
      }
    } catch {}
    if (!filteredByTTL) {
      try {
        const { data: miRows, error: miErr } = await admin
          .from('marketplace_items')
          .select('marketplace_item_id, last_description_update')
          .eq('organizations_id', organizationId)
          .eq('marketplace_name', 'Mercado Livre')
          .in('marketplace_item_id', ids.slice(0, 10000));
        if (!miErr && Array.isArray(miRows)) {
          const recent = new Set<string>((miRows || [])
            .filter((d: any) => d?.last_description_update && String(d.last_description_update) >= cutoffIso)
            .map((d: any) => String(d.marketplace_item_id)));
          ids = ids.filter((id) => !recent.has(id));
          filteredByTTL = true;
        }
      } catch {}
    }

    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    const MAX_CONCURRENCY = 3;
    let i = 0; const workers: Promise<void>[] = [];

    const runOne = async (id: string) => {
      try {
        const url = `https://api.mercadolibre.com/items/${encodeURIComponent(id)}/description`;
        let { resp, json: js, text } = await doGetWithBackoff(url, accessToken);
        if (!resp.ok && (resp.status === 401 || resp.status === 403)) {
          const newTok = await refreshTokenIfNeeded(accessToken);
          if (newTok !== accessToken) {
            ({ resp, js, text } = await doGetWithBackoff(url, newTok));
          }
        }
        if (!resp.ok) {
          // Rate limit: enfileira retentativa
          if (resp.status === 429 || resp.status === 503) {
            try {
              await admin.from('ml_retry_queue').insert({
                job_type: 'descriptions',
                organizations_id: organizationId,
                payload: { itemId: id },
                attempts: 0,
                max_attempts: 5,
                next_retry_at: new Date(Date.now() + 30_000).toISOString(),
                last_error: `HTTP ${resp.status}`
              });
            } catch {}
          }
          console.warn('[ml-desc]', rid, 'fetch failed', id, resp.status, text?.slice(0, 300));
          return;
        }
        const plainText = (js?.plain_text ?? null);
        const html = (js?.text ?? js?.html ?? null);
        // Atualiza marketplace_items sempre que possível
        // Tenta atualizar marketplace_items (se colunas existirem)
        let miUpdated = false;
        try {
          const { error: miErr } = await admin
            .from('marketplace_items')
            .update({
              description_plain_text: plainText,
              description_html: html,
              last_description_update: nowIso,
              updated_at: nowIso,
            })
            .eq('organizations_id', organizationId)
            .eq('marketplace_name', 'Mercado Livre')
            .eq('marketplace_item_id', id);
          if (!miErr) miUpdated = true; else console.warn('[ml-desc]', rid, 'marketplace_items update error', id, miErr.message);
        } catch {}

        // Se a tabela dedicada existir, também persiste lá (normalizado)
        // Tenta persistir também na tabela normalizada (se existir)
        try {
          const row = {
            organizations_id: organizationId,
            marketplace_name: 'Mercado Livre',
            marketplace_item_id: id,
            plain_text: plainText,
            html,
            last_updated: nowIso,
            updated_at: nowIso,
          } as const;
          const { error: upErr } = await admin
            .from('marketplace_item_descriptions')
            .upsert(row, { onConflict: 'organizations_id,marketplace_name,marketplace_item_id' });
          if (upErr) console.warn('[ml-desc]', rid, 'upsert error', id, upErr.message);
          else miUpdated = true; // considerar operação bem-sucedida para contagem
        } catch {}

        if (miUpdated) updatedCount += 1;
      } catch (e) {
        console.warn('[ml-desc]', rid, 'worker error', id, (e as any)?.message || e);
      }
    };

    while (i < ids.length) {
      while (workers.length < MAX_CONCURRENCY && i < ids.length) workers.push(runOne(ids[i++]));
      await Promise.all(workers).catch(() => {});
      workers.length = 0;
      if (i < ids.length) await sleep(500);
    }

    return json({ ok: true, updated: updatedCount, rid }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});