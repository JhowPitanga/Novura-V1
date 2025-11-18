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
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-meli-signature, x-request-id, x-origin, x-correlation-id",
    },
  });
}

function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)); const ivStr = btoa(String.fromCharCode(...iv)); const ctStr = btoa(String.fromCharCode(...new Uint8Array(ct))); return `enc:gcm:${ivStr}:${ctStr}`; }

// Esta função é a porta de entrada para webhooks do Mercado Livre
// Ela roteia as notificações para as funções específicas baseadas no tópico
serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("mercado-livre-sync-all config_missing", { SUPABASE_URL_present: !!SUPABASE_URL, SERVICE_ROLE_KEY_present: !!SERVICE_ROLE_KEY });
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  try {
    const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const hdrLog = {
      host: req.headers.get("host") || null,
      "content-type": req.headers.get("content-type") || null,
      "user-agent": req.headers.get("user-agent") || null,
      "x-forwarded-for": req.headers.get("x-forwarded-for") || null,
      "x-meli-signature": req.headers.get("x-meli-signature") || null,
      authorization_present: !!req.headers.get("authorization"),
      "x-request-id": req.headers.get("x-request-id") || null,
    };

    const bodyText = await req.text();
    console.log("mercado-livre-sync-all inbound", {
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
      console.error("mercado-livre-sync-all invalid_json", { correlationId, error: msg });
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    
    // Validar estrutura da notificação
    const missing: string[] = [];
    if (!notification.resource) missing.push("resource");
    if (!notification.user_id) missing.push("user_id");
    if (!notification.topic) missing.push("topic");
    if (missing.length) {
      console.warn("mercado-livre-sync-all invalid_notification_format", {
        correlationId,
        missing,
        receivedKeys: Object.keys(notification || {}),
      });
      return jsonResponse({ error: "Invalid notification format", missing }, 400);
    }

    console.log("mercado-livre-sync-all routing_decision", {
      correlationId,
      topic: notification.topic,
      user_id: String(notification.user_id),
      resource: notification.resource,
    });

    // Roteamento baseado no tópico — responder 200 rapidamente e processar em background
    switch (notification.topic) {
      case "items": {
        setTimeout(() => { routeToItemsWebhook(notification, req.headers, correlationId).catch((e) => console.error("sync-all bg items error", e)); }, 0);
        console.log("mercado-livre-sync-all ack", { correlationId, topic: "items" });
        return jsonResponse({ ok: true, accepted: true, topic: "items", correlationId });
      }

      case "shipments": {
        setTimeout(() => { routeToShipmentsWebhook(notification, req.headers, correlationId).catch((e) => console.error("sync-all bg shipments error", e)); }, 0);
        console.log("mercado-livre-sync-all ack", { correlationId, topic: "shipments" });
        return jsonResponse({ ok: true, accepted: true, topic: "shipments", correlationId });
      }

      case "orders":
      case "orders_v2": {
        setTimeout(() => { routeToOrdersWebhook(notification, req.headers, correlationId).catch((e) => console.error("sync-all bg orders error", e)); }, 0);
        console.log("mercado-livre-sync-all ack", { correlationId, topic: notification.topic });
        return jsonResponse({ ok: true, accepted: true, topic: notification.topic, correlationId });
      }

      case "stock_locations":
      case "stock-locations":
      case "available_quantity": {
        setTimeout(() => { routeToStockLocations(notification, req.headers, correlationId).catch((e) => console.error("sync-all bg stock_locations error", e)); }, 0);
        console.log("mercado-livre-sync-all ack", { correlationId, topic: notification.topic });
        return jsonResponse({ ok: true, accepted: true, topic: notification.topic, correlationId });
      }

      default: {
        console.info("mercado-livre-sync-all unsupported_topic", { correlationId, topic: notification.topic });
        return jsonResponse({ 
          ok: true,
          accepted: false,
          topic: notification.topic,
          correlationId,
          supported_topics: ["items", "orders", "orders_v2", "stock_locations", "stock-locations", "shipments"]
        }, 200);
      }
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all unexpected_error", { error: msg });
    return jsonResponse({ error: msg }, 500);
  }
});

// Função para rotear notificações de items
async function routeToItemsWebhook(notification: any, headers?: Headers, correlationId?: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const corr = correlationId || headers?.get("x-correlation-id") || headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> items invoke_start", {
    correlationId: corr,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });

  // Preparar e registrar cabeçalhos de invocação (sem expor segredos)
  const invHeaders = {
    'x-meli-signature': headers?.get('x-meli-signature') || '',
    'x-request-id': corr,
    'x-correlation-id': corr,
    'x-origin': 'webhook',
    'apikey': SERVICE_ROLE_KEY,
    'authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'x-internal-call': '1',
  } as const;
  const invHeadersLog = {
    apikey_present: !!invHeaders['apikey'],
    x_meli_signature_present: !!invHeaders['x-meli-signature'],
    x_request_id: invHeaders['x-request-id'] || null,
    x_correlation_id_present: !!invHeaders['x-correlation-id'],
    x_origin: invHeaders['x-origin'],
    x_internal_call: invHeaders['x-internal-call'],
  };
  console.log("mercado-livre-sync-all -> items headers_prepared", { correlationId: corr, headers: invHeadersLog });
  try {
    const payload = { ...notification, correlation_id: corr };
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-items', {
      body: payload,
      headers: invHeaders,
    });
    if (error) {
      const errObj = {
        name: (error as any)?.name,
        message: error.message,
        status: (error as any)?.context?.status,
        body: (error as any)?.context?.error || (error as any)?.context?.body,
      };
      console.warn("mercado-livre-sync-all -> items invoke_error", { correlationId: corr, error: errObj });
      const bodyRaw = (error as any)?.context?.body;
      const bodyPreview = bodyRaw && typeof bodyRaw === 'object' ? JSON.stringify(bodyRaw).slice(0, 500) : String(bodyRaw || '').slice(0, 500);
      console.warn("mercado-livre-sync-all -> items invoke_error_details", { correlationId: corr, status: (error as any)?.context?.status, bodyPreview });
      // Não propagar erro para o Mercado Livre; responder 200 com detalhes
      return jsonResponse({ ok: false, topic: "items", routed: true, error: errObj, correlationId: corr }, 200);
    }
    console.log("mercado-livre-sync-all -> items invoke_success", {
      correlationId: corr,
      result_type: typeof data,
      result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
    });
    const resultPreview = data && typeof data === 'object' ? JSON.stringify({ ok: (data as any)?.ok, keys: Object.keys(data).slice(0, 10) }).slice(0, 200) : String(data).slice(0, 200);
    console.log("mercado-livre-sync-all -> items invoke_success_preview", { correlationId: corr, resultPreview });
    return jsonResponse({ ok: true, topic: "items", routed: true, result: data, correlationId: corr });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> items invoke_exception", { correlationId: corr, error: msg });
    // Não propagar erro para o Mercado Livre; responder 200 com detalhes
    return jsonResponse({ ok: false, topic: "items", routed: true, error: msg, correlationId: corr }, 200);
  }
}

// Função para rotear notificações de alterações de locais de estoque
async function routeToStockLocations(notification: any, headers?: Headers, correlationId?: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const corr = correlationId || headers?.get("x-correlation-id") || headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> available_quantity invoke_start", {
    correlationId: corr,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });

  // Resolver organizationId a partir do meli_user_id
  const { data: integration, error: integErr } = await admin
    .from("marketplace_integrations")
    .select("id, organizations_id, company_id, meli_user_id, marketplace_name")
    .eq("meli_user_id", String(notification.user_id))
    .eq("marketplace_name", "Mercado Livre")
    .single();

  if (integErr || !integration) {
    console.warn("mercado-livre-sync-all -> available_quantity integration_missing", { correlationId: corr, error: integErr?.message });
    // Não propagar erro: responder 200 para o webhook do ML
    return jsonResponse({ ok: false, topic: notification.topic, routed: false, error: "Integration not found", correlationId: corr }, 200);
  }

  const organizationId = integration.organizations_id;
  console.log("mercado-livre-sync-all -> available_quantity integration_ok", {
    correlationId: corr,
    organizations_id: organizationId,
    integration_id: integration.id,
    seller_id: integration.meli_user_id,
  });

  // Preparar cabeçalhos para invocar a função interna
  const invHeaders = {
    'x-meli-signature': headers?.get('x-meli-signature') || '',
    'x-request-id': corr,
    'x-correlation-id': corr,
    'x-origin': 'webhook',
    'apikey': SERVICE_ROLE_KEY,
    'authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'x-internal-call': '1',
  } as const;
  const invHeadersLog = {
    apikey_present: !!invHeaders['apikey'],
    x_meli_signature_present: !!invHeaders['x-meli-signature'],
    x_request_id: invHeaders['x-request-id'] || null,
    x_correlation_id_present: !!invHeaders['x-correlation-id'],
    x_origin: invHeaders['x-origin'],
    x_internal_call: invHeaders['x-internal-call'],
  };
  console.log("mercado-livre-sync-all -> available_quantity headers_prepared", { correlationId: corr, headers: invHeadersLog });

  try {
    const { data, error } = await admin.functions.invoke('mercado-livre-sync-stock-distribution', {
      body: { organizationId },
      headers: invHeaders,
    });
    if (error) {
      const errObj = {
        name: (error as any)?.name,
        message: error.message,
        status: (error as any)?.context?.status,
        body: (error as any)?.context?.error || (error as any)?.context?.body,
      };
      console.warn("mercado-livre-sync-all -> available_quantity invoke_error", { correlationId: corr, error: errObj });
      const bodyRaw = (error as any)?.context?.body;
      const bodyPreview = bodyRaw && typeof bodyRaw === 'object' ? JSON.stringify(bodyRaw).slice(0, 500) : String(bodyRaw || '').slice(0, 500);
      console.warn("mercado-livre-sync-all -> available_quantity invoke_error_details", { correlationId: corr, status: (error as any)?.context?.status, bodyPreview });
      // Não propagar erro para o ML; responder 200
      return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: errObj, correlationId: corr }, 200);
    }

    console.log("mercado-livre-sync-all -> available_quantity invoke_success", {
      correlationId: corr,
      result_type: typeof data,
      result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
    });
    const resultPreview = data && typeof data === 'object' ? JSON.stringify({ ok: (data as any)?.ok, keys: Object.keys(data).slice(0, 10) }).slice(0, 200) : String(data).slice(0, 200);
    console.log("mercado-livre-sync-all -> available_quantity invoke_success_preview", { correlationId: corr, resultPreview });
    return jsonResponse({ ok: true, topic: notification.topic, routed: true, result: data, correlationId: corr });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> available_quantity invoke_exception", { correlationId: corr, error: msg });
    return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: msg, correlationId: corr }, 200);
  }
}

// Função para rotear notificações de shipments
async function routeToShipmentsWebhook(notification: any, headers?: Headers, correlationId?: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const corr = correlationId || headers?.get("x-correlation-id") || headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> shipments invoke_start", {
    correlationId: corr,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });

  function extractShipmentId(resource: string): string | null {
    if (!resource) return null;
    const r = resource.trim();
    const patterns = [
      /^(?:https?:\/\/[^\s]+)?\/?shipments\/?([A-Za-z0-9-_.]+)/,
      /^\/?shipments\/?([A-Za-z0-9-_.]+)/,
    ];
    for (const p of patterns) {
      const m = r.match(p);
      if (m && m[1]) return m[1].split("?")[0].split("/")[0];
    }
    return null;
  }

  const shipmentId = extractShipmentId(String(notification.resource || ""));
  if (!shipmentId) {
    console.warn("mercado-livre-sync-all -> shipments invalid_resource", { correlationId: corr, resource: notification.resource });
    return jsonResponse({ ok: false, topic: "shipments", routed: false, error: "Invalid shipment resource", correlationId: corr }, 200);
  }

  const { data: integration, error: integErr } = await admin
    .from("marketplace_integrations")
    .select("id, organizations_id, company_id, meli_user_id, marketplace_name, access_token, refresh_token")
    .eq("meli_user_id", String(notification.user_id))
    .eq("marketplace_name", "Mercado Livre")
    .single();

  if (integErr || !integration) {
    console.warn("mercado-livre-sync-all -> shipments integration_missing", { correlationId: corr, error: integErr?.message });
    return jsonResponse({ ok: false, topic: "shipments", routed: false, error: "Integration not found", correlationId: corr }, 200);
  }

  const invHeaders = {
    'x-meli-signature': headers?.get('x-meli-signature') || '',
    'x-request-id': corr,
    'x-correlation-id': corr,
    'x-origin': 'webhook',
    'apikey': SERVICE_ROLE_KEY!,
    'authorization': `Bearer ${SERVICE_ROLE_KEY!}`,
    'x-internal-call': '1',
  } as const;
  const invHeadersLog = {
    apikey_present: !!invHeaders['apikey'],
    x_meli_signature_present: !!invHeaders['x-meli-signature'],
    x_request_id: invHeaders['x-request-id'] || null,
    x_correlation_id_present: !!invHeaders['x-correlation-id'],
    x_origin: invHeaders['x-origin'],
    x_internal_call: invHeaders['x-internal-call'],
  };
  console.log("mercado-livre-sync-all -> shipments headers_prepared", { correlationId: corr, headers: invHeadersLog });

  let accessToken: string | null = null;
  try {
    if (!ENC_KEY_B64) throw new Error("Missing TOKENS_ENCRYPTION_KEY");
    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("mercado-livre-sync-all -> shipments decrypt_token_failed", { correlationId: corr, error: msg });
    if (typeof integration.access_token === 'string' && !integration.access_token.startsWith('enc:')) {
      accessToken = integration.access_token;
    }
  }

  if (!accessToken) {
    console.warn("mercado-livre-sync-all -> shipments missing_access_token", { correlationId: corr });
    return jsonResponse({ ok: false, topic: "shipments", routed: false, error: "Access token unavailable", correlationId: corr }, 200);
  }

  async function fetchShipmentDetails(shid: string, token: string, useNewFormat = false): Promise<any | null> {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      if (useNewFormat) headers["x-format-new"] = "true";
      const resp = await fetch(`https://api.mercadolibre.com/shipments/${shid}`, { headers });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (_) { return null; }
  }

  let shipmentJson = await fetchShipmentDetails(shipmentId, accessToken, false) || await fetchShipmentDetails(shipmentId, accessToken, true);
  if (!shipmentJson) {
    try {
      const ENC = ENC_KEY_B64 ? await importAesGcmKey(ENC_KEY_B64) : null;
      if (ENC && integration.refresh_token) {
        const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret").eq("name", "Mercado Livre").single();
        if (!appErr && appRow) {
          let refreshTokenPlain: string | null = null;
          try { refreshTokenPlain = await aesGcmDecryptFromString(ENC, integration.refresh_token); } catch { refreshTokenPlain = null; }
          if (refreshTokenPlain) {
            const tokenResp = await fetch("https://api.mercadolibre.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", client_id: String(appRow.client_id), client_secret: String(appRow.client_secret), refresh_token: refreshTokenPlain }) });
            if (tokenResp.ok) {
              const tokenJson = await tokenResp.json();
              const newAccessEnc = await aesGcmEncryptToString(ENC, tokenJson.access_token);
              const newRefreshEnc = await aesGcmEncryptToString(ENC, tokenJson.refresh_token);
              const expiresAtIso = new Date(Date.now() + (Number(tokenJson.expires_in) || 3600) * 1000).toISOString();
              await admin.from("marketplace_integrations").update({ access_token: newAccessEnc, refresh_token: newRefreshEnc, token_expires_at: expiresAtIso }).eq("id", integration.id);
              accessToken = tokenJson.access_token;
              shipmentJson = await fetchShipmentDetails(shipmentId, accessToken, false) || await fetchShipmentDetails(shipmentId, accessToken, true);
            }
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  function resolveOrderId(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;
    // Common shapes
    if (obj.order_id) try { return String(obj.order_id); } catch { /* ignore */ }
    if (obj.order && obj.order.id) try { return String(obj.order.id); } catch { /* ignore */ }
    // Arrays of orders
    if (Array.isArray(obj.orders) && obj.orders.length > 0) {
      const first = obj.orders[0];
      if (first && (first.id || first.order_id)) return String(first.id || first.order_id);
    }
    // Other possible fields
    if (Array.isArray(obj.order_ids) && obj.order_ids.length > 0) return String(obj.order_ids[0]);
    if (obj.orderId) try { return String(obj.orderId); } catch { /* ignore */ }
    if (obj.shipping && obj.shipping.order_id) try { return String(obj.shipping.order_id); } catch { /* ignore */ }
    return null;
  }

  const orderId = resolveOrderId(shipmentJson);
  if (!orderId) {
    console.warn("mercado-livre-sync-all -> shipments order_id_missing", { correlationId: corr, shipment_id: shipmentId });
    return jsonResponse({ ok: false, topic: "shipments", routed: false, error: "Order ID not found for shipment", correlationId: corr, shipment_id: shipmentId }, 200);
  }

  try {
    // Encaminhar para o webhook de pedidos com uma notificação sintética de orders
    const forwardNotification = {
      topic: "orders",
      user_id: String(integration.meli_user_id),
      resource: `/orders/${orderId}`,
      _forwarded_from: "shipments",
      _shipment_id: String(shipmentId),
      _original: {
        topic: notification.topic,
        resource: notification.resource,
        user_id: String(notification.user_id),
      },
    } as const;

    const payload = { ...forwardNotification, correlation_id: corr };
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-orders', {
      body: payload,
      headers: invHeaders,
    });
    if (error) {
      const errObj = { name: (error as any)?.name, message: error.message, status: (error as any)?.context?.status, body: (error as any)?.context?.error || (error as any)?.context?.body };
      console.warn("mercado-livre-sync-all -> shipments forwarded_to_orders_error", { correlationId: corr, error: errObj });
      const bodyRaw = (error as any)?.context?.body;
      const bodyPreview = bodyRaw && typeof bodyRaw === 'object' ? JSON.stringify(bodyRaw).slice(0, 500) : String(bodyRaw || '').slice(0, 500);
      console.warn("mercado-livre-sync-all -> shipments forwarded_to_orders_error_details", { correlationId: corr, status: (error as any)?.context?.status, bodyPreview });
      return jsonResponse({ ok: false, topic: "shipments", routed: true, forwarded_to: "orders", error: errObj, correlationId: corr, order_id: String(orderId) }, 200);
    }
    console.log("mercado-livre-sync-all -> shipments forwarded_to_orders_success", { correlationId: corr, order_id: String(orderId), result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined });
    return jsonResponse({ ok: true, topic: "shipments", routed: true, forwarded_to: "orders", result: data, correlationId: corr, order_id: String(orderId) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> shipments invoke_exception", { correlationId: corr, error: msg });
    return jsonResponse({ ok: false, topic: "shipments", routed: true, error: msg, correlationId: corr, order_id: String(orderId) }, 200);
  }
}

// Função para rotear notificações de orders
async function routeToOrdersWebhook(notification: any, headers?: Headers, correlationId?: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const corr = correlationId || headers?.get("x-correlation-id") || headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> orders invoke_start", {
    correlationId: corr,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });
  const invHeaders = {
    'x-meli-signature': headers?.get('x-meli-signature') || '',
    'x-request-id': corr,
    'x-correlation-id': corr,
    'x-origin': 'webhook',
    'apikey': SERVICE_ROLE_KEY,
    'authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'x-internal-call': '1',
  } as const;
  const invHeadersLog = {
    apikey_present: !!invHeaders['apikey'],
    x_meli_signature_present: !!invHeaders['x-meli-signature'],
    x_request_id: invHeaders['x-request-id'] || null,
    x_correlation_id_present: !!invHeaders['x-correlation-id'],
    x_origin: invHeaders['x-origin'],
    x_internal_call: invHeaders['x-internal-call'],
  };
  console.log("mercado-livre-sync-all -> orders headers_prepared", { correlationId: corr, headers: invHeadersLog });
  try {
    const payload = { ...notification, correlation_id: corr };
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-orders', {
      body: payload,
      headers: invHeaders,
    });
    if (error) {
      const errObj = {
        name: (error as any)?.name,
        message: error.message,
        status: (error as any)?.context?.status,
        body: (error as any)?.context?.error || (error as any)?.context?.body,
      };
      console.warn("mercado-livre-sync-all -> orders invoke_error", { correlationId: corr, error: errObj });
      const bodyRaw = (error as any)?.context?.body;
      const bodyPreview = bodyRaw && typeof bodyRaw === 'object' ? JSON.stringify(bodyRaw).slice(0, 500) : String(bodyRaw || '').slice(0, 500);
      console.warn("mercado-livre-sync-all -> orders invoke_error_details", { correlationId: corr, status: (error as any)?.context?.status, bodyPreview });
      // Não propagar erro para o Mercado Livre; responder 200 com detalhes
      return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: errObj, correlationId: corr }, 200);
    }
    console.log("mercado-livre-sync-all -> orders invoke_success", {
      correlationId: corr,
      result_type: typeof data,
      result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
    });
    const resultPreview = data && typeof data === 'object' ? JSON.stringify({ ok: (data as any)?.ok, keys: Object.keys(data).slice(0, 10) }).slice(0, 200) : String(data).slice(0, 200);
    console.log("mercado-livre-sync-all -> orders invoke_success_preview", { correlationId: corr, resultPreview });
    return jsonResponse({ ok: true, topic: notification.topic, routed: true, result: data, correlationId: corr });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> orders invoke_exception", { correlationId: corr, error: msg });
    // Não propagar erro para o Mercado Livre; responder 200 com detalhes
    return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: msg, correlationId: corr }, 200);
  }
}