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

function uint8ToB64(bytes: Uint8Array): string { 
  const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); 
  return btoa(bin); 
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

function normalizeOrderNumbers(order: any): any {
  try {
    const o = JSON.parse(JSON.stringify(order));
    const toNumOrDelete = (obj: any, key: string) => {
      if (!obj || typeof obj !== "object" || !(key in obj)) return;
      const v = obj[key];
      if (typeof v === "number" && Number.isFinite(v)) return;
      if (typeof v === "string" && /^\d+$/.test(v)) { obj[key] = Number(v); return; }
      try { delete obj[key]; } catch {}
    };
    if (o && o.buyer) toNumOrDelete(o.buyer, "id");
    toNumOrDelete(o, "pack_id");
    if (o && o.data) {
      toNumOrDelete(o.data, "pack_id");
      if (o.data.buyer) toNumOrDelete(o.data.buyer, "id");
    }
    return o;
  } catch (_) {
    return order;
  }
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
    const orderDataClean = normalizeOrderNumbers(orderData);

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

    async function fetchShipmentLabels(
      shipmentIds: string[],
      responseType: "pdf" | "zpl2",
    ): Promise<{ ok: boolean; content_base64?: string; content_type?: string; size_bytes?: number; fetched_at?: string; error?: any; }> {
      if (shipmentIds.length === 0) return { ok: false };
      const url = new URL("https://api.mercadolibre.com/shipment_labels");
      url.searchParams.set("shipment_ids", shipmentIds.join(","));
      url.searchParams.set("response_type", responseType.toUpperCase());
      const tryFetch = async (token: string) => fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` } });

      let mlResp = await tryFetch(accessToken);
      if (!mlResp.ok && (mlResp.status === 401 || mlResp.status === 403) && integration.refresh_token) {
        try {
          const { data: appRow, error: appErr } = await admin
            .from("apps")
            .select("client_id, client_secret")
            .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
            .single();
          if (!appErr && appRow) {
            let refreshTokenPlain: string | null = null;
            try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch { refreshTokenPlain = null; }
            if (refreshTokenPlain) {
              const form = new URLSearchParams();
              form.append("grant_type", "refresh_token");
              form.append("client_id", appRow.client_id);
              form.append("client_secret", appRow.client_secret);
              form.append("refresh_token", refreshTokenPlain);
              const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
                method: "POST",
                headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
                body: form.toString(),
              });
              const refreshJson = await refreshResp.json();
              if (refreshResp.ok) {
                const newAccessToken = String(refreshJson.access_token || "");
                const newRefreshToken = String(refreshJson.refresh_token || "");
                const expiresIn = Number(refreshJson.expires_in) || 0;
                const newExpiresAtIso = new Date(Date.now() + expiresIn * 1000).toISOString();
                const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
                const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
                await admin
                  .from("marketplace_integrations")
                  .update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, token_expires_at: newExpiresAtIso })
                  .eq("id", integration.id);
                mlResp = await tryFetch(newAccessToken);
              }
            }
          }
        } catch (_) { }
      }

      const buf = await mlResp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const b64 = uint8ToB64(bytes);
      const ct = responseType === "pdf" ? "application/pdf" : "text/plain";
      if (mlResp.ok) {
        return { ok: true, content_base64: b64, content_type: ct, size_bytes: bytes.byteLength, fetched_at: nowIso };
      }
      let errJson: any = {};
      try { errJson = JSON.parse(new TextDecoder().decode(bytes)); } catch { errJson = { raw: new TextDecoder().decode(bytes) }; }
      return { ok: false, error: errJson };
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

    let labelsObj: any | null = null;
    try {
      const labelIds = Array.from(candidateShipmentIds);
      if (labelIds.length > 0) {
        const pdf = await fetchShipmentLabels(labelIds, "pdf");
        const zpl = await fetchShipmentLabels(labelIds, "zpl2");
        if (pdf.ok || zpl.ok) {
          const primary = pdf.ok ? { type: "pdf", ...pdf } : { type: "zpl2", ...zpl };
          labelsObj = {
            cached: true,
            response_type: primary.type,
            content_base64: primary.content_base64,
            content_type: primary.content_type || (primary.type === "pdf" ? "application/pdf" : "text/plain"),
            shipment_ids: labelIds,
            fetched_at: primary.fetched_at,
            size_bytes: primary.size_bytes,
            pdf_base64: pdf.ok ? pdf.content_base64 : undefined,
            pdf_size_bytes: pdf.ok ? pdf.size_bytes : undefined,
            pdf_fetched_at: pdf.ok ? pdf.fetched_at : undefined,
            zpl2_base64: zpl.ok ? zpl.content_base64 : undefined,
            zpl2_size_bytes: zpl.ok ? zpl.size_bytes : undefined,
            zpl2_fetched_at: zpl.ok ? zpl.fetched_at : undefined,
          };
        } else {
          labelsObj = {
            error: true,
            message: (pdf.error?.message || zpl.error?.message || "ML error"),
            shipment_ids: labelIds,
            fetched_at: nowIso,
          };
        }
      } else {
        labelsObj = {
          error: true,
          message: "no shipments found",
          shipment_ids: [],
          fetched_at: nowIso,
        };
      }
    } catch (_) {}
    if (!labelsObj) {
      labelsObj = {
        error: true,
        message: "label fetch failed",
        shipment_ids: Array.from(candidateShipmentIds),
        fetched_at: nowIso,
      };
    }

    const { data: upId, error: upErr } = await admin.rpc('upsert_marketplace_order_raw', {
      p_organizations_id: integration.organizations_id,
      p_company_id: integration.company_id,
      p_marketplace_name: "Mercado Livre",
      p_marketplace_order_id: String(orderDataClean.id),
      p_status: orderDataClean.status || null,
      p_status_detail: orderDataClean.status_detail || null,
      p_order_items: Array.isArray(orderDataClean.order_items) ? orderDataClean.order_items : [],
      p_buyer: orderDataClean.buyer || null,
      p_seller: orderDataClean.seller || null,
      p_payments: Array.isArray(orderDataClean.payments) ? orderDataClean.payments : [],
      p_shipments: shipmentsNormalized,
      p_feedback: orderDataClean.feedback || null,
      p_tags: Array.isArray(orderDataClean.tags) ? orderDataClean.tags : [],
      p_data: orderDataClean,
      p_date_created: orderDataClean.date_created || null,
      p_date_closed: orderDataClean.date_closed || null,
      p_last_updated: orderDataClean.last_updated || null,
      p_last_synced_at: nowIso,
    });

    if (!upErr && upId) {
      const { error: updLabelsErr } = await admin
        .from("marketplace_orders_raw")
        .update({ labels: labelsObj, last_updated: nowIso })
        .eq("id", upId);
      if (!updLabelsErr) {
        try { await admin.rpc('refresh_presented_order', { p_order_id: upId }); } catch (_) {}
      }
    }

    if (upErr) {
      console.error("mercado-livre-webhook-orders rpc_upsert_failed", { correlationId, message: (upErr as any).message, details: (upErr as any).details, hint: (upErr as any).hint });
      try {
        const isNewRaw = true;
        const buyerClean = (() => {
          const b = orderDataClean?.buyer && typeof orderDataClean.buyer === "object" ? { ...orderDataClean.buyer } : null;
          if (b && typeof (b as any).id !== "number") { try { delete (b as any).id; } catch {} }
          return b;
        })();
        const dataClean = (() => {
          const d = JSON.parse(JSON.stringify(orderDataClean));
          if (d && typeof d.pack_id !== "number") { try { delete (d as any).pack_id; } catch {} }
          if (d && d.buyer && typeof d.buyer === "object" && typeof (d.buyer as any).id !== "number") { try { delete (d.buyer as any).id; } catch {} }
          return d;
        })();
        const upsertData = {
          organizations_id: integration.organizations_id,
          company_id: integration.company_id,
          marketplace_name: "Mercado Livre",
          marketplace_order_id: String(orderDataClean.id),
          status: orderDataClean.status || null,
          status_detail: orderDataClean.status_detail || null,
          order_items: Array.isArray(orderDataClean.order_items) ? orderDataClean.order_items : [],
          buyer: buyerClean,
          seller: orderDataClean.seller || null,
          payments: Array.isArray(orderDataClean.payments) ? orderDataClean.payments : [],
          shipments: Array.isArray(shipmentsNormalized) ? shipmentsNormalized : [],
          labels: labelsObj,
          feedback: orderDataClean.feedback || null,
          tags: Array.isArray(orderDataClean.tags) ? orderDataClean.tags : [],
          data: dataClean,
          date_created: orderDataClean.date_created || null,
          date_closed: orderDataClean.date_closed || null,
          last_updated: orderDataClean.last_updated || null,
          last_synced_at: nowIso,
          updated_at: nowIso,
        } as const;
        const { error: upErr2 } = await admin
          .from("marketplace_orders_raw")
          .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });
        if (upErr2) {
          console.error("mercado-livre-webhook-orders upsert_failed_fallback", { correlationId, message: upErr2.message });
          return jsonResponse({ ok: false, error: `Failed to upsert order: ${upErr.message}`, correlationId, code: (upErr as any).code, details: (upErr as any).details, hint: (upErr as any).hint }, 200);
        }
      } catch (_) {
        console.error("mercado-livre-webhook-orders upsert_exception_fallback", { correlationId });
        return jsonResponse({ ok: false, error: `Failed to upsert order: ${upErr.message}`, correlationId, code: (upErr as any).code, details: (upErr as any).details, hint: (upErr as any).hint }, 200);
      }
    }
    console.log("mercado-livre-webhook-orders upsert_ok", { correlationId, order_id: orderId, organizations_id: integration.organizations_id, raw_id: upId });

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
