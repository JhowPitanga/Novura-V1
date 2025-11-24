import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importAesGcmKey, aesGcmDecryptFromString, checkAndRefreshToken } from "../_shared/token-utils.ts";

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

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || undefined;
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (_) {
      console.warn("ml-products-search invalid_json", { correlationId });
      return jsonResponse({ error: "Invalid JSON body", correlationId }, 400);
    }
    const organizationId: string | undefined = body?.organizationId;
    const siteId: string = body?.siteId || "MLB";
    const query: string = body?.query || "";
    const mode: string = body?.mode || "title";
    const domainId: string | undefined = body?.domainId;
    const limit: number = Number(body?.limit) || 10;
    const offset: number = Number(body?.offset) || 0;
    console.log("ml-products-search input", { correlationId, organizationId, siteId, mode, query_len: (typeof query === "string" ? query.length : 0) });
    if (!organizationId || !query) return jsonResponse({ error: "organizationId and query required", correlationId }, 400);

    const authHeader = req.headers.get("Authorization") || undefined;
    const baseUrl = new URL(req.url).origin;
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || baseUrl;
    const headerApiKey = req.headers.get("apikey") || req.headers.get("x-apikey") || undefined;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || undefined;
    console.log("ml-products-search init", { correlationId, supabase_url: supabaseUrl, auth_present: !!authHeader, apikey_present: !!headerApiKey, has_service_role: !!serviceRoleKey, has_anon_key: !!anonKey, has_enc_key: !!ENC_KEY_B64 });
    const admin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
    const userClient = (anonKey || headerApiKey) ? createClient(supabaseUrl, (anonKey || headerApiKey)!, { global: authHeader ? { headers: { Authorization: authHeader } } : {} }) : null;
    const db = (admin || userClient);
    console.log("ml-products-search db_client", { correlationId, type: admin ? "admin" : (userClient ? "user" : "none") });
    if (!db) return jsonResponse({ error: "Missing Supabase client configuration", correlationId }, 500);
    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch { aesKey = null; }
    }
    const { data: integ, error: integErr } = await db
      .from("marketplace_integrations")
      .select("id, access_token, meli_user_id, marketplace_name")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    console.log("ml-products-search integration_fetch", { correlationId, org: organizationId, error: integErr?.message, found: !!integ });
    let accessToken: string | null = null;
    if (integ) {
      if (aesKey) {
        try { accessToken = await aesGcmDecryptFromString(aesKey, integ.access_token); console.log("ml-products-search token_decrypt", { correlationId, decrypted: true }); } catch { accessToken = integ.access_token; console.log("ml-products-search token_decrypt", { correlationId, decrypted: false }); }
      } else {
        accessToken = integ.access_token;
        console.log("ml-products-search token_decrypt", { correlationId, decrypted: false });
      }
    }

    const base = `https://api.mercadolibre.com/products/search?status=active&site_id=${encodeURIComponent(siteId)}${domainId ? `&domain_id=${encodeURIComponent(domainId)}` : ""}&limit=${limit}&offset=${offset}`;
    const url = mode === "barcode"
      ? `${base}&product_identifier=${encodeURIComponent(query)}`
      : `${base}&q=${encodeURIComponent(query)}`;
    const commonHeaders: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.mercadolivre.com.br/catalogo/explorar",
      Origin: "https://www.mercadolivre.com.br",
      "Cache-Control": "no-cache"
    };
    if (!accessToken) {
      try {
          const fallbackUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
        const f = await fetch(fallbackUrl, { headers: { ...commonHeaders } });
        let fj: any = null; let ft: string | null = null; const fct = f.headers.get("content-type") || "";
        if (fct.includes("application/json")) { try { fj = await f.json(); } catch { try { ft = await f.text(); } catch { ft = null; } } }
        else { try { ft = await f.text(); } catch { ft = null; } if (ft) { try { fj = JSON.parse(ft); } catch {} } }
        console.log("ml-products-search fallback_sites_search_no_token", { correlationId, status: f.status, ok: f.ok });
        if (f.ok) {
          const items = Array.isArray(fj?.results) ? fj.results : [];
          return jsonResponse({ ok: true, results: items, correlationId }, 200);
        }
        const ddUrl = `https://api.mercadolibre.com/domain_discovery/search?q=${encodeURIComponent(query)}&limit=${limit}`;
        const dd = await fetch(ddUrl, { headers: { ...commonHeaders } });
        let ddj: any = null; let ddt: string | null = null; const ddct = dd.headers.get("content-type") || "";
        if (ddct.includes("application/json")) { try { ddj = await dd.json(); } catch { try { ddt = await dd.text(); } catch { ddt = null; } } }
        else { try { ddt = await dd.text(); } catch { ddt = null; } if (ddt) { try { ddj = JSON.parse(ddt); } catch {} } }
        console.log("ml-products-search fallback_domain_discovery_no_token", { correlationId, status: dd.status, ok: dd.ok });
        if (dd.ok) {
          const arr = Array.isArray(ddj) ? ddj : (Array.isArray(ddj?.results) ? ddj.results : []);
          const mapped = arr.map((r: any) => ({ id: r?.id || r?.domain_id || r?.name || crypto.randomUUID(), name: r?.name || r?.domain_name || r?.title || "Produto", category_id: r?.category_id || r?.category?.id || null }));
          return jsonResponse({ ok: true, results: mapped, correlationId }, 200);
        }
      } catch {}
      return jsonResponse({ error: "search failed", status: 403, meli: {}, correlationId }, 200);
    }
    console.log("ml-products-search call_meli", { correlationId, url });
    let resp = await fetch(url, { headers: { ...commonHeaders, Authorization: `Bearer ${accessToken}` } });
    const ct = resp.headers.get("content-type") || "";
    let json: any = null;
    let text: string | null = null;
    if (ct.includes("application/json")) {
      try { json = await resp.json(); } catch { try { text = await resp.text(); } catch { text = null; } }
    } else {
      try { text = await resp.text(); } catch { text = null; }
      if (text) { try { json = JSON.parse(text); } catch {} }
    }
    console.log("ml-products-search meli_resp", { correlationId, status: resp.status, ok: resp.ok, ct, preview: (text ? text.slice(0, 300) : undefined) });
    if (!resp.ok && (resp.status === 401 || resp.status === 403) && admin && aesKey && integ?.id) {
      try {
        const refreshed = await checkAndRefreshToken(admin, aesKey, String(integ.id));
        if (refreshed?.success && refreshed?.accessToken) {
          accessToken = refreshed.accessToken;
          resp = await fetch(url, { headers: { ...commonHeaders, Authorization: `Bearer ${accessToken}` } });
        }
      } catch {}
      const ct2 = resp.headers.get("content-type") || "";
      json = null; text = null;
      if (ct2.includes("application/json")) {
        try { json = await resp.json(); } catch { try { text = await resp.text(); } catch { text = null; } }
      } else {
        try { text = await resp.text(); } catch { text = null; }
        if (text) { try { json = JSON.parse(text); } catch {} }
      }
      console.log("ml-products-search meli_resp_after_refresh", { correlationId, status: resp.status, ok: resp.ok, ct: ct2, preview: (text ? text.slice(0, 300) : undefined) });
    }
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        try {
          const fallbackUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(query)}&search_type=scan`;
          const f = await fetch(fallbackUrl, { headers: { ...commonHeaders } });
          let fj: any = null; let ft: string | null = null;
          const fct = f.headers.get("content-type") || "";
          if (fct.includes("application/json")) { try { fj = await f.json(); } catch { try { ft = await f.text(); } catch { ft = null; } } }
          else { try { ft = await f.text(); } catch { ft = null; } if (ft) { try { fj = JSON.parse(ft); } catch {} } }
          console.log("ml-products-search fallback_sites_search", { correlationId, status: f.status, ok: f.ok });
          if (f.ok) {
            const items = Array.isArray(fj?.results) ? fj.results : [];
            return jsonResponse({ ok: true, results: items, correlationId }, 200);
          }
          const ddUrl = `https://api.mercadolibre.com/domain_discovery/search?q=${encodeURIComponent(query)}&limit=10`;
          const dd = await fetch(ddUrl, { headers: { ...commonHeaders } });
          let ddj: any = null; let ddt: string | null = null; const ddct = dd.headers.get("content-type") || "";
          if (ddct.includes("application/json")) { try { ddj = await dd.json(); } catch { try { ddt = await dd.text(); } catch { ddt = null; } } }
          else { try { ddt = await dd.text(); } catch { ddt = null; } if (ddt) { try { ddj = JSON.parse(ddt); } catch {} } }
          console.log("ml-products-search fallback_domain_discovery", { correlationId, status: dd.status, ok: dd.ok });
          if (dd.ok) {
            const arr = Array.isArray(ddj) ? ddj : (Array.isArray(ddj?.results) ? ddj.results : []);
            const mapped = arr.map((r: any) => ({ id: r?.id || r?.domain_id || r?.name || crypto.randomUUID(), name: r?.name || r?.domain_name || r?.title || "Produto", category_id: r?.category_id || r?.category?.id || null }));
            return jsonResponse({ ok: true, results: mapped, correlationId }, 200);
          }
        } catch {}
      }
      return jsonResponse({ error: "search failed", status: resp.status, meli: json || (text ? { raw: text } : {}), correlationId }, 200);
    }
    return jsonResponse({ ok: true, results: (json?.results || json?.products || []), correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ml-products-search exception", { correlationId, error: msg, stack: (e instanceof Error ? e.stack : undefined) });
    return jsonResponse({ error: msg, correlationId }, 500);
  }
});