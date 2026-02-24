import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function sanitizeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^`+|`+$/g, "");
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  try {
    const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const method = req.method;
    
    type StartBody = { organizationId?: string; storeName?: string; connectedByUserId?: string; redirect_uri?: string };
    const body = method === "GET" ? null : (await req.json() as StartBody);
    
    // Dados para o STATE (passados para o callback)
    const organizationId = body?.organizationId || null;
    const storeName = body?.storeName || null;
    const connectedByUserId = body?.connectedByUserId || null;
    const redirectOverride = sanitizeRedirect(body?.redirect_uri || null);

    const admin = createAdminClient();

    // Busca Credenciais do App Shopee (Tabela APPS)
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, config") // Removido auth_url, pois será fixo para produção
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    type AppRow = { client_id?: string; client_secret?: string; config?: Record<string, unknown> };
    const app = appRow as AppRow;
    
    // --- OTIMIZAÇÃO: Recuperação segura e validação do Partner ID ---
    const partnerId = String(app.client_id || "").trim();
    const partnerKey = String(app.client_secret || "").trim();
    
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
      console.error("[shopee-start] partner_credentials_error", { correlationId, partnerId, hasKey: !!partnerKey });
      return jsonResponse({ error: "Missing or invalid Partner ID (client_id) or Partner Key (client_secret)" }, 400);
    }
    
    // --- CONFIGURAÇÃO ESTRITAMENTE DE PRODUÇÃO ---
    const PROD_AUTH_HOST = "https://partner.shopeemobile.com";
    const fixedAuthPath = "/api/v2/shop/auth_partner";
    const defaultRedirectUri = "https://novuraerp.com.br/oauth/shopee/callback"; // Default de fallback

    // Lógica de REDIRECT URI
    const cfg = app.config as Record<string, unknown> | undefined;
    const redirectFromConfig = sanitizeRedirect((cfg && typeof cfg["redirect_uri"] === "string") ? String(cfg["redirect_uri"]) : null);
    const redirectEnv = sanitizeRedirect(Deno.env.get("SHOPEE_REDIRECT_URI") || null);
    
    const redirectUri = redirectOverride || redirectFromConfig || redirectEnv || defaultRedirectUri;

    // Assinatura (HMAC)
    const timestamp = Math.floor(Date.now() / 1000);
    // BaseString: partner_id + path + timestamp
    const baseString = `${partnerId}${fixedAuthPath}${timestamp}`;
    
    // CORREÇÃO: Assinatura deve ser minúscula (lowercase)
    const sign = await hmacSha256Hex(partnerKey, baseString);

    // Montagem da URL de Autorização
    const authorizationUrl = new URL(`${PROD_AUTH_HOST}${fixedAuthPath}`);
    authorizationUrl.searchParams.set("partner_id", partnerId);
    authorizationUrl.searchParams.set("timestamp", String(timestamp));
    authorizationUrl.searchParams.set("sign", sign);
    
    // Montagem do STATE e inserção na URL de Redirect
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