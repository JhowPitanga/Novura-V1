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

function base64UrlEncode(bytes: Uint8Array): string {
  // @ts-ignore
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateCodeVerifier(length = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let out = "";
  const rnd = new Uint8Array(length);
  crypto.getRandomValues(rnd);
  for (let i = 0; i < length; i++) out += chars[rnd[i] % chars.length];
  return out;
}

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
    const { marketplaceName = "Mercado Livre", redirect_uri, organizationId, storeName, connectedByUserId } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Fetch app row
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("name, client_id, auth_url")
      .eq("name", marketplaceName)
      .single();

    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    // Resolve credentials from DB or environment
    const clientId = appRow.client_id || Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || null;
    const authUrl = appRow.auth_url || Deno.env.get("MERCADO_LIVRE_AUTH_URL") || "https://auth.mercadolivre.com.br/authorization";
    if (!clientId || !authUrl) return jsonResponse({ error: "App missing client_id or auth_url (DB or env)" }, 400);

    // Determine redirect URI (env fallback if not provided)
    const envRedirect = Deno.env.get("MERCADO_LIVRE_REDIRECT_URI") || Deno.env.get("MERCADO_LIVRE_CALLBACK_URL") || null;
    const finalRedirect = redirect_uri || envRedirect;

    // Generate PKCE (optional if app enforces it). Always include for safety.
    const codeVerifier = generateCodeVerifier(64);
    const codeChallenge = await sha256(codeVerifier);

    // Generate state for CSRF protection and pass-through context
    const csrf = crypto.randomUUID();
    const statePayload = {
      csrf,
      organizationId: organizationId ?? null,
      marketplaceName: appRow.name,
      storeName: storeName ?? null,
      connectedByUserId: connectedByUserId ?? null,
      redirect_uri: finalRedirect ?? null,
      pkce_verifier: codeVerifier,
    };
    const state = btoa(JSON.stringify(statePayload));

    // Build authorization URL
    const base = new URL(authUrl);
    base.searchParams.set("client_id", clientId);
    base.searchParams.set("response_type", "code");
    base.searchParams.set("state", state);
    base.searchParams.set("code_challenge", codeChallenge);
    base.searchParams.set("code_challenge_method", "S256");
    if (finalRedirect) {
      base.searchParams.set("redirect_uri", finalRedirect);
    }

    return jsonResponse({ authorization_url: base.toString(), state });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});