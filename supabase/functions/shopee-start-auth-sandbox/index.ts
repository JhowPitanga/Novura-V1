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

function sanitizeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^`+|`+$/g, "");
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
    const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const method = req.method;
    
    type StartBody = { organizationId?: string; storeName?: string; connectedByUserId?: string; redirect_uri?: string };
    const body = method === "GET" ? null : (await req.json() as StartBody);
    
    const organizationId = body?.organizationId || null;
    const storeName = body?.storeName || null;
    const connectedByUserId = body?.connectedByUserId || null;
    const redirectOverride = sanitizeRedirect(body?.redirect_uri || null);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let appRow: Record<string, unknown> | null = null;
    const candidateNames = ["sandbox_shopee", "sanbox_shopee", "Shopee Sandbox", "Shopee"];
    for (const nm of candidateNames) {
      const { data, error } = await admin
        .from("apps")
        .select("client_id, client_secret, config")
        .eq("name", nm)
        .limit(1);
      if (!error && Array.isArray(data) && data.length > 0) {
        appRow = data[0] as Record<string, unknown>;
        break;
      }
    }
    if (!appRow) return jsonResponse({ error: "App not found (expected one of sandbox_shopee/sanbox_shopee/Shopee Sandbox/Shopee)" }, 404);

    type AppRow = { client_id?: string; client_secret?: string; config?: Record<string, unknown> };
    const app = appRow as AppRow;
    
    const partnerId = String(app.client_id || "").trim();
    const partnerKey = String(app.client_secret || "").trim();
    
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
      console.error("[shopee-start] partner_credentials_error", { correlationId, partnerId, hasKey: !!partnerKey });
      return jsonResponse({ error: "Missing or invalid Partner ID (client_id) or Partner Key (client_secret)" }, 400);
    }
    
    const SANDBOX_AUTH_HOST = "https://partner.test-stable.shopeemobile.com";
    const fixedAuthPath = "/api/v2/shop/auth_partner";
    const defaultRedirectUri = "https://www.novuraerp.com.br/oauth/shopee/callback";

    const cfg = app.config as Record<string, unknown> | undefined;
    const redirectFromConfig = sanitizeRedirect((cfg && typeof cfg["redirect_uri"] === "string") ? String(cfg["redirect_uri"]) : null);
    const redirectEnv = sanitizeRedirect(Deno.env.get("SHOPEE_REDIRECT_URI") || null);
    
    const redirectUri = redirectOverride || redirectFromConfig || redirectEnv || defaultRedirectUri;

    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `${partnerId}${fixedAuthPath}${timestamp}`;
    const sign = await hmacSha256Hex(partnerKey, baseString);

    const authorizationUrl = new URL(`${SANDBOX_AUTH_HOST}${fixedAuthPath}`);
    authorizationUrl.searchParams.set("partner_id", partnerId);
    authorizationUrl.searchParams.set("timestamp", String(timestamp));
    authorizationUrl.searchParams.set("sign", sign);
    
    const statePayload = { organizationId, storeName, connectedByUserId, redirect_uri: redirectUri };
    const state = btoa(JSON.stringify(statePayload));
    
    let redirectWithState = redirectUri;
    try {
      const r = new URL(redirectUri);
      r.searchParams.set("state", state);
      redirectWithState = r.toString();
    } catch (e) {
      console.warn("[shopee-start] invalid_redirect_uri", { correlationId, redirectUri, error: e instanceof Error ? e.message : String(e) });
      redirectWithState = redirectUri;
    }
    
    authorizationUrl.searchParams.set("redirect", redirectWithState);
    
    console.log("[shopee-start] success", { correlationId, authUrl: authorizationUrl.toString() });

    return jsonResponse({ authorization_url: authorizationUrl.toString(), state }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shopee-start] unexpected_error", { message: msg });
    return jsonResponse({ error: msg }, 500);
  }
});
