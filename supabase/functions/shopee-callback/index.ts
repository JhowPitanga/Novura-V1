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
    type CallbackBody = { code?: string; shop_id?: string; state?: string; error?: string };
    const body = method === "GET" ? null : (await req.json() as CallbackBody);
    const code = method === "GET" ? url.searchParams.get("code") : body?.code ?? null;
    const shopId = method === "GET" ? url.searchParams.get("shop_id") : body?.shop_id ?? null;
    const stateStr = method === "GET" ? url.searchParams.get("state") : body?.state ?? null;
    const errorParam = method === "GET" ? url.searchParams.get("error") : body?.error ?? null;
    if (errorParam) return jsonResponse({ error: errorParam }, 400);
    if (!code || !shopId) return jsonResponse({ error: "Missing code or shop_id" }, 400);

    type StatePayload = { organizationId?: string; storeName?: string; connectedByUserId?: string };
    let state: StatePayload | null = null;
    if (stateStr) {
      try { state = JSON.parse(atob(stateStr)) as StatePayload; } catch (_) { state = null; }
    }

    const organizationId: string | null = state?.organizationId ?? null;
    const storeName: string | null = state?.storeName ?? null;
    const connectedByUserId: string | null = state?.connectedByUserId ?? null;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const ENC_KEY = Deno.env.get("TOKENS_ENCRYPTION_KEY") || "";
    if (!ENC_KEY) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY);

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, auth_url, config")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    const partnerId = String(appRow.client_id || "");
    const partnerKey = String(appRow.client_secret || "");
    if (!partnerId || !partnerKey) return jsonResponse({ error: "Missing partner credentials" }, 400);

    const cfg = (appRow as Record<string, unknown>)?.["config"] as Record<string, unknown> | undefined;
    const envName = (Deno.env.get("SHOPEE_ENV") || (typeof cfg?.["env"] === "string" ? String(cfg?.["env"]) : "")).toLowerCase();
    const defaultHost = envName === "sandbox" || envName === "test" ? "https://partner.test-st.shopeemobile.com" : "https://partner.shopeemobile.com";
    const tokenPath = "/api/v2/auth/token/get";
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `${partnerId}${tokenPath}${timestamp}`;
    const sign = (await hmacSha256Hex(partnerKey, baseString)).toUpperCase();
    const tokenUrl = `${defaultHost}${tokenPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;

    const tokenResp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, shop_id: shopId, partner_id: Number(partnerId) }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || tokenJson?.error) return jsonResponse({ error: tokenJson?.message || tokenJson?.error || "Token exchange failed", details: tokenJson }, tokenResp.status || 200);

    const accessToken = String(tokenJson?.access_token || "");
    const refreshToken = String(tokenJson?.refresh_token || "");
    const ttl = Number(tokenJson?.expire_in || tokenJson?.expires_in || 14400);
    const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();

    let companyId: string | null = null;
    if (organizationId) {
      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1)
        .single();
      if (companyError || !company?.id) return jsonResponse({ error: companyError?.message || "Company not found" }, 404);
      companyId = String(company.id);
    }

    const config = {
      storeName,
      connectedByUserId,
      connectedAt: new Date().toISOString(),
      shopee_shop_id: String(shopId),
    };

    const accessTokenEnc = await aesGcmEncryptToString(aesKey, accessToken);
    const refreshTokenEnc = await aesGcmEncryptToString(aesKey, refreshToken);

    const insertPayload: Record<string, unknown> = {
      organizations_id: organizationId,
      company_id: companyId,
      marketplace_name: "Shopee",
      access_token: accessTokenEnc,
      refresh_token: refreshTokenEnc,
      expires_in: expiresAtIso,
      config,
    };

    const { error: insertErr } = await admin.from("marketplace_integrations").insert([insertPayload]);
    if (insertErr) return jsonResponse({ error: insertErr.message }, 500);

    if (method === "POST") return jsonResponse({ ok: true });
    const siteUrl = Deno.env.get("SITE_URL") || "http://novuraerp.com.br/aplicativos/conectados";
    return htmlPostMessageSuccess(siteUrl, { ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
