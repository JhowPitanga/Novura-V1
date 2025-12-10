import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importAesGcmKey, aesGcmEncryptToString } from "./token-utils.ts";

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

function htmlPostMessageSuccess(siteUrl: string, payload: unknown) {
  const origin = (() => { try { return new URL(siteUrl).origin; } catch (_) { return "*"; } })();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conexão autorizada</title></head><body><p>Conexão autorizada. Você pode fechar esta janela.</p><script>(function(){try{var targetOrigin=${JSON.stringify(origin)};if(window.opener){window.opener.postMessage({type:'shopee_oauth_success', payload:${JSON.stringify(payload)}}, targetOrigin);} }catch(e){} setTimeout(function(){try{window.close();}catch(e){} window.location.href=${JSON.stringify(siteUrl)};}, 200);})();</script></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, "0");
    hex += h;
  }
  return hex;
}

function getField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
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
    const url = new URL(req.url);
    type CallbackBody = { code?: string; shop_id?: string; state?: string; error?: string };
    const body = method === "GET" ? null : (await req.json() as CallbackBody);
    const code = method === "GET" ? url.searchParams.get("code") : body?.code ?? null;
    const shopId = method === "GET" ? url.searchParams.get("shop_id") : body?.shop_id ?? null;
    const stateStr = method === "GET" ? url.searchParams.get("state") : body?.state ?? null;
    const errorParam = method === "GET" ? url.searchParams.get("error") : body?.error ?? null;
    console.log("[shopee-callback] inbound", {
      correlationId,
      method,
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      has_code: !!code,
      has_shop_id: !!shopId,
      has_state: !!stateStr,
      has_error_param: !!errorParam,
    });
    if (errorParam) return jsonResponse({ error: errorParam }, 400);
    if (!code || !shopId) return jsonResponse({ error: "Missing code or shop_id" }, 400);

    type StatePayload = { organizationId?: string; storeName?: string; connectedByUserId?: string };
    let state: StatePayload | null = null;
    if (stateStr) {
      try { state = JSON.parse(atob(stateStr)) as StatePayload; } catch (_) { state = null; }
    }
    console.log("[shopee-callback] state_decoded", {
      correlationId,
      state_present: !!state,
      organizationId: state?.organizationId || null,
      storeName_present: !!state?.storeName,
      connectedByUserId_present: !!state?.connectedByUserId,
    });

    const organizationId: string | null = state?.organizationId ?? null;
    const storeName: string | null = state?.storeName ?? null;
    const connectedByUserId: string | null = state?.connectedByUserId ?? null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
    console.log("[shopee-callback] env_check", {
      correlationId,
      supabase_url_present: !!SUPABASE_URL,
      service_role_present: !!SERVICE_ROLE_KEY,
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

    const ENC_KEY = Deno.env.get("TOKENS_ENCRYPTION_KEY") || "";
    if (!ENC_KEY) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
    let aesKey: CryptoKey;
    try {
      aesKey = await importAesGcmKey(ENC_KEY);
      console.log("[shopee-callback] aes_key_imported", { correlationId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[shopee-callback] aes_key_import_failed", { correlationId, message: msg });
      return jsonResponse({ error: "Failed to import encryption key" }, 500);
    }

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, auth_url, config")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);
    console.log("[shopee-callback] app_row_ok", { correlationId });

    const partnerId = String(appRow.client_id || "");
    const partnerKey = String(appRow.client_secret || "");
    if (!partnerId || !partnerKey) return jsonResponse({ error: "Missing partner credentials" }, 400);
    console.log("[shopee-callback] partner_credentials_present", { correlationId, partner_id_present: !!partnerId, partner_key_present: !!partnerKey });

    const cfg = (appRow as Record<string, unknown>)?.["config"] as Record<string, unknown> | undefined;
    const envName = (Deno.env.get("SHOPEE_ENV") || (typeof cfg?.["env"] === "string" ? String(cfg?.["env"]) : "")).toLowerCase();
    const tokenPath = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `${partnerId}${tokenPath}${timestamp}`;
    const sign = (await hmacSha256Hex(partnerKey, baseString)).toUpperCase();

    let explicitHost: string | null = null;
    try {
      const au = (appRow as Record<string, unknown>)?.["auth_url"] as string | null | undefined;
      if (au && typeof au === "string" && au.trim()) explicitHost = new URL(au).origin;
    } catch (_) {
      explicitHost = null;
    }
    const hosts: string[] = [];
    if (explicitHost) hosts.push(explicitHost);
    if (envName === "sandbox" || envName === "test") {
      hosts.push(
        "https://openplatform.sandbox.test-stable.shopee.sg",
        "https://partner.test-stable.shopeemobile.com",
        "https://partner.test-st.shopeemobile.com"
      );
    } else {
      hosts.push("https://partner.shopeemobile.com");
    }

    let tokenJson: Record<string, unknown> | null = null;
    let lastStatus = 0;
    let lastErrorMsg: string | null = null;
    for (const host of hosts) {
      const tokenUrl = `${host}${tokenPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
      console.log("[shopee-callback] token_request_start", { correlationId, host, path: tokenPath });
      try {
        const tokenResp = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, shop_id: shopId, partner_id: Number(partnerId) }),
        });
        lastStatus = tokenResp.status;
        const json = await tokenResp.json();
        console.log("[shopee-callback] token_response", {
          correlationId,
          status: tokenResp.status,
          ok: tokenResp.ok,
          has_error: !!getField(json, "error"),
          has_message: !!getField(json, "message"),
          access_token_present: !!getField(json, "access_token"),
          refresh_token_present: !!getField(json, "refresh_token"),
          expire_in: (getField(json, "expire_in") as number) || (getField(json, "expires_in") as number) || null,
        });
        if (tokenResp.ok && !getField(json, "error")) {
          tokenJson = json as Record<string, unknown>;
          break;
        }
        lastErrorMsg = (getField(json, "message") as string) || (getField(json, "error") as string) || null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[shopee-callback] token_attempt_exception", { correlationId, host, message: msg });
        lastErrorMsg = msg;
        continue;
      }
    }
    if (!tokenJson) {
      return jsonResponse({ error: lastErrorMsg || "Token exchange failed", status: lastStatus }, lastStatus || 500);
    }

    const accessToken = String(getField(tokenJson, "access_token") || "");
    const refreshToken = String(getField(tokenJson, "refresh_token") || "");
    const ttl = Number((getField(tokenJson, "expire_in") as number) || (getField(tokenJson, "expires_in") as number) || 14400);
    const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();
    console.log("[shopee-callback] token_processed", { correlationId, ttl, expiresAtIso });

    let companyId: string | null = null;
    if (organizationId) {
      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1)
        .single();
      if (companyError || !company?.id) {
        console.error("[shopee-callback] company_lookup_failed", { correlationId, organizationId, message: companyError?.message || "Not found" });
        return jsonResponse({ error: companyError?.message || "Company not found" }, 404);
      }
      companyId = String(company.id);
      console.log("[shopee-callback] company_resolved", { correlationId, companyId });
    }

    const config = {
      storeName,
      connectedByUserId,
      connectedAt: new Date().toISOString(),
      shopee_shop_id: String(shopId),
    };
    console.log("[shopee-callback] config_ready", { correlationId, storeName_present: !!storeName, connectedByUserId_present: !!connectedByUserId, shopee_shop_id: String(shopId) });

    const accessTokenEnc = await aesGcmEncryptToString(aesKey, accessToken);
    const refreshTokenEnc = await aesGcmEncryptToString(aesKey, refreshToken);
    console.log("[shopee-callback] tokens_encrypted", { correlationId });

    const insertPayload: Record<string, unknown> = {
      organizations_id: organizationId,
      company_id: companyId,
      marketplace_name: "Shopee",
      access_token: accessTokenEnc,
      refresh_token: refreshTokenEnc,
      expires_in: expiresAtIso,
      config,
    };
    console.log("[shopee-callback] insert_payload_meta", { correlationId, organizations_id_present: !!organizationId, company_id_present: !!companyId, expires_in: expiresAtIso });

    const { error: insertErr } = await admin.from("marketplace_integrations").insert([insertPayload]);
    if (insertErr) {
      console.error("[shopee-callback] insert_failed", { correlationId, message: insertErr.message });
      return jsonResponse({ error: insertErr.message }, 500);
    }
    console.log("[shopee-callback] insert_ok", { correlationId });

    if (method === "POST") return jsonResponse({ ok: true });
    const siteUrl = Deno.env.get("SITE_URL") || "http://novuraerp.com.br/aplicativos/conectados";
    console.log("[shopee-callback] html_redirect", { correlationId, siteUrl });
    return htmlPostMessageSuccess(siteUrl, { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[shopee-callback] unexpected_error", { message });
    return jsonResponse({ error: message }, 500);
  }
});
