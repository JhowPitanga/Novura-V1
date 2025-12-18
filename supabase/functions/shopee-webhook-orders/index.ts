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

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

  try {
    const bodyText = await req.text();
    const body = tryParseJson(bodyText) ?? {};
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    console.log("shopee-webhook-orders inbound", { correlationId, method: req.method, url: req.url, bodyPreview: bodyText.slice(0, 500) });

    const orderSn = detectOrderSn(body);
    const shopId = detectShopId(body);
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

    const combinedData = { notification: notifPayload } as const;
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
          try { await admin.rpc('refresh_presented_order', { p_order_id: rawId }); } catch (_) {}
        }
        return jsonResponse({ ok: true, order_id: orderSn, raw_id: rawId, correlationId }, 200);
      } catch (_) {
        const emsg = typeof upErr === "object" && upErr !== null && "message" in (upErr as Record<string, unknown>) ? String((upErr as Record<string, unknown>).message) : "Upsert failed";
        return jsonResponse({ ok: false, error: emsg, correlationId }, 200);
      }
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
