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
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-meli-signature, x-request-id",
    },
  });
}

function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

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
    const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();
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

    // Roteamento baseado no tópico
    switch (notification.topic) {
      case "items":
        // Chamar função específica para items
        return await routeToItemsWebhook(notification, req.headers);
    
      case "orders":
      case "orders_v2":
        // Chamar função específica para orders (suporta alias "orders" e "orders_v2")
        return await routeToOrdersWebhook(notification, req.headers);
    
      default:
        console.warn("mercado-livre-sync-all unsupported_topic", { correlationId, topic: notification.topic });
        return jsonResponse({ 
          error: `Unsupported topic: ${notification.topic}`,
          supported_topics: ["items", "orders", "orders_v2"]
        }, 400);
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all unexpected_error", { error: msg });
    return jsonResponse({ error: msg }, 500);
  }
});

// Função para rotear notificações de items
async function routeToItemsWebhook(notification: any, headers?: Headers) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const correlationId = headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> items invoke_start", {
    correlationId,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });
  try {
    // Propagar cabeçalhos relevantes (caso necessários para rastreio/validação)
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-items', {
      body: notification,
      headers: {
        'x-meli-signature': headers?.get('x-meli-signature') || '',
        'x-request-id': headers?.get('x-request-id') || ''
      }
    });
    if (error) {
      const errObj = {
        name: (error as any)?.name,
        message: error.message,
        status: (error as any)?.context?.status,
        body: (error as any)?.context?.error || (error as any)?.context?.body,
      };
      console.warn("mercado-livre-sync-all -> items invoke_error", { correlationId, error: errObj });
      // Não propagar erro para o Mercado Livre; responder 200 com detalhes
      return jsonResponse({ ok: false, topic: "items", routed: true, error: errObj }, 200);
    }
    console.log("mercado-livre-sync-all -> items invoke_success", {
      correlationId,
      result_type: typeof data,
      result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
    });
    return jsonResponse({ ok: true, topic: "items", routed: true, result: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> items invoke_exception", { correlationId, error: msg });
    // Não propagar erro para o Mercado Livre; responder 200 com detalhes
    return jsonResponse({ ok: false, topic: "items", routed: true, error: msg }, 200);
  }
}

// Função para rotear notificações de orders
async function routeToOrdersWebhook(notification: any, headers?: Headers) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const correlationId = headers?.get("x-request-id") || crypto.randomUUID();
  const forwardedLog = {
    authorization_present: !!headers?.get("authorization"),
    "x-meli-signature": headers?.get("x-meli-signature") || null,
    "x-request-id": headers?.get("x-request-id") || null,
  };
  console.log("mercado-livre-sync-all -> orders invoke_start", {
    correlationId,
    topic: notification.topic,
    user_id: String(notification.user_id),
    resource: notification.resource,
    forwarded_headers: forwardedLog,
  });
  try {
    // Propagar cabeçalhos relevantes (caso necessários para rastreio/validação)
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-orders', {
      body: notification,
      headers: {
        'x-meli-signature': headers?.get('x-meli-signature') || '',
        'x-request-id': headers?.get('x-request-id') || ''
      }
    });
    if (error) {
      const errObj = {
        name: (error as any)?.name,
        message: error.message,
        status: (error as any)?.context?.status,
        body: (error as any)?.context?.error || (error as any)?.context?.body,
      };
      console.warn("mercado-livre-sync-all -> orders invoke_error", { correlationId, error: errObj });
      // Não propagar erro para o Mercado Livre; responder 200 com detalhes
      return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: errObj }, 200);
    }
    console.log("mercado-livre-sync-all -> orders invoke_success", {
      correlationId,
      result_type: typeof data,
      result_keys: data && typeof data === 'object' ? Object.keys(data) : undefined,
    });
    return jsonResponse({ ok: true, topic: notification.topic, routed: true, result: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-sync-all -> orders invoke_exception", { correlationId, error: msg });
    // Não propagar erro para o Mercado Livre; responder 200 com detalhes
    return jsonResponse({ ok: false, topic: notification.topic, routed: true, error: msg }, 200);
  }
}