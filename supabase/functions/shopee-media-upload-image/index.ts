import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id",
    },
  });
}
function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = b64ToUint8(base64Key);
  const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength);
  return crypto.subtle.importKey("raw", keyBuf as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> {
  const parts = encStr.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format");
  const iv = b64ToUint8(parts[2]);
  const ct = b64ToUint8(parts[3]);
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const ctBuf = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, ctBuf);
  return new TextDecoder().decode(pt);
}
async function tryDecryptToken(key: CryptoKey, encStr: string): Promise<string> {
  const s = String(encStr || "");
  if (!s) return "";
  try {
    if (s.startsWith("enc:gcm:")) return await aesGcmDecryptFromString(key, s);
  } catch (_) {}
  return s;
}
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.toUpperCase();
}
function getField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}
function getStr(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !(k in (cur as Record<string, unknown>))) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  const v = cur as unknown;
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}
serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);
  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(bodyText); } catch (_) { body = {}; }
    const url = new URL(req.url);
    const organizationId = getStr(body, ["organizationId"]) || url.searchParams.get("organizationId") || undefined;
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || url.searchParams.get("shop_id") || url.searchParams.get("shopId") || null;
    const imageUrl = getStr(body, ["image_url"]) || url.searchParams.get("image_url") || null;
    const scene = getStr(body, ["scene"]) || url.searchParams.get("scene") || "normal";
    const shopIdInput = shopIdStr ? Number(shopIdStr) : null;
    if (!imageUrl) return jsonResponse({ ok: false, error: "Missing image_url" }, 200);
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);
    const hosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
    let integration: any = null;
    if (shopIdInput) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopIdInput},meli_user_id.eq.${shopIdInput}`)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    } else if (organizationId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("organizations_id", organizationId)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    }
    if (!integration) return jsonResponse({ ok: false, error: "No Shopee integration found", correlationId }, 200);
    const cfg = getField(integration, "config") as Record<string, unknown> | null;
    const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
      ? Number(cfg?.["shopee_shop_id"])
      : Number(getField(integration, "meli_user_id") || 0);
    if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) return jsonResponse({ ok: false, error: "Integration missing shop_id", correlationId }, 200);
    const integrationId = String(getField(integration, "id"));
    const accRaw = String(getField(integration, "access_token") || "");
    const refRaw = String(getField(integration, "refresh_token") || "");
    let accessToken = await tryDecryptToken(aesKey, accRaw);
    let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);
    const refreshPath = "/api/v2/auth/access_token/get";
    const tryRefreshAccessToken = async (): Promise<boolean> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = await hmacSha256Hex(partnerKey, `${partnerId}${refreshPath}${timestamp}`);
      if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
      for (const host of hosts) {
        const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
        try {
          const resp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shop_id: Number(shopIdCandidate), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
          });
          const text = await resp.text();
          let json: any = {};
          try { json = JSON.parse(text); } catch (_) { json = {}; }
          if (resp.ok && json && json.access_token) {
            accessToken = String(json.access_token);
            refreshTokenPlain = String(json.refresh_token || refreshTokenPlain);
            try {
              const iv = crypto.getRandomValues(new Uint8Array(12));
              const ctA = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(accessToken));
              const ctB = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(refreshTokenPlain));
              const accEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctA)))}`;
              const refEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctB)))}`;
              const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
              await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", integrationId);
            } catch (_) {}
            return true;
          }
        } catch (_) { continue; }
      }
      return false;
    };
    if (!accessToken) await tryRefreshAccessToken();
    const ts = Math.floor(Date.now() / 1000);
    const path = "/api/v2/media_space/upload_image";
    let sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
    const buildUrl = (host: string) => {
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      if (scene) qs.set("scene", String(scene));
      return `${host}${path}?${qs.toString()}`;
    };
    let blob: Blob | null = null;
    try {
      const respImg = await fetch(imageUrl);
      const arr = new Uint8Array(await respImg.arrayBuffer());
      blob = new Blob([arr], { type: respImg.headers.get("content-type") || "image/jpeg" });
    } catch (_) {
      blob = null;
    }
    if (!blob) return jsonResponse({ ok: false, correlationId, error: "Failed to fetch image" }, 200);
    for (const host of hosts) {
      const urlReq = buildUrl(host);
      try {
        const fd = new FormData();
        fd.append("image", blob, "upload.jpg");
        const resp = await fetch(urlReq, { method: "POST", body: fd });
        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch (_) { json = null; }
        if (!resp.ok) {
          const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
          if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
            const refreshed = await tryRefreshAccessToken();
            if (refreshed) sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
          }
        }
        if (resp.status === 401 || resp.status === 403) continue;
        if (resp.ok) return jsonResponse({ ok: true, correlationId, data: json }, 200);
        return jsonResponse({ ok: false, correlationId, status: resp.status, error: (json as any)?.message || (json as any)?.msg || "Shopee API error", data: json }, 200);
      } catch (_) { continue; }
    }
    return jsonResponse({ ok: false, correlationId, error: "Shopee API unreachable" }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "Unknown error");
    return jsonResponse({ ok: false, error: msg }, 200);
  }
})
