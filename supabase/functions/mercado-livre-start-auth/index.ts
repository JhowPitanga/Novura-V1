// deno-lint-ignore-file no-explicit-any
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { marketplaceName = "Mercado Livre", redirect_uri, organizationId, storeName, connectedByUserId } = await req.json();

    const admin = createAdminClient();

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

    // Generate state for CSRF protection and pass-through context.
    // IMPORTANT: pkce_verifier is NOT included in state — state travels through
    // the browser URL (visible in history, logs, proxies). The verifier is returned
    // directly to the caller and must be stored in sessionStorage client-side.
    const csrf = crypto.randomUUID();
    const statePayload = {
      csrf,
      organizationId: organizationId ?? null,
      marketplaceName: appRow.name,
      storeName: storeName ?? null,
      connectedByUserId: connectedByUserId ?? null,
      redirect_uri: finalRedirect ?? null,
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

    // Return code_verifier separately so the client can store it in sessionStorage.
    // It must never be embedded in `state` or any URL parameter.
    return jsonResponse({ authorization_url: base.toString(), state, code_verifier: codeVerifier });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
