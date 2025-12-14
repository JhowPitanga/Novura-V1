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
  try { return JSON.parse(text); } catch (_) { return null;
}
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

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const rawKey = enc.encode(key);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex.toUpperCase(); // Retorna em MAIÚSCULAS (correto para orders API)
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

// Funções de detecção (mantidas por serem utilitários)
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
  for (const p of cand) { const v = getStr(payload, p); if (v) return v;
  }
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
  return tryNested("data") || tryNested("msg") || tryNested("message");
}

function detectShopId(payload: unknown): string | null {
  const cand = [["shop_id"],["data","shop_id"],["msg","shop_id"],["merchant_id"],["shopid"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  return null;
}

function detectOrderStatus(payload: unknown): string | null {
  const cand = [["order_status"],["status"],["data","order_status"],["data","status"],["msg","order_status"],["msg","status"],["message","order_status"],["message","status"],["current_state"],["new_status"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v;
  }
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
    const timeFrom = Number(getStr(body, ["time_from"]) || getStr(body, ["timeFrom"]) || (nowSec - 86400));
    const timeTo = Number(getStr(body, ["time_to"]) || getStr(body, ["timeTo"]) || nowSec);
    const timeRangeFieldInput = getStr(body, ["time_range_field"]) || "update_time";
    const pageSize = Number(getStr(body, ["page_size"]) || 50);
    const orderSn = getStr(body, ["order_sn"]) || getStr(body, ["orderSn"]) || null;
    
    // Busca Credenciais do App Shopee (Tabela APPS)
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret") // Seleciona apenas o necessário
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    
    // --- OTIMIZAÇÃO: Configuração estritamente para Produção (Remoção de lógica de teste) ---
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();

    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
        console.error("shopee-sync-orders credentials_error", { correlationId, partnerId, hasKey: !!partnerKey });
        return jsonResponse({ ok: false, error: "Missing or invalid Partner ID (client_id) or Partner Key (client_secret)" }, 200);
    }
    
    const listPath = "/api/v2/order/get_order_list";
    const detailPath = "/api/v2/order/get_order_detail";
    
    // Hosts de Produção Fixados
    const prodHosts = [
      "https://partner.shopeemobile.com", 
      "https://openplatform.shopee.com.br", 
    ];

    const listHosts = prodHosts; 
    const detailHosts = prodHosts;
    console.log("shopee-sync-orders api_host_selection_prod", { correlationId, partnerId, listHosts, detailHosts });
    // --- Fim da Otimização de Configuração ---

    let integrations: any[] = [];
    if (shopId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopId},meli_user_id.eq.${shopId}`)
        .limit(10);
      integrations = Array.isArray(data) ? data : [];
    } else if (organizationId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("organizations_id", organizationId);
      integrations = Array.isArray(data) ? data : [];
    } else {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, config, meli_user_id")
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

      let accessToken = await aesGcmDecryptFromString(aesKey, String(getField(integration, "access_token")));
      const fetchList = async (cursor?: string, rangeField?: string, fromTs?: number, toTs?: number): Promise<any | null> => {
        const timestamp = Math.floor(Date.now() / 1000);
        const rf = rangeField || timeRangeFieldInput;
        const f = typeof fromTs === "number" ? fromTs : timeFrom;
        const t = typeof toTs === "number" ? toTs : timeTo;
        
        // BaseString APENAS com parâmetros comuns (sem corpo JSON)
        const baseString = `${partnerId}${listPath}${timestamp}${accessToken}${shopIdCandidate}`;
        let sign = await hmacSha256Hex(partnerKey, baseString);
        
        // Construção dos parâmetros de Query String
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

        for (const host of listHosts) {
          const url = `${host}${listPath}?${queryParams.toString()}`;
          try {
            // Requisição GET
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text);
            } catch (_) { json = null; }
            try {
              console.log("shopee-sync-orders list_api_raw", { correlationId, integration_id: integrationId, host, url, status: resp.status, ok: resp.ok, body: text });
            } catch (_) {}
            try {
              const listA = Array.isArray((json as any)?.order_list) ?
              (json as any).order_list : [];
              const listB = Array.isArray((json as any)?.data?.order_list) ? (json as any).data.order_list : [];
              const len = (listA.length || listB.length);
              const nxt = getStr(json, ["next_cursor"]) || getStr(json, ["data","next_cursor"]) || null;
              const more = Boolean((json as any)?.more ?? (json as any)?.data?.more ?? false);
              console.log("shopee-sync-orders list_api", { correlationId, integration_id: integrationId, host, url, status: resp.status, ok: resp.ok, len, more, next_cursor: nxt, range_field: rf, time_from: f, time_to: t, cursor: cursor || null });
            } catch (_) {}
            if (!resp.ok) {
              try {
                const errCode = (json as any)?.code ??
                (json as any)?.error ?? (json as any)?.data?.code ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) ||
                null;
                console.warn("shopee-sync-orders list_api_err", { correlationId, integration_id: integrationId, host, url, status: resp.status, code: errCode, message: errMsg });
              } catch (_) {}
            }
            if (resp.status === 401 || resp.status === 403) return null;
            if (resp.ok) return json;
          } catch (_) { continue; }
        }
        return null;
      };

      const fetchDetailBatch = async (orderSns: string[]): Promise<any | null> => {
        const timestamp = Math.floor(Date.now() / 1000);
        // 1. Prepare parameters for URL Query String (GET method)
        const orderSnListParam = orderSns.join(",");

        // 2. CONSTRUCT BASE STRING FOR V2 GET/URL-PARAM REQUEST (NO JSON Body)
        // BaseString = partner_id + API_PATH + timestamp + access_token + shop_id
        const baseString = `${partnerId}${detailPath}${timestamp}${accessToken}${shopIdCandidate}`;
        let sign = await hmacSha256Hex(partnerKey, baseString);
        
        for (const host of detailHosts) {
          // 3. Construct URL with all V2 parameters and the specific GET parameters in Query String
          const url = `${host}${detailPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${sign}&order_sn_list=${encodeURIComponent(orderSnListParam)}`;
          try {
            // 4. CALL FETCH with GET method and NO BODY
            const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
            const text = await resp.text();
            let json: any = null;
            try { json = JSON.parse(text);
            } catch (_) { json = null; }
            try {
              console.log("shopee-sync-orders detail_api_raw", { correlationId, integration_id: integrationId, host, url, status: resp.status, ok: resp.ok, body: text });
            } catch (_) {}
            try {
              const listA = Array.isArray((json as any)?.order_list) ?
              (json as any).order_list : [];
              const listB = Array.isArray((json as any)?.data?.order_list) ? (json as any).data.order_list : [];
              const len = (listA.length || listB.length);
              console.log("shopee-sync-orders detail_api", { correlationId, integration_id: integrationId, host, url, status: resp.status, ok: resp.ok, batch_size: orderSns.length, detail_len: len });
            } catch (_) {}
            if (!resp.ok) {
              try {
                const errCode = (json as any)?.code ??
                (json as any)?.error ?? (json as any)?.data?.code ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) ||
                null;
                console.warn("shopee-sync-orders detail_api_err", { correlationId, integration_id: integrationId, host, url, status: resp.status, code: errCode, message: errMsg });
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
      const readOrderList = (j: any): any[] => {
        const orderList = (j?.order_list || j?.data?.order_list || []) as any[];
        return Array.isArray(orderList) ? orderList : [];
      };
      const hasMore = (j: any): boolean => Boolean(j?.more ?? j?.data?.more ?? false);
      const nextCursor = (j: any): string | null => getStr(j, ["next_cursor"]) || getStr(j, ["data","next_cursor"]) || null;
      const batches: string[][] = [];
      const pushBatch = (sns: string[]) => {
        const size = 50;
        for (let i = 0; i < sns.length; i += size) batches.push(sns.slice(i, i + size));
      };
      if (orderSn) {
          pushBatch([orderSn]);
          fetched = 1;
          console.log("shopee-sync-orders single_order_sync", { correlationId, integration_id: integrationId, orderSn, action: "details_fetch_queued" });
      } else {
          let listJson = await fetchList();
          while (true) {
            const current = cursor ?
            await fetchList(cursor) : listJson;
            if (!current) break;
            const items = readOrderList(current);
            const sns = items.map((o: any) => String(o?.ordersn || o?.order_sn || "")).filter(Boolean);
            fetched += sns.length;
            if (sns.length) pushBatch(sns);
            if (hasMore(current)) {
              cursor = nextCursor(current);
              if (!cursor) break;
            } else {
              break;
            }
          }
          console.log("shopee-sync-orders list_summary", { correlationId, integration_id: integrationId, fetched_initial: fetched });
          if (fetched === 0) {
            const sevenDays = 7 * 86400;
            const altFrom = nowSec - sevenDays;
            const altTo = nowSec;
            cursor = null;
            listJson = await fetchList(undefined, "create_time", altFrom, altTo);
            while (true) {
              const current = cursor ?
              await fetchList(cursor, "create_time", altFrom, altTo) : listJson;
              if (!current) break;
              const items = readOrderList(current);
              const sns = items.map((o: any) => String(o?.ordersn || o?.order_sn || "")).filter(Boolean);
              fetched += sns.length;
              if (sns.length) pushBatch(sns);
              if (hasMore(current)) {
                cursor = nextCursor(current);
                if (!cursor) break;
              } else {
                break;
              }
            }
            console.log("shopee-sync-orders list_fallback_summary", { correlationId, integration_id: integrationId, fetched_after_fallback: fetched });
          }
          if (fetched === 0) {
            const fourteenDays = 14 * 86400;
            const altFrom2 = nowSec - fourteenDays;
            const altTo2 = nowSec;
            cursor = null;
            listJson = await fetchList(undefined, "update_time", altFrom2, altTo2);
            while (true) {
              const current = cursor ?
              await fetchList(cursor, "update_time", altFrom2, altTo2) : listJson;
              if (!current) break;
              const items = readOrderList(current);
              const sns = items.map((o: any) => String(o?.ordersn || o?.order_sn || "")).filter(Boolean);
              fetched += sns.length;
              if (sns.length) pushBatch(sns);
              if (hasMore(current)) {
                cursor = nextCursor(current);
                if (!cursor) break;
              } else {
                break;
              }
            }
            console.log("shopee-sync-orders list_second_fallback_summary", { correlationId, integration_id: integrationId, fetched_after_second_fallback: fetched });
          }
      }


      for (const b of batches) {
        const detailJson = await fetchDetailBatch(b);
        const orderList = (detailJson?.order_list || detailJson?.data?.order_list || []) as any[];
        if (!Array.isArray(orderList)) continue;
        for (const ord of orderList) {
          const ordSn = String(ord?.order_sn || ord?.ordersn || "");
          if (!ordSn) continue;
          const status = String(ord?.order_status || ord?.status || "").trim() || null;
          const updateTs = getStr(ord, ["update_time"]) || null;
          const createTs = getStr(ord, ["create_time"]) || null;
          const orderItems = Array.isArray(ord?.item_list) ? ord.item_list : [];
          const toIso = (ts: string | null) => {
            const n = ts ?
            Number(ts) : NaN;
            if (!Number.isFinite(n)) return null;
            return new Date(n * 1000).toISOString();
          };
          const nowIso = new Date().toISOString();
          const combined = { order_detail: ord } as const;
          const upsertData = {
            organizations_id: organizationsId,
            company_id: companyId,
            marketplace_name: "Shopee",
            marketplace_order_id: ordSn,
            status: status,
            status_detail: null,
          
            order_items: Array.isArray(orderItems) ?
            orderItems : [],
            buyer: null,
            seller: null,
            payments: [],
            shipments: [],
            feedback: null,
            tags: [],
            data: combined,
  
     
            date_created: toIso(createTs),
            date_closed: null,
            last_updated: toIso(updateTs),
            last_synced_at: nowIso,
            updated_at: nowIso,
          } as const;
          let rawId: string | null = null;
          try {
            const { data: rpcId, error: rpcErr } = await admin.rpc('upsert_marketplace_order_raw', {
              p_organizations_id: organizationsId,
              p_company_id: companyId,
              p_marketplace_name: "Shopee",
              p_marketplace_order_id: ordSn,
          
              p_status: status,
              p_status_detail: null,
              p_order_items: Array.isArray(orderItems) ? orderItems : [],
              p_buyer: null,
              p_seller: null,
              p_payments: [],
      
              p_shipments: [],
 
              p_feedback: null,
              p_tags: [],
              p_data: combined,
              p_date_created: toIso(createTs),
              p_date_closed: null,
              p_last_updated: 
              toIso(updateTs),
           
              p_last_synced_at: nowIso,
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
                  .eq("marketplace_order_id", 
                  
                  ordSn)
                  .limit(1)
                  .single();
                rawId = row?.id || null;
                console.log("shopee-sync-orders upsert_direct_ok", { correlationId, integration_id: integrationId, ordSn, raw_id: rawId });
              } else {
                console.warn("shopee-sync-orders upsert_failed", { integration_id: integrationId, order_sn: ordSn, message: upErr.message });
              }
            }
            if (rawId) { try { await admin.rpc('refresh_presented_order', { p_order_id: rawId });
            } catch (_) {} }
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