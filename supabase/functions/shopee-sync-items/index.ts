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
    if (s.startsWith("enc:gcm:")) return await aesGcmDecryptFromString(key, s);
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

function getNum(obj: unknown, path: string[]): number | null {
  const s = getStr(obj, path);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(bodyText); } catch (_) { body = {}; }

    const organizationId = getStr(body, ["organizationId"]) || undefined;
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || null;
    const shopIdInput = shopIdStr ? Number(shopIdStr) : null;
    const offsetInput = Number(getStr(body, ["offset"]) || 0);
    const pageSizeInput = Number(getStr(body, ["page_size"]) || 50);
    const updateFromInput = Number(getStr(body, ["update_time_from"]) || 0);
    const updateToInput = Number(getStr(body, ["update_time_to"]) || 0);
    const itemStatusRaw = getField(body, "item_status");
    let itemStatuses: string[] = [];
    if (Array.isArray(itemStatusRaw)) itemStatuses = (itemStatusRaw as any[]).map((x) => String(x || "").trim()).filter((s) => !!s);
    if (!itemStatuses.length) itemStatuses = ["NORMAL","REVIEWING","SHOPEE_DELETE"];
    const selectedIdsRaw = getField(body, "item_id_list") ?? getField(body, "itemIds");
    let selectedItemIds: string[] = [];
    if (Array.isArray(selectedIdsRaw)) selectedItemIds = (selectedIdsRaw as any[]).map((x) => String(x || "").trim()).filter((s) => !!s);
    const offsetStart = Number.isFinite(offsetInput) && offsetInput >= 0 ? offsetInput : 0;
    const pageSize = Math.min(100, Math.max(1, pageSizeInput || 50));
    const updateFrom = Number.isFinite(updateFromInput) && updateFromInput > 0 ? updateFromInput : undefined;
    const updateTo = Number.isFinite(updateToInput) && updateToInput > 0 ? updateToInput : undefined;
    try {
      console.log("shopee-sync-items input", { correlationId, organizationId: organizationId || null, shop_id: shopIdInput || null, offset: offsetStart, page_size: pageSize, update_time_from: updateFrom || null, update_time_to: updateTo || null, item_status_len: itemStatuses.length, selected_ids_len: selectedItemIds.length });
    } catch (_) {}

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);
    try {
      console.log("shopee-sync-items apps_loaded", { correlationId, has_partner_id: !!partnerId, has_partner_key: !!partnerKey });
    } catch (_) {}

    const hosts = ["https://openplatform.shopee.com.br"];
    const listPath = "/api/v2/product/get_item_list";
    const baseInfoPath = "/api/v2/product/get_item_base_info";
    const extraInfoPath = "/api/v2/product/get_item_extra_info";
    const modelListPath = "/api/v2/product/get_model_list";
    const itemPromotionPath = "/api/v2/product/get_item_promotion";
    const contentDiagnosisPath = "/api/v2/product/get_item_content_diagnosis_result";

    let integrations: any[] = [];
    if (shopIdInput) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopIdInput},meli_user_id.eq.${shopIdInput}`)
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
      const companyId = String(getField(integration, "company_id") || "");
      const integrationId = String(getField(integration, "id"));
      const cfg = getField(integration, "config") as Record<string, unknown> | null;
      const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
        ? Number(cfg?.["shopee_shop_id"])
        : Number(getField(integration, "meli_user_id") || 0);
      if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) continue;

      const accRaw = String(getField(integration, "access_token") || "");
      const refRaw = String(getField(integration, "refresh_token") || "");
      let accessToken = await tryDecryptToken(aesKey, accRaw);
      let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);

      const tryRefreshAccessToken = async (): Promise<boolean> => {
        const refreshPath = "/api/v2/auth/access_token/get";
        const timestamp = Math.floor(Date.now() / 1000);
        const baseString = `${partnerId}${refreshPath}${timestamp}`;
        const sign = await hmacSha256Hex(partnerKey, baseString);
        if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
        for (const host of hosts) {
          const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
          try {
            const resp = await fetch(tokenUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ shop_id: Number(shopIdCandidate), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
            });
            const text = await resp.text();
            let json: any = {};
            try { json = JSON.parse(text);
            } catch (_) { json = {}; }
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
                await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", integrationId);
                console.log("shopee-sync-items token_refreshed", { correlationId, integration_id: integrationId, access_len: accessToken.length, refresh_len: refreshTokenPlain.length, expire_in: Number(json.expire_in) || null });
              } catch (_) {}
              return true;
            }
            try {
              const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
              const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : "") || null;
              console.warn("shopee-sync-items token_refresh_failed", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
            } catch (_) {}
          } catch (_) { continue; }
        }
        return false;
      };

      const timestampBase = Math.floor(Date.now() / 1000);
      let fetchedIds: string[] = [];
      if (selectedItemIds.length > 0) {
        fetchedIds = selectedItemIds.slice();
      } else {
        let off = offsetStart;
        let pages = 0;
        const maxPages = 50;
        while (pages < maxPages) {
          pages++;
          const ts = Math.floor(Date.now() / 1000);
          const baseString = `${partnerId}${listPath}${ts}${accessToken}${shopIdCandidate}`;
          let sign = await hmacSha256Hex(partnerKey, baseString);
          for (const host of hosts) {
            const qs = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
              offset: String(off),
              page_size: String(pageSize),
            });
            for (const st of itemStatuses) qs.append("item_status", st);
            if (typeof updateFrom === "number") qs.set("update_time_from", String(updateFrom));
            if (typeof updateTo === "number") qs.set("update_time_to", String(updateTo));
            const url = `${host}${listPath}?${qs.toString()}`;
            try {
              const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
              const text = await resp.text();
              let json: any = null;
              try { json = JSON.parse(text);
              } catch (_) { json = null; }
              try {
                const maskQs = new URLSearchParams({ offset: String(off), page_size: String(pageSize) });
                for (const st of itemStatuses) maskQs.append("item_status", st);
                if (typeof updateFrom === "number") maskQs.set("update_time_from", String(updateFrom));
                if (typeof updateTo === "number") maskQs.set("update_time_to", String(updateTo));
                const urlMasked = `${host}${listPath}?${maskQs.toString()}`;
                console.log("shopee-sync-items list_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
              } catch (_) {}
              if (!resp.ok) {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-items list_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) { sign = await hmacSha256Hex(partnerKey, `${partnerId}${listPath}${ts}${accessToken}${shopIdCandidate}`); }
                }
              }
              if (resp.status === 401 || resp.status === 403) continue;
              if (resp.ok && json) {
                const itemsArr =
                  Array.isArray((json as any)?.item_list) ? (json as any).item_list :
                  Array.isArray((json as any)?.item) ? (json as any).item :
                  Array.isArray((json as any)?.response?.item_list) ? (json as any).response.item_list :
                  Array.isArray((json as any)?.response?.item) ? (json as any).response.item :
                  Array.isArray((json as any)?.data?.item_list) ? (json as any).data.item_list :
                  Array.isArray((json as any)?.data?.item) ? (json as any).data.item :
                  [];
                try { console.log("shopee-sync-items list_parse_items_len", { correlationId, integration_id: integrationId, count: itemsArr.length }); } catch (_) {}
                const ids = itemsArr.map((it: any) => String(it?.item_id || it?.item?.item_id || "")).filter((s: string) => !!s);
                for (const id of ids) if (!fetchedIds.includes(id)) fetchedIds.push(id);
                const len = ids.length;
                if (len < pageSize) { pages = maxPages; break; }
                off += len > 0 ? len : pageSize;
                break;
              }
            } catch (_) { continue; }
          }
        }
      }
      try { console.log("shopee-sync-items list_summary", { correlationId, integration_id: integrationId, fetched_ids_len: fetchedIds.length }); } catch (_) {}

      const chunkSize = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < fetchedIds.length; i += chunkSize) chunks.push(fetchedIds.slice(i, i + chunkSize));

      const baseMap = new Map<string, any>();
      const extraMap = new Map<string, any>();
      const modelsMap = new Map<string, any>();
      const promoMap = new Map<string, any>();
      const diagMap = new Map<string, any>();

      for (const ch of chunks) {
        const ts = Math.floor(Date.now() / 1000);
        const baseStr = `${partnerId}${baseInfoPath}${ts}${accessToken}${shopIdCandidate}`;
        let signBase = await hmacSha256Hex(partnerKey, baseStr);
        const tryFetchBase = async (): Promise<any | null> => {
          for (const host of hosts) {
            const qs = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(signBase),
              need_tax_info: "false",
            });
            qs.set("item_id_list", ch.join(","));
            const url = `${host}${baseInfoPath}?${qs.toString()}`;
            try {
              const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
              const text = await resp.text();
              let json: any = null;
              try { json = JSON.parse(text);
              } catch (_) { json = null; }
              try {
                const maskQs = new URLSearchParams({ need_tax_info: "false" });
                maskQs.set("item_id_list", ch.join(","));
                const urlMasked = `${host}${baseInfoPath}?${maskQs.toString()}`;
                console.log("shopee-sync-items base_info_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
              } catch (_) {}
              if (!resp.ok) {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-items base_info_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    const ts2 = Math.floor(Date.now() / 1000);
                    signBase = await hmacSha256Hex(partnerKey, `${partnerId}${baseInfoPath}${ts2}${accessToken}${shopIdCandidate}`);
                  }
                }
                if (String((json as any)?.error || "").toLowerCase().includes("error_param")) {
                  const qs2 = new URLSearchParams({
                    partner_id: String(partnerId),
                    timestamp: String(ts),
                    access_token: String(accessToken),
                    shop_id: String(shopIdCandidate),
                    sign: String(signBase),
                    need_tax_info: "false",
                  });
                  for (const id of ch) qs2.append("item_id_list", id);
                  const url2 = `${host}${baseInfoPath}?${qs2.toString()}`;
                  const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
                  const text2 = await resp2.text();
                  try { json = JSON.parse(text2);
                  } catch (_) { json = null; }
                  try {
                    const urlMasked2 = `${host}${baseInfoPath}?item_id_list=${ch.join(",")}&need_tax_info=false`;
                    console.log("shopee-sync-items base_info_retry_raw", { correlationId, integration_id: integrationId, host, url: urlMasked2, status: resp2.status, ok: resp2.ok, body: text2 });
                  } catch (_) {}
                  if (resp2.ok) return json;
                }
              }
              if (resp.ok) return json;
            } catch (_) { continue; }
          }
          return null;
        };
         const baseJson = await tryFetchBase();
         if (baseJson) {
          const arr =
            Array.isArray((baseJson as any)?.item_list) ? (baseJson as any).item_list :
            Array.isArray((baseJson as any)?.item) ? (baseJson as any).item :
            Array.isArray((baseJson as any)?.response?.item_list) ? (baseJson as any).response.item_list :
            Array.isArray((baseJson as any)?.response?.item) ? (baseJson as any).response.item :
            Array.isArray((baseJson as any)?.data?.item_list) ? (baseJson as any).data.item_list :
            Array.isArray((baseJson as any)?.data?.item) ? (baseJson as any).data.item :
            [];
          for (const it of arr) {
            const id = String((it?.item_id ?? it?.item?.item_id ?? "") || "");
            if (id) baseMap.set(id, it);
          }
         }

        const tsE = Math.floor(Date.now() / 1000);
        const baseStrE = `${partnerId}${extraInfoPath}${tsE}${accessToken}${shopIdCandidate}`;
        let signExtra = await hmacSha256Hex(partnerKey, baseStrE);
        const tryFetchExtra = async (): Promise<any | null> => {
          for (const host of hosts) {
            const qs = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsE),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(signExtra),
            });
            qs.set("item_id_list", ch.join(","));
            const url = `${host}${extraInfoPath}?${qs.toString()}`;
            try {
              const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
              const text = await resp.text();
              let json: any = null;
              try { json = JSON.parse(text);
              } catch (_) { json = null; }
              try {
                const maskQs = new URLSearchParams();
                maskQs.set("item_id_list", ch.join(","));
                const urlMasked = `${host}${extraInfoPath}?${maskQs.toString()}`;
                console.log("shopee-sync-items extra_info_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
              } catch (_) {}
              if (!resp.ok) {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-items extra_info_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    const ts2 = Math.floor(Date.now() / 1000);
                    signExtra = await hmacSha256Hex(partnerKey, `${partnerId}${extraInfoPath}${ts2}${accessToken}${shopIdCandidate}`);
                  }
                }
                if (String((json as any)?.error || "").toLowerCase().includes("error_param")) {
                  const qs2 = new URLSearchParams({
                    partner_id: String(partnerId),
                    timestamp: String(tsE),
                    access_token: String(accessToken),
                    shop_id: String(shopIdCandidate),
                    sign: String(signExtra),
                  });
                  for (const id of ch) qs2.append("item_id_list", id);
                  const url2 = `${host}${extraInfoPath}?${qs2.toString()}`;
                  const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
                  const text2 = await resp2.text();
                  try { json = JSON.parse(text2);
                  } catch (_) { json = null; }
                  try {
                    const urlMasked2 = `${host}${extraInfoPath}?item_id_list=${ch.join(",")}`;
                    console.log("shopee-sync-items extra_info_retry_raw", { correlationId, integration_id: integrationId, host, url: urlMasked2, status: resp2.status, ok: resp2.ok, body: text2 });
                  } catch (_) {}
                  if (resp2.ok) return json;
                }
              }
              if (resp.ok) return json;
            } catch (_) { continue; }
          }
          return null;
        };
         const extraJson = await tryFetchExtra();
         if (extraJson) {
          const arr =
            Array.isArray((extraJson as any)?.item_list) ? (extraJson as any).item_list :
            Array.isArray((extraJson as any)?.item) ? (extraJson as any).item :
            Array.isArray((extraJson as any)?.response?.item_list) ? (extraJson as any).response.item_list :
            Array.isArray((extraJson as any)?.response?.item) ? (extraJson as any).response.item :
            Array.isArray((extraJson as any)?.data?.item_list) ? (extraJson as any).data.item_list :
            Array.isArray((extraJson as any)?.data?.item) ? (extraJson as any).data.item :
            [];
          for (const it of arr) {
            const id = String((it?.item_id ?? it?.item?.item_id ?? "") || "");
            if (id) extraMap.set(id, it);
          }
       }
      }

      for (const id of fetchedIds) {
        const tsM = Math.floor(Date.now() / 1000);
        const baseStrM = `${partnerId}${modelListPath}${tsM}${accessToken}${shopIdCandidate}`;
        let signModel = await hmacSha256Hex(partnerKey, baseStrM);
        const tryFetchModel = async (): Promise<any | null> => {
          for (const host of hosts) {
            const qs = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(tsM),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(signModel),
              item_id: String(id),
            });
            qs.set("response_optional_fields", "tier_variation,standardise_tier_variation,variation_option_list,image");
            const url = `${host}${modelListPath}?${qs.toString()}`;
            try {
              const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
              const text = await resp.text();
              let json: any = null;
              try { json = JSON.parse(text);
              } catch (_) { json = null; }
              try {
                const urlMasked = `${host}${modelListPath}?item_id=${encodeURIComponent(String(id))}`;
                console.log("shopee-sync-items model_list_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
              } catch (_) {}
              if (!resp.ok) {
                const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                console.warn("shopee-sync-items model_list_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                  const refreshed = await tryRefreshAccessToken();
                  if (refreshed) {
                    const ts2 = Math.floor(Date.now() / 1000);
                    signModel = await hmacSha256Hex(partnerKey, `${partnerId}${modelListPath}${ts2}${accessToken}${shopIdCandidate}`);
                  }
                }
              }
              if (resp.status === 401 || resp.status === 403) continue;
              if (resp.ok) return json;
            } catch (_) { continue; }
          }
          return null;
        };
        const modelJson = await tryFetchModel();
        if (modelJson) {
          const obj = (modelJson as any)?.response ?? (modelJson as any)?.data ?? modelJson;
          const tv = Array.isArray((obj as any)?.tier_variation) ? (obj as any).tier_variation :
            Array.isArray((modelJson as any)?.tier_variation) ? (modelJson as any).tier_variation : null;
          const std = Array.isArray((obj as any)?.standardise_tier_variation) ? (obj as any).standardise_tier_variation :
            Array.isArray((modelJson as any)?.standardise_tier_variation) ? (modelJson as any).standardise_tier_variation : null;
          const arr =
            Array.isArray((obj as any)?.model_list) ? (obj as any).model_list :
            Array.isArray((obj as any)?.model) ? (obj as any).model :
            Array.isArray((modelJson as any)?.response?.model_list) ? (modelJson as any).response.model_list :
            Array.isArray((modelJson as any)?.response?.model) ? (modelJson as any).response.model :
            Array.isArray((modelJson as any)?.data?.model_list) ? (modelJson as any).data.model_list :
            Array.isArray((modelJson as any)?.data?.model) ? (modelJson as any).data.model :
            [];
          const updated = Array.isArray(arr) ? arr.map((m: any) => {
            let imgId: string | null = null;
            let imgUrl: string | null = null;
            const tierIndexArr: number[] = Array.isArray(m?.tier_index) ? m.tier_index : [];
            if (Array.isArray(tv) && tv.length && tierIndexArr.length) {
              for (let i = 0; i < tierIndexArr.length; i++) {
                const tvEntry = tv[i];
                const optIdx = tierIndexArr[i];
                const optList = Array.isArray(tvEntry?.option_list) ? tvEntry.option_list : null;
                const opt = optList && Number.isFinite(optIdx) ? optList[optIdx] : null;
                const imgObj = opt?.image || null;
                const iid = imgObj?.image_id || imgObj?.id || null;
                const iurl = imgObj?.image_url || imgObj?.url || null;
                if (iurl) { imgId = iid ? String(iid) : null; imgUrl = String(iurl); break; }
              }
            }
            const out = { ...m };
            if (imgId || imgUrl) {
              if (imgId) {
                (out as any).picture_id = String(imgId);
                (out as any).picture_ids = [String(imgId)];
              }
              (out as any).model_image_url = imgUrl || null;
            }
            return out;
          }) : [];
          modelsMap.set(id, { model_list: updated, tier_variation: tv, standardise_tier_variation: std });
        }
      }

      {
        try { console.log("shopee-sync-items item_promotion_build_item_count", { correlationId, integration_id: integrationId, item_count: fetchedIds.length }); } catch (_) {}
        const promoChunkSize = 50;
        const promoChunks: string[][] = [];
        for (let i = 0; i < fetchedIds.length; i += promoChunkSize) promoChunks.push(fetchedIds.slice(i, i + promoChunkSize));
        for (const ch of promoChunks) {
          const tsP = Math.floor(Date.now() / 1000);
          const baseStrP = `${partnerId}${itemPromotionPath}${tsP}${accessToken}${shopIdCandidate}`;
          let signPromo = await hmacSha256Hex(partnerKey, baseStrP);
          const tryFetchPromo = async (): Promise<any | null> => {
            for (const host of hosts) {
              const qs = new URLSearchParams({
                partner_id: String(partnerId),
                timestamp: String(tsP),
                access_token: String(accessToken),
                shop_id: String(shopIdCandidate),
                sign: String(signPromo),
              });
              for (const id of ch) qs.append("item_id_list", String(id));
              const url = `${host}${itemPromotionPath}?${qs.toString()}`;
              try {
                const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
                const text = await resp.text();
                let json: any = null;
                try { json = JSON.parse(text);
                } catch (_) { json = null; }
                try {
                  console.log("shopee-sync-items item_promotion_raw", { correlationId, integration_id: integrationId, host, url: `${host}${itemPromotionPath}?item_id_list=count:${ch.length}`, status: resp.status, ok: resp.ok, body: text });
                } catch (_) {}
                if (!resp.ok) {
                  const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                  const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                  console.warn("shopee-sync-items item_promotion_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                  if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                    const refreshed = await tryRefreshAccessToken();
                    if (refreshed) {
                      const ts2 = Math.floor(Date.now() / 1000);
                      signPromo = await hmacSha256Hex(partnerKey, `${partnerId}${itemPromotionPath}${ts2}${accessToken}${shopIdCandidate}`);
                    }
                  }
                  if (String((json as any)?.error || "").toLowerCase().includes("error_param")) {
                    const qs2 = new URLSearchParams({
                      partner_id: String(partnerId),
                      timestamp: String(tsP),
                      access_token: String(accessToken),
                      shop_id: String(shopIdCandidate),
                      sign: String(signPromo),
                    });
                    qs2.set("item_id_list", ch.join(","));
                    const url2 = `${host}${itemPromotionPath}?${qs2.toString()}`;
                    const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
                    const text2 = await resp2.text();
                    let json2: any = null;
                    try { json2 = JSON.parse(text2);
                    } catch (_) { json2 = null; }
                    try {
                      console.log("shopee-sync-items item_promotion_retry_raw", { correlationId, integration_id: integrationId, host, url: `${host}${itemPromotionPath}?item_id_list=count:${ch.length}`, status: resp2.status, ok: resp2.ok, body: text2 });
                    } catch (_) {}
                    if (resp2.ok) return json2;
                  }
                }
                if (resp.status === 401 || resp.status === 403) continue;
                if (resp.ok) return json;
              } catch (_) { continue; }
            }
            return null;
          };
          const promoJson = await tryFetchPromo();
          if (promoJson) {
            const obj = (promoJson as any)?.response ?? (promoJson as any)?.data ?? promoJson;
            let mapped = 0;
            const arr =
              Array.isArray((obj as any)?.item_promotion_list) ? (obj as any).item_promotion_list :
              Array.isArray((obj as any)?.result_list) ? (obj as any).result_list :
              Array.isArray((obj as any)?.item_list) ? (obj as any).item_list :
              Array.isArray((obj as any)?.items) ? (obj as any).items :
              null;
            if (Array.isArray(arr)) {
              for (const it of arr) {
                const iid =
                  getStr(it, ["item_id"]) ||
                  getStr(it, ["item","item_id"]) ||
                  getStr(it, ["base_info","item_id"]) ||
                  getStr(it, ["item_base","item_id"]) ||
                  null;
                if (iid) {
                  promoMap.set(String(iid), it);
                  mapped++;
                }
              }
            } else if (obj && typeof obj === "object") {
              const keys = Object.keys(obj as Record<string, unknown>);
              for (const k of keys) {
                if (/^\d+$/.test(k) && ch.includes(String(k))) {
                  const v = (obj as any)[k];
                  promoMap.set(String(k), v);
                  mapped++;
                }
              }
            }
            if (mapped === 0) {
              for (const iid of ch) {
                try {
                  const tsS = Math.floor(Date.now() / 1000);
                  const baseStrS = `${partnerId}${itemPromotionPath}${tsS}${accessToken}${shopIdCandidate}`;
                  let signPromoS = await hmacSha256Hex(partnerKey, baseStrS);
                  for (const host of hosts) {
                    const qsS = new URLSearchParams({
                      partner_id: String(partnerId),
                      timestamp: String(tsS),
                      access_token: String(accessToken),
                      shop_id: String(shopIdCandidate),
                      sign: String(signPromoS),
                    });
                    qsS.append("item_id_list", String(iid));
                    const urlS = `${host}${itemPromotionPath}?${qsS.toString()}`;
                    const respS = await fetch(urlS, { method: "GET", headers: { "content-type": "application/json" } });
                    const textS = await respS.text();
                    let jsonS: any = null;
                    try { jsonS = JSON.parse(textS);
                    } catch (_) { jsonS = null; }
                    try {
                      console.log("shopee-sync-items item_promotion_single_raw", { correlationId, integration_id: integrationId, host, url: `${host}${itemPromotionPath}?item_id_list=1`, status: respS.status, ok: respS.ok, body: textS, item_id: String(iid) });
                    } catch (_) {}
                    if (respS.ok && jsonS) {
                      const o = (jsonS as any)?.response ?? (jsonS as any)?.data ?? jsonS;
                      const a =
                        Array.isArray((o as any)?.item_promotion_list) ? (o as any).item_promotion_list :
                        Array.isArray((o as any)?.result_list) ? (o as any).result_list :
                        Array.isArray((o as any)?.item_list) ? (o as any).item_list :
                        Array.isArray((o as any)?.items) ? (o as any).items :
                        null;
                      if (Array.isArray(a)) {
                        let set = false;
                        for (const it of a) {
                          const ii =
                            getStr(it, ["item_id"]) ||
                            getStr(it, ["item","item_id"]) ||
                            getStr(it, ["base_info","item_id"]) ||
                            getStr(it, ["item_base","item_id"]) ||
                            null;
                          if (ii && String(ii) === String(iid)) {
                            promoMap.set(String(iid), it);
                            set = true;
                            break;
                          }
                        }
                        if (!set) promoMap.set(String(iid), o);
                      } else {
                        promoMap.set(String(iid), o);
                      }
                      mapped++;
                    } else if (respS.status === 401 || respS.status === 403) {
                      const refreshed = await tryRefreshAccessToken();
                      if (refreshed) {
                        const ts2 = Math.floor(Date.now() / 1000);
                        signPromoS = await hmacSha256Hex(partnerKey, `${partnerId}${itemPromotionPath}${ts2}${accessToken}${shopIdCandidate}`);
                      }
                    }
                  }
                } catch (_) {}
              }
            }
            try { console.log("shopee-sync-items item_promotion_map_counts", { correlationId, integration_id: integrationId, mapped_count: mapped, chunk_count: ch.length }); } catch (_) {}
          }
        }
      }

      {
        const diagChunkSize = 48;
        const diagChunks: string[][] = [];
        for (let i = 0; i < fetchedIds.length; i += diagChunkSize) diagChunks.push(fetchedIds.slice(i, i + diagChunkSize));
        for (const ch of diagChunks) {
          const tsD = Math.floor(Date.now() / 1000);
          const baseStrD = `${partnerId}${contentDiagnosisPath}${tsD}${accessToken}${shopIdCandidate}`;
          let signDiag = await hmacSha256Hex(partnerKey, baseStrD);
          const tryFetchDiag = async (): Promise<any | null> => {
            for (const host of hosts) {
              const url = `${host}${contentDiagnosisPath}?partner_id=${encodeURIComponent(String(partnerId))}&timestamp=${tsD}&access_token=${encodeURIComponent(String(accessToken))}&shop_id=${encodeURIComponent(String(shopIdCandidate))}&sign=${encodeURIComponent(String(signDiag))}`;
              try {
                const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ch.map((v) => Number(v)) }) });
                const text = await resp.text();
                let json: any = null;
                try { json = JSON.parse(text);
                } catch (_) { json = null; }
                try {
                  const urlMasked = `${host}${contentDiagnosisPath}`;
                  console.log("shopee-sync-items content_diag_raw", { correlationId, integration_id: integrationId, host, url: urlMasked, status: resp.status, ok: resp.ok, body: text });
                } catch (_) {}
                if (!resp.ok) {
                  const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
                  const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
                  console.warn("shopee-sync-items content_diag_err", { correlationId, integration_id: integrationId, host, status: resp.status, code: errCode, message: errMsg });
                  if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
                    const refreshed = await tryRefreshAccessToken();
                    if (refreshed) {
                      const ts2 = Math.floor(Date.now() / 1000);
                      signDiag = await hmacSha256Hex(partnerKey, `${partnerId}${contentDiagnosisPath}${ts2}${accessToken}${shopIdCandidate}`);
                    }
                  }
                  if (String((json as any)?.error || "").toLowerCase().includes("error_param")) {
                    for (const id of ch) {
                      const resp2 = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: [Number(id)] }) });
                      const text2 = await resp2.text();
                      let json2: any = null;
                      try { json2 = JSON.parse(text2);
                      } catch (_) { json2 = null; }
                      try { console.log("shopee-sync-items content_diag_retry_raw", { correlationId, integration_id: integrationId, host, status: resp2.status, ok: resp2.ok, id, body: text2 }); } catch (_) {}
                      if (resp2.ok) {
                        const objRetry = (json2 as any)?.response ?? (json2 as any)?.data ?? (json2 as any)?.content_diagnosis_result ?? json2;
                        const succRetry =
                          Array.isArray((objRetry as any)?.success_item_list) ? (objRetry as any).success_item_list : null;
                        if (Array.isArray(succRetry)) {
                          for (const it of succRetry) {
                            const iid = getStr(it, ["item_id"]) || getStr(it, ["item","item_id"]) || null;
                            if (iid) diagMap.set(String(iid), it);
                          }
                        } else {
                          const iid = String(id);
                          if (!diagMap.has(iid)) diagMap.set(iid, objRetry);
                        }
                      }
                    }
                  }
                }
                if (resp.ok) return json;
              } catch (_) { continue; }
            }
            return null;
          };
          const diagJson = await tryFetchDiag();
          if (diagJson) {
            const obj = (diagJson as any)?.response ?? (diagJson as any)?.data ?? (diagJson as any)?.content_diagnosis_result ?? diagJson;
            const successArr =
              Array.isArray((obj as any)?.success_item_list) ? (obj as any).success_item_list :
              Array.isArray((diagJson as any)?.success_item_list) ? (diagJson as any).success_item_list :
              Array.isArray((diagJson as any)?.content_diagnosis_result?.success_item_list) ? (diagJson as any).content_diagnosis_result.success_item_list :
              Array.isArray((obj as any)?.result_list) ? (obj as any).result_list :
              Array.isArray((obj as any)?.item_list) ? (obj as any).item_list :
              null;
            if (Array.isArray(successArr)) {
              for (const it of successArr) {
                const iid = getStr(it, ["item_id"]) || getStr(it, ["item","item_id"]) || null;
                if (iid) diagMap.set(String(iid), it);
              }
            } else {
              for (const id of ch) {
                const iid = String(id);
                if (!diagMap.has(iid)) diagMap.set(iid, obj);
              }
            }
            const failedArr =
              Array.isArray((obj as any)?.failed_item_list) ? (obj as any).failed_item_list :
              Array.isArray((diagJson as any)?.failed_item_list) ? (diagJson as any).failed_item_list :
              Array.isArray((diagJson as any)?.content_diagnosis_result?.failed_item_list) ? (diagJson as any).content_diagnosis_result.failed_item_list :
              null;
            if (Array.isArray(failedArr)) {
              for (const it of failedArr) {
                const iid = getStr(it, ["item_id"]) || getStr(it, ["item","item_id"]) || null;
                if (iid && !diagMap.has(String(iid))) diagMap.set(String(iid), { failed: true, ...(it as any) });
              }
            }
          }
        }
      }

      let updated = 0;
      const nowIso = new Date().toISOString();
      for (const id of fetchedIds) {
        const base = baseMap.get(id) || null;
        const extra = extraMap.get(id) || null;
        const models = modelsMap.get(id) || null;
        const promo = promoMap.get(id) || null;
        const diag = diagMap.get(id) || null;
        const combined: Record<string, unknown> = { base_info: base, extra_info: extra, model_list: models, item_promotion: promo, content_diagnosis_result: diag };

        const title = getStr(base, ["item_name"]) || null;
        const sku = getStr(base, ["item_sku"]) || null;
        const condition = getStr(base, ["condition"]) || null;
        const status = getStr(base, ["item_status"]) || null;
        const priceOriginal =
          getNum(base, ["price_info","0","original_price"]) ??
          getNum(extra, ["price_info","0","original_price"]) ??
          getNum(extra, ["original_price"]) ??
          getNum(base, ["original_price"]) ??
          null;
        const priceCurrent =
          getNum(base, ["price_info","0","current_price"]) ??
          getNum(extra, ["price_info","0","current_price"]) ??
          getNum(extra, ["current_price"]) ??
          getNum(promo, ["current_price"]) ??
          null;
        const price = priceOriginal ?? priceCurrent ?? null;
        const promotionPrice = priceCurrent ?? null;
        const categoryId = getStr(base, ["category_id"]) || null;
        const imageList = (() => {
          if (base && Array.isArray((base as any)?.image?.image_url_list)) return (base as any).image.image_url_list;
          if (base && Array.isArray((base as any)?.image_url_list)) return (base as any).image_url_list;
          if (base && Array.isArray((base as any)?.promotion_image?.image_url_list)) return (base as any).promotion_image.image_url_list;
          return null;
        })();
        const attributes =
          (base && Array.isArray((base as any)?.attribute_list)) ? (base as any).attribute_list : null;
        const variations =
          Array.isArray((models || {})?.model_list) ? (models as any).model_list :
          (Array.isArray(models) ? models : null);
        const stockDistribution =
          (base && typeof (base as any)?.stock_info_v2 === "object") ? (base as any).stock_info_v2 : null;
        const shippingTypes =
          (base && Array.isArray((base as any)?.logistic_info)) ? (base as any).logistic_info : null;
        const descriptionPlain =
          getStr(base, ["description"]) || null;
        const createdAtEpoch =
          getNum(base, ["create_time"]);
        const createdAtIso =
          typeof createdAtEpoch === "number" && createdAtEpoch > 0 ? new Date(createdAtEpoch * 1000).toISOString() : null;

        const sellerId = getStr(integration, ["meli_user_id"]) || null;
        const permalink =
          (sellerId && id) ? `https://shopee.com.br/product/${encodeURIComponent(String(sellerId))}/${encodeURIComponent(String(id))}` : null;

        const rowPerformanceData = diag || null;
        const rowItemPerfomance = extra || null;

        const row: Record<string, unknown> = {
          organizations_id: organizationsId,
          marketplace_name: "Shopee",
          marketplace_item_id: id,
          data: combined,
          last_synced_at: nowIso,
          updated_at: nowIso,
        };
        if (companyId) row["company_id"] = companyId;
        if (title !== null) row["title"] = title;
        if (sku !== null) row["sku"] = sku;
        if (condition !== null) row["condition"] = condition;
        if (status !== null) row["status"] = status;
        if (price !== null) row["price"] = price;
        if (promotionPrice !== null) row["promotion_price"] = promotionPrice;
        if (categoryId !== null) row["category_id"] = categoryId;
        if (permalink !== null) row["permalink"] = permalink;
        if (attributes !== null) row["attributes"] = attributes;
        if (variations !== null) row["variations"] = variations;
        if (imageList !== null) row["pictures"] = imageList;
        if (sellerId !== null) row["seller_id"] = sellerId;
        if (descriptionPlain !== null) row["description_plain_text"] = descriptionPlain;
        if (stockDistribution !== null) row["stock_distribution"] = stockDistribution;
        if (shippingTypes !== null) row["shipping_types"] = shippingTypes;
        if (rowPerformanceData !== null) row["performance_data"] = rowPerformanceData;
        if (rowItemPerfomance !== null) row["item_perfomance"] = rowItemPerfomance;
        if (createdAtIso !== null) row["created_at"] = createdAtIso;
        const { error: upErr } = await admin
          .from("marketplace_items_raw")
          .upsert(row, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
        if (!upErr) {
          updated++;
        } else {
          try {
            const msg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : null;
            console.warn("shopee-sync-items upsert_error", { correlationId, integration_id: integrationId, item_id: id, message: msg });
          } catch (_) {}
        }
      }

      results.push({ integration_id: integrationId, fetched: fetchedIds.length, updated });
      try { console.log("shopee-sync-items integration_summary", { correlationId, integration_id: integrationId, fetched: fetchedIds.length, updated }); } catch (_) {}
    }

    return jsonResponse({ ok: true, results, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try { console.error("shopee-sync-items unexpected_error", { message: msg }); } catch (_) {}
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
