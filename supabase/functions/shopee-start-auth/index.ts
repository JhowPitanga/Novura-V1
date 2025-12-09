import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
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

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

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

  try {
    const method = req.method;
    const url = new URL(req.url);
    type StartBody = { organizationId?: string; storeName?: string; connectedByUserId?: string; redirect_uri?: string };
    const body = method === "GET" ? null : (await req.json() as StartBody);
    const organizationId = body?.organizationId || null;
    const storeName = body?.storeName || null;
    const connectedByUserId = body?.connectedByUserId || null;
    const redirectOverride = body?.redirect_uri || null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, auth_url, config")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    type AppRow = { client_id?: string; client_secret?: string; auth_url?: string; config?: Record<string, unknown> };
    const app = appRow as AppRow;
    const partnerId = String(app.client_id || "");
    const partnerKey = String(app.client_secret || "");
    const cfg = app.config as Record<string, unknown> | undefined;
    const envName = (Deno.env.get("SHOPEE_ENV") || (typeof cfg?.["env"] === "string" ? String(cfg?.["env"]) : "")).toLowerCase();
    const defaultHost = envName === "sandbox" || envName === "test" ? "https://partner.test-st.shopeemobile.com" : "https://partner.shopeemobile.com";
    const defaultAuthUrl = `${defaultHost}/api/v2/shop/auth_partner`;
    const authUrlBase = String(app.auth_url || Deno.env.get("SHOPEE_AUTH_URL") || defaultAuthUrl);
    const redirectFromConfig = (cfg && typeof cfg["redirect_uri"] === "string") ? String(cfg["redirect_uri"]) : null;
    const redirectEnv = Deno.env.get("SHOPEE_REDIRECT_URI") || null;
    const redirectUri = redirectOverride || redirectFromConfig || redirectEnv || "https://novuraerp.com.br/oauth/shopee/callback";
    if (!partnerId || !partnerKey || !redirectUri) return jsonResponse({ error: "Missing partner credentials or redirect_uri" }, 400);
    if (!/^\d+$/.test(partnerId)) return jsonResponse({ error: "Invalid partner_id format" }, 400);

    const fixedAuthPath = "/api/v2/shop/auth_partner";

    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `${partnerId}${fixedAuthPath}${timestamp}`;
    const sign = (await hmacSha256Hex(partnerKey, baseString)).toUpperCase();

    const hostForUrl = new URL(authUrlBase).origin;
    const authorizationUrl = new URL(`${hostForUrl}${fixedAuthPath}`);
    authorizationUrl.searchParams.set("partner_id", partnerId);
    authorizationUrl.searchParams.set("timestamp", String(timestamp));
    authorizationUrl.searchParams.set("sign", sign);
    authorizationUrl.searchParams.set("redirect", redirectUri);

    const statePayload = { organizationId, storeName, connectedByUserId, redirect_uri: redirectUri };
    const state = btoa(JSON.stringify(statePayload));
    let redirectWithState = redirectUri;
    try {
      const r = new URL(redirectUri);
      r.searchParams.set("state", state);
      redirectWithState = r.toString();
    } catch (_) {
      redirectWithState = redirectUri;
    }
    authorizationUrl.searchParams.set("redirect", redirectWithState);
    return jsonResponse({ authorization_url: authorizationUrl.toString(), state }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
