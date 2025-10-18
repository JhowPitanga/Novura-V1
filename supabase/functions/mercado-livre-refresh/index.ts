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

// AES-GCM helpers (match callback format enc:gcm:<iv>:<ct>)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { integrationId } = await req.json();
    if (!integrationId) return jsonResponse({ error: "Missing integrationId" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!ENC_KEY_B64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: integ, error: getErr } = await admin
      .from("marketplace_integrations")
      .select("id, refresh_token, marketplace_name")
      .eq("id", integrationId)
      .single();

    if (getErr || !integ) return jsonResponse({ error: getErr?.message || "Integration not found" }, 404);
    if (!integ.refresh_token) return jsonResponse({ error: "Missing refresh_token" }, 400);

    // Decrypt stored refresh_token
    let refreshTokenPlain: string;
    try {
      refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integ.refresh_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: `Failed to decrypt refresh_token: ${msg}` }, 500);
    }

    // Fetch app credentials from public.apps by marketplace_name
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", integ.marketplace_name === "mercado_livre" ? "Mercado Livre" : integ.marketplace_name)
      .single();

    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App credentials not found" }, 404);

    const clientSecret = appRow.client_secret || Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || null;
    if (!clientSecret) return jsonResponse({ error: "Missing client_secret (DB or env)" }, 400);

    const form = new URLSearchParams();
    form.append("grant_type", "refresh_token");
    form.append("client_id", appRow.client_id);
    form.append("client_secret", clientSecret);
    form.append("refresh_token", refreshTokenPlain);

    const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    const json = await resp.json();
    if (!resp.ok) return jsonResponse({ error: json?.error_description || "Refresh failed", details: json }, resp.status);

    const { access_token, refresh_token, expires_in, user_id } = json;
    const expiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();

    // Re-encrypt tokens before saving
    const access_token_enc = await aesGcmEncryptToString(aesKey, access_token);
    const refresh_token_enc = await aesGcmEncryptToString(aesKey, refresh_token);

    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({ access_token: access_token_enc, refresh_token: refresh_token_enc, expires_in: expiresAtIso, meli_user_id: user_id })
      .eq("id", integrationId);

    if (updErr) return jsonResponse({ error: updErr.message }, 500);

    return jsonResponse({ ok: true, expires_in: expiresAtIso });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});