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
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-origin, x-meli-signature",
    },
  });
}

function b64ToUint8(b64: string): Uint8Array { 
  const bin = atob(b64); 
  const bytes = new Uint8Array(bin.length); 
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); 
  return bytes; 
}

async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { 
  const keyBytes = b64ToUint8(base64Key); 
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); 
}

async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { 
  const parts = encStr.split(":"); 
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); 
  const iv = b64ToUint8(parts[2]); 
  const ct = b64ToUint8(parts[3]); 
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); 
  return new TextDecoder().decode(pt); 
}

// Utilitário: extrair ID de recurso (robusto para variações de caminho)
function extractResourceId(resource: string, kind: "items" | "orders"): string | null {
  if (!resource) return null;
  const r = resource.trim();
  const patterns = kind === "items"
    ? [
        /^(?:https?:\/\/[^\s]+)?\/?items\/?([A-Za-z0-9-_.]+)/,
        /^\/?items\/?([A-Za-z0-9-_.]+)/
      ]
    : [
        /^(?:https?:\/\/[^\s]+)?\/?orders\/?([A-Za-z0-9-_.]+)/,
        /^\/?orders\/?([A-Za-z0-9-_.]+)/
      ];
  for (const p of patterns) {
    const m = r.match(p);
    if (m && m[1]) return m[1].split("?")[0].split("/")[0];
  }
  return null;
}

async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const ivStr = btoa(String.fromCharCode(...iv));
  const ctStr = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return `enc:gcm:${ivStr}:${ctStr}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 200);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
    console.error("mercado-livre-webhook-items config_missing", {
      SUPABASE_URL_present: !!SUPABASE_URL,
      SERVICE_ROLE_KEY_present: !!SERVICE_ROLE_KEY,
      ENC_KEY_B64_present: !!ENC_KEY_B64,
    });
    return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const hdrLog = {
      host: req.headers.get("host") || null,
      "content-type": req.headers.get("content-type") || null,
      "user-agent": req.headers.get("user-agent") || null,
      "x-forwarded-for": req.headers.get("x-forwarded-for") || null,
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      x_internal_call_present: !!req.headers.get("x-internal-call"),
      x_meli_signature_present: !!req.headers.get("x-meli-signature"),
      x_origin: req.headers.get("x-origin") || null,
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
    };
    const bodyText = await req.text();
    console.log("mercado-livre-webhook-items inbound", {
      correlationId,
      method: req.method,
      url: req.url,
      headers: hdrLog,
      bodyPreview: bodyText.slice(0, 500),
    });

    let notification: any;
    try {
      notification = JSON.parse(bodyText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("mercado-livre-webhook-items invalid_json", { correlationId, error: msg });
      return jsonResponse({ ok: false, error: "Invalid JSON body", correlationId }, 200);
    }
    
    // Validar estrutura da notificação
    const missing: string[] = [];
    if (!notification.resource) missing.push("resource");
    if (!notification.user_id) missing.push("user_id");
    if (!notification.topic) missing.push("topic");
    if (missing.length) {
      console.warn("mercado-livre-webhook-items invalid_notification_format", {
        correlationId,
        missing,
        receivedKeys: Object.keys(notification || {}),
      });
      return jsonResponse({ ok: false, error: "Invalid notification format", missing, correlationId }, 200);
    }

    console.log("mercado-livre-webhook-items routing_decision", {
      correlationId,
      topic: notification.topic,
      user_id: String(notification.user_id),
      resource: notification.resource,
    });

    // Verificar se é notificação de items
    if (notification.topic !== "items") {
      console.warn("mercado-livre-webhook-items not_items_topic", { correlationId, topic: notification.topic });
      return jsonResponse({ ok: false, error: "Not an items notification", correlationId }, 200);
    }

    // Extrair item_id de forma robusta
    const itemId = extractResourceId(notification.resource, "items");
    if (!itemId) {
      console.warn("mercado-livre-webhook-items resource_extract_failed", { correlationId, resource: notification.resource });
      return jsonResponse({ ok: false, error: "Invalid or missing item resource", correlationId }, 200);
    }
    console.log("mercado-livre-webhook-items resource_extract_ok", { correlationId, itemId });

    // Buscar integração do usuário
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, meli_user_id")
      .eq("meli_user_id", String(notification.user_id))
      .eq("marketplace_name", "Mercado Livre")
      .single();

    if (integErr || !integration) {
      console.warn("mercado-livre-webhook-items integration_missing", { correlationId, error: integErr?.message });
      return jsonResponse({ ok: false, error: "Integration not found", correlationId }, 200);
    }
    console.log("mercado-livre-webhook-items integration_ok", {
      correlationId,
      integration_id: integration.id,
      organizations_id: integration.organizations_id,
      company_id: integration.company_id,
    });

    // Descriptografar access token
    let accessToken: string;
    try {
      accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
      console.log("mercado-livre-webhook-items token_decrypt_ok", { correlationId, token_len: accessToken.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("mercado-livre-webhook-items token_decrypt_failed", { correlationId, error: msg });
      return jsonResponse({ ok: false, error: "Access token decrypt failed", correlationId }, 200);
    }

    // Buscar dados completos do item com fallback de refresh
    console.log("mercado-livre-webhook-items meli_fetch_start", { correlationId, itemId });
    const fetchStartedAt = Date.now();
    let itemResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        Accept: "application/json" 
      }
    });
    console.log("mercado-livre-webhook-items meli_fetch_status", { correlationId, status: itemResp.status, elapsed_ms: Date.now() - fetchStartedAt });

    // Tentar refresh em 401/403
    if (itemResp.status === 401 || itemResp.status === 403) {
      console.warn("mercado-livre-webhook-items token_refresh_attempt", { correlationId, status: itemResp.status });
      try {
        const { data: appRow, error: appErr } = await admin
          .from("apps")
          .select("client_id, client_secret")
          .eq("name", "Mercado Livre")
          .single();
        if (appErr || !appRow) throw new Error(appErr?.message || "App credentials not found");

        const refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token);
        const tokenResp = await fetch("https://api.mercadolibre.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: String(appRow.client_id),
            client_secret: String(appRow.client_secret),
            refresh_token: refreshTokenPlain
          })
        });
        console.log("mercado-livre-webhook-items token_refresh_status", { correlationId, status: tokenResp.status });
        if (!tokenResp.ok) throw new Error(`Token refresh failed: ${tokenResp.status}`);
        const tokenJson = await tokenResp.json();
        const newAccessEnc = await aesGcmEncryptToString(aesKey, tokenJson.access_token);
        const newRefreshEnc = await aesGcmEncryptToString(aesKey, tokenJson.refresh_token);
        const expiresAtIso = new Date(Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000).toISOString();

        const { error: updErr } = await admin
          .from("marketplace_integrations")
          .update({
            access_token: newAccessEnc,
            refresh_token: newRefreshEnc,
            token_expires_at: expiresAtIso
          })
          .eq("id", integration.id);
        if (updErr) throw new Error(updErr.message);
        console.log("mercado-livre-webhook-items token_refresh_db_updated", { correlationId, integration_id: integration.id });

        // Usar novo token e refazer a chamada
        const newAccess = tokenJson.access_token;
        const retryStartedAt = Date.now();
        itemResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
          headers: { Authorization: `Bearer ${newAccess}`, Accept: "application/json" }
        });
        console.log("mercado-livre-webhook-items meli_fetch_retry_status", { correlationId, status: itemResp.status, elapsed_ms: Date.now() - retryStartedAt });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("mercado-livre-webhook-items token_refresh_failed", { correlationId, error: msg });
        return jsonResponse({ ok: false, error: `Token refresh attempt failed: ${msg}`, correlationId }, 200);
      }
    }

    if (!itemResp.ok) {
      console.warn("mercado-livre-webhook-items meli_fetch_failed", { correlationId, status: itemResp.status });
      return jsonResponse({ ok: false, error: "Failed to fetch item details", status: itemResp.status, correlationId }, 200);
    }

    const itemData = await itemResp.json();
    const keysPreview = itemData && typeof itemData === "object" ? Object.keys(itemData).slice(0, 15) : [];
    console.log("mercado-livre-webhook-items meli_fetch_ok", { correlationId, itemId, keysPreview });

    // Preparar dados para upsert
    const nowIso = new Date().toISOString();
    const upsertData = {
      organizations_id: integration.organizations_id,
      company_id: integration.company_id,
      marketplace_name: "Mercado Livre",
      marketplace_item_id: itemData.id,
      title: itemData.title || null,
      sku: itemData.seller_custom_field || itemData.seller_sku || itemData.catalog_product_id || null,
      condition: itemData.condition || null,
      status: itemData.status || null,
      price: typeof itemData.price === "number" ? itemData.price : (Number(itemData.price) || null),
      available_quantity: typeof itemData.available_quantity === "number" ? itemData.available_quantity : null,
      sold_quantity: typeof itemData.sold_quantity === "number" ? itemData.sold_quantity : null,
      category_id: itemData.category_id || null,
      permalink: itemData.permalink || null,
      attributes: Array.isArray(itemData.attributes) ? itemData.attributes : [],
      variations: Array.isArray(itemData.variations) ? itemData.variations : null,
      pictures: Array.isArray(itemData.pictures) ? itemData.pictures : [],
      tags: Array.isArray(itemData.tags) ? itemData.tags : null,
      seller_id: String(notification.user_id),
      data: itemData,
      published_at: itemData.stop_time ? null : (itemData.date_created ? itemData.date_created : null),
      last_synced_at: nowIso,
      updated_at: nowIso,
    };

    // Upsert no banco
    const upsertStartedAt = Date.now();
    const { error: upErr } = await admin
      .from("marketplace_items")
      .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });


    if (upErr) {
      console.error("mercado-livre-webhook-items upsert_failed", { correlationId, error: upErr.message });
      return jsonResponse({ ok: false, error: `Failed to upsert item: ${upErr.message}`, correlationId }, 200);
    }
    console.log("mercado-livre-webhook-items upsert_ok", {
      correlationId,
      item_id: itemId,
      organizations_id: integration.organizations_id,
      company_id: integration.company_id,
      elapsed_ms: Date.now() - upsertStartedAt,
      variations_count: Array.isArray(upsertData.variations) ? upsertData.variations.length : null,
      attributes_count: Array.isArray(upsertData.attributes) ? upsertData.attributes.length : null,
    });

    return jsonResponse({ 
      ok: true, 
      item_id: itemId,
      action: "updated",
      notification_id: notification._id || notification.id,
      correlationId,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-webhook-items unexpected_error", { error: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
