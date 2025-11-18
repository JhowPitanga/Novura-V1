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
    return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const notification = await req.json();
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || (notification?.correlation_id ? String(notification.correlation_id) : null) || crypto.randomUUID();
    const hdrLog = {
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      x_internal_call_present: !!req.headers.get("x-internal-call"),
      x_meli_signature_present: !!req.headers.get("x-meli-signature"),
      x_origin: req.headers.get("x-origin") || null,
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
    };
    console.log("mercado-livre-webhook-orders inbound", { correlationId, method: req.method, url: req.url, headers: hdrLog, bodyPreview: JSON.stringify(notification).slice(0, 500) });
    
    // Validar estrutura da notificação
    if (!notification.resource || !notification.user_id || !notification.topic) {
      return jsonResponse({ ok: false, error: "Invalid notification format" }, 200);
    }

    // Verificar se é notificação de orders (suporta 'orders' e 'orders_v2')
    if (notification.topic !== "orders_v2" && notification.topic !== "orders") {
      console.warn("mercado-livre-webhook-orders not_orders_topic", { correlationId, topic: notification.topic });
      return jsonResponse({ ok: false, error: "Not an orders notification", correlationId }, 200);
    }

    // Extrair order_id de forma robusta
    const orderId = extractResourceId(notification.resource, "orders");
    if (!orderId) {
      console.warn("mercado-livre-webhook-orders resource_extract_failed", { correlationId, resource: notification.resource });
      return jsonResponse({ ok: false, error: "Invalid or missing order resource", correlationId }, 200);
    }

    // Buscar integração do usuário
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, meli_user_id")
      .eq("meli_user_id", String(notification.user_id))
      .eq("marketplace_name", "Mercado Livre")
      .single();

    if (integErr || !integration) {
      console.warn("mercado-livre-webhook-orders integration_missing", { correlationId, error: integErr?.message });
      return jsonResponse({ ok: false, error: "Integration not found", correlationId }, 200);
    }
    console.log("mercado-livre-webhook-orders integration_ok", { correlationId, organizations_id: integration.organizations_id, integration_id: integration.id, seller_id: integration.meli_user_id });

    // Descriptografar access token
    const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);

    // Buscar dados completos do pedido com fallback de refresh
    console.log("mercado-livre-webhook-orders meli_fetch_start", { correlationId, orderId });
    let orderResp = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
      headers: { 
        Authorization: `Bearer ${accessToken}`, 
        Accept: "application/json" 
      }
    });
    console.log("mercado-livre-webhook-orders meli_fetch_status", { correlationId, status: orderResp.status });

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
        console.log("mercado-livre-webhook-orders token_refresh_status", { correlationId, status: tokenResp.status });
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
        console.log("mercado-livre-webhook-orders meli_fetch_retry_status", { correlationId, status: orderResp.status });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("mercado-livre-webhook-orders token_refresh_failed", { correlationId, error: msg });
        return jsonResponse({ ok: false, error: `Token refresh attempt failed: ${msg}`, correlationId }, 200);
      }
    }

    if (!orderResp.ok) {
      console.warn("mercado-livre-webhook-orders meli_fetch_failed", { correlationId, status: orderResp.status });
      return jsonResponse({ ok: false, error: "Failed to fetch order details", status: orderResp.status, correlationId }, 200);
    }

    const orderData = await orderResp.json();

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

    const shipmentsDetailed: Record<string, any> = {};
    for (const sid of candidateShipmentIds) {
      const det = await fetchShipmentDetails(sid, accessToken);
      if (det) shipmentsDetailed[String(sid)] = det;
    }

    // Classificador do tipo de envio a partir do shipment
    function classifyShippingType(sh: any): string | null {
      if (!sh) return null;
      const lt = String(sh?.logistic_type || sh?.shipping_mode || sh?.mode || "").toLowerCase();
      if (!lt) return null;
      if (lt === "fulfillment" || lt === "fbm") return "full";
      if (lt === "self_service") return "flex";
      if (lt === "xd_drop_off" || lt === "cross_docking") return "envios";
      if (lt === "drop_off") return "correios";
      if (lt === "me2" || lt === "custom") return "envios";
      return null;
    }

    // Preparar dados para upsert
    const nowIso = new Date().toISOString();

    // Base de envios a enriquecer (detalhados ou fallback)
    const baseShipments: any[] = (
      (Object.keys(shipmentsDetailed).length > 0)
        ? Array.from(candidateShipmentIds).map((sid) => shipmentsDetailed[String(sid)]).filter(Boolean)
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
      const det = sid ? shipmentsDetailed[String(sid)] : null;
      const embeddedSla = (det?.sla ?? det?.dispatch_sla ?? sh?.sla ?? sh?.dispatch_sla) || null;
      const embeddedDelays = (det?.delays ?? det?.tracking?.delays ?? sh?.delays ?? sh?.tracking?.delays) || null;

      const sla_status = (
        embeddedSla?.status ?? sh?.sla_status ?? null
      );
      const sla_service = (
        embeddedSla?.service ?? sh?.sla_service ?? null
      );
      const sla_expected_date = (
        embeddedSla?.expected_date ?? sh?.sla_expected_date ?? null
      );
      const sla_last_updated = (
        embeddedSla?.last_updated ?? sh?.sla_last_updated ?? null
      );
      const delaysArr = Array.isArray(embeddedDelays)
        ? embeddedDelays
        : (Array.isArray(sh?.delays) ? sh.delays : null);

      shipmentsNormalized.push({
        ...(det || sh),
        tracking: (det?.tracking ?? sh?.tracking ?? null),
        costs: (det?.costs ?? sh?.costs ?? null),
        tracking_fetched_at: det?.tracking ? nowIso : (sh?.tracking_fetched_at ?? null),
        costs_fetched_at: det?.costs ? nowIso : (sh?.costs_fetched_at ?? null),
        sla_status,
        sla_service,
        sla_expected_date,
        sla_last_updated,
        sla_fetched_at: embeddedSla ? nowIso : (sh?.sla_fetched_at ?? null),
        delays: delaysArr ?? null,
        delays_fetched_at: embeddedDelays ? nowIso : (sh?.delays_fetched_at ?? null),
      });
    }
    console.log("mercado-livre-webhook-orders shipments_normalized", { correlationId, count: shipmentsNormalized.length });

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
      console.error("mercado-livre-webhook-orders upsert_failed", { correlationId, error: upErr.message });
      return jsonResponse({ ok: false, error: `Failed to upsert order: ${upErr.message}`, correlationId }, 200);
    }
    console.log("mercado-livre-webhook-orders upsert_ok", { correlationId, order_id: orderId, organizations_id: integration.organizations_id });

    return jsonResponse({ 
      ok: true, 
      order_id: orderId,
      action: "updated",
      notification_id: notification._id || notification.id
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("mercado-livre-webhook-orders unexpected_error", { error: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
