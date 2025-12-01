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

function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)); const ivStr = btoa(String.fromCharCode(...iv)); const ctStr = btoa(String.fromCharCode(...new Uint8Array(ct))); return `enc:gcm:${ivStr}:${ctStr}`; }

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const bodyText = await req.text();
    let parsed: any = {}; try { parsed = bodyText ? JSON.parse(bodyText) : {}; } catch { parsed = {}; }
    const urlObj = new URL(req.url);
    const organizationId = parsed?.organizationId || urlObj.searchParams.get('organizationId');
    const categoryId = parsed?.categoryId || urlObj.searchParams.get('categoryId');
    const attributes = Array.isArray(parsed?.attributes) ? parsed.attributes : [];
    if (!organizationId || !categoryId) return jsonResponse({ error: "organizationId and categoryId required" }, 400);

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, marketplace_name, access_token, refresh_token")
      .eq("organizations_id", String(organizationId))
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: "Integration not found" }, 404);

    const reqBody = { attributes };
    let accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
    let resp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes/conditional`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(reqBody)
    });
    if (resp.status === 401 || resp.status === 403) {
      const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret").eq("name", "Mercado Livre").single();
      if (!appRow || appErr) return jsonResponse({ error: "App credentials not found" }, 500);
      const refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
      const tokenResp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: String(appRow.client_id), client_secret: String(appRow.client_secret), refresh_token: refreshTokenPlain })
      });
      if (!tokenResp.ok) return jsonResponse({ error: "Token refresh failed", status: tokenResp.status }, 200);
      const tokenJson = await tokenResp.json();
      const newAccessEnc = await aesGcmEncryptToString(aesKey, tokenJson.access_token);
      const newRefreshEnc = await aesGcmEncryptToString(aesKey, tokenJson.refresh_token);
      const expiresAtIso = new Date(Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000).toISOString();
      await admin.from("marketplace_integrations").update({ access_token: newAccessEnc, refresh_token: newRefreshEnc, token_expires_at: expiresAtIso }).eq("id", integration.id);
      resp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/attributes/conditional`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });
    }
    if (!resp.ok) return jsonResponse({ error: "Failed", status: resp.status }, 200);
    const ml = await resp.json();
    let requiredIds: string[] = [];
    try {
      if (Array.isArray(ml?.required_attributes)) requiredIds = (ml.required_attributes as any[]).map((x: any) => String(x?.id || x)).filter(Boolean);
      else if (Array.isArray(ml?.attributes)) requiredIds = (ml.attributes as any[]).filter((x: any) => x?.tags?.required || x?.tags?.conditional_required).map((x: any) => String(x?.id)).filter(Boolean);
    } catch {}
    return jsonResponse({ required_ids: requiredIds, raw: ml }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});