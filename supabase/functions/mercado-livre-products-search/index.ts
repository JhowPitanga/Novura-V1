import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importAesGcmKey, aesGcmDecryptFromString, checkAndRefreshToken } from "../_shared/token-utils.ts";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function getResultsField(v: unknown): unknown[] {
  if (isRecord(v)) {
    const val = (v as Record<string, unknown>)["results"];
    return Array.isArray(val) ? val : [];
  }
  return [];
}
function mapDomain(arr: unknown[]): { id: string; name: string; category_id: string | null }[] {
  return arr.map((r) => {
    if (isRecord(r)) {
      const rec = r as Record<string, unknown>;
      const id = typeof rec["id"] === "string" ? String(rec["id"]) :
                 typeof rec["domain_id"] === "string" ? String(rec["domain_id"]) :
                 typeof rec["name"] === "string" ? String(rec["name"]) :
                 crypto.randomUUID();
      const name = typeof rec["name"] === "string" ? String(rec["name"]) :
                   typeof rec["domain_name"] === "string" ? String(rec["domain_name"]) :
                   typeof rec["title"] === "string" ? String(rec["title"]) : "Produto";
      let category_id: string | null = null;
      if (typeof rec["category_id"] === "string") category_id = String(rec["category_id"]);
      else if (isRecord(rec["category"])) {
        const cid = (rec["category"] as Record<string, unknown>)["id"];
        category_id = typeof cid === "string" ? String(cid) : null;
      }
      return { id, name, category_id };
    }
    return { id: crypto.randomUUID(), name: "Produto", category_id: null };
  });
}

function jsonResponse(body: unknown, status = 200) {
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
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn("ml-products-search invalid_json", { correlationId, error: err instanceof Error ? err.message : String(err) });
      return jsonResponse({ error: "Invalid JSON body", correlationId }, 400);
    }
    const organizationId = typeof body["organizationId"] === "string" ? String(body["organizationId"]) : undefined;
    const siteId = typeof body["siteId"] === "string" ? String(body["siteId"]) : "MLB";
    const query = typeof body["query"] === "string" ? String(body["query"]) : "";
    const mode = typeof body["mode"] === "string" ? String(body["mode"]) : "title";
    const domainId = typeof body["domainId"] === "string" ? String(body["domainId"]) : undefined;
    const limit = Number(body["limit"]) || 10;
    const offset = Number(body["offset"]) || 0;
    console.log("ml-products-search input", { correlationId, organizationId, siteId, mode, query_len: (typeof query === "string" ? query.length : 0) });
    if (!organizationId || !query) return jsonResponse({ error: "organizationId and query required", correlationId }, 400);

    const authHeader = req.headers.get("Authorization") || undefined;
    const baseUrl = new URL(req.url).origin;
    const supabaseUrl = Deno.env.get("REMOTE_URL") || Deno.env.get("SUPABASE_URL") || baseUrl;
    const headerApiKey = req.headers.get("apikey") || req.headers.get("x-apikey") || undefined;
    const serviceRoleKey = Deno.env.get("SRK") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || undefined;
    console.log("ml-products-search init", { correlationId, supabase_url: supabaseUrl, auth_present: !!authHeader, apikey_present: !!headerApiKey, has_service_role: !!serviceRoleKey, has_anon_key: !!anonKey, has_enc_key: !!ENC_KEY_B64 });
    const admin = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;
    const userClient = (anonKey || headerApiKey) ? createClient(supabaseUrl, (anonKey || headerApiKey)!, { global: authHeader ? { headers: { Authorization: authHeader } } : {} }) : null;
    const db = (admin || userClient);
    console.log("ml-products-search db_client", { correlationId, type: admin ? "admin" : (userClient ? "user" : "none") });
    if (!db) return jsonResponse({ error: "Missing Supabase client configuration", correlationId }, 500);
    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch (err) { aesKey = null; console.warn("ml-products-search aes_import_error", { correlationId, error: err instanceof Error ? err.message : String(err) }); }
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
    let callerId: string | null = null;
    try {
      const { data: appRow } = await db
        .from("apps")
        .select("client_id")
        .eq("name", integ?.marketplace_name === "mercado_livre" ? "Mercado Livre" : (integ?.marketplace_name || "Mercado Livre"))
        .single();
      callerId = appRow?.client_id ? String(appRow.client_id) : null;
    } catch (err) { callerId = null; }
    let accessToken: string | null = null;
    if (integ) {
      const raw = String(integ.access_token || "");
      const isEnc = raw.startsWith("enc:gcm:");
      if (aesKey) {
        try {
          accessToken = await aesGcmDecryptFromString(aesKey, raw);
          console.log("ml-products-search token_decrypt", { correlationId, decrypted: true });
        } catch (err) {
          accessToken = isEnc ? null : raw;
          console.log("ml-products-search token_decrypt", { correlationId, decrypted: false, treated_as_plain: !isEnc, error: err instanceof Error ? err.message : String(err) });
        }
      } else {
        accessToken = isEnc ? null : raw;
        console.log("ml-products-search token_decrypt", { correlationId, decrypted: false, treated_as_plain: !isEnc });
      }
    }

    const base = `https://api.mercadolibre.com/products/search?status=active&site_id=${encodeURIComponent(siteId)}${domainId ? `&domain_id=${encodeURIComponent(domainId)}` : ""}&limit=${limit}&offset=${offset}`;
    const url = mode === "barcode"
      ? `${base}&product_identifier=${encodeURIComponent(query)}`
      : `${base}&q=${encodeURIComponent(query)}`;
    const commonHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      Referer: "https://www.mercadolivre.com.br/catalogo/explorar",
      Origin: "https://www.mercadolivre.com.br",
      "Cache-Control": "no-cache",
      "X-Requested-With": "XMLHttpRequest",
      Connection: "keep-alive",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      "Sec-Ch-Ua": "\"Chromium\";v=\"120\", \"Not.A/Brand\";v=\"24\"",
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": "\"Windows\"",
      "Accept-Encoding": "gzip, deflate, br",
      "X-Caller-Id": callerId || "",
      "X-Meli-Session-Id": String(correlationId)
    };
    if (!accessToken) {
      try {
          const fallbackUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
        const f = await fetch(fallbackUrl, { headers: { ...commonHeaders } });
        let fj: unknown = null; let ft: string | null = null; const fct = f.headers.get("content-type") || "";
        if (fct.includes("application/json")) { try { fj = await f.json(); } catch (err) { try { ft = await f.text(); } catch (err2) { ft = null; console.warn("ml-products-search sites_search_text_err", { correlationId, error: err2 instanceof Error ? err2.message : String(err2) }); } } }
        else { try { ft = await f.text(); } catch (err3) { ft = null; console.warn("ml-products-search sites_search_text_err", { correlationId, error: err3 instanceof Error ? err3.message : String(err3) }); } if (ft) { try { fj = JSON.parse(ft); } catch (err4) { console.warn("ml-products-search sites_search_json_parse_err", { correlationId, error: err4 instanceof Error ? err4.message : String(err4) }); } } }
        console.log("ml-products-search fallback_sites_search_no_token", { correlationId, status: f.status, ok: f.ok });
        if (f.ok) {
          const items = getResultsField(fj);
          return jsonResponse({ ok: true, results: items, correlationId }, 200);
        }
        const ddUrl = `https://api.mercadolibre.com/domain_discovery/search?q=${encodeURIComponent(query)}&site_id=${encodeURIComponent(siteId)}&limit=${limit}`;
        const dd = await fetch(ddUrl, { headers: { ...commonHeaders } });
        let ddj: unknown = null; let ddt: string | null = null; const ddct = dd.headers.get("content-type") || "";
        if (ddct.includes("application/json")) { try { ddj = await dd.json(); } catch (err) { try { ddt = await dd.text(); } catch (err2) { ddt = null; console.warn("ml-products-search dd_text_err", { correlationId, error: err2 instanceof Error ? err2.message : String(err2) }); } } }
        else { try { ddt = await dd.text(); } catch (err3) { ddt = null; console.warn("ml-products-search dd_text_err", { correlationId, error: err3 instanceof Error ? err3.message : String(err3) }); } if (ddt) { try { ddj = JSON.parse(ddt); } catch (err4) { console.warn("ml-products-search dd_json_parse_err", { correlationId, error: err4 instanceof Error ? err4.message : String(err4) }); } } }
        console.log("ml-products-search fallback_domain_discovery_no_token", { correlationId, status: dd.status, ok: dd.ok });
        if (dd.ok) {
          const arr: unknown[] = Array.isArray(ddj) ? ddj : getResultsField(ddj);
          const mapped = mapDomain(arr);
          return jsonResponse({ ok: true, results: mapped, correlationId }, 200);
        }
      } catch (err) { console.warn("ml-products-search public_fallback_error", { correlationId, error: err instanceof Error ? err.message : String(err) }); }
      return jsonResponse({ error: "search failed", status: 403, meli: {}, correlationId }, 200);
    }
    console.log("ml-products-search call_meli", { correlationId, url });
    let resp = await fetch(url, { headers: { ...commonHeaders, Authorization: `Bearer ${accessToken}` } });
    const ct = resp.headers.get("content-type") || "";
    let json: unknown = null;
    let text: string | null = null;
    if (ct.includes("application/json")) {
      try { json = await resp.json(); } catch (err) { try { text = await resp.text(); } catch (err2) { text = null; console.warn("ml-products-search resp_text_err", { correlationId, error: err2 instanceof Error ? err2.message : String(err2) }); } }
    } else {
      try { text = await resp.text(); } catch (err3) { text = null; console.warn("ml-products-search resp_text_err", { correlationId, error: err3 instanceof Error ? err3.message : String(err3) }); }
      if (text) { try { json = JSON.parse(text); } catch (err4) { console.warn("ml-products-search resp_json_parse_err", { correlationId, error: err4 instanceof Error ? err4.message : String(err4) }); } }
    }
    console.log("ml-products-search meli_resp", { correlationId, status: resp.status, ok: resp.ok, ct, preview: (text ? text.slice(0, 300) : undefined) });
    if (!resp.ok && (resp.status === 401 || resp.status === 403) && admin && aesKey && integ?.id) {
      try {
        const refreshed = await checkAndRefreshToken(admin, aesKey, String(integ.id));
        if (refreshed?.success && refreshed?.accessToken) {
          accessToken = refreshed.accessToken;
          resp = await fetch(url, { headers: { ...commonHeaders, Authorization: `Bearer ${accessToken}` } });
        }
      } catch (err) { console.warn("ml-products-search token_refresh_error", { correlationId, error: err instanceof Error ? err.message : String(err) }); }
      const ct2 = resp.headers.get("content-type") || "";
      json = null; text = null;
      if (ct2.includes("application/json")) {
        try { json = await resp.json(); } catch (err5) { try { text = await resp.text(); } catch (err6) { text = null; console.warn("ml-products-search resp_text_err", { correlationId, error: err6 instanceof Error ? err6.message : String(err6) }); } }
      } else {
        try { text = await resp.text(); } catch (err7) { text = null; console.warn("ml-products-search resp_text_err", { correlationId, error: err7 instanceof Error ? err7.message : String(err7) }); }
        if (text) { try { json = JSON.parse(text); } catch (err8) { console.warn("ml-products-search resp_json_parse_err", { correlationId, error: err8 instanceof Error ? err8.message : String(err8) }); } }
      }
      console.log("ml-products-search meli_resp_after_refresh", { correlationId, status: resp.status, ok: resp.ok, ct: ct2, preview: (text ? text.slice(0, 300) : undefined) });
    }
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        if (accessToken) {
          try {
            const siteAuthUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
            const sf = await fetch(siteAuthUrl, { headers: { ...commonHeaders, Authorization: `Bearer ${accessToken}` } });
            let sfj: unknown = null; let sft: string | null = null; const sfct = sf.headers.get("content-type") || "";
            if (sfct.includes("application/json")) { try { sfj = await sf.json(); } catch (err) { try { sft = await sf.text(); } catch (err2) { sft = null; } } }
            else { try { sft = await sf.text(); } catch (err3) { sft = null; } if (sft) { try { sfj = JSON.parse(sft); } catch (err4) { sfj = null; } } }
            console.log("ml-products-search fallback_sites_search_with_auth", { correlationId, status: sf.status, ok: sf.ok });
            if (sf.ok) {
              const items = getResultsField(sfj);
              return jsonResponse({ ok: true, results: items, correlationId }, 200);
            }
          } catch (err) { console.warn("ml-products-search fallback_sites_auth_err", { correlationId, error: err instanceof Error ? err.message : String(err) }); }
        }
        try {
          const fallbackUrl = `https://api.mercadolibre.com/sites/${encodeURIComponent(siteId)}/search?q=${encodeURIComponent(query)}`;
          const f = await fetch(fallbackUrl, { headers: { ...commonHeaders } });
          let fj: unknown = null; let ft: string | null = null;
          const fct = f.headers.get("content-type") || "";
          if (fct.includes("application/json")) { try { fj = await f.json(); } catch (err) { try { ft = await f.text(); } catch (err2) { ft = null; console.warn("ml-products-search sites_search_text_err", { correlationId, error: err2 instanceof Error ? err2.message : String(err2) }); } } }
          else { try { ft = await f.text(); } catch (err3) { ft = null; console.warn("ml-products-search sites_search_text_err", { correlationId, error: err3 instanceof Error ? err3.message : String(err3) }); } if (ft) { try { fj = JSON.parse(ft); } catch (err4) { console.warn("ml-products-search sites_search_json_parse_err", { correlationId, error: err4 instanceof Error ? err4.message : String(err4) }); } } }
          console.log("ml-products-search fallback_sites_search", { correlationId, status: f.status, ok: f.ok });
          if (f.ok) {
            const items = getResultsField(fj);
            return jsonResponse({ ok: true, results: items, correlationId }, 200);
          }
          const ddUrl = `https://api.mercadolibre.com/domain_discovery/search?q=${encodeURIComponent(query)}&site_id=${encodeURIComponent(siteId)}&limit=10`;
          const dd = await fetch(ddUrl, { headers: { ...commonHeaders } });
          let ddj: unknown = null; let ddt: string | null = null; const ddct = dd.headers.get("content-type") || "";
          if (ddct.includes("application/json")) { try { ddj = await dd.json(); } catch (err) { try { ddt = await dd.text(); } catch (err2) { ddt = null; console.warn("ml-products-search dd_text_err", { correlationId, error: err2 instanceof Error ? err2.message : String(err2) }); } } }
          else { try { ddt = await dd.text(); } catch (err3) { ddt = null; console.warn("ml-products-search dd_text_err", { correlationId, error: err3 instanceof Error ? err3.message : String(err3) }); } if (ddt) { try { ddj = JSON.parse(ddt); } catch (err4) { console.warn("ml-products-search dd_json_parse_err", { correlationId, error: err4 instanceof Error ? err4.message : String(err4) }); } } }
          console.log("ml-products-search fallback_domain_discovery", { correlationId, status: dd.status, ok: dd.ok });
          if (dd.ok) {
            const arr: unknown[] = Array.isArray(ddj) ? ddj : getResultsField(ddj);
            const mapped = mapDomain(arr);
            return jsonResponse({ ok: true, results: mapped, correlationId }, 200);
          }
        } catch (err) { console.warn("ml-products-search public_fallback_error", { correlationId, error: err instanceof Error ? err.message : String(err) }); }
      }
      return jsonResponse({ error: "search failed", status: resp.status, meli: json || (text ? { raw: text } : {}), correlationId }, 200);
    }
    const results = getResultsField(json);
    const products = isRecord(json) ? (Array.isArray((json as Record<string, unknown>)["products"]) ? ((json as Record<string, unknown>)["products"] as unknown[]) : []) : [];
    return jsonResponse({ ok: true, results: (results.length ? results : products), correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("ml-products-search exception", { correlationId, error: msg, stack: (e instanceof Error ? e.stack : undefined) });
    return jsonResponse({ error: msg, correlationId }, 500);
  }
});