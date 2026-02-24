import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/object-utils.ts";
import { importAesGcmKey, aesGcmEncryptToString, tryDecryptToken, hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const b = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

async function hmacSha256HexLower(key: string, message: string): Promise<string> {
  const up = await hmacSha256Hex(key, message);
  return up.toLowerCase();
}

function detectOrderSn(payload: unknown): string | null {
  const cand = [
    ["order_sn"],
    ["ordersn"],
    ["ordersn_list","0"],
    ["order_sn_list","0"],
    ["data","order_sn"],
    ["data","ordersn"],
    ["msg","order_sn"],
    ["msg","ordersn"],
    ["message","order_sn"],
    ["message","ordersn"],
    ["order","order_sn"],
    ["orders","0","order_sn"],
  ];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  const tryNested = (key: string): string | null => {
    const raw = getStr(payload, [key]);
    if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        const nested = JSON.parse(raw);
        for (const p of cand) {
          const v = getStr(nested, p);
          if (v) return v;
        }
      } catch (_) { /* ignore */ }
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message") || tryNested("raw");
}

function detectShopId(payload: unknown): string | null {
  const cand = [["shop_id"],["data","shop_id"],["msg","shop_id"],["merchant_id"],["shopid"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  return null;
}

function detectOrderStatus(payload: unknown): string | null {
  const cand = [["order_status"],["status"],["data","order_status"],["data","status"],["msg","order_status"],["msg","status"],["message","order_status"],["message","status"],["current_state"],["new_status"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  const tryNested = (key: string): string | null => {
    const raw = getStr(payload, [key]);
    if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        const nested = JSON.parse(raw);
        for (const p of cand) {
          const v = getStr(nested, p);
          if (v) return v;
        }
      } catch (_) {}
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message");
}

function detectPushCode(payload: unknown): number | null {
  const cand = [["code"],["push_type"],["business_type"],["data","code"],["msg","code"],["message","code"],["data","push_type"],["msg","push_type"],["message","push_type"],["data","business_type"],["msg","business_type"],["message","business_type"]];
  for (const p of cand) {
    const v = getStr(payload, p);
    if (v && /^\d+$/.test(String(v))) return Number(v);
  }
  const tryNested = (key: string): number | null => {
    const raw = getStr(payload, [key]);
    if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        const nested = JSON.parse(raw);
        for (const p of cand) {
          const v = getStr(nested, p);
          if (v && /^\d+$/.test(String(v))) return Number(v);
        }
      } catch (_) {}
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);

  const admin = createAdminClient() as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const bodyText = await req.text();
    const body = tryParseJson(bodyText) ?? {};
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const contentType = req.headers.get("content-type") || "";
    const origin = req.headers.get("x-origin") || null;
    console.log("shopee-webhook-orders inbound", { correlationId, method: req.method, url: req.url, contentType, rawLen: bodyText.length, origin, bodyPreview: bodyText.slice(0, 500) });
    try {
      const liveKey = Deno.env.get("SHOPEE_LIVE_PUSH_PARTNER_KEY");
      const providedSig =
        req.headers.get("x-shopee-signature") ||
        req.headers.get("x-shopee-sign") ||
        req.headers.get("x-signature") ||
        req.headers.get("x-sign") ||
        (req.headers.get("authorization") || "").split(" ").pop() ||
        getStr(body, ["sign"]) ||
        getStr(body, ["signature"]) ||
        null;
      const shouldValidate = Boolean(liveKey) && Boolean(providedSig);
      // Evita validar assinatura em chamadas internas encaminhadas por sync-all
      const origin = req.headers.get("x-origin") || null;
      const doValidate = shouldValidate && origin !== "live_push";
      if (doValidate) {
        const sigHexUp = await hmacSha256Hex(liveKey!, bodyText);
        const sigHexLo = await hmacSha256HexLower(liveKey!, bodyText);
        const sigB64 = await hmacSha256Base64(liveKey!, bodyText);
        const p = String(providedSig || "").trim();
        const matched =
          p &&
          (p === sigHexUp ? "hex_upper" : (p.toLowerCase() === sigHexLo ? "hex_lower" : (p === sigB64 ? "base64" : null)));
        console.log("shopee-webhook-orders signature_validation", { correlationId, origin, provided: Boolean(providedSig), matched, validated: doValidate });
        if (!matched) {
          return jsonResponse({ ok: false, error: "Invalid signature", correlationId }, 401);
        }
      }
    } catch (_) {}

    const orderSn = detectOrderSn(body);
    const shopId = detectShopId(body);
    try {
      console.log("shopee-webhook-orders detection_summary", { correlationId, origin, orderSn, shopId });
    } catch (_) {}
    if (!orderSn) return jsonResponse({ ok: false, error: "Missing order_sn", correlationId }, 200);

    const notifPayload = (getField(body, "notification") ?? body) as unknown;

    const hosts: string[] = [];

    let integration: any = null;
    let integErr: any = null;
    try {
      const { data, error } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .contains("config", shopId ? { shopee_shop_id: String(shopId) } : {})
        .limit(1)
        .single();
      integration = data;
      integErr = error;
    } catch (_) {}
    if ((!integration || integErr) && shopId) {
      const { data: byUserId } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("meli_user_id", Number(shopId))
        .limit(1)
        .single();
      if (byUserId) integration = byUserId;
    }
    if (!integration) return jsonResponse({ ok: false, error: "Integration not found", correlationId }, 200);

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Partner ID or Partner Key", correlationId }, 200);
    const cfgInt = getField(integration, "config") as Record<string, unknown> | null;
    const shopIdCandidate = (cfgInt && typeof cfgInt?.["shopee_shop_id"] !== "undefined") ? Number(cfgInt?.["shopee_shop_id"]) : Number(getField(integration, "meli_user_id") || 0);
    if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) return jsonResponse({ ok: false, error: "Missing shop_id", correlationId }, 200);
    const accRaw = String(getField(integration, "access_token") || "");
    const refRaw = String(getField(integration, "refresh_token") || "");
    let accessToken = await tryDecryptToken(aesKey, accRaw);
    let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);
    const listHosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
    const refreshPath = "/api/v2/auth/access_token/get";
    const tryRefreshAccessToken = async (): Promise<boolean> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = `${partnerId}${refreshPath}${timestamp}`;
      const sign = await hmacSha256Hex(partnerKey, baseString);
      if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
      for (const h of listHosts) {
        const tokenUrl = `${h}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
        const resp = await fetch(tokenUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shop_id: Number(shopIdCandidate), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
        });
        const text = await resp.text();
        let json: any = {};
        try { json = JSON.parse(text); } catch (_) { json = {}; }
        if (resp.ok && json && json.access_token) {
          accessToken = String(json.access_token);
          refreshTokenPlain = String(json.refresh_token || refreshTokenPlain);
          try {
            const accEnc = await aesGcmEncryptToString(aesKey, accessToken);
            const refEnc = await aesGcmEncryptToString(aesKey, refreshTokenPlain);
            const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
            await admin
              .from("marketplace_integrations")
              .update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso })
              .eq("id", String(getField(integration, "id")));
          } catch (_) {}
          return true;
        }
      }
      return false;
    };
    if (!accessToken && refreshTokenPlain) await tryRefreshAccessToken();
    const detailPath = "/api/v2/order/get_order_detail";
    const timestamp = Math.floor(Date.now() / 1000);
    const orderSnListParam = String(orderSn);
    const responseOptionalFieldsParam = "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,invoice_data,order_chargeable_weight_gram,return_request_due_date,edt,payment_info";
    const baseString = `${partnerId}${detailPath}${timestamp}${accessToken}${shopIdCandidate}`;
    let sign = await hmacSha256Hex(partnerKey, baseString);
    let orderDetailJson: any = null;
    for (const h of listHosts) {
      const detailUrl = `${h}${detailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${sign}&order_sn_list=${encodeURIComponent(orderSnListParam)}&request_order_status_pending=true&response_optional_fields=${encodeURIComponent(responseOptionalFieldsParam)}`;
      try {
        const urlMasked = detailUrl.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
        console.log("shopee-webhook-orders detail_api_request", { correlationId, host: h, url: urlMasked });
        const respDetail = await fetch(detailUrl, { method: "GET", headers: { "content-type": "application/json" } });
        const textDetail = await respDetail.text();
        try {
          console.log("shopee-webhook-orders detail_api_raw", { correlationId, host: h, status: respDetail.status, ok: respDetail.ok, body: textDetail });
        } catch (_) {}
        try { orderDetailJson = JSON.parse(textDetail); } catch (_) { orderDetailJson = null; }
        if (!respDetail.ok) {
          const errCode = (orderDetailJson as any)?.code ?? (orderDetailJson as any)?.error ?? (orderDetailJson as any)?.data?.code ?? null;
          if ((respDetail.status === 401 || respDetail.status === 403 || String(errCode).includes("invalid_access_token")) && await tryRefreshAccessToken()) {
            console.warn("shopee-webhook-orders detail_refresh_attempt", { correlationId, host: h, status: respDetail.status, code: errCode });
            const ts2 = Math.floor(Date.now() / 1000);
            const base2 = `${partnerId}${detailPath}${ts2}${accessToken}${shopIdCandidate}`;
            sign = await hmacSha256Hex(partnerKey, base2);
            const url2 = `${h}${detailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts2}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${sign}&order_sn_list=${encodeURIComponent(orderSnListParam)}&request_order_status_pending=true&response_optional_fields=${encodeURIComponent(responseOptionalFieldsParam)}`;
            const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
            const text2 = await resp2.text();
            try {
              const url2Masked = url2.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
              console.log("shopee-webhook-orders detail_api_raw_retry", { correlationId, host: h, url: url2Masked, status: resp2.status, ok: resp2.ok, body: text2 });
            } catch (_) {}
            try { orderDetailJson = JSON.parse(text2); } catch (_) { orderDetailJson = null; }
          }
        }
        if (respDetail.ok && orderDetailJson) break;
      } catch (_) {}
    }
    const orderListA = Array.isArray((orderDetailJson as any)?.order_list) ? (orderDetailJson as any)?.order_list : [];
    const orderListB = Array.isArray((orderDetailJson as any)?.data?.order_list) ? (orderDetailJson as any)?.data?.order_list : [];
    const orderListC = Array.isArray((orderDetailJson as any)?.response?.order_list) ? (orderDetailJson as any)?.response?.order_list : [];
    const orderList = (orderListA.length ? orderListA : (orderListB.length ? orderListB : orderListC));
    const orderDetailItem = Array.isArray(orderList) && orderList.length > 0 ? orderList[0] : null;
    const escrowPath = "/api/v2/payment/get_escrow_detail";
    let escrowJson: any = null;
  const buyerInvoicePath = "/api/v2/order/get_buyer_invoice_info";
    const fetchBuyerInvoiceInfo = async (ordSn: string, allowRefresh = true): Promise<any | null> => {
      const tsI = Math.floor(Date.now() / 1000);
      const baseI = `${partnerId}${buyerInvoicePath}${tsI}${accessToken}${shopIdCandidate}`;
      let signI = await hmacSha256Hex(partnerKey, baseI);
      const invoiceHosts = ["https://openplatform.shopee.com.br"];
      for (const h of invoiceHosts) {
        const urlI = `${h}${buyerInvoicePath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${tsI}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${signI}`;
        try {
          const respI = await fetch(urlI, {
            method: "POST",
            headers: { "content-type": "application/json", "accept": "application/json" },
            body: JSON.stringify({ queries: [{ order_sn: String(ordSn) }] }),
          });
          const textI = await respI.text();
          let jsonI: any = null;
          try { jsonI = JSON.parse(textI); } catch (_) { jsonI = null; }
          if (!respI.ok) {
            const errCode = (jsonI as any)?.code ?? (jsonI as any)?.error ?? (jsonI as any)?.data?.code ?? null;
            if ((respI.status === 401 || respI.status === 403 || String(errCode).includes("invalid_access_token")) && allowRefresh) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) {
                const ts2 = Math.floor(Date.now() / 1000);
                const base2 = `${partnerId}${buyerInvoicePath}${ts2}${accessToken}${shopIdCandidate}`;
                signI = await hmacSha256Hex(partnerKey, base2);
                const url2 = `${h}${buyerInvoicePath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts2}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${signI}`;
                const resp2 = await fetch(url2, {
                  method: "POST",
                  headers: { "content-type": "application/json", "accept": "application/json" },
                  body: JSON.stringify({ queries: [{ order_sn: String(ordSn) }] }),
                });
                const text2 = await resp2.text();
                try { jsonI = JSON.parse(text2); } catch (_) { jsonI = null; }
              }
            }
          }
          if (respI.status === 401 || respI.status === 403) continue;
          if (respI.ok) return jsonI;
        } catch (_) { continue; }
      }
      return null;
    };
  const packageDetailPath = "/api/v2/logistics/get_package_detail";
  const shipmentListPath = "/api/v2/order/get_shipment_list";
  const shippingParamPath = "/api/v2/logistics/get_shipping_parameter";
    const fetchPackageDetail = async (pkgId: string, allowRefresh = true): Promise<any | null> => {
      const tsP = Math.floor(Date.now() / 1000);
      const baseP = `${partnerId}${packageDetailPath}${tsP}${accessToken}${shopIdCandidate}`;
      let signP = await hmacSha256Hex(partnerKey, baseP);
      const pkgHosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
      for (const h of pkgHosts) {
        const urlP = `${h}${packageDetailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${tsP}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${signP}&package_id=${encodeURIComponent(String(pkgId))}`;
        try {
          const respP = await fetch(urlP, { method: "GET", headers: { "content-type": "application/json" } });
          const textP = await respP.text();
          let jsonP: any = null;
          try { jsonP = JSON.parse(textP); } catch (_) { jsonP = null; }
          if (!respP.ok) {
            const errCode = (jsonP as any)?.code ?? (jsonP as any)?.error ?? (jsonP as any)?.data?.code ?? null;
            if ((respP.status === 401 || respP.status === 403 || String(errCode).includes("invalid_access_token")) && allowRefresh) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) {
                const ts2 = Math.floor(Date.now() / 1000);
                const base2 = `${partnerId}${packageDetailPath}${ts2}${accessToken}${shopIdCandidate}`;
                signP = await hmacSha256Hex(partnerKey, base2);
                const url2 = `${h}${packageDetailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts2}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${signP}&package_id=${encodeURIComponent(String(pkgId))}`;
                const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
                const text2 = await resp2.text();
                try { jsonP = JSON.parse(text2); } catch (_) { jsonP = null; }
              }
            }
          }
          if (respP.status === 401 || respP.status === 403) continue;
          if (respP.ok) return jsonP;
        } catch (_) { continue; }
      }
      return null;
    };
    const fetchPackageDetailsByNumberList = async (pkgNumbers: string[], allowRefresh = true): Promise<any | null> => {
      if (!Array.isArray(pkgNumbers) || pkgNumbers.length === 0) return null;
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${packageDetailPath}${ts}${accessToken}${shopIdCandidate}`);
      const listParam = pkgNumbers.join(",");
      for (const h of listHosts) {
        const qs = new URLSearchParams({
          partner_id: String(partnerId),
          timestamp: String(ts),
          access_token: String(accessToken),
          shop_id: String(shopIdCandidate),
          sign: String(sign),
          package_number_list: String(listParam),
        });
        const url = `${h}${packageDetailPath}?${qs.toString()}`;
        try {
          const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text); } catch (_) { json = null; }
          if (resp.ok && json && ((String((json as any)?.error || "").toLowerCase() === "error_sign") || (String((json as any)?.message || "").toLowerCase().includes("wrong sign")))) {
            const ts2 = Math.floor(Date.now() / 1000);
            const base2 = `${partnerId}${packageDetailPath}${ts2}${accessToken}${shopIdCandidate}`;
            sign = await hmacSha256Hex(partnerKey, base2);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
              package_number_list: String(listParam),
            });
            const url2 = `${h}${packageDetailPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2); } catch (_) { json = null; }
            if (resp2.ok) return json;
          }
          if (!resp.ok) {
            const errCode = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.data?.code ?? null;
            if ((resp.status === 401 || resp.status === 403 || String(errCode || "").includes("invalid_access_token")) && allowRefresh) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) return await fetchPackageDetailsByNumberList(pkgNumbers, false);
            }
          }
          if (resp.status === 401 || resp.status === 403) continue;
          if (resp.ok) return json;
        } catch (_) { continue; }
      }
      return null;
    };
    if (orderDetailItem) {
      const tsE = Math.floor(Date.now() / 1000);
      const baseE = `${partnerId}${escrowPath}${tsE}${accessToken}${shopIdCandidate}`;
      const signE = await hmacSha256Hex(partnerKey, baseE);
      for (const h of listHosts) {
        const urlE = `${h}${escrowPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${tsE}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${signE}&order_sn=${encodeURIComponent(String(orderSn))}`;
        try {
          const respE = await fetch(urlE, { method: "GET", headers: { "content-type": "application/json" } });
          const textE = await respE.text();
          try { escrowJson = JSON.parse(textE); } catch (_) { escrowJson = null; }
          if (respE.ok) break;
        } catch (_) {}
      }
    }
    const packageIds = (() => {
      const list = Array.isArray(orderDetailItem?.package_list) ? orderDetailItem?.package_list : [];
      const ids = [];
      for (const p of list) {
        const v = String((p?.package_id ?? p?.packageid ?? p?.id ?? "") || "");
        if (v) ids.push(v);
      }
      return ids;
    })();
    const packageDetails: any[] = [];
    for (const pid of packageIds) {
      const det = await fetchPackageDetail(pid).catch(() => null);
      if (det) packageDetails.push({ package_id: pid, ...det });
    }
    const fetchShipmentList = async (ordSn: string, allowRefresh = true): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      const base = `${partnerId}${shipmentListPath}${ts}${accessToken}${shopIdCandidate}`;
      let sign = await hmacSha256Hex(partnerKey, base);
      for (const h of listHosts) {
        const qs = new URLSearchParams({
          partner_id: String(partnerId),
          timestamp: String(ts),
          access_token: String(accessToken),
          shop_id: String(shopIdCandidate),
          sign: String(sign),
          order_sn: String(ordSn),
        });
        const url = `${h}${shipmentListPath}?${qs.toString()}`;
        const urlMasked = url.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
        try {
          console.log("shopee-webhook-orders shipment_list_request", { correlationId, host: h, url: urlMasked, order_sn: ordSn });
          const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text);
          } catch (_) { json = null; }
          console.log("shopee-webhook-orders shipment_list_raw", { correlationId, host: h, status: resp.status, ok: resp.ok });
          if (!resp.ok) {
            const errCode = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.data?.code ?? null;
            const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
            console.warn("shopee-webhook-orders shipment_list_err", { correlationId, host: h, url: urlMasked, status: resp.status, code: errCode, message: errMsg });
            if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token")) && allowRefresh) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) return await fetchShipmentList(ordSn, false);
            }
          }
          if (resp.status === 401 || resp.status === 403) continue;
          if (resp.ok) return json;
        } catch (_) { continue; }
      }
      return null;
    };
    const fetchShippingParameter = async (ordSn: string, pkgNumber?: string, allowRefresh = true): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${shippingParamPath}${ts}${accessToken}${shopIdCandidate}`);
      for (const h of listHosts) {
        const qs = new URLSearchParams({
          partner_id: String(partnerId),
          timestamp: String(ts),
          access_token: String(accessToken),
          shop_id: String(shopIdCandidate),
          sign: String(sign),
          order_sn: String(ordSn),
        });
        if (pkgNumber) qs.set("package_number", String(pkgNumber));
        const url = `${h}${shippingParamPath}?${qs.toString()}`;
        const urlMasked = url.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
        try {
          console.log("shopee-webhook-orders shipping_param_request", { correlationId, host: h, url: urlMasked, order_sn: ordSn, package_number: pkgNumber || null });
          const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
          const text = await resp.text();
          let json: any = null;
          try { json = JSON.parse(text);
          } catch (_) { json = null; }
          console.log("shopee-webhook-orders shipping_param_raw", { correlationId, host: h, status: resp.status, ok: resp.ok });
          if (!resp.ok) {
            const errCode = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.data?.code ?? null;
            const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
            console.warn("shopee-webhook-orders shipping_param_err", { correlationId, host: h, url: urlMasked, status: resp.status, code: errCode, message: errMsg });
            if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token")) && allowRefresh) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) return await fetchShippingParameter(ordSn, pkgNumber, false);
            }
          }
          if (resp.status === 401 || resp.status === 403) continue;
          if (resp.ok) return json;
        } catch (_) { continue; }
      }
      return null;
    };
    const packageNumbersFromOrder = (() => {
      const list = Array.isArray(orderDetailItem?.package_list) ? orderDetailItem?.package_list : [];
      const nums: string[] = [];
      for (const p of list) {
        const v = getStr(p as any, ["package_number"]) || null;
        if (v) nums.push(String(v));
      }
      return nums;
    })();
    const packageDetailResponse = await fetchPackageDetailsByNumberList(packageNumbersFromOrder).catch(() => null);
    const shipmentListResp = await fetchShipmentList(String(orderSn)).catch(() => null);
    const statusesFromShipment = (() => {
      const src = (shipmentListResp && (shipmentListResp.response || shipmentListResp.data || shipmentListResp)) || null;
      const arr = Array.isArray((src as any)?.shipment_list) ? (src as any)?.shipment_list : [];
      const set = new Set<string>();
      for (const s of arr) {
        const v = String(getStr(s as any, ["status"]) || "").toUpperCase();
        if (v) set.add(v);
      }
      return Array.from(set);
    })();
    const statusesFromOrderPkgs = (() => {
      const list = Array.isArray(orderDetailItem?.package_list) ? orderDetailItem?.package_list : [];
      const set = new Set<string>();
      for (const p of list) {
        const v = String(getStr(p as any, ["logistics_status"]) || "").toUpperCase();
        if (v) set.add(v);
      }
      return Array.from(set);
    })();
    const hasLogisticsReady = (() => {
      const s = new Set<string>([...statusesFromShipment, ...statusesFromOrderPkgs]);
      for (const v of s) { if (v === "LOGISTICS_READY") return true; }
      return false;
    })();
    const invStatusRaw =
      (orderDetailItem && typeof orderDetailItem?.invoice_data === "object" ? String(orderDetailItem?.invoice_data?.invoice_status || "") : "") ||
      String((notifPayload as any)?.invoice_data?.invoice_status || "");
    const ordStatusRaw = String(orderDetailItem?.order_status || (notifPayload as any)?.order_status || (notifPayload as any)?.status || "");
    const invPending =
      invStatusRaw.toLowerCase() === "pending" ||
      invStatusRaw.toLowerCase() === "invoice_pending" ||
      ordStatusRaw.toLowerCase() === "invoice_pending" ||
      !(
        orderDetailItem &&
        typeof orderDetailItem?.invoice_data === "object" &&
        String(orderDetailItem?.invoice_data?.invoice_number || "").trim()
      );
    const invoiceInfoJson = invPending ? await fetchBuyerInvoiceInfo(orderSn).catch(() => null) : null;
    const statusNorm = String(ordStatusRaw || "").toUpperCase();
    const hasLogisticsRequestCreated = (() => {
      for (const p of Array.isArray(orderDetailItem?.package_list) ? orderDetailItem!.package_list : []) {
        const v = String(getStr(p as any, ["logistics_status"]) || "").toUpperCase();
        if (v === "REQUEST_CREATED") return true;
      }
      return false;
    })();
    const firstPkgNumber = packageNumbersFromOrder[0] || null;
    const shouldFetchShipParam = !invPending && ((statusNorm === "READY_TO_SHIP") || (statusNorm === "PROCESSED" && hasLogisticsRequestCreated) || hasLogisticsReady);
    const shippingParam = shouldFetchShipParam ? await fetchShippingParameter(String(orderSn), firstPkgNumber || undefined).catch(() => null) : null;
    const pushCode = detectPushCode(body);
    const pushLabel = (() => {
      const m: Record<number, string> = {
        3: "order_status_push",
        4: "order_trackingno_push",
        15: "shipping_document_status_push",
        23: "booking_status_push",
        24: "booking_trackingno_push",
        25: "booking_shipping_document_status_push",
        30: "package_fulfillment_status_push",
        37: "courier_delivery_binding_status_push",
        47: "package_info_push",
      };
      return typeof pushCode === "number" && m[pushCode] ? m[pushCode] : null;
    })();
    try {
      console.log("shopee-webhook-orders push_detection", { correlationId, origin, hasPushCode: typeof pushCode === "number", pushCode, pushLabel });
    } catch (_) {}
    const combinedData = (() => {
      const base: any = { notification: notifPayload };
      if (orderDetailItem) base.order_detail = orderDetailItem;
      if (escrowJson) base.escrow_detail = escrowJson;
      if (invoiceInfoJson) base.buyer_invoice_info = invoiceInfoJson;
      if (packageDetails.length) base.package_detail_list = packageDetails;
      if (shipmentListResp) base.shipment_list_response = shipmentListResp;
      if (shippingParam) base.shipping_parameter = shippingParam;
      if (packageDetailResponse) base.package_detail_response = packageDetailResponse;
      if (typeof pushCode === "number") base.push = { type_code: pushCode, type_label: pushLabel };
      return base;
    })();
    const nowIso = new Date().toISOString();

    const { data: upId, error: upErr } = await admin.rpc('upsert_marketplace_order_raw_shopee', {
      p_organizations_id: String(getField(integration, "organizations_id")),
      p_company_id: String(getField(integration, "company_id")),
      p_marketplace_name: "Shopee",
      p_marketplace_order_id: String(orderSn),
      p_data: combinedData,
    });

    if (upErr) {
      try {
        const msg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : null;
        console.warn("shopee-webhook-orders upsert_rpc_failed", { correlationId, message: msg });
      } catch (_) {}
      try {
        const upsertData = {
          organizations_id: String(getField(integration, "organizations_id")),
          company_id: String(getField(integration, "company_id")),
          marketplace_name: "Shopee",
          marketplace_order_id: String(orderSn),
          data: combinedData,
          last_synced_at: nowIso,
          updated_at: nowIso,
        } as const;
        const { error: upErr2 } = await admin
          .from("marketplace_orders_raw")
          .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });
        if (upErr2) {
          const emsg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : "Upsert failed";
          return jsonResponse({ ok: false, error: emsg, correlationId }, 200);
        }
        const { data: row } = await admin
          .from("marketplace_orders_raw")
          .select("id")
          .eq("organizations_id", String(getField(integration, "organizations_id")))
          .eq("marketplace_name", "Shopee")
          .eq("marketplace_order_id", String(orderSn))
          .limit(1)
          .single();
        const rawId = row?.id || null;
        if (rawId) {
          try {
            await (admin as any).functions.invoke("shopee-process-presented", {
              body: { raw_id: rawId },
              headers: { "x-request-id": correlationId, "x-correlation-id": correlationId },
            });
            console.log("shopee-webhook-orders process_presented_invoked", { correlationId, rawId });
          } catch (_) {}
          try {
            const tn =
              getStr(body, ["tracking_number"]) ||
              getStr(body, ["message","tracking_number"]) ||
              getStr(body, ["msg","tracking_number"]) ||
              getStr(body, ["data","tracking_number"]) ||
              getStr(body, ["tracking_no"]) ||
              getStr(body, ["message","tracking_no"]) ||
              getStr(body, ["msg","tracking_no"]) ||
              getStr(body, ["data","tracking_no"]) ||
              getStr(orderDetailItem || {}, ["package_list","0","tracking_number"]) ||
              getStr(orderDetailItem || {}, ["tracking_number"]) ||
              null;
            const pkgNum =
              getStr(body, ["package_number"]) ||
              getStr(body, ["message","package_number"]) ||
              getStr(body, ["msg","package_number"]) ||
              getStr(body, ["data","package_number"]) ||
              getStr(orderDetailItem || {}, ["package_list","0","package_number"]) ||
              null;
            if ((tn || pkgNum)) {
              const { data: pres } = await admin
                .from("marketplace_orders_presented_new")
                .select("id, shipping_info")
                .eq("marketplace", "Shopee")
                .eq("marketplace_order_id", String(orderSn))
                .limit(1)
                .single();
              const prevInfo = pres?.shipping_info && typeof pres.shipping_info === "object" ? (pres.shipping_info as any) : null;
              const nextInfo: any = {};
              if (prevInfo && typeof prevInfo === "object") {
                for (const k of Object.keys(prevInfo)) nextInfo[k] = (prevInfo as any)[k];
              }
              if (tn) nextInfo.tracking_number = tn;
              if (pkgNum) nextInfo.package_number = pkgNum;
              nextInfo.tracking_event = notifPayload;
              nextInfo.tracking_pushed_at = nowIso;
              if (typeof pushCode === "number") nextInfo.push = { type_code: pushCode, type_label: pushLabel };
              const updObj: Record<string, unknown> = { shipping_info: nextInfo };
              if (tn) updObj["tracking_number"] = tn;
              if (pres?.id) {
                await admin.from("marketplace_orders_presented_new").update(updObj).eq("id", pres.id);
              } else {
                await admin
                  .from("marketplace_orders_presented_new")
                  .update(updObj)
                  .eq("marketplace", "Shopee")
                  .eq("marketplace_order_id", String(orderSn));
              }
              if (tn) {
                const getShippingDocumentParamPath = "/api/v2/logistics/get_shipping_document_parameter";
                const createShippingDocumentPath = "/api/v2/logistics/create_shipping_document";
                let labelOk = false;
                let labelResp: any = null;
                let labelRespStatus: number | null = null;
                let labelRespHost: string | null = null;
                if (partnerId && partnerKey && accessToken && shopIdCandidate) {
                  const tsP = Math.floor(Date.now() / 1000);
                  const baseP = `${partnerId}${getShippingDocumentParamPath}${tsP}${accessToken}${shopIdCandidate}`;
                  let signP = await hmacSha256Hex(partnerKey, baseP);
                  const qsP = new URLSearchParams({
                    partner_id: String(partnerId),
                    timestamp: String(tsP),
                    access_token: String(accessToken),
                    shop_id: String(shopIdCandidate),
                    sign: String(signP),
                    order_sn: String(orderSn),
                  });
                  if (pkgNum) qsP.set("package_number", String(pkgNum));
                  let paramsObj: any = null;
                  for (const h of listHosts) {
                    const urlP = `${h}${getShippingDocumentParamPath}?${qsP.toString()}`;
                    try {
                      const respP = await fetch(urlP, { method: "GET", headers: { "content-type": "application/json" } });
                      const textP = await respP.text();
                      let jsonP: any = null;
                      try { jsonP = JSON.parse(textP); } catch { jsonP = null; }
                      if (respP.ok && jsonP) {
                        paramsObj = jsonP;
                        break;
                      }
                    } catch {}
                  }
                  const tsC = Math.floor(Date.now() / 1000);
                  const baseC = `${partnerId}${createShippingDocumentPath}${tsC}${accessToken}${shopIdCandidate}`;
                  let signC = await hmacSha256Hex(partnerKey, baseC);
                  const qsC = new URLSearchParams({
                    partner_id: String(partnerId),
                    timestamp: String(tsC),
                    access_token: String(accessToken),
                    shop_id: String(shopIdCandidate),
                    sign: String(signC),
                  });
                  const payloadC: any = { order_sn: String(orderSn), tracking_number: String(tn) };
                  if (pkgNum) payloadC.package_number = String(pkgNum);
                  const respFields = paramsObj && (paramsObj.response || paramsObj.data || paramsObj);
                  const docType = (respFields && (respFields.document_type || respFields.type || respFields.default_document_type)) || "label";
                  const docFormat = (respFields && (respFields.file_type || respFields.format || respFields.default_file_type)) || "pdf";
                  payloadC.document_type = String(docType);
                  payloadC.file_type = String(docFormat);
                  for (const h of listHosts) {
                    const urlC = `${h}${createShippingDocumentPath}?${qsC.toString()}`;
                    try {
                      const respC = await fetch(urlC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadC) });
                      const textC = await respC.text();
                      let jsonC: any = null;
                      try { jsonC = JSON.parse(textC); } catch { jsonC = null; }
                      labelResp = jsonC;
                      labelRespStatus = respC.status;
                      labelRespHost = h;
                      if (respC.ok && jsonC) {
                        labelOk = true;
                        break;
                      }
                      if (!respC.ok) {
                        const errCode = (jsonC as any)?.code ?? (jsonC as any)?.error ?? (jsonC as any)?.data?.code ?? null;
                        if ((respC.status === 401 || respC.status === 403 || String(errCode || "").includes("invalid_access_token")) && await tryRefreshAccessToken()) {
                          const tsC2 = Math.floor(Date.now() / 1000);
                          const baseC2 = `${partnerId}${createShippingDocumentPath}${tsC2}${accessToken}${shopIdCandidate}`;
                          signC = await hmacSha256Hex(partnerKey, baseC2);
                          const qsC2 = new URLSearchParams({
                            partner_id: String(partnerId),
                            timestamp: String(tsC2),
                            access_token: String(accessToken),
                            shop_id: String(shopIdCandidate),
                            sign: String(signC),
                          });
                          const urlC2 = `${h}${createShippingDocumentPath}?${qsC2.toString()}`;
                          const respC2 = await fetch(urlC2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadC) });
                          const textC2 = await respC2.text();
                          try { labelResp = JSON.parse(textC2); } catch { labelResp = null; }
                          labelRespStatus = respC2.status;
                          labelRespHost = h;
                          if (respC2.ok) {
                            labelOk = true;
                            break;
                          }
                        }
                      }
                    } catch {}
                  }
                  const { data: pres2 } = await admin
                    .from("marketplace_orders_presented_new")
                    .select("id, shipping_info")
                    .eq("marketplace", "Shopee")
                    .eq("marketplace_order_id", String(orderSn))
                    .limit(1)
                    .single();
                  const prevInfo2 = pres2?.shipping_info && typeof pres2.shipping_info === "object" ? (pres2.shipping_info as any) : null;
                  const nextInfo2: any = {};
                  if (prevInfo2 && typeof prevInfo2 === "object") {
                    for (const k of Object.keys(prevInfo2)) nextInfo2[k] = (prevInfo2 as any)[k];
                  }
                  nextInfo2.label_request = { order_sn: String(orderSn), package_number: pkgNum || null, tracking_number: tn, document_type: String(docType), file_type: String(docFormat), requested_at: nowIso };
                  nextInfo2.label_response = labelResp || null;
                  nextInfo2.label_success = labelOk;
                  const logs2 = Array.isArray(nextInfo2.log_events) ? nextInfo2.log_events : [];
                  nextInfo2.log_events = [
                    ...logs2,
                    {
                      stage: "label",
                      time: nowIso,
                      correlation_id: correlationId,
                      request_host: labelRespHost,
                      response_status: labelRespStatus,
                      success: labelOk,
                      tracking_number: tn,
                      package_number: pkgNum || null,
                    },
                  ];
                  const respObj = labelResp && (labelResp.response || labelResp.data || labelResp);
                  const contentB64 = (respObj && (respObj.content_base64 || respObj.base64 || respObj.file_base64 || respObj.pdf_base64 || respObj.zpl_base64)) || null;
                  const pdfB64 = (respObj && (respObj.pdf_base64 || respObj.pdf || null)) || null;
                  const zplB64 = (respObj && (respObj.zpl2_base64 || respObj.zpl_base64 || respObj.zpl || null)) || null;
                  const contentType = (respObj && (respObj.content_type || respObj.mime || null)) || (String(docFormat).toLowerCase() === "pdf" ? "application/pdf" : (String(docFormat).toLowerCase().includes("zpl") ? "text/plain" : null));
                  const chosenB64 = contentB64 || pdfB64 || zplB64 || null;
                  const sizeBytes = chosenB64 ? Math.floor((chosenB64.length * 3) / 4) : null;
                  const updLabel: Record<string, unknown> = { shipping_info: nextInfo2 };
                  if (chosenB64) {
                    updLabel["label_cached"] = true;
                    updLabel["label_response_type"] = String(docFormat).toLowerCase();
                    updLabel["label_fetched_at"] = nowIso;
                    updLabel["label_size_bytes"] = sizeBytes;
                    updLabel["label_content_base64"] = chosenB64;
                    updLabel["label_content_type"] = contentType || null;
                    if (String(docFormat).toLowerCase() === "pdf") updLabel["label_pdf_base64"] = chosenB64;
                    if (String(docFormat).toLowerCase().includes("zpl")) updLabel["label_zpl2_base64"] = chosenB64;
                  }
                  if (pres2?.id) {
                    await admin.from("marketplace_orders_presented_new").update(updLabel).eq("id", pres2.id);
                  } else {
                    await admin
                      .from("marketplace_orders_presented_new")
                      .update(updLabel)
                      .eq("marketplace", "Shopee")
                      .eq("marketplace_order_id", String(orderSn));
                  }
                }
              }
            }
          } catch (_) {}
        }
        return jsonResponse({ ok: true, order_id: orderSn, raw_id: rawId, correlationId }, 200);
      } catch (_) {
        const emsg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : "Upsert failed";
        return jsonResponse({ ok: false, error: emsg, correlationId }, 200);
      }
    }

    try {
      await (admin as any).functions.invoke("shopee-process-presented", {
        body: { raw_id: upId },
        headers: { "x-request-id": correlationId, "x-correlation-id": correlationId },
      });
    } catch (err) {
      console.warn("shopee-webhook-orders process_presented_failed");
    }
    try {
      const tn =
        getStr(body, ["tracking_number"]) ||
        getStr(body, ["message","tracking_number"]) ||
        getStr(body, ["msg","tracking_number"]) ||
        getStr(body, ["data","tracking_number"]) ||
        
        
        getStr(body, ["tracking_no"]) ||
        getStr(body, ["message","tracking_no"]) ||
        getStr(body, ["msg","tracking_no"]) ||
        getStr(body, ["data","tracking_no"]) ||
        getStr(orderDetailItem || {}, ["package_list","0","tracking_number"]) ||
        getStr(orderDetailItem || {}, ["tracking_number"]) ||
        null;
      const pkgNum =
        getStr(body, ["package_number"]) ||
        getStr(body, ["message","package_number"]) ||
        getStr(body, ["msg","package_number"]) ||
        getStr(body, ["data","package_number"]) ||
        getStr(orderDetailItem || {}, ["package_list","0","package_number"]) ||
        null;
      if (pushLabel === "order_trackingno_push" && (tn || pkgNum)) {
        const { data: pres } = await admin
          .from("marketplace_orders_presented_new")
          .select("id, shipping_info")
          .eq("marketplace", "Shopee")
          .eq("marketplace_order_id", String(orderSn))
          .limit(1)
          .single();
        const prevInfo = pres?.shipping_info && typeof pres.shipping_info === "object" ? (pres.shipping_info as any) : null;
        const nextInfo: any = {};
        if (prevInfo && typeof prevInfo === "object") {
          for (const k of Object.keys(prevInfo)) nextInfo[k] = (prevInfo as any)[k];
        }
        if (tn) nextInfo.tracking_number = tn;
        if (pkgNum) nextInfo.package_number = pkgNum;
        nextInfo.tracking_event = notifPayload;
        nextInfo.tracking_pushed_at = nowIso;
        if (typeof pushCode === "number") nextInfo.push = { type_code: pushCode, type_label: pushLabel };
        const updObj: Record<string, unknown> = { shipping_info: nextInfo };
        if (tn) updObj["tracking_number"] = tn;
        if (pres?.id) {
          await admin.from("marketplace_orders_presented_new").update(updObj).eq("id", pres.id);
        } else {
          await admin
            .from("marketplace_orders_presented_new")
            .update(updObj)
            .eq("marketplace", "Shopee")
            .eq("marketplace_order_id", String(orderSn));
        }
        if (tn) {
          const getShippingDocumentParamPath = "/api/v2/logistics/get_shipping_document_parameter";
          const createShippingDocumentPath = "/api/v2/logistics/create_shipping_document";
          let labelOk = false;
          let labelResp: any = null;
          let labelRespStatus: number | null = null;
          let labelRespHost: string | null = null;
          if (partnerId && partnerKey && accessToken && shopIdCandidate) {
            const tsP = Math.floor(Date.now() / 1000);
            const baseP = `${partnerId}${getShippingDocumentParamPath}${tsP}${accessToken}${shopIdCandidate}`;
            let signP = await hmacSha256Hex(partnerKey, baseP);
            const qsP = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsP),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(signP),
              order_sn: String(orderSn),
            });
            if (pkgNum) qsP.set("package_number", String(pkgNum));
            let paramsObj: any = null;
            for (const h of listHosts) {
              const urlP = `${h}${getShippingDocumentParamPath}?${qsP.toString()}`;
              try {
                const respP = await fetch(urlP, { method: "GET", headers: { "content-type": "application/json" } });
                const textP = await respP.text();
                let jsonP: any = null;
                try { jsonP = JSON.parse(textP); } catch { jsonP = null; }
                if (respP.ok && jsonP) {
                  paramsObj = jsonP;
                  break;
                }
              } catch {}
            }
            const tsC = Math.floor(Date.now() / 1000);
            const baseC = `${partnerId}${createShippingDocumentPath}${tsC}${accessToken}${shopIdCandidate}`;
            let signC = await hmacSha256Hex(partnerKey, baseC);
            const qsC = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsC),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(signC),
            });
            const payloadC: any = { order_sn: String(orderSn), tracking_number: String(tn) };
            if (pkgNum) payloadC.package_number = String(pkgNum);
            const respFields = paramsObj && (paramsObj.response || paramsObj.data || paramsObj);
            const docType = (respFields && (respFields.document_type || respFields.type || respFields.default_document_type)) || "label";
            const docFormat = (respFields && (respFields.file_type || respFields.format || respFields.default_file_type)) || "pdf";
            payloadC.document_type = String(docType);
            payloadC.file_type = String(docFormat);
            for (const h of listHosts) {
              const urlC = `${h}${createShippingDocumentPath}?${qsC.toString()}`;
              try {
                const respC = await fetch(urlC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadC) });
                const textC = await respC.text();
                let jsonC: any = null;
                try { jsonC = JSON.parse(textC); } catch { jsonC = null; }
                labelResp = jsonC;
                labelRespStatus = respC.status;
                labelRespHost = h;
                if (respC.ok && jsonC) {
                  labelOk = true;
                  break;
                }
                if (!respC.ok) {
                  const errCode = (jsonC as any)?.code ?? (jsonC as any)?.error ?? (jsonC as any)?.data?.code ?? null;
                  if ((respC.status === 401 || respC.status === 403 || String(errCode || "").includes("invalid_access_token")) && await tryRefreshAccessToken()) {
                    const tsC2 = Math.floor(Date.now() / 1000);
                    const baseC2 = `${partnerId}${createShippingDocumentPath}${tsC2}${accessToken}${shopIdCandidate}`;
                    signC = await hmacSha256Hex(partnerKey, baseC2);
                    const qsC2 = new URLSearchParams({
                      partner_id: String(partnerId),
                      timestamp: String(tsC2),
                      access_token: String(accessToken),
                      shop_id: String(shopIdCandidate),
                      sign: String(signC),
                    });
                    const urlC2 = `${h}${createShippingDocumentPath}?${qsC2.toString()}`;
                    const respC2 = await fetch(urlC2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadC) });
                    const textC2 = await respC2.text();
                    try { labelResp = JSON.parse(textC2); } catch { labelResp = null; }
                    labelRespStatus = respC2.status;
                    labelRespHost = h;
                    if (respC2.ok) {
                      labelOk = true;
                      break;
                    }
                  }
                }
              } catch {}
            }
            const { data: pres2 } = await admin
              .from("marketplace_orders_presented_new")
              .select("id, shipping_info")
              .eq("marketplace", "Shopee")
              .eq("marketplace_order_id", String(orderSn))
              .limit(1)
              .single();
            const prevInfo2 = pres2?.shipping_info && typeof pres2.shipping_info === "object" ? (pres2.shipping_info as any) : null;
            const nextInfo2: any = {};
            if (prevInfo2 && typeof prevInfo2 === "object") {
              for (const k of Object.keys(prevInfo2)) nextInfo2[k] = (prevInfo2 as any)[k];
            }
            nextInfo2.label_request = { order_sn: String(orderSn), package_number: pkgNum || null, tracking_number: tn, document_type: String(docType), file_type: String(docFormat), requested_at: nowIso };
            nextInfo2.label_response = labelResp || null;
            nextInfo2.label_success = labelOk;
            const logs2 = Array.isArray(nextInfo2.log_events) ? nextInfo2.log_events : [];
            nextInfo2.log_events = [
              ...logs2,
              {
                stage: "label",
                time: nowIso,
                correlation_id: correlationId,
                request_host: labelRespHost,
                response_status: labelRespStatus,
                success: labelOk,
                tracking_number: tn,
                package_number: pkgNum || null,
              },
            ];
            const respObj = labelResp && (labelResp.response || labelResp.data || labelResp);
            const contentB64 = (respObj && (respObj.content_base64 || respObj.base64 || respObj.file_base64 || respObj.pdf_base64 || respObj.zpl_base64)) || null;
            const pdfB64 = (respObj && (respObj.pdf_base64 || respObj.pdf || null)) || null;
            const zplB64 = (respObj && (respObj.zpl2_base64 || respObj.zpl_base64 || respObj.zpl || null)) || null;
            const contentType = (respObj && (respObj.content_type || respObj.mime || null)) || (String(docFormat).toLowerCase() === "pdf" ? "application/pdf" : (String(docFormat).toLowerCase().includes("zpl") ? "text/plain" : null));
            const chosenB64 = contentB64 || pdfB64 || zplB64 || null;
            const sizeBytes = chosenB64 ? Math.floor((chosenB64.length * 3) / 4) : null;
            const updLabel: Record<string, unknown> = { shipping_info: nextInfo2 };
            if (chosenB64) {
              updLabel["label_cached"] = true;
              updLabel["label_response_type"] = String(docFormat).toLowerCase();
              updLabel["label_fetched_at"] = nowIso;
              updLabel["label_size_bytes"] = sizeBytes;
              updLabel["label_content_base64"] = chosenB64;
              updLabel["label_content_type"] = contentType || null;
              if (String(docFormat).toLowerCase() === "pdf") updLabel["label_pdf_base64"] = chosenB64;
              if (String(docFormat).toLowerCase().includes("zpl")) updLabel["label_zpl2_base64"] = chosenB64;
            }
            if (pres2?.id) {
              await admin.from("marketplace_orders_presented_new").update(updLabel).eq("id", pres2.id);
            } else {
              await admin
                .from("marketplace_orders_presented_new")
                .update(updLabel)
                .eq("marketplace", "Shopee")
                .eq("marketplace_order_id", String(orderSn));
            }
          }
        }
      }
    } catch (_) {}
    try {
      console.log("shopee-webhook-orders success", { correlationId, orderSn, rawId: upId });
    } catch (_) {}
    return jsonResponse({ ok: true, order_id: orderSn, raw_id: upId, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("shopee-webhook-orders unexpected_error", { message: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
