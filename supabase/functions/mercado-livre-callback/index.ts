// deno-lint-ignore-file no-explicit-any
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmEncryptToString } from "../_shared/adapters/token-utils.ts";

function htmlPostMessageSuccess(siteUrl: string, payload: any) {
  const origin = (() => {
    try {
      return new URL(siteUrl).origin;
    } catch (_) {
      return "*";
    }
  })();
  const html = `<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Conexão autorizada</title></head><body><p>Conexão autorizada. Você pode fechar esta janela.</p><script>(function(){try{var targetOrigin=${JSON.stringify(origin)};if(window.opener){window.opener.postMessage({type:'meli_oauth_success', payload:${JSON.stringify(payload)}}, targetOrigin);} }catch(e){} setTimeout(function(){try{window.close();}catch(e){} window.location.href=${JSON.stringify(siteUrl)};}, 200);})();</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  try {
    const url = new URL(req.url);
    const method = req.method;
    const body = method === "GET" ? null : await req.json();
    console.log("[meli-callback] request", {
      method,
      url: req.url
    });
    const code = method === "GET" ? url.searchParams.get("code") : body?.code ?? null;
    const stateStr = method === "GET" ? url.searchParams.get("state") : body?.state ?? null;
    const errorParam = method === "GET" ? url.searchParams.get("error") : body?.error ?? null;
    console.log("[meli-callback] params", {
      hasCode: !!code,
      hasState: !!stateStr,
      hasError: !!errorParam
    });
    if (errorParam) return jsonResponse({
      error: errorParam
    }, 400);
    if (!code || !stateStr) return jsonResponse({
      error: "Missing code or state"
    }, 400);
    let state: any;
    try {
      state = JSON.parse(atob(stateStr));
      console.log("[meli-callback] state parsed", {
        keys: Object.keys(state || {})
      });
    } catch (_) {
      console.error("[meli-callback] invalid state", {
        stateStrLength: stateStr?.length || 0
      });
      return jsonResponse({
        error: "Invalid state"
      }, 400);
    }
    const { organizationId, marketplaceName = "Mercado Livre", storeName, connectedByUserId, pkce_verifier, redirect_uri: stateRedirect } = state || {};
    console.log("[meli-callback] org/app", {
      organizationId,
      marketplaceName,
      hasPkceVerifier: !!pkce_verifier,
      stateRedirect: stateRedirect || null
    });
    if (!organizationId) return jsonResponse({
      error: "Missing organizationId in state"
    }, 400);

    const admin = createAdminClient();

    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!ENC_KEY_B64) return jsonResponse({
      error: "Missing TOKENS_ENCRYPTION_KEY"
    }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    // Fetch app credentials
    const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret, auth_url").eq("name", marketplaceName).single();
    if (appErr || !appRow) {
      console.error("[meli-callback] app not found", {
        appErr
      });
      return jsonResponse({
        error: appErr?.message || "App not found"
      }, 404);
    }
    const clientId = appRow.client_id || Deno.env.get("MERCADO_LIVRE_CLIENT_ID") || null;
    const clientSecret = appRow.client_secret || Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET") || null;
    const redirectEnv = Deno.env.get("MERCADO_LIVRE_REDIRECT_URI") || Deno.env.get("MERCADO_LIVRE_CALLBACK_URL") || null;
    const redirectUri = stateRedirect || redirectEnv;
    if (!clientId || !clientSecret) return jsonResponse({
      error: "Missing client credentials (DB or env)"
    }, 400);
    const form = new URLSearchParams();
    form.append("grant_type", "authorization_code");
    form.append("client_id", clientId);
    form.append("client_secret", clientSecret);
    form.append("code", code);
    if (redirectUri) form.append("redirect_uri", redirectUri);
    if (pkce_verifier) form.append("code_verifier", pkce_verifier);
    const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
    console.log("[meli-callback] meli token response status", resp.status);
    const json = await resp.json();
    const safePreview = {
      hasAccessToken: !!json?.access_token,
      hasRefreshToken: !!json?.refresh_token,
      expires_in: json?.expires_in,
      user_id: json?.user_id,
      error: json?.error,
      error_description: json?.error_description
    };
    console.log("[meli-callback] meli token preview", safePreview);
    if (!resp.ok) return jsonResponse({
      error: json?.error_description || "Token exchange failed",
      details: safePreview
    }, resp.status);
    const { access_token, refresh_token, expires_in, user_id } = json;
    const expiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
    // Resolve company by organization
    const { data: company, error: companyError } = await admin.from("companies").select("id").eq("organization_id", organizationId).limit(1).single();
    if (companyError || !company?.id) {
      console.error("[meli-callback] company not found", {
        companyError
      });
      return jsonResponse({
        error: companyError?.message || "Company not found"
      }, 404);
    }
    console.log("[meli-callback] company resolved", {
      companyId: company.id
    });
    const now = new Date();
    const config = {
      storeName: storeName ?? null,
      connectedByUserId: connectedByUserId ?? null,
      connectedAt: now.toISOString()
    };
    const access_token_enc = await aesGcmEncryptToString(aesKey, access_token);
    const refresh_token_enc = await aesGcmEncryptToString(aesKey, refresh_token);
    const { error: insertError } = await admin.from("marketplace_integrations").insert([
      {
        organizations_id: organizationId,
        company_id: company.id,
        marketplace_name: marketplaceName,
        access_token: access_token_enc,
        refresh_token: refresh_token_enc,
        expires_in: expiresAtIso,
        meli_user_id: user_id,
        config
      }
    ]);
    if (insertError) {
      console.error("[meli-callback] insert error", {
        insertError
      });
      return jsonResponse({
        error: insertError.message
      }, 500);
    }
    console.log("[meli-callback] insert ok", {
      companyId: company.id,
      marketplaceName
    });
    if (method === "POST") {
      return jsonResponse({
        ok: true
      });
    }
    const siteUrl = Deno.env.get("SITE_URL") || "http://novuraerp.com.br/aplicativos/conectados";
    return htmlPostMessageSuccess(siteUrl, {
      ok: true
    });
  } catch (e) {
    console.error("[meli-callback] error", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({
      error: message
    }, 500);
  }
});
