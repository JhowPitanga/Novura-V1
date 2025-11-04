// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// AES-GCM helpers (match enc:gcm:<iv>:<ct>)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

// JWT helpers (decode sub)
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse body
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const organizationId: string | undefined = body?.organizationId;
    const shipmentIdsInput: string[] = Array.isArray(body?.shipment_ids) ? body.shipment_ids.map((x: any) => String(x)) : [];
    const responseTypeInput: string = String(body?.response_type || "pdf").toLowerCase();
    const responseType = responseTypeInput === "zpl2" ? "zpl2" : "pdf";
    if (!organizationId) return jsonResponse({ error: "Missing organizationId" }, 400);
    if (!shipmentIdsInput || shipmentIdsInput.length === 0) return jsonResponse({ error: "Missing shipment_ids" }, 400);

    // Validate membership using JWT (skip for internal service key calls)
    const authHeader = req.headers.get("Authorization") || "";
    const apiKeyHeader = req.headers.get("apikey") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalHeader = req.headers.get("x-internal-call") === "1";
    const isInternalCall = internalHeader && (apiKeyHeader === SERVICE_ROLE_KEY || bearerToken === SERVICE_ROLE_KEY);
    let userIdFromJwt: string | null = null;
    if (!isInternalCall) {
      if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);
      userIdFromJwt = decodeJwtSub(bearerToken);
      const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", { p_user_id: userIdFromJwt, p_organization_id: organizationId });
      if (permErr || !permData || !Array.isArray(permData) || permData.length === 0) {
        return jsonResponse({ error: permErr?.message || "Unauthorized" }, 403);
      }
    }

    // Fetch ML integration for org
    const { data: integ, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, marketplace_name, access_token, refresh_token, expires_in")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .limit(1)
      .single();

    if (integErr || !integ) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    // Decrypt tokens (support legacy plain when not enc:gcm)
    let accessTokenPlain = "";
    let refreshTokenPlain = "";
    const isAccessEnc = typeof integ.access_token === "string" && integ.access_token.startsWith("enc:gcm:");
    const isRefreshEnc = typeof integ.refresh_token === "string" && integ.refresh_token.startsWith("enc:gcm:");
    try {
      accessTokenPlain = isAccessEnc ? await aesGcmDecryptFromString(aesKey, integ.access_token) : String(integ.access_token || "");
      refreshTokenPlain = isRefreshEnc ? await aesGcmDecryptFromString(aesKey, integ.refresh_token) : String(integ.refresh_token || "");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: `Failed to decrypt tokens: ${msg}` }, 500);
    }

    const expiresAtMillis = (() => { try { return new Date(String(integ.expires_in || "")).getTime(); } catch { return 0; } })();
    const isExpired = !expiresAtMillis || Date.now() >= expiresAtMillis - 30_000; // refresh 30s early

    // Resolve client credentials from apps table (or env) for refresh
    async function refreshTokens(): Promise<string> {
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", "Mercado Livre")
        .limit(1)
        .single();
      if (appErr || !appRow) throw new Error(appErr?.message || "App credentials not found");

      const clientId = appRow.client_id || Deno.env.get("MERCADO_LIVRE_CLIENT_ID");
      const clientSecret = appRow.client_secret || Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET");
      if (!clientId || !clientSecret) throw new Error("Missing client credentials (DB or env)");

      const form = new URLSearchParams();
      form.append("grant_type", "refresh_token");
      form.append("client_id", clientId);
      form.append("client_secret", clientSecret);
      form.append("refresh_token", refreshTokenPlain);

      const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let json: any = {}; try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!resp.ok) throw new Error(json?.error_description || json?.message || `Refresh failed (${resp.status})`);
      const { access_token, refresh_token, expires_in } = json;
      const newExpiresAt = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
      const encAccess = await aesGcmEncryptToString(aesKey, access_token);
      const encRefresh = await aesGcmEncryptToString(aesKey, refresh_token);
      const { error: updErr } = await admin
        .from("marketplace_integrations")
        .update({ access_token: encAccess, refresh_token: encRefresh, expires_in: newExpiresAt })
        .eq("id", integ.id);
      if (updErr) throw new Error(updErr.message);
      accessTokenPlain = access_token;
      refreshTokenPlain = refresh_token;
      return newExpiresAt;
    }

    if (isExpired || !accessTokenPlain) {
      try { await refreshTokens(); } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 502); }
    }

    // Tentar retornar etiqueta do cache em marketplace_orders_raw.labels
    const normalizeIds = (arr: any): string[] => Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
    const sameSet = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const sa = [...a].sort();
      const sb = [...b].sort();
      for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
      return true;
    };

    try {
      const { data: cachedRows } = await admin
        .from("marketplace_orders_raw")
        .select("marketplace_order_id, labels")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", "Mercado Livre")
        .not("labels", "is", null)
        .filter("labels->>response_type", "eq", responseType)
        .limit(50);
      if (Array.isArray(cachedRows)) {
        for (const row of cachedRows) {
          const labels = (row as any)?.labels || null;
          const ids = normalizeIds(labels?.shipment_ids);
          if (labels && ids.length > 0 && sameSet(ids, shipmentIdsInput) && labels?.content_base64) {
            const ct = labels?.content_type || (responseType === "pdf" ? "application/pdf" : "text/plain");
            return jsonResponse({
              ok: true,
              cached: true,
              response_type: responseType,
              content_base64: String(labels.content_base64),
              content_type: ct,
              label_fetched_at: labels?.fetched_at || null,
              label_size_bytes: labels?.size_bytes || null,
              order_id: String((row as any)?.marketplace_order_id || "")
            });
          }
        }
      }
    } catch (_) { /* ignore cache lookup errors */ }

    // Cache não encontrado com conjunto exato de IDs: chamar ML shipment_labels
    const url = new URL("https://api.mercadolibre.com/shipment_labels");
    url.searchParams.set("shipment_ids", shipmentIdsInput.join(","));
    url.searchParams.set("response_type", responseType);

    let mlResp: Response;
    try {
      mlResp = await fetch(url.toString(), { method: "GET", headers: { "Authorization": `Bearer ${accessTokenPlain}` } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: "Failed to call ML shipment_labels", details: msg }, 502);
    }

    // If unauthorized, try refresh once
    if (mlResp.status === 401 || mlResp.status === 403) {
      try { await refreshTokens(); } catch (e) { return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 502); }
      try {
        mlResp = await fetch(url.toString(), { method: "GET", headers: { "Authorization": `Bearer ${accessTokenPlain}` } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse({ error: "Failed to call ML shipment_labels after refresh", details: msg }, 502);
      }
    }

    const buf = await mlResp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const b64 = uint8ToB64(bytes);
    const ct = responseType === "pdf" ? "application/pdf" : "text/plain";
    if (!mlResp.ok) {
      // Tentar decodificar JSON de erro
      const errText = new TextDecoder().decode(bytes);
      let jsonErr: any = {}; try { jsonErr = JSON.parse(errText); } catch { jsonErr = { raw: errText }; }
      return jsonResponse({ error: jsonErr?.message || "ML error", details: jsonErr }, mlResp.status);
    }

    return jsonResponse({ ok: true, response_type: responseType, content_base64: b64, content_type: ct });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});