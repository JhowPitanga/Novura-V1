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

function htmlPostMessageSuccess(siteUrl: string, payload: unknown) {
  const origin = (() => { try { return new URL(siteUrl).origin; } catch (_) { return "*"; } })();
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Conexão autorizada</title></head><body><p>Conexão autorizada. Você pode fechar esta janela.</p><script>(function(){try{var targetOrigin=${JSON.stringify(origin)};if(window.opener){window.opener.postMessage({type:'shopee_oauth_success', payload:${JSON.stringify(payload)}}, targetOrigin);} }catch(e){} setTimeout(function(){try{window.close();}catch(e){} window.location.href=${JSON.stringify(siteUrl)};}, 200);})();</script></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function strToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function uint8ToB64(bytes: Uint8Array): string {
  const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
  return btoa(bin);
}

async function importAesGcmKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = b64ToUint8(base64Key);
  const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength);
  return crypto.subtle.importKey("raw", keyBuf as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ptBytes = strToUint8(plaintext);
  const ptBuf = ptBytes.buffer.slice(ptBytes.byteOffset, ptBytes.byteOffset + ptBytes.byteLength) as ArrayBuffer;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ptBuf);
  const ctBytes = new Uint8Array(ct);
  return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`;
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
      has_code: !!code,
      has_shop_id: !!shopId,
      error_param: errorParam,
    });

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

    const ENC_KEY = Deno.env.get("TOKENS_ENCRYPTION_KEY") || "";
    if (!ENC_KEY) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY);

    let appRow: Record<string, unknown> | null = null;
    const candidateNames = ["sandbox_shopee", "sanbox_shopee", "Shopee Sandbox", "Shopee"];
    for (const nm of candidateNames) {
      const { data, error } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", nm)
        .limit(1);
      if (!error && Array.isArray(data) && data.length > 0) {
        appRow = data[0] as Record<string, unknown>;
        break;
      }
    }
    if (!appRow) return jsonResponse({ error: "App not found (expected one of sandbox_shopee/sanbox_shopee/Shopee Sandbox/Shopee)" }, 404);

    const partnerIdStr = String((appRow as any).client_id || "").trim();
    const partnerKey = String((appRow as any).client_secret || "").trim();
    
    const partnerIdNum = Number(partnerIdStr);
    const shopIdNum = Number(shopId);

    console.log("[shopee-callback] credentials_check", {
      correlationId,
      partnerId_from_db: partnerIdStr,
      partnerId_is_valid_num: Number.isInteger(partnerIdNum),
      has_key: !!partnerKey
    });

    if (!partnerIdStr || !partnerKey || isNaN(partnerIdNum)) {
        return jsonResponse({ error: "Invalid partner_id (client_id) in apps table configuration" }, 400);
    }

    const sandboxHost = "https://partner.test-stable.shopeemobile.com";
    const tokenPath = "/api/v2/auth/token/get"; 
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = `${partnerIdStr}${tokenPath}${timestamp}`;
    const sign = await hmacSha256Hex(partnerKey, baseString);

    console.log("[shopee-callback] token_exchange_init", { correlationId, host: sandboxHost, path: tokenPath });

    let tokenJson: Record<string, unknown> | null = null;
    let errorMsg: string | null = null;

    try {
      const tokenUrl = `${sandboxHost}${tokenPath}?partner_id=${encodeURIComponent(partnerIdStr)}&timestamp=${timestamp}&sign=${sign}`;
      
      const tokenResp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          code, 
          shop_id: shopIdNum, 
          partner_id: partnerIdNum
        }),
      });

      const json = await tokenResp.json();
      
      if (tokenResp.ok && !getField(json, "error")) {
        tokenJson = json as Record<string, unknown>;
        console.log("[shopee-callback] token_success", { correlationId });
      } else {
        errorMsg = (getField(json, "message") as string) || (getField(json, "error") as string) || "Unknown error";
        console.warn("[shopee-callback] token_error", { correlationId, status: tokenResp.status, error: errorMsg });
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      console.error("[shopee-callback] token_exception", { correlationId, message: errorMsg });
    }

    if (!tokenJson) {
      return jsonResponse({ error: errorMsg || "Token exchange failed" }, 400);
    }

    const accessToken = String(getField(tokenJson, "access_token") || "").trim();
    const refreshToken = String(getField(tokenJson, "refresh_token") || "").trim();
    const ttl = Number((getField(tokenJson, "expire_in") as number) || (getField(tokenJson, "expires_in") as number) || 14400);
    const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();

    let companyId: string | null = null;
    if (organizationId) {
      const { data: company } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1)
        .single();
      if (company?.id) companyId = String(company.id);
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
      meli_user_id: shopIdNum,
      config,
    };

    const { error: insertErr } = await admin.from("marketplace_integrations").insert([insertPayload]);
    if (insertErr) {
      console.error("[shopee-callback] insert_failed", { correlationId, message: insertErr.message });
      return jsonResponse({ error: insertErr.message }, 500);
    }

    console.log("[shopee-callback] success_saved_db", { correlationId, shopId });

    if (method === "POST") return jsonResponse({ ok: true });
    
    const siteUrl = Deno.env.get("SITE_URL") || "https://www.novuraerp.com.br/aplicativos/conectados";
    return htmlPostMessageSuccess(siteUrl, { ok: true });

  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[shopee-callback] unexpected_fatal_error", { message });
    return jsonResponse({ error: message }, 500);
  }
});
