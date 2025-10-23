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

    // Verificar se é notificação de items
    if (notification.topic !== "items") {
      return jsonResponse({ error: "Not an items notification" }, 400);
    }

    // Extrair item_id do resource (ex: "/items/MLA123456789")
    const itemId = notification.resource.replace("/items/", "");
    if (!itemId) {
      return jsonResponse({ error: "Invalid item ID in resource" }, 400);
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

    // Buscar dados completos do item
    const itemResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        Accept: "application/json" 
      }
    });

    if (!itemResp.ok) {
      return jsonResponse({ error: "Failed to fetch item details" }, itemResp.status);
    }

    const itemData = await itemResp.json();

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
    const { error: upErr } = await admin
      .from("marketplace_items")
      .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });

    if (upErr) {
      return jsonResponse({ error: `Failed to upsert item: ${upErr.message}` }, 500);
    }

    return jsonResponse({ 
      ok: true, 
      item_id: itemId,
      action: "updated",
      notification_id: notification._id || notification.id
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
