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
  const patterns = kind === "orders"
    ? [
        /^(?:https?:\/\/[^\s]+)?\/?orders\/?([A-Za-z0-9-_.]+)/,
        /^\/?orders\/?([A-Za-z0-9-_.]+)/
      ]
    : [
        /^(?:https?:\/\/[^\s]+)?\/?items\/?([A-Za-z0-9-_.]+)/,
        /^\/?items\/?([A-Za-z0-9-_.]+)/
      ];
  for (const p of patterns) {
    const m = r.match(p);
    if (m && m[1]) return m[1].split("?")[0].split("/")[0];
  }
  return null;
}

// Utilitário: cifrar texto com AES-GCM para armazenar tokens atualizados
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const ivStr = btoa(String.fromCharCode(...iv));
  const ctStr = btoa(String.fromCharCode(...new Uint8Array(ct)));
  return `enc:gcm:${ivStr}:${ctStr}`;
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

    // Verificar se é notificação de orders (suporta 'orders' e 'orders_v2')
    if (notification.topic !== "orders_v2" && notification.topic !== "orders") {
      return jsonResponse({ error: "Not an orders notification" }, 400);
    }

    // Extrair order_id de forma robusta
    const orderId = extractResourceId(notification.resource, "orders");
    if (!orderId) {
      return jsonResponse({ error: "Invalid or missing order resource" }, 400);
    }

    // Buscar integração do usuário
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, meli_user_id")
      .eq("meli_user_id", String(notification.user_id))
      .eq("marketplace_name", "Mercado Livre")
      .single();

    if (integErr || !integration) {
      return jsonResponse({ error: "Integration not found" }, 404);
    }

    // Descriptografar access token
    const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);

    // Buscar dados completos do pedido com fallback de refresh
    let orderResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        Accept: "application/json" 
      }
    });

    // Tentar refresh em 401/403
    if (orderResp.status === 401 || orderResp.status === 403) {
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

        // Usar novo token e refazer a chamada
        const newAccess = tokenJson.access_token;
        orderResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${newAccess}`, Accept: "application/json" }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse({ error: `Token refresh attempt failed: ${msg}` }, 401);
      }
    }

    if (!orderResp.ok) {
      return jsonResponse({ error: "Failed to fetch order details" }, orderResp.status);
    }

    const orderData = await orderResp.json();

    // Buscar shipment detalhado (x-format-new) quando possível
    async function fetchShipmentDetails(shipmentId: string, token: string): Promise<any | null> {
      if (!shipmentId) return null;
      try {
        const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "x-format-new": "true",
          },
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch (_) { return null; }
    }

    // Sub-recursos do envio: tracking e costs
    async function fetchShipmentTracking(shipmentId: string, token: string): Promise<any | null> {
      if (!shipmentId) return null;
      try {
        const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/tracking`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch (_) { return null; }
    }

    async function fetchShipmentCosts(shipmentId: string, token: string): Promise<any | null> {
      if (!shipmentId) return null;
      try {
        const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/costs`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch (_) { return null; }
    }

    // Novos sub-recursos: SLA de despacho e atrasos
    async function fetchShipmentSLA(shipmentId: string, token: string): Promise<any | null> {
      if (!shipmentId) return null;
      try {
        const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/sla`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch (_) { return null; }
    }

    async function fetchShipmentDelays(shipmentId: string, token: string): Promise<any | null> {
      if (!shipmentId) return null;
      try {
        const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/delays`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "x-format-new": "true" },
        });
        if (!resp.ok) return null;
        return await resp.json();
      } catch (_) { return null; }
    }

    // Buscar detalhes de TODOS os envios possíveis (shipping.id e elementos de shipments)
    const candidateShipmentIds = new Set<string>();
    if (orderData?.shipping?.id) {
      try { candidateShipmentIds.add(String(orderData.shipping.id)); } catch { /* ignore */ }
    }
    if (Array.isArray(orderData?.shipments)) {
      for (const s of orderData.shipments) {
        const sid = (s && (s.id ?? s.shipment_id)) ? String(s.id ?? s.shipment_id) : null;
        if (sid) candidateShipmentIds.add(sid);
      }
    }

    const shipmentsDetailed: any[] = [];
    for (const sid of candidateShipmentIds) {
      const det = await fetchShipmentDetails(sid, accessToken);
      if (det) shipmentsDetailed.push(det);
    }

    // Classificador do tipo de envio a partir do shipment
    function classifyShippingType(sh: any): string | null {
      if (!sh) return null;
      const lt = String(sh?.logistic_type || sh?.shipping_mode || sh?.mode || "").toLowerCase();
      if (!lt) return null;
      if (lt === "fulfillment" || lt === "fbm") return "full";
      if (lt === "self_service") return "flex";
      if (lt === "drop_off" || lt === "xd_drop_off" || lt === "cross_docking") return "agencia";
      if (lt === "me2" || lt === "custom") return "agencia";
      return null;
    }

    // Preparar dados para upsert
    const nowIso = new Date().toISOString();

    // Base de envios a enriquecer (detalhados ou fallback)
    const baseShipments: any[] = (
      shipmentsDetailed.length > 0
        ? shipmentsDetailed
        : (
            Array.isArray(orderData.shipments) && orderData.shipments.length > 0
              ? orderData.shipments
              : (orderData?.shipping ? [orderData.shipping] : [])
          )
    );

    // Enriquecer cada envio com /tracking, /costs, /sla e /delays (com mapeamento robusto)
    const shipmentsNormalized: any[] = [];
    for (const sh of baseShipments) {
      const sid = (sh && (sh.id ?? sh.shipment_id)) ? String(sh.id ?? sh.shipment_id) : null;
      let tracking: any | null = null;
      let costs: any | null = null;
      let sla: any | null = null;
      let delays: any | null = null;
      if (sid) {
        tracking = await fetchShipmentTracking(sid, accessToken);
        costs = await fetchShipmentCosts(sid, accessToken);
        sla = await fetchShipmentSLA(sid, accessToken);
        delays = await fetchShipmentDelays(sid, accessToken);
      }

      // Extrações resilientes de SLA direto do objeto de detalhes do envio (quando vier embutido)
      const embeddedSla = sh?.sla || sh?.dispatch_sla || null;
      const embeddedDelays = sh?.delays || sh?.tracking?.delays || null;

      // Preparar campos normalizados com fallback em várias posições
      const sla_status = (
        sla?.status ?? embeddedSla?.status ?? sh?.sla_status ?? null
      );
      const sla_service = (
        sla?.service ?? embeddedSla?.service ?? sh?.sla_service ?? null
      );
      const sla_expected_date = (
        sla?.expected_date ?? embeddedSla?.expected_date ?? sh?.sla_expected_date ?? null
      );
      const sla_last_updated = (
        sla?.last_updated ?? embeddedSla?.last_updated ?? sh?.sla_last_updated ?? null
      );
      const delaysArr = Array.isArray(delays?.delays)
        ? delays.delays
        : (Array.isArray(embeddedDelays) ? embeddedDelays : (Array.isArray(sh?.delays) ? sh.delays : null));

      shipmentsNormalized.push({
        ...sh,
        tracking: tracking ?? (sh?.tracking ?? null),
        costs: costs ?? (sh?.costs ?? null),
        tracking_fetched_at: tracking ? nowIso : (sh?.tracking_fetched_at ?? null),
        costs_fetched_at: costs ? nowIso : (sh?.costs_fetched_at ?? null),
        // Campos normalizados de SLA (com fallback em diferentes fontes)
        sla_status,
        sla_service,
        sla_expected_date,
        sla_last_updated,
        sla_fetched_at: (sla || embeddedSla) ? nowIso : (sh?.sla_fetched_at ?? null),
        // Campos de atrasos (array)
        delays: delaysArr ?? null,
        delays_fetched_at: (delays || embeddedDelays) ? nowIso : (sh?.delays_fetched_at ?? null),
      });
    }

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
      shipments: shipmentsNormalized,
      feedback: orderData.feedback || null,
      tags: Array.isArray(orderData.tags) ? orderData.tags : [],
      data: orderData,
      date_created: orderData.date_created || null,
      date_closed: orderData.date_closed || null,
      last_updated: orderData.last_updated || null,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };

    // Upsert no banco na tabela de dados brutos (marketplace_orders_raw)
    const { error: upErr } = await admin
      .from("marketplace_orders_raw")
      .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });

    // If order upsert succeeded, also upsert normalized shipments into marketplace_shipments
    if (!upErr) {
      // Não gravar mais em marketplace_shipments: todos os dados de envio ficam em marketplace_orders_raw.shipments
    }

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
