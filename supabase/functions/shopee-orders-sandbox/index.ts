// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-origin",
    },
  });
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importAesGcmKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = b64ToUint8(base64Key);
  const keyBuf = keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength);
  return crypto.subtle.importKey("raw", keyBuf as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}

async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> {
  const parts = encStr.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format");
  const iv = b64ToUint8(parts[2]);
  const ct = b64ToUint8(parts[3]);
  const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
  const ctBuf = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer;
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, ctBuf);
  return new TextDecoder().decode(pt);
}

async function tryDecryptToken(key: CryptoKey, encStr: string): Promise<string> {
  const s = String(encStr || "");
  if (!s) return "";
  try {
    if (s.startsWith("enc:gcm:")) {
      return await aesGcmDecryptFromString(key, s);
    }
  } catch (_) {}
  return s;
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function getField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>)[key];
  }
  return undefined;
}

function getStr(obj: unknown, path: string[]): string | null {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !(k in (cur as Record<string, unknown>))) return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  const v = cur as unknown;
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function detectOrderSn(payload: unknown): string | null {
  const cand = [
    ["order_sn"],
    ["ordersn"],
    ["ordersn_list","0"],
    ["order_sn_list","0"],
    ["data","order_sn"],
    ["msg","order_sn"],
    ["message","order_sn"],
    ["order","order_sn"],
    ["orders","0","order_sn"],
  ];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  const tryNested = (key: string): string | null => {
    const raw = getStr(payload, [key]);
    if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        const nested = JSON.parse(raw);
        for (const p of cand) { const v = getStr(nested, p); if (v) return v; }
      } catch (_) {}
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message");
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
        for (const p of cand) { const v = getStr(nested, p); if (v) return v; }
      } catch (_) {}
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    const body = tryParseJson(bodyText) ?? {};
    console.log("shopee-sync-orders inbound", { correlationId, method: req.method, url: req.url, bodyPreview: bodyText.slice(0, 500) });

    const organizationId = getStr(body, ["organizationId"]);
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || null;
    const shopId = shopIdStr ? Number(shopIdStr) : null;
    const nowSec = Math.floor(Date.now() / 1000);
    const timeFromInput = Number(getStr(body, ["time_from"]) || getStr(body, ["timeFrom"]) || (nowSec - 86400));
    const timeToInput = Number(getStr(body, ["time_to"]) || getStr(body, ["timeTo"]) || nowSec);
    let timeFrom = Number.isFinite(timeFromInput) ? timeFromInput : (nowSec - 86400);
    let timeTo = Number.isFinite(timeToInput) ? timeToInput : nowSec;
    const hasTimeFromParam = (getStr(body, ["time_from"]) !== null) || (getStr(body, ["timeFrom"]) !== null);
    const hasTimeToParam = (getStr(body, ["time_to"]) !== null) || (getStr(body, ["timeTo"]) !== null);
    const explicitPeriod = Boolean(hasTimeFromParam || hasTimeToParam);
    if (timeFrom > timeTo) { const t = timeFrom; timeFrom = timeTo; timeTo = t; }
    const maxWindowSec = 15 * 86400;
    if ((timeTo - timeFrom) > maxWindowSec) timeFrom = timeTo - maxWindowSec;
    const timeRangeFieldInput = getStr(body, ["time_range_field"]) || "update_time";
    const pageSize = Math.min(100, Math.max(1, Number(getStr(body, ["page_size"]) || 50)));
    const orderSn = getStr(body, ["order_sn"]) || getStr(body, ["orderSn"]) || null;
    let orderSnList: string[] = [];
    {
      const rawListField = getField(body, "order_sn_list") ?? getField(body, "orderSnList");
      if (Array.isArray(rawListField)) {
        orderSnList = (rawListField as any[]).map((x) => String(x || "").trim()).filter((s) => !!s);
      } else {
        const csv = getStr(body, ["order_sn_list"]) || getStr(body, ["orderSnList"]) || null;
        if (csv) {
          orderSnList = String(csv).split(/[\s,]+/).map((s) => s.trim()).filter((s) => !!s);
        }
      }
    }
    
    let appRow: Record<string, unknown> | null = null;
    {
      const candidateNames = ["sandbox_shopee", "sanbox_shopee", "Shopee Sandbox", "Shopee"];
      for (const nm of candidateNames) {
        const { data, error } = await admin
          .from("apps")
          .select("client_id, client_secret")
          .eq("name", nm)
          .limit(1);
        if (!error && Array.isArray(data) && data.length > 0) {
          appRow = data[0] as Record<string, unknown>;
          break;
        }
      }
    }
    if (!appRow) return jsonResponse({ ok: false, error: "App not found (expected one of sandbox_shopee/sanbox_shopee/Shopee Sandbox/Shopee)", correlationId }, 200);
    
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();

    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
        console.error("shopee-sync-orders credentials_error", { correlationId, partnerId, hasKey: !!partnerKey });
        return jsonResponse({ ok: false, error: "Missing or invalid Partner ID (client_id) or Partner Key (client_secret)" }, 200);
    }
    
    const listPath = "/api/v2/order/get_order_list";
    const detailPath = "/api/v2/order/get_order_detail";
    
    const sandboxHosts = [
      "https://partner.test-stable.shopeemobile.com",
    ];

    const listHosts = sandboxHosts;
    const detailHosts = sandboxHosts;
    console.log("shopee-sync-orders api_host_selection_sandbox", { correlationId, partnerId, listHosts, detailHosts });

    let integrations: any[] = [];
    if (shopId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopId},meli_user_id.eq.${shopId}`)
        .limit(10);
      integrations = Array.isArray(data) ? data : [];
    } else if (organizationId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("organizations_id", organizationId);
      integrations = Array.isArray(data) ? data : [];
    } else {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .limit(10);
      integrations = Array.isArray(data) ? data : [];
    }

    if (!integrations.length) return jsonResponse({ ok: false, error: "No Shopee integrations found", correlationId }, 200);
    const results: Array<{ integration_id: string; fetched: number; updated: number }> = [];
    for (const integration of integrations) {
      const organizationsId = String(getField(integration, "organizations_id"));
      const companyId = String(getField(integration, "company_id"));
      const integrationId = String(getField(integration, "id"));
      const cfgInt = getField(integration, "config") as Record<string, unknown> | null;
      const shopIdCandidate = (cfgInt && typeof cfgInt?.["shopee_shop_id"] !== "undefined") ? Number(cfgInt?.["shopee_shop_id"]) : Number(getField(integration, "meli_user_id") || 0);
      if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) {
        console.warn("shopee-sync-orders skip_integration_missing_shop_id", { correlationId, integration_id: integrationId });
        continue;
      }

      const accRaw = String(getField(integration, "access_token") || "");
      const refRaw = String(getField(integration, "refresh_token") || "");
      let accessToken = await tryDecryptToken(aesKey, accRaw);
      let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);
      const encAccess = accRaw.startsWith("enc:gcm:");
      const encRefresh = refRaw.startsWith("enc:gcm:");
      console.log("shopee-sync-orders token_state", { correlationId, integration_id: integrationId, enc_access: encAccess, enc_refresh: encRefresh, access_len: accessToken.length, refresh_len: refreshTokenPlain.length });
      console.log("shopee-sync-orders params_summary", { correlationId, integration_id: integrationId, shop_id: shopIdCandidate, time_range_field: timeRangeFieldInput, time_from: timeFrom, time_to: timeTo, page_size: pageSize, window_sec: (timeTo - timeFrom) });

      const tryRefreshAccessToken = async (): Promise<boolean> => {
        const refreshPath = "/api/v2/auth/access_token/get";
        const timestamp = Math.floor(Date.now() / 1000);
        const baseString = `${partnerId}${refreshPath}${timestamp}`;
        const sign = await hmacSha256Hex(partnerKey, baseString);
        if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) {
          console.warn("shopee-sync-orders token_refresh_skipped_missing_refresh", { correlationId, integration_id: integrationId, refresh_len: (refreshTokenPlain || "").length });
          return false;
        }
        for (const host of listHosts) {
          const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
          try {
            console.log("shopee-sync-orders token_refresh_request", { correlationId, integration_id: integrationId, host, url: tokenUrl.replace(/sign=[^&]*/i, "sign=***"), body: { shop_id: Number(shopIdCandidate), has_refresh_token: true, partner_id: Number(partnerId) } });
            const resp = await fetch(tokenUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ shop_id: Number(shopIdCandidate), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
            });
            const text = await resp.text();
            let json: any = {};
            try { json = JSON.parse(text); } catch (_) { json = {}; }
            console.log("shopee-sync-orders token_refresh_response", { correlationId, integration_id: integrationId, status: resp.status, ok: resp.ok, body_preview: String(text).slice(0, 200) });
            if (resp.ok && json && json.access_token) {
              accessToken = String(json.access_token);
              refreshTokenPlain = String(json.refresh_token || refreshTokenPlain);
              try {
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const ctA = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(accessToken));
                const ctB = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, new TextEncoder().encode(refreshTokenPlain));
                const accEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctA)))}`;
                const refEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctB)))}`;
                const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
                await admin
                  .from("marketplace_integrations")
                  .update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso })
                  .eq("id", integrationId);
                console.log("shopee-sync-orders token_refreshed", { correlationId, integration_id: integrationId, access_len: accessToken.length, refresh_len: refreshTokenPlain.length, expire_in: Number(json.expire_in) || null });
              } catch (_) {}
              return true;
            } else {
              try {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : "") || null;
                console.warn("shopee-sync-orders token_refresh_failed", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
              } catch (_) {}
            }
          } catch (_) { continue; }
        }
        return false;
      };

      if (!accessToken && refreshTokenPlain) {
        await tryRefreshAccessToken();
      }

      const escrowPath = "/api/v2/payment/get_escrow_detail";
      const fetchEscrowDetail = async (orderSn: string, allowRefresh = true): Promise<any | null> => {
        const timestamp = Math.floor(Date.now() / 1000);
        const baseString = `${partnerId}${escrowPath}${timestamp}${accessToken}${shopIdCandidate}`;
        let sign = await hmacSha256Hex(partnerKey, baseString);
        const signPreview = sign.slice(0, 8);
        const tsDiff = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
        for (const host of detailHosts) {
          const url = `${host}${escrowPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${sign}&order_sn=${encodeURIComponent(orderSn)}`;
          const urlMasked = url.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
          try {
            console.log("shopee-sync-orders escrow_sign_inputs", { correlationId, integration_id: integrationId, path: escrowPath, timestamp, partner_id: partnerId, shop_id: shopIdCandidate, access_len: accessToken.length, sign_preview: signPreview });
            console.log("shopee-sync-orders escrow_api_request", { correlationId, integration_id: integrationId, host, url: urlMasked, order_sn: orderSn, ts_diff: tsDiff });
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch (_) { json = null; }
            try {
              console.log("shopee-sync-orders escrow_api_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
            } catch (_) {}
            if (!resp.ok) {
              try {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.data?.code ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-orders escrow_api_err", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token")) && allowRefresh) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    return await fetchEscrowDetail(orderSn, false);
                  }
                }
              } catch (_) {}
            }
            if (resp.status === 401 || resp.status === 403) return null;
            if (resp.ok) return json;
          } catch (_) { continue; }
        }
        return null;
      };

      const fetchList = async (cursor?: string, rangeField?: string, fromTs?: number, toTs?: number, allowRefresh = true): Promise<any | null> => {
        const timestamp = Math.floor(Date.now() / 1000);
        const rf = rangeField || timeRangeFieldInput;
        const f = typeof fromTs === "number" ? fromTs : timeFrom;
        const t = typeof toTs === "number" ? toTs : timeTo;
        const baseString = `${partnerId}${listPath}${timestamp}${accessToken}${shopIdCandidate}`;
        let sign = await hmacSha256Hex(partnerKey, baseString);
        const signPreview = sign.slice(0, 8);
        const tsDiff = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
        const queryParams = new URLSearchParams({
          partner_id: partnerId,
          timestamp: String(timestamp),
          access_token: accessToken,
          shop_id: String(shopIdCandidate),
          sign: sign,
          time_range_field: rf,
          time_from: String(f),
          time_to: String(t),
          page_size: String(pageSize),
        });
        if (cursor) queryParams.set("cursor", cursor);
        const rawOrderStatus = getStr(body, ["order_status"]) || getStr(body, ["orderStatus"]);
        const orderStatusNorm = rawOrderStatus ? rawOrderStatus.trim().toUpperCase() : null;
        const allowedStatuses = new Set(["UNPAID","READY_TO_SHIP","PROCESSED","SHIPPED","COMPLETED","IN_CANCEL","CANCELLED","INVOICE_PENDING"]);
        const orderStatusValid = orderStatusNorm ? allowedStatuses.has(orderStatusNorm) : false;
        if (orderStatusValid) queryParams.set("order_status", orderStatusNorm);
        console.log("shopee-sync-orders list_order_status_param", { correlationId, integration_id: integrationId, raw: rawOrderStatus || null, normalized: orderStatusNorm || null, valid: orderStatusValid });
        const respOptFieldsRaw = getStr(body, ["response_optional_fields"]);
        if (respOptFieldsRaw && respOptFieldsRaw.trim().toLowerCase() === "order_status") queryParams.set("response_optional_fields", "order_status");
        const reqPendingStr = getStr(body, ["request_order_status_pending"]) || getStr(body, ["pending"]);
        if (reqPendingStr) {
          const v = String(reqPendingStr).toLowerCase();
          const b = (v === "true" || v === "1" || v === "yes");
          queryParams.set("request_order_status_pending", String(b));
        }
        const lcidStr = getStr(body, ["logistics_channel_id"]);
        const lcidNum = lcidStr && Number.isFinite(Number(lcidStr)) ? Number(lcidStr) : null;
        if (lcidNum !== null) queryParams.set("logistics_channel_id", String(lcidNum));

        for (const host of listHosts) {
          const url = `${host}${listPath}?${queryParams.toString()}`;
          const urlMasked = url.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
          try {
            console.log("shopee-sync-orders list_sign_inputs", { correlationId, integration_id: integrationId, path: listPath, timestamp, partner_id: partnerId, shop_id: shopIdCandidate, access_len: accessToken.length, sign_preview: signPreview });
            console.log("shopee-sync-orders list_api_request", { correlationId, integration_id: integrationId, host, url: urlMasked, time_range_field: rf, time_from: f, time_to: t, page_size: pageSize, cursor: cursor || null, ts_diff: tsDiff, has_order_status: orderStatusValid, has_resp_opt: (respOptFieldsRaw || "").trim().toLowerCase() === "order_status", pending_flag: Boolean(reqPendingStr), logistics_channel_id: lcidNum });
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch (_) { json = null; }
            try {
              console.log("shopee-sync-orders list_api_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
            } catch (_) {}
            try {
              const listA = Array.isArray((json as any)?.order_list) ? (json as any).order_list : [];
              const listB = Array.isArray((json as any)?.data?.order_list) ? (json as any).data.order_list : [];
              const listC = Array.isArray((json as any)?.response?.order_list) ? (json as any).response.order_list : [];
              const len = (listA.length || listB.length || listC.length);
              const nxt = getStr(json, ["next_cursor"]) || getStr(json, ["data","next_cursor"]) || getStr(json, ["response","next_cursor"]) || null;
              const more = Boolean((json as any)?.more ?? (json as any)?.data?.more ?? (json as any)?.response?.more ?? false);
              console.log("shopee-sync-orders list_api", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, len, more, next_cursor: nxt, range_field: rf, time_from: f, time_to: t, cursor: cursor || null });
            } catch (_) {}
            if (!resp.ok) {
              try {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? (json as any)?.data?.code ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-orders list_api_err", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token") || String(errCode).includes("invalid_acceess_token")) && allowRefresh) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    return await fetchList(cursor, rf, f, t, false);
                  }
                }
              } catch (_) {}
            }
            if (resp.status === 401 || resp.status === 403) return null;
            if (resp.ok) return json;
          } catch (_) { continue; }
        }
        return null;
      };

      const fetchDetailBatch = async (orderSns: string[], allowRefresh = true): Promise<any | null> => {
        const timestamp = Math.floor(Date.now() / 1000);
        const orderSnListParam = orderSns.join(",");
        const responseOptionalFieldsParam = "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,invoice_data,order_chargeable_weight_gram,return_request_due_date,edt,payment_info";
        const baseString = `${partnerId}${detailPath}${timestamp}${accessToken}${shopIdCandidate}`;
        let sign = await hmacSha256Hex(partnerKey, baseString);
        const signPreview = sign.slice(0, 8);
        const tsDiff = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
        
        for (const host of detailHosts) {
          const url = `${host}${detailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${sign}&order_sn_list=${encodeURIComponent(orderSnListParam)}&request_order_status_pending=true&response_optional_fields=${encodeURIComponent(responseOptionalFieldsParam)}`;
          const urlMasked = url.replace(/access_token=[^&]*/i, "access_token=***").replace(/sign=[^&]*/i, "sign=***");
          try {
            console.log("shopee-sync-orders detail_sign_inputs", { correlationId, integration_id: integrationId, path: detailPath, timestamp, partner_id: partnerId, shop_id: shopIdCandidate, access_len: accessToken.length, sign_preview: signPreview });
            console.log("shopee-sync-orders detail_api_request", { correlationId, integration_id: integrationId, host, url: urlMasked, batch_size: orderSns.length, ts_diff: tsDiff });
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch (_) { json = null; }
            try {
              console.log("shopee-sync-orders detail_api_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
            } catch (_) {}
            try {
              const listA = Array.isArray((json as any)?.order_list) ? (json as any).order_list : [];
              const listB = Array.isArray((json as any)?.data?.order_list) ? (json as any).data.order_list : [];
              const listC = Array.isArray((json as any)?.response?.order_list) ? (json as any).response.order_list : [];
              const len = (listA.length || listB.length || listC.length);
              console.log("shopee-sync-orders detail_api", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, batch_size: orderSns.length, detail_len: len });
            } catch (_) {}
            if (!resp.ok) {
              try {
                const errCode = (json as any)?.code ??
                (json as any)?.error ?? (json as any)?.data?.code ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) ||
                null;
                console.warn("shopee-sync-orders detail_api_err", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token") || String(errCode).includes("invalid_acceess_token")) && allowRefresh) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    return await fetchDetailBatch(orderSns, false);
                  }
                }
              } catch (_) {}
            }
            if (resp.status === 401 || resp.status === 403) return null;
            if (resp.ok) return json;
          } catch (_) { continue; }
        }
        return null;
      };

      let cursor: string | null = null;
      let fetched = 0, updated = 0;
      const orderListMap = new Map<string, any>();
      const readOrderList = (j: any): any[] => {
        const orderListA = Array.isArray(j?.order_list) ? j?.order_list : [];
        const orderListB = Array.isArray(j?.data?.order_list) ? j?.data?.order_list : [];
        const orderListC = Array.isArray(j?.response?.order_list) ? j?.response?.order_list : [];
        const merged = (orderListA.length ? orderListA : (orderListB.length ? orderListB : orderListC));
        return Array.isArray(merged) ? merged : [];
      };
      const hasMore = (j: any): boolean => Boolean(j?.more ?? j?.data?.more ?? j?.response?.more ?? false);
      const nextCursor = (j: any): string | null => getStr(j, ["next_cursor"]) || getStr(j, ["data","next_cursor"]) || getStr(j, ["response","next_cursor"]) || null;
      const batches: string[][] = [];
      const pushBatch = (sns: string[]) => {
        const size = 50;
        for (let i = 0; i < sns.length; i += size) batches.push(sns.slice(i, i + size));
      };
      if (orderSnList.length > 0) {
          pushBatch(orderSnList);
          fetched = orderSnList.length;
          console.log("shopee-sync-orders explicit_order_list_sync", { correlationId, integration_id: integrationId, batch_size: orderSnList.length, action: "details_fetch_queued" });
      } else if (orderSn) {
          pushBatch([orderSn]);
          fetched = 1;
          console.log("shopee-sync-orders single_order_sync", { correlationId, integration_id: integrationId, orderSn, action: "details_fetch_queued" });
      } else {
          if (explicitPeriod) {
            let listJson = await fetchList();
            while (true) {
              const current = cursor ?
              await fetchList(cursor) : listJson;
              if (!current) break;
              const items = readOrderList(current);
              const sns = items.map((o: any) => String(o?.ordersn || o?.order_sn || "")).filter(Boolean);
              for (const it of items) {
                const snx = String(it?.ordersn || it?.order_sn || "");
                if (snx) orderListMap.set(snx, it);
              }
              fetched += sns.length;
              if (sns.length) pushBatch(sns);
              if (hasMore(current)) {
                cursor = nextCursor(current);
                if (!cursor) break;
              } else {
                break;
              }
            }
            console.log("shopee-sync-orders list_summary", { correlationId, integration_id: integrationId, fetched_initial: fetched, explicit_period: true });
          } else {
            console.log("shopee-sync-orders list_skipped_no_explicit_period", { correlationId, integration_id: integrationId });
          }
      }

      for (const b of batches) {
        const detailJson = await fetchDetailBatch(b);
        const orderList = readOrderList(detailJson);
        if (!Array.isArray(orderList)) continue;
        for (const ord of orderList) {
          const ordSn = String(ord?.order_sn || ord?.ordersn || "");
          if (!ordSn) continue;
          const status = String(ord?.order_status || ord?.status || "").trim() || null;
          const updateTs = getStr(ord, ["update_time"]) || null;
          const createTs = getStr(ord, ["create_time"]) || null;
          const orderItems = Array.isArray(ord?.item_list) ? ord.item_list : [];
          const toIso = (ts: string | null) => {
            const n = ts ? Number(ts) : NaN;
            if (!Number.isFinite(n)) return null;
            return new Date(n * 1000).toISOString();
          };
          const nowIso = new Date().toISOString();
          const listEntry = orderListMap.get(ordSn) || null;
          const escrow = await fetchEscrowDetail(ordSn).catch(() => null);
          const combined = escrow ? { order_list_item: listEntry, order_detail: ord, escrow_detail: escrow } as const : { order_list_item: listEntry, order_detail: ord } as const;
          const upsertData = {
            organizations_id: organizationsId,
            company_id: companyId,
            marketplace_name: "Shopee",
            marketplace_order_id: ordSn,
            data: combined,
            last_synced_at: nowIso,
            updated_at: nowIso,
          } as const;
          let rawId: string | null = null;
          try {
            const { data: rpcId, error: rpcErr } = await admin.rpc('upsert_marketplace_order_raw_shopee', {
              p_organizations_id: organizationsId,
              p_company_id: companyId,
              p_marketplace_name: "Shopee",
              p_marketplace_order_id: ordSn,
              p_data: combined,
            });
            if (!rpcErr && rpcId) {
              rawId = String(rpcId);
              updated++;
              console.log("shopee-sync-orders upsert_rpc_ok", { correlationId, integration_id: integrationId, ordSn, raw_id: rawId });
            } else {
              if (rpcErr) console.warn("shopee-sync-orders upsert_rpc_err", { correlationId, integration_id: integrationId, ordSn, message: (rpcErr as any)?.message, code: (rpcErr as any)?.code });
              const { error: upErr } = await admin.from("marketplace_orders_raw").upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });
              if (!upErr) {
                updated++;
                const { data: row } = await admin
                  .from("marketplace_orders_raw")
                  .select("id")
                  .eq("organizations_id", organizationsId)
                  .eq("marketplace_name", "Shopee")
                  .eq("marketplace_order_id", ordSn)
                  .limit(1)
                  .single();
                rawId = row?.id || null;
                console.log("shopee-sync-orders upsert_direct_ok", { correlationId, integration_id: integrationId, ordSn, raw_id: rawId });
              } else {
                console.warn("shopee-sync-orders upsert_failed", { integration_id: integrationId, order_sn: ordSn, message: upErr.message });
              }
            }
            if (rawId) { try { await admin.rpc('refresh_presented_order', { p_order_id: rawId }); } catch (_) {} }
          } catch (_) {}
        }
      }

      results.push({ integration_id: integrationId, fetched, updated });
    }

    return jsonResponse({ ok: true, results, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("shopee-sync-orders unexpected_error", { message: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
