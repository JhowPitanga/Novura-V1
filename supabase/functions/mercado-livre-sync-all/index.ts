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
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  try {
    const notification = await req.json();
    
    // Validar estrutura da notificação
    if (!notification.resource || !notification.user_id || !notification.topic) {
      return jsonResponse({ error: "Invalid notification format" }, 400);
    }

    // Roteamento baseado no tópico
    switch (notification.topic) {
      case "items":
        // Chamar função específica para items
        return await routeToItemsWebhook(notification);
        
      case "orders_v2":
        // Chamar função específica para orders
        return await routeToOrdersWebhook(notification);
        
      default:
        return jsonResponse({ 
          error: `Unsupported topic: ${notification.topic}`,
          supported_topics: ["items", "orders_v2"]
        }, 400);
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});

// Função para rotear notificações de items
async function routeToItemsWebhook(notification: any) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  
  try {
    // Chamar a função específica de items
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-items', {
      body: notification
    });

    if (error) {
      return jsonResponse({ error: `Items webhook failed: ${error.message}` }, 500);
    }

    return jsonResponse({ 
      ok: true, 
      topic: "items",
      routed: true,
      result: data
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Items webhook error: ${msg}` }, 500);
  }
}

// Função para rotear notificações de orders
async function routeToOrdersWebhook(notification: any) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  
  try {
    // Chamar a função específica de orders
    const { data, error } = await admin.functions.invoke('mercado-livre-webhook-orders', {
      body: notification
    });

    if (error) {
      return jsonResponse({ error: `Orders webhook failed: ${error.message}` }, 500);
    }

    return jsonResponse({ 
      ok: true, 
      topic: "orders_v2",
      routed: true,
      result: data
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: `Orders webhook error: ${msg}` }, 500);
  }
}