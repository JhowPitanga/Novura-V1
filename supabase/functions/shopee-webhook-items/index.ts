import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getField, getStr, getNum } from "../_shared/adapters/object-utils.ts";
import { importAesGcmKey, aesGcmEncryptToString, tryDecryptToken, hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function hmacSha256HexLower(key: string, message: string): Promise<string> {
  const up = await hmacSha256Hex(key, message);
  return up.toLowerCase();
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

function detectShopId(payload: unknown): string | null {
  const cand = [["shop_id"],["data","shop_id"],["msg","shop_id"],["merchant_id"],["shopid"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  return null;
}

function detectItemIds(payload: unknown): string[] {
  const out: string[] = [];
  const push = (v: string | null) => { if (v && v.trim()) out.push(String(v)); };
  const candSingle = [
    ["item_id"],["itemid"],
    ["data","item_id"],["data","itemid"],
    ["msg","item_id"],["message","item_id"],
    ["item","item_id"],["content","item_id"],
    ["data","content","content","item_id"],
    ["data","message","content","item_id"],
  ];
  for (const p of candSingle) push(getStr(payload, p));
  const candArray = [
    ["item_id_list","0"],["data","item_id_list","0"],["msg","item_id_list","0"],["message","item_id_list","0"],
    ["item_list","0","item_id"],["data","item_list","0","item_id"],["msg","item_list","0","item_id"],["message","item_list","0","item_id"],
  ];
  for (const p of candArray) push(getStr(payload, p));
  const tryNested = (key: string) => {
    const raw = getStr(payload, [key]);
    if (raw && (raw.trim().startsWith("{") || raw.trim().startsWith("["))) {
      try {
        const nested = JSON.parse(raw);
        for (const p of candSingle) push(getStr(nested, p));
        for (const p of candArray) push(getStr(nested, p));
      } catch (_) {}
    }
  };
  tryNested("data"); tryNested("msg"); tryNested("message"); tryNested("raw");
  return Array.from(new Set(out.filter((s) => /^\d+$/.test(String(s)))));
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

function detectPushLabel(payload: unknown, code: number | null): string | null {
  const m: Record<number, string> = {
    8: "reserved_stock_change_push",
    11: "video_upload_push",
    16: "violation_item_push",
    22: "item_price_update_push",
    27: "item_scheduled_publish_failed_push",
  };
  if (typeof code === "number" && m[code]) return m[code];
  const t = (getStr(payload, ["type"]) || "").toLowerCase();
  const known = ["reserved_stock_change_push","video_upload_push","violation_item_push","item_price_update_push","item_scheduled_publish_failed_push"];
  if (t && known.includes(t)) return t;
  return null;
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
    console.log("shopee-webhook-items inbound", { correlationId, method: req.method, url: req.url, contentType, rawLen: bodyText.length, origin, bodyPreview: bodyText.slice(0, 500) });
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
      const originHdr = req.headers.get("x-origin") || null;
      const doValidate = shouldValidate && originHdr !== "live_push";
      if (doValidate) {
        const sigHexUp = await hmacSha256Hex(liveKey!, bodyText);
        const sigHexLo = await hmacSha256HexLower(liveKey!, bodyText);
        const sigB64 = await hmacSha256Base64(liveKey!, bodyText);
        const p = String(providedSig || "").trim();
        const matched =
          p &&
          (p === sigHexUp ? "hex_upper" : (p.toLowerCase() === sigHexLo ? "hex_lower" : (p === sigB64 ? "base64" : null)));
        console.log("shopee-webhook-items signature_validation", { correlationId, origin: originHdr, provided: Boolean(providedSig), matched, validated: doValidate });
        if (!matched) {
          return jsonResponse({ ok: false, error: "Invalid signature", correlationId }, 401);
        }
      }
    } catch (_) {}

    const itemIds = detectItemIds(body);
    const shopIdStr = detectShopId(body);
    const pushCode = detectPushCode(body);
    const pushLabel = detectPushLabel(body, pushCode);
    console.log("shopee-webhook-items detection_summary", { correlationId, itemIdsLen: itemIds.length, shopId: shopIdStr, pushCode, pushLabel });
    if (!itemIds.length) return jsonResponse({ ok: false, error: "Missing item_id", correlationId }, 200);

    const notifPayload = (getField(body, "notification") ?? body) as unknown;

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);
    console.log("shopee-webhook-items apps_loaded", { correlationId, has_partner_id: !!partnerId, has_partner_key: !!partnerKey });

    let integration: any = null;
    if (shopIdStr) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopIdStr},meli_user_id.eq.${shopIdStr}`)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    } else {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    }
    if (!integration) return jsonResponse({ ok: false, error: "No Shopee integration found", correlationId }, 200);
    const cfg = getField(integration, "config") as Record<string, unknown> | null;
    const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
      ? Number(cfg?.["shopee_shop_id"])
      : Number(getField(integration, "meli_user_id") || 0);
    if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) return jsonResponse({ ok: false, error: "Integration missing shop_id", correlationId }, 200);
    console.log("shopee-webhook-items integration_found", { correlationId, integration_id: String(getField(integration, "id") || ""), organizations_id: String(getField(integration, "organizations_id") || ""), shop_id: shopIdCandidate });

    const accRaw = String(getField(integration, "access_token") || "");
    const refRaw = String(getField(integration, "refresh_token") || "");
    let accessToken = await tryDecryptToken(aesKey, accRaw);
    let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);

    const hosts = ["https://openplatform.shopee.com.br"];
    const baseInfoPath = "/api/v2/product/get_item_base_info";
    const extraInfoPath = "/api/v2/product/get_item_extra_info";
    const modelListPath = "/api/v2/product/get_model_list";
    const itemPromotionPath = "/api/v2/product/get_item_promotion";
    const contentDiagnosisPath = "/api/v2/product/get_item_content_diagnosis_result";

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
              const accEnc = await aesGcmEncryptToString(aesKey, accessToken);
              const refEnc = await aesGcmEncryptToString(aesKey, refreshTokenPlain);
              const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
              await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", String(getField(integration, "id")));
              console.log("shopee-webhook-items token_refreshed", { correlationId, integration_id: String(getField(integration, "id")), access_len: accessToken.length, refresh_len: refreshTokenPlain.length, expire_in: Number(json.expire_in) || null });
            } catch (_) {}
            return true;
          }
        } catch (_) { continue; }
      }
      return false;
    };

    const fetchBaseInfo = async (ids: string[]): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${baseInfoPath}${ts}${accessToken}${shopIdCandidate}`);
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      const url = `${hosts[0]}${baseInfoPath}?${qs.toString()}`;
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text);
      } catch (_) { json = null; }
      console.log("shopee-webhook-items base_info_raw", { correlationId, host: hosts[0], status: resp.status, ok: resp.ok });
      if (!resp.ok || !json) {
        if (resp.status === 401 || resp.status === 403) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            const ts2 = Math.floor(Date.now() / 1000);
            sign = await hmacSha256Hex(partnerKey, `${partnerId}${baseInfoPath}${ts2}${accessToken}${shopIdCandidate}`);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
            });
            const url2 = `${hosts[0]}${baseInfoPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2);
            } catch (_) { json = null; }
            if (!resp2.ok) return null;
          }
        } else {
          return null;
        }
      }
      return json;
    };

    const fetchExtraInfo = async (ids: string[]): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${extraInfoPath}${ts}${accessToken}${shopIdCandidate}`);
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      const url = `${hosts[0]}${extraInfoPath}?${qs.toString()}`;
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text);
      } catch (_) { json = null; }
      console.log("shopee-webhook-items extra_info_raw", { correlationId, host: hosts[0], status: resp.status, ok: resp.ok });
      if (!resp.ok || !json) {
        if (resp.status === 401 || resp.status === 403) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            const ts2 = Math.floor(Date.now() / 1000);
            sign = await hmacSha256Hex(partnerKey, `${partnerId}${extraInfoPath}${ts2}${accessToken}${shopIdCandidate}`);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
            });
            const url2 = `${hosts[0]}${extraInfoPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2);
            } catch (_) { json = null; }
            if (!resp2.ok) return null;
          }
        } else {
          return null;
        }
      }
      return json;
    };

    const fetchModelList = async (ids: string[]): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${modelListPath}${ts}${accessToken}${shopIdCandidate}`);
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      const url = `${hosts[0]}${modelListPath}?${qs.toString()}`;
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text);
      } catch (_) { json = null; }
      console.log("shopee-webhook-items model_list_raw", { correlationId, host: hosts[0], status: resp.status, ok: resp.ok });
      if (!resp.ok || !json) {
        if (resp.status === 401 || resp.status === 403) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            const ts2 = Math.floor(Date.now() / 1000);
            sign = await hmacSha256Hex(partnerKey, `${partnerId}${modelListPath}${ts2}${accessToken}${shopIdCandidate}`);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
            });
            const url2 = `${hosts[0]}${modelListPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2);
            } catch (_) { json = null; }
            if (!resp2.ok) return null;
          }
        } else {
          return null;
        }
      }
      return json;
    };

    const fetchItemPromotion = async (ids: string[]): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${itemPromotionPath}${ts}${accessToken}${shopIdCandidate}`);
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      qs.set("item_id_list", ids.join(","));
      const url = `${hosts[0]}${itemPromotionPath}?${qs.toString()}`;
      const resp = await fetch(url, { method: "GET", headers: { "content-type": "application/json" } });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text);
      } catch (_) { json = null; }
      console.log("shopee-webhook-items item_promotion_raw", { correlationId, host: hosts[0], status: resp.status, ok: resp.ok });
      if (!resp.ok || !json) {
        if (resp.status === 401 || resp.status === 403) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            const ts2 = Math.floor(Date.now() / 1000);
            sign = await hmacSha256Hex(partnerKey, `${partnerId}${itemPromotionPath}${ts2}${accessToken}${shopIdCandidate}`);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
            });
            qs2.set("item_id_list", ids.join(","));
            const url2 = `${hosts[0]}${itemPromotionPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "GET", headers: { "content-type": "application/json" } });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2);
            } catch (_) { json = null; }
            if (!resp2.ok) return null;
          }
        } else {
          return null;
        }
      }
      return json;
    };

    const fetchContentDiagnosis = async (ids: string[]): Promise<any | null> => {
      const ts = Math.floor(Date.now() / 1000);
      let sign = await hmacSha256Hex(partnerKey, `${partnerId}${contentDiagnosisPath}${ts}${accessToken}${shopIdCandidate}`);
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      const url = `${hosts[0]}${contentDiagnosisPath}?${qs.toString()}`;
      const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text);
      } catch (_) { json = null; }
      console.log("shopee-webhook-items content_diag_raw", { correlationId, host: hosts[0], status: resp.status, ok: resp.ok });
      if (!resp.ok || !json) {
        if (resp.status === 401 || resp.status === 403) {
          const refreshed = await tryRefreshAccessToken();
          if (refreshed) {
            const ts2 = Math.floor(Date.now() / 1000);
            sign = await hmacSha256Hex(partnerKey, `${partnerId}${contentDiagnosisPath}${ts2}${accessToken}${shopIdCandidate}`);
            const qs2 = new URLSearchParams({
              partner_id: String(partnerId),
              timestamp: String(ts2),
              access_token: String(accessToken),
              shop_id: String(shopIdCandidate),
              sign: String(sign),
            });
            const url2 = `${hosts[0]}${contentDiagnosisPath}?${qs2.toString()}`;
            const resp2 = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item_id_list: ids.map((x) => Number(x)) }) });
            const text2 = await resp2.text();
            try { json = JSON.parse(text2);
            } catch (_) { json = null; }
            if (!resp2.ok) return null;
          }
        } else {
          return null;
        }
      }
      return json;
    };

    const ids = itemIds;
    const baseJson = await fetchBaseInfo(ids).catch(() => null);
    const extraJson = await fetchExtraInfo(ids).catch(() => null);
    const modelsJson = await fetchModelList(ids).catch(() => null);
    const promoJson = await fetchItemPromotion(ids).catch(() => null);
    const diagJson = await fetchContentDiagnosis(ids).catch(() => null);

    const parseList = (obj: any, key: string) => {
      if (!obj) return [];
      const k = (obj as any)?.[key];
      if (Array.isArray(k)) return k;
      const r = (obj as any)?.response ?? (obj as any)?.data ?? obj;
      const kk = (r as any)?.[key];
      if (Array.isArray(kk)) return kk;
      return [];
    };
    const baseList = parseList(baseJson, "item_list");
    const extraList = parseList(extraJson, "item_list");
    const modelListRaw = parseList(modelsJson, "model_list_list");
    const promoListRaw = parseList(promoJson, "item_promotion_list");
    const diagFailedRaw =
      Array.isArray((diagJson as any)?.failed_item_list) ? (diagJson as any).failed_item_list :
      Array.isArray((diagJson as any)?.content_diagnosis_result?.failed_item_list) ? (diagJson as any).content_diagnosis_result.failed_item_list :
      [];

    const baseMap = new Map<string, any>();
    const extraMap = new Map<string, any>();
    const modelsMap = new Map<string, any>();
    const promoMap = new Map<string, any>();
    const diagMap = new Map<string, any>();

    for (const it of baseList) {
      const id = getStr(it, ["item_id"]) || getStr(it, ["item","item_id"]) || null;
      if (id) baseMap.set(String(id), it);
    }
    for (const it of extraList) {
      const id = getStr(it, ["item_id"]) || getStr(it, ["item","item_id"]) || null;
      if (id) extraMap.set(String(id), it);
    }
    if (Array.isArray(modelListRaw)) {
      for (const g of modelListRaw) {
        const id = getStr(g, ["item_id"]) || getStr(g, ["item","item_id"]) || null;
        if (id) modelsMap.set(String(id), g);
      }
    } else if (Array.isArray((modelsJson as any)?.model_list)) {
      for (const m of (modelsJson as any)?.model_list) {
        const id = getStr(m, ["item_id"]) || getStr(m, ["item","item_id"]) || null;
        if (id && !modelsMap.has(String(id))) modelsMap.set(String(id), { model_list: [(m as any)] });
      }
    }
    if (Array.isArray(promoListRaw)) {
      for (const p of promoListRaw) {
        const id = getStr(p, ["item_id"]) || getStr(p, ["item","item_id"]) || null;
        if (id) promoMap.set(String(id), p);
      }
    } else if (promoJson && typeof promoJson === "object") {
      const r = (promoJson as any)?.response ?? (promoJson as any)?.data ?? promoJson;
      if (Array.isArray((r as any)?.item_promotion)) {
        for (const p of (r as any)?.item_promotion) {
          const id = getStr(p, ["item_id"]) || getStr(p, ["item","item_id"]) || null;
          if (id && !promoMap.has(String(id))) promoMap.set(String(id), { item_promotion: [(p as any)] });
        }
      }
    }
    for (const f of diagFailedRaw) {
      const id = getStr(f, ["item_id"]) || getStr(f, ["item","item_id"]) || null;
      if (id) diagMap.set(String(id), { failed: true, ...(f as any) });
    }

    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    for (const id of ids) {
      const base = baseMap.get(id) || null;
      const extra = extraMap.get(id) || null;
      const models = modelsMap.get(id) || null;
      const promo = promoMap.get(id) || null;
      const diag = diagMap.get(id) || null;
      const combined: Record<string, unknown> = { notification: notifPayload, base_info: base, extra_info: extra, model_list: models, item_promotion: promo, content_diagnosis_result: diag };
      if (typeof pushCode === "number") combined["push"] = { type_code: pushCode, type_label: pushLabel };

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
        organizations_id: String(getField(integration, "organizations_id")),
        marketplace_name: "Shopee",
        marketplace_item_id: String(id),
        data: combined,
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
      const companyId = String(getField(integration, "company_id") || "");
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
        updatedCount++;
      } else {
        try {
          const msg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : null;
          console.warn("shopee-webhook-items upsert_error", { correlationId, integration_id: String(getField(integration, "id")), item_id: id, message: msg });
        } catch (_) {}
      }
    }

    return jsonResponse({ ok: true, updated: updatedCount, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("shopee-webhook-items unexpected_error", { message: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
