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
  const cand = [["order_sn"],["ordersn"],["data","order_sn"],["msg","order_sn"],["order","order_sn"],["orders","0","order_sn"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  return null;
}

function detectShopId(payload: unknown): string | null {
  const cand = [["shop_id"],["data","shop_id"],["msg","shop_id"],["merchant_id"],["shopid"]];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  return null;
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
    const body = await req.json().catch(() => ({}));
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    console.log("shopee-webhook-orders inbound", { correlationId, method: req.method, url: req.url });

    const orderSn = detectOrderSn(body);
    const shopId = detectShopId(body);
    if (!orderSn) return jsonResponse({ ok: false, error: "Missing order_sn", correlationId }, 200);

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, auth_url, config")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "");
    const partnerKey = String(getField(appRow, "client_secret") || "");
    const cfg = getField(appRow, "config") as Record<string, unknown> | undefined;
    const envName = (Deno.env.get("SHOPEE_ENV") || (typeof cfg?.["env"] === "string" ? String(cfg?.["env"]) : "")).toLowerCase();

    let explicitHost: string | null = null;
    try {
      const au = getField(appRow, "auth_url") as string | null | undefined;
      if (au && typeof au === "string" && au.trim()) explicitHost = new URL(au).origin;
    } catch (_) { explicitHost = null; }
    const hosts: string[] = [];
    if (explicitHost) hosts.push(explicitHost);
    if (envName === "sandbox" || envName === "test") {
      hosts.push(
        "https://openplatform.sandbox.test-stable.shopee.sg",
        "https://partner.test-stable.shopeemobile.com",
        "https://partner.test-st.shopeemobile.com"
      );
    } else {
      hosts.push("https://partner.shopeemobile.com");
    }

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config")
      .eq("marketplace_name", "Shopee")
      .contains("config", shopId ? { shopee_shop_id: String(shopId) } : {})
      .limit(1)
      .single();
    if (integErr || !integration) return jsonResponse({ ok: false, error: "Integration not found", correlationId }, 200);

    let accessToken = await aesGcmDecryptFromString(aesKey, String(getField(integration, "access_token")));
    let refreshTokenPlain = await aesGcmDecryptFromString(aesKey, String(getField(integration, "refresh_token")));

    const orderPath = "/api/v2/order/get_order_detail";
    const fetchOrder = async (): Promise<unknown | null> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = `${partnerId}${orderPath}${timestamp}${accessToken}${shopId ?? ""}`;
      const sign = await hmacSha256Hex(partnerKey, baseString);
      for (const host of hosts) {
        const url = `${host}${orderPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopId ?? ""))}&sign=${sign}`;
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ order_sn_list: [orderSn] }),
          });
          const json = await resp.json();
          if (resp.status === 401 || resp.status === 403) return null;
          if (resp.ok) return json;
        } catch (_) { continue; }
      }
      return null;
    };

    let orderJson = await fetchOrder();
    if (!orderJson) {
      const refreshPath = "/api/v2/auth/access_token/get";
      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = `${partnerId}${refreshPath}${timestamp}`;
      const sign = await hmacSha256Hex(partnerKey, baseString);
      for (const host of hosts) {
        const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
        try {
          const resp = await fetch(tokenUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shop_id: Number(shopId), refresh_token: refreshTokenPlain, partner_id: Number(partnerId) }),
          });
          const json = await resp.json();
          if (resp.ok && json && json.access_token) {
            accessToken = String(json.access_token);
            refreshTokenPlain = String(json.refresh_token || refreshTokenPlain);
            const encKey = await importAesGcmKey(ENC_KEY_B64);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ctA = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey, new TextEncoder().encode(accessToken));
            const ctB = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, encKey, new TextEncoder().encode(refreshTokenPlain));
            const accEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctA)))}`;
            const refEnc = `enc:gcm:${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ctB)))}`;
            const expiresAtIso = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
            await admin
              .from("marketplace_integrations")
              .update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso })
              .eq("id", String(getField(integration, "id")));
            break;
          }
        } catch (_) { continue; }
      }
      orderJson = await fetchOrder();
    }

    if (!orderJson) return jsonResponse({ ok: false, error: "Failed to fetch order detail", correlationId }, 200);

    const nowIso = new Date().toISOString();
    const status = getStr(orderJson, ["order_status"]) || getStr(orderJson, ["data","order_status"]) || null;
    const dateCreatedTs = getStr(orderJson, ["create_time"]) || getStr(orderJson, ["data","create_time"]) || null;
    const lastUpdatedTs = getStr(orderJson, ["update_time"]) || getStr(orderJson, ["data","update_time"]) || null;
    const toIso = (ts: string | null) => {
      const n = ts ? Number(ts) : NaN;
      if (!Number.isFinite(n)) return null;
      return new Date(n * 1000).toISOString();
    };
    let orderItems: unknown = [];
    const orderList = getField(orderJson, "order_list");
    if (Array.isArray(orderList) && orderList.length > 0) {
      const first = orderList[0] as Record<string, unknown>;
      const il = first ? first["item_list"] : undefined;
      if (Array.isArray(il)) orderItems = il;
    }

    const { data: upId, error: upErr } = await admin.rpc('upsert_marketplace_order_raw', {
      p_organizations_id: String(getField(integration, "organizations_id")),
      p_company_id: String(getField(integration, "company_id")),
      p_marketplace_name: "Shopee",
      p_marketplace_order_id: String(orderSn),
      p_status: status,
      p_status_detail: null,
      p_order_items: Array.isArray(orderItems) ? orderItems : [],
      p_buyer: null,
      p_seller: null,
      p_payments: [],
      p_shipments: [],
      p_feedback: null,
      p_tags: [],
      p_data: orderJson,
      p_date_created: toIso(dateCreatedTs),
      p_date_closed: null,
      p_last_updated: toIso(lastUpdatedTs),
      p_last_synced_at: nowIso,
    });

    if (upErr) {
      const emsg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : "Upsert failed";
      return jsonResponse({ ok: false, error: emsg, correlationId }, 200);
    }

    try { await admin.rpc('refresh_presented_order', { p_order_id: upId }); } catch (err) {
      console.warn("shopee-webhook-orders refresh_presented_order_failed");
    }
    return jsonResponse({ ok: true, order_id: orderSn, raw_id: upId, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("shopee-webhook-orders unexpected_error", { message: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
