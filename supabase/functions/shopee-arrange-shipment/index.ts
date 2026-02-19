import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id",
    },
  });
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
  try {
    const parts = encStr.split(":");
    if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") return encStr;
    const iv = b64ToUint8(parts[2]);
    const ct = b64ToUint8(parts[3]);
    const ivBuf = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
    const ctBuf = ct.buffer.slice(ct.byteOffset, ct.byteOffset + ct.byteLength) as ArrayBuffer;
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, ctBuf);
    return new TextDecoder().decode(pt);
  } catch {
    return encStr;
  }
}

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!cur || typeof cur !== "object" || !(k in (cur as Record<string, unknown>))) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function getStr(obj: unknown, path: string[]): string | null {
  const v = get(obj, path);
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function arr(obj: unknown): any[] {
  return Array.isArray(obj) ? obj as any[] : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const rawText = await req.text();
    let body: any = {};
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = {}; }
    const organizationId = String(body?.organizationId || "");
    const companyId = String(body?.companyId || "");
    const orders = Array.isArray(body?.orders) ? body.orders.map((x: any) => String(x || "")) : [];
    const presentedIds = Array.isArray(body?.presentedIds) ? body.presentedIds.map((x: any) => String(x || "")) : [];
    const singleOrderSn = String(body?.orderSn || body?.order_sn || "");
    const orderSns = (() => {
      const all = [...orders, ...(singleOrderSn ? [singleOrderSn] : [])].map((x) => x.trim()).filter(Boolean);
      const uniq = Array.from(new Set(all));
      return uniq;
    })();
    if (!organizationId || (!orderSns.length && !presentedIds.length)) return jsonResponse({ ok: false, error: "Missing organizationId or orders", correlationId }, 200);
    const nowIso = new Date().toISOString();
    const updated: Array<{ order_sn: string; mode: string | null; planned: boolean; reason?: string }> = [];
    const idsToProcess: Array<{ id: string; order_sn: string; org_id: string }> = [];
    if (presentedIds.length) {
      const { data: rows } = await admin
        .from("marketplace_orders_presented_new")
        .select("id, marketplace_order_id, organizations_id")
        .in("id", presentedIds);
      for (const r of Array.isArray(rows) ? rows : []) {
        idsToProcess.push({ id: String(r.id), order_sn: String(r.marketplace_order_id), org_id: String((r as any)?.organizations_id || "") });
      }
    }
    if (orderSns.length) {
      const { data: rows } = await admin
        .from("marketplace_orders_presented_new")
        .select("id, marketplace_order_id, organizations_id")
        .eq("organizations_id", organizationId)
        .in("marketplace_order_id", orderSns);
      for (const r of Array.isArray(rows) ? rows : []) {
        idsToProcess.push({ id: String(r.id), order_sn: String(r.marketplace_order_id), org_id: String((r as any)?.organizations_id || "") });
      }
    }
    const seen = new Set<string>();
    const planIds = idsToProcess.filter((x) => {
      const k = `${x.id}:${x.order_sn}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const { data: appRow } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    const partnerId = String((appRow as any)?.client_id || "").trim();
    const partnerKey = String((appRow as any)?.client_secret || "").trim();
    const { data: integ } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, access_token, refresh_token, meli_user_id, expires_in")
      .eq("marketplace_name", "Shopee")
      .eq("organizations_id", organizationId)
      .limit(1)
      .maybeSingle();
    let accessToken = String((integ as any)?.access_token || "").trim();
    const refreshTokenEnc = String((integ as any)?.refresh_token || "").trim();
    const shopId = Number((integ as any)?.meli_user_id || 0);
    try {
      const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
      if (encKey && accessToken && accessToken.startsWith("enc:gcm:")) {
        const aesKey = await importAesGcmKey(encKey);
        accessToken = (await aesGcmDecryptFromString(aesKey, accessToken)).trim();
      }
    } catch {}
    const hosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
    const getTrackingNumberPath = "/api/v2/logistics/get_tracking_number";
    const shipOrderPath = "/api/v2/logistics/ship_order";
    const refreshPath = "/api/v2/auth/access_token/get";
    const getShippingDocumentParamPath = "/api/v2/logistics/get_shipping_document_parameter";
    const createShippingDocumentPath = "/api/v2/logistics/create_shipping_document";

    const tryRefreshAccessToken = async (): Promise<boolean> => {
      try {
        const encKey = Deno.env.get("TOKENS_ENCRYPTION_KEY");
        let refreshTokenPlain = refreshTokenEnc;
        if (encKey && refreshTokenPlain.startsWith("enc:gcm:")) {
          const aesKey = await importAesGcmKey(encKey);
          refreshTokenPlain = await aesGcmDecryptFromString(aesKey, refreshTokenPlain);
        }
        if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
        const ts = Math.floor(Date.now() / 1000);
        const base = `${partnerId}${refreshPath}${ts}`;
        const sign = await hmacSha256Hex(partnerKey, base);
        for (const h of hosts) {
          const url = `${h}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts}&sign=${sign}`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shop_id: Number(shopId), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
          });
          const text = await resp.text();
          let json: any = {};
          try { json = JSON.parse(text); } catch { json = {}; }
          if (resp.ok && json && json.access_token) {
            accessToken = String(json.access_token || accessToken).trim();
            const newRefresh = String(json.refresh_token || refreshTokenPlain);
            const ttl = Number(json.expire_in || 14400);
            const expiresAtIso = new Date(Date.now() + (Number.isFinite(ttl) ? ttl : 14400) * 1000).toISOString();
            try {
              const encKey2 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
              if (encKey2) {
                const aesKey2 = await importAesGcmKey(encKey2);
                const iv = crypto.getRandomValues(new Uint8Array(12));
                const ctAcc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey2, new TextEncoder().encode(accessToken));
                const ctRef = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey2, new TextEncoder().encode(newRefresh));
                const accEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctAcc)))}`;
                const refEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctRef)))}`;
                await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", (integ as any)?.id);
              } else {
                await admin.from("marketplace_integrations").update({ access_token: accessToken, refresh_token: newRefresh, expires_in: expiresAtIso }).eq("id", (integ as any)?.id);
              }
            } catch {}
            return true;
          }
        }
      } catch {}
      return false;
    };

    for (const it of planIds) {
      const { data: rawRow } = await admin
        .from("marketplace_orders_raw")
        .select("data")
        .eq("organizations_id", String(it.org_id))
        .eq("marketplace_name", "Shopee")
        .eq("marketplace_order_id", String(it.order_sn))
        .limit(1)
        .maybeSingle();
      const data = rawRow?.data || {};
      const infoNeeded = get(data, ["shipping_parameter","response","info_needed"]) ?? get(data, ["shipping_parameter","info_needed"]) ?? {};
      const infoDrop = get(infoNeeded, ["dropoff"]) ?? [];
      const infoPickup = get(infoNeeded, ["pickup"]) ?? [];
      const dropoffEmpty = Array.isArray(infoDrop) && infoDrop.length === 0;
      const pickupNeeds = Array.isArray(infoPickup) ? infoPickup.map((x) => String(x || "")).filter(Boolean) : [];
      const isPickup = pickupNeeds.length > 0;
      const pkgList = arr(get(data, ["order_detail","package_list"]));
      const pkg = pkgList.length ? pkgList[0] : null;
      const packageNumber = getStr(pkg || {}, ["package_number"]) || null;
      const isSplitOrder = pkgList.length > 1;
      const addressList = arr(get(data, ["shipping_parameter","response","pickup","address_list"]));
      const addressId = addressList.length ? getStr(addressList[0] || {}, ["address_id"]) : null;
      const timeSlots = arr(get(addressList.length ? addressList[0] : {}, ["time_slot_list"]));
      const pickupTimeId = timeSlots.length ? getStr(timeSlots[0] || {}, ["pickup_time_id"]) : null;
      const payload: any = { order_sn: it.order_sn };
      if (isSplitOrder && packageNumber) payload.package_number = packageNumber;
      let mode: string | null = null;
      if (dropoffEmpty) {
        payload.dropoff = {};
        mode = "dropoff";
      } else if (isPickup) {
        payload.pickup = {};
        if (pickupNeeds.includes("address_id") && addressId) payload.pickup.address_id = addressId;
        if (pickupNeeds.includes("pickup_time_id") && pickupTimeId) payload.pickup.pickup_time_id = pickupTimeId;
        mode = "pickup";
      } else {
        mode = null;
      }
      if (!mode) {
        updated.push({ order_sn: it.order_sn, mode, planned: false, reason: "missing_mode" });
        continue;
      }
      const shippingInfo = (() => {
        const base: any = { order_sn: it.order_sn, mode };
        if (packageNumber) base.package_number = packageNumber;
        if (mode === "dropoff") base.dropoff = {};
        if (mode === "pickup") {
          base.pickup = {};
          if (addressId) base.pickup.address_id = addressId;
        if (pickupTimeId) base.pickup.pickup_time_id = pickupTimeId;
        }
        base.info_needed = infoNeeded || {};
        base.planned_payload = payload;
        base.planned_at = nowIso;
        base.log_events = [
          {
            stage: "plan",
            time: nowIso,
            correlation_id: correlationId,
            order_sn: it.order_sn,
            mode,
            package_number: packageNumber || null,
            address_id: addressId || null,
            pickup_time_id: pickupTimeId || null,
            is_split_order: isSplitOrder,
          },
        ];
        return base;
      })();
      try {
        console.log("shopee-arrange-shipment", correlationId, "plan", JSON.stringify({ order_sn: it.order_sn, mode, package_number: packageNumber || null, address_id: addressId || null, pickup_time_id: pickupTimeId || null }));
      } catch {}
      const upd = await admin
        .from("marketplace_orders_presented_new")
        .update({ shipping_info: shippingInfo, ship_order_planned_at: nowIso })
        .eq("id", it.id);
      if (upd.error) {
        updated.push({ order_sn: it.order_sn, mode, planned: false, reason: "update_error" });
      } else {
        let shipOk = false;
        let shipResp: any = null;
        let shipRespStatus: number | null = null;
        let shipRespHost: string | null = null;
        let shipErrCode: string | null = null;
        let shipErrMessage: string | null = null;
        try {
          if (partnerId && partnerKey && accessToken && shopId) {
            const tsS = Math.floor(Date.now() / 1000);
            const baseS = `${partnerId}${shipOrderPath}${tsS}${accessToken}${shopId}`;
            let signS = await hmacSha256Hex(partnerKey, baseS);
            const qsS = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsS),
              access_token: String(accessToken),
              shop_id: String(shopId),
              sign: String(signS),
            });
            const bodyS: any = { order_sn: String(it.order_sn) };
            const includePkg = isSplitOrder && !!packageNumber;
            if (includePkg) bodyS.package_number = String(packageNumber);
            if (mode === "dropoff") bodyS.dropoff = {};
            if (mode === "pickup") {
              bodyS.pickup = {};
              if (addressId) bodyS.pickup.address_id = addressId;
              if (pickupTimeId) bodyS.pickup.pickup_time_id = pickupTimeId;
              }
            for (const h of hosts) {
              const urlS = `${h}${shipOrderPath}?${qsS.toString()}`;
              try {
                const respS = await fetch(urlS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyS) });
                const textS = await respS.text();
                let jsonS: any = null;
                try { jsonS = JSON.parse(textS); } catch { jsonS = null; }
                shipResp = jsonS;
                shipRespStatus = respS.status;
                shipRespHost = h;
                try {
                  console.log("shopee-arrange-shipment", correlationId, "ship_order_request", JSON.stringify({ order_sn: String(it.order_sn), mode, package_number: packageNumber || null, host: h }));
                  console.log("shopee-arrange-shipment", correlationId, "ship_order_response", JSON.stringify({ status: respS.status, success: respS.ok, code: (jsonS as any)?.code ?? (jsonS as any)?.error ?? (jsonS as any)?.data?.code ?? null, message: (jsonS as any)?.message ?? (jsonS as any)?.msg ?? null }));
                } catch {}
                if (!respS.ok) {
                  const errCode = (jsonS as any)?.code ?? (jsonS as any)?.error ?? (jsonS as any)?.data?.code ?? null;
                  shipErrCode = errCode ? String(errCode) : null;
                  shipErrMessage = ((jsonS as any)?.message ?? (jsonS as any)?.msg ?? null) ? String((jsonS as any)?.message ?? (jsonS as any)?.msg ?? "") : null;
                  if ((respS.status === 401 || respS.status === 403 || String(errCode || "").includes("invalid_access_token")) && await tryRefreshAccessToken()) {
                    const ts2S = Math.floor(Date.now() / 1000);
                    const base2S = `${partnerId}${shipOrderPath}${ts2S}${accessToken}${shopId}`;
                    signS = await hmacSha256Hex(partnerKey, base2S);
                    const qs2S = new URLSearchParams({
                      partner_id: String(partnerId),
                      timestamp: String(ts2S),
                      access_token: String(accessToken),
                      shop_id: String(shopId),
                      sign: String(signS),
                    });
                    const url2S = `${h}${shipOrderPath}?${qs2S.toString()}`;
                    const resp2S = await fetch(url2S, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyS) });
                    const text2S = await resp2S.text();
                    try { shipResp = JSON.parse(text2S); } catch { shipResp = null; }
                    shipRespStatus = resp2S.status;
                    shipRespHost = h;
                    try {
                      console.log("shopee-arrange-shipment", correlationId, "ship_order_retry_response", JSON.stringify({ status: resp2S.status, success: resp2S.ok, code: (shipResp as any)?.code ?? (shipResp as any)?.error ?? (shipResp as any)?.data?.code ?? null, message: (shipResp as any)?.message ?? (shipResp as any)?.msg ?? null }));
                    } catch {}
                    if (resp2S.ok) {
                      shipOk = true;
                      break;
                    }
                  }
                } else {
                  shipOk = true;
                  const codeVal = (jsonS as any)?.code ?? (jsonS as any)?.error ?? (jsonS as any)?.data?.code ?? null;
                  if (includePkg && String(codeVal || "") === "logistics.ship_order_not_need_pacakge_number") {
                    try {
                      const bodyNoPkg: any = { order_sn: String(it.order_sn) };
                      if (mode === "dropoff") bodyNoPkg.dropoff = {};
                      if (mode === "pickup") {
                        bodyNoPkg.pickup = {};
                        if (addressId) bodyNoPkg.pickup.address_id = addressId;
                        if (pickupTimeId) bodyNoPkg.pickup.pickup_time_id = pickupTimeId;
                      }
                      const tsR = Math.floor(Date.now() / 1000);
                      const baseR = `${partnerId}${shipOrderPath}${tsR}${accessToken}${shopId}`;
                      const signR = await hmacSha256Hex(partnerKey, baseR);
                      const qsR = new URLSearchParams({
                        partner_id: String(partnerId),
                        timestamp: String(tsR),
                        access_token: String(accessToken),
                        shop_id: String(shopId),
                        sign: String(signR),
                      });
                      const urlR = `${h}${shipOrderPath}?${qsR.toString()}`;
                      const respR = await fetch(urlR, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyNoPkg) });
                      const textR = await respR.text();
                      let jsonR: any = null;
                      try { jsonR = JSON.parse(textR); } catch { jsonR = null; }
                      shipResp = jsonR;
                      shipRespStatus = respR.status;
                      shipRespHost = h;
                      shipOk = respR.ok;
                      try {
                        console.log("shopee-arrange-shipment", correlationId, "ship_order_retry_without_package", JSON.stringify({ status: respR.status, success: respR.ok, host: h }));
                      } catch {}
                    } catch {}
                  }
                  break;
                }
              } catch {}
            }
            const { data: pres2 } = await admin
              .from("marketplace_orders_presented_new")
              .select("id, shipping_info")
              .eq("id", it.id)
              .limit(1)
              .single();
            const prevInfo2 = pres2?.shipping_info && typeof pres2.shipping_info === "object" ? (pres2.shipping_info as any) : null;
            const nextInfo2: any = {};
            if (prevInfo2 && typeof prevInfo2 === "object") {
              for (const k of Object.keys(prevInfo2)) nextInfo2[k] = (prevInfo2 as any)[k];
            }
            nextInfo2.ship_order_request = { order_sn: String(it.order_sn), package_number: packageNumber || null, mode, requested_at: nowIso, payload: bodyS };
            nextInfo2.ship_order_response = shipResp || null;
            nextInfo2.ship_order_success = shipOk;
            nextInfo2.ship_order_channel = mode;
            nextInfo2.ship_order_error_code = shipErrCode || null;
            nextInfo2.ship_order_error_message = shipErrMessage || null;
            const logs2 = Array.isArray(nextInfo2.log_events) ? nextInfo2.log_events : [];
            nextInfo2.log_events = [
              ...logs2,
              {
                stage: "ship_order",
                time: nowIso,
                correlation_id: correlationId,
                request_host: shipRespHost,
                response_status: shipRespStatus,
                success: shipOk,
                error_code: shipErrCode || null,
                error_message: shipErrMessage || null,
                mode,
                package_number: packageNumber || null,
                is_split_order: isSplitOrder,
              },
            ];
            await admin.from("marketplace_orders_presented_new").update({ shipping_info: nextInfo2 }).eq("id", it.id);
          }
        } catch {}
        let tn: string | null = null;
        let trackingResp: any = null;
        let trackingRespStatus: number | null = null;
        let trackingRespHost: string | null = null;
        try {
          if (partnerId && partnerKey && accessToken && shopId) {
            const ts = Math.floor(Date.now() / 1000);
            const base = `${partnerId}${getTrackingNumberPath}${ts}${accessToken}${shopId}`;
            const sign = await hmacSha256Hex(partnerKey, base);
            const qs = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts),
              access_token: String(accessToken),
              shop_id: String(shopId),
              sign: String(sign),
              order_sn: String(it.order_sn),
            });
            if (isSplitOrder && packageNumber) qs.set("package_number", String(packageNumber));
            qs.set("response_optional_fields", "plp_number,first_mile_tracking_number,last_mile_tracking_number");
            for (const h of hosts) {
              const url = `${h}${getTrackingNumberPath}?${qs.toString()}`;
              try {
                const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
                const text = await resp.text();
                let json: any = null;
                try { json = JSON.parse(text); } catch { json = null; }
                if (resp.ok && json) {
                  trackingResp = json;
                  trackingRespStatus = resp.status;
                  trackingRespHost = h;
                  try {
                    console.log("shopee-arrange-shipment", correlationId, "tracking_response", JSON.stringify({ status: resp.status, ok: resp.ok, host: h }));
                  } catch {}
                  break;
                }
              } catch {}
            }
            const respObj = trackingResp && (trackingResp.response || trackingResp.data || trackingResp);
            const plp = getStr(respObj || {}, ["plp_number"]);
            const firstMile = getStr(respObj || {}, ["first_mile_tracking_number"]);
            const lastMile = getStr(respObj || {}, ["last_mile_tracking_number"]);
            tn = lastMile || firstMile || getStr(respObj || {}, ["tracking_number"]) || null;
            const { data: pres } = await admin
              .from("marketplace_orders_presented_new")
              .select("id, shipping_info")
              .eq("id", it.id)
              .limit(1)
              .single();
            const prevInfo = pres?.shipping_info && typeof pres.shipping_info === "object" ? (pres.shipping_info as any) : null;
            const nextInfo: any = {};
            if (prevInfo && typeof prevInfo === "object") {
              for (const k of Object.keys(prevInfo)) nextInfo[k] = (prevInfo as any)[k];
            }
            nextInfo.tracking_query = { order_sn: it.order_sn, package_number: packageNumber || null, requested_at: nowIso };
            nextInfo.tracking_numbers = { plp_number: plp || null, first_mile_tracking_number: firstMile || null, last_mile_tracking_number: lastMile || null };
            nextInfo.tracking_response = trackingResp || null;
            const logs = Array.isArray(nextInfo.log_events) ? nextInfo.log_events : [];
            nextInfo.log_events = [
              ...logs,
              {
                stage: "tracking",
                time: nowIso,
                correlation_id: correlationId,
                request_host: trackingRespHost,
                response_status: trackingRespStatus,
                tracking_number: tn || null,
                plp_number: plp || null,
                first_mile_tracking_number: firstMile || null,
                last_mile_tracking_number: lastMile || null,
                package_number: packageNumber || null,
              },
            ];
            const updObj: Record<string, unknown> = { shipping_info: nextInfo };
            if (tn) updObj["tracking_number"] = tn;
            await admin.from("marketplace_orders_presented_new").update(updObj).eq("id", it.id);
          }
        } catch {}
        let labelOk = false;
        let labelResp: any = null;
        let labelRespStatus: number | null = null;
        let labelRespHost: string | null = null;
        try {
          if (tn && partnerId && partnerKey && accessToken && shopId) {
            const tsP = Math.floor(Date.now() / 1000);
            const baseP = `${partnerId}${getShippingDocumentParamPath}${tsP}${accessToken}${shopId}`;
            let signP = await hmacSha256Hex(partnerKey, baseP);
            const qsP = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsP),
              access_token: String(accessToken),
              shop_id: String(shopId),
              sign: String(signP),
              order_sn: String(it.order_sn),
            });
            if (isSplitOrder && packageNumber) qsP.set("package_number", String(packageNumber));
            let paramsObj: any = null;
            for (const h of hosts) {
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
            const baseC = `${partnerId}${createShippingDocumentPath}${tsC}${accessToken}${shopId}`;
            let signC = await hmacSha256Hex(partnerKey, baseC);
            const qsC = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsC),
              access_token: String(accessToken),
              shop_id: String(shopId),
              sign: String(signC),
            });
            const payloadC: any = { order_sn: String(it.order_sn), tracking_number: String(tn) };
            if (isSplitOrder && packageNumber) payloadC.package_number = String(packageNumber);
            const respFields = paramsObj && (paramsObj.response || paramsObj.data || paramsObj);
            const docType =
              (respFields && (respFields.document_type || respFields.type || respFields.default_document_type)) ||
              "label";
            const docFormat =
              (respFields && (respFields.file_type || respFields.format || respFields.default_file_type)) ||
              "pdf";
            payloadC.document_type = String(docType);
            payloadC.file_type = String(docFormat);
            for (const h of hosts) {
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
                    const baseC2 = `${partnerId}${createShippingDocumentPath}${tsC2}${accessToken}${shopId}`;
                    signC = await hmacSha256Hex(partnerKey, baseC2);
                    const qsC2 = new URLSearchParams({
                      partner_id: String(partnerId),
                      timestamp: String(tsC2),
                      access_token: String(accessToken),
                      shop_id: String(shopId),
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
            const { data: pres3 } = await admin
              .from("marketplace_orders_presented_new")
              .select("id, shipping_info")
              .eq("id", it.id)
              .limit(1)
              .single();
            const prevInfo3 = pres3?.shipping_info && typeof pres3.shipping_info === "object" ? (pres3.shipping_info as any) : null;
            const nextInfo3: any = {};
            if (prevInfo3 && typeof prevInfo3 === "object") {
              for (const k of Object.keys(prevInfo3)) nextInfo3[k] = (prevInfo3 as any)[k];
            }
            nextInfo3.label_request = { order_sn: String(it.order_sn), package_number: packageNumber || null, tracking_number: tn, document_type: String(docType), file_type: String(docFormat), requested_at: nowIso };
            nextInfo3.label_response = labelResp || null;
            nextInfo3.label_success = labelOk;
            const logs3 = Array.isArray(nextInfo3.log_events) ? nextInfo3.log_events : [];
            nextInfo3.log_events = [
              ...logs3,
              {
                stage: "label",
                time: nowIso,
                correlation_id: correlationId,
                request_host: labelRespHost,
                response_status: labelRespStatus,
                success: labelOk,
                tracking_number: tn,
                package_number: packageNumber || null,
              },
            ];
            const respObj = labelResp && (labelResp.response || labelResp.data || labelResp);
            const contentB64 =
              (respObj && (respObj.content_base64 || respObj.base64 || respObj.file_base64 || respObj.pdf_base64 || respObj.zpl_base64)) ||
              null;
            const pdfB64 =
              (respObj && (respObj.pdf_base64 || respObj.pdf || null)) ||
              null;
            const zplB64 =
              (respObj && (respObj.zpl2_base64 || respObj.zpl_base64 || respObj.zpl || null)) ||
              null;
            const contentType =
              (respObj && (respObj.content_type || respObj.mime || null)) ||
              (String(docFormat).toLowerCase() === "pdf" ? "application/pdf" : (String(docFormat).toLowerCase().includes("zpl") ? "text/plain" : null));
            const chosenB64 = contentB64 || pdfB64 || zplB64 || null;
            const sizeBytes = chosenB64 ? Math.floor((chosenB64.length * 3) / 4) : null;
            const updLabel: Record<string, unknown> = {
              shipping_info: nextInfo3,
            };
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
            await admin.from("marketplace_orders_presented_new").update(updLabel).eq("id", it.id);
          }
        } catch {}
        updated.push({ order_sn: it.order_sn, mode, planned: true, reason: shipOk ? (tn ? `ship_order:ok;tracking:${tn}` : "ship_order:ok") : "ship_order:error" });
      }
    }
    return jsonResponse({ ok: true, planned: updated, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
