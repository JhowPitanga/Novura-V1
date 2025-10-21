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

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const notification = await req.json();
    
    // Validar estrutura da notificação
    if (!notification.resource || !notification.user_id || !notification.topic) {
      return jsonResponse({ error: "Invalid notification format" }, 400);
    }

    // Verificar se é notificação de orders
    if (notification.topic !== "orders_v2") {
      return jsonResponse({ error: "Not an orders notification" }, 400);
    }

    // Extrair order_id do resource (ex: "/orders/2195160686")
    const orderId = notification.resource.replace("/orders/", "");
    if (!orderId) {
      return jsonResponse({ error: "Invalid order ID in resource" }, 400);
    }

    // Buscar integração do usuário
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, access_token, meli_user_id")
      .eq("meli_user_id", String(notification.user_id))
      .eq("marketplace_name", "Mercado Livre")
      .eq("enabled", true)
      .single();

    if (integErr || !integration) {
      return jsonResponse({ error: "Integration not found" }, 404);
    }

    // Descriptografar access token
    const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);

    // Buscar dados completos do pedido
    const orderResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        Accept: "application/json" 
      }
    });

    if (!orderResp.ok) {
      return jsonResponse({ error: "Failed to fetch order details" }, orderResp.status);
    }

    const orderData = await orderResp.json();

    // Preparar dados para upsert
    const nowIso = new Date().toISOString();
    const upsertData = {
      organizations_id: integration.organizations_id,
      company_id: integration.company_id,
      marketplace_name: "Mercado Livre",
      marketplace_order_id: orderData.id,
      status: orderData.status || null,
      status_detail: orderData.status_detail || null,
      order_items: Array.isArray(orderData.order_items) ? orderData.order_items : [],
      buyer: orderData.buyer || null,
      seller: orderData.seller || null,
      payments: Array.isArray(orderData.payments) ? orderData.payments : [],
      shipments: Array.isArray(orderData.shipments) ? orderData.shipments : [],
      feedback: orderData.feedback || null,
      tags: Array.isArray(orderData.tags) ? orderData.tags : [],
      data: orderData,
      date_created: orderData.date_created || null,
      date_closed: orderData.date_closed || null,
      last_updated: orderData.last_updated || null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };

    // Upsert no banco (assumindo que existe uma tabela marketplace_orders)
    const { error: upErr } = await admin
      .from("marketplace_orders")
      .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });

    if (upErr) {
      return jsonResponse({ error: `Failed to upsert order: ${upErr.message}` }, 500);
    }

    return jsonResponse({ 
      ok: true, 
      order_id: orderId,
      action: "updated",
      notification_id: notification._id || notification.id
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
