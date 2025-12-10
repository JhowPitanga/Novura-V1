import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-request-id, x-correlation-id, x-origin, x-shopee-signature",
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
  return hex;
}

function tryParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch (_) { return null; }
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
    ["ordersn_list", "0"],
    ["order_sn_list", "0"],
    ["data", "order_sn"],
    ["msg", "order_sn"],
    ["message", "order_sn"],
    ["order", "order_sn"],
    ["orders", "0", "order_sn"],
  ];
  for (const p of cand) {
    const v = getStr(payload, p);
    if (v) return v;
  }
  // tentar decodificar quando data/msg/message são strings com JSON
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
  const cand = [
    ["shop_id"],
    ["data", "shop_id"],
    ["msg", "shop_id"],
    ["message", "shop_id"],
    ["merchant_id"],
    ["shopid"],
  ];
  for (const p of cand) {
    const v = getStr(payload, p);
    if (v) return v;
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

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method === "GET") return jsonResponse({ ok: true }, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const hdrLog = {
      authorization_present: !!req.headers.get("authorization"),
      apikey_present: !!req.headers.get("apikey"),
      x_internal_call_present: !!req.headers.get("x-internal-call"),
      x_shopee_signature_present: !!req.headers.get("x-shopee-signature"),
      "x-request-id": req.headers.get("x-request-id") || null,
      "x-correlation-id": req.headers.get("x-correlation-id") || null,
    } as const;
    const bodyText = await req.text();
    const payload = tryParseJson(bodyText);
    console.log("shopee-sync-all inbound", { correlationId, method: req.method, url: req.url, headers: hdrLog, bodyPreview: bodyText.slice(0, 500) });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;
    let partnerKey: string | null = null;
    try {
      const { data: appRow } = await admin
        .from("apps")
        .select("client_secret")
        .eq("name", "Shopee")
        .single();
      partnerKey = appRow?.client_secret ? String(appRow.client_secret) : null;
    } catch (_) {
      partnerKey = null;
    }

    const isInternal = req.headers.get("x-internal-call") === "1";
    if (!isInternal && partnerKey && bodyText.trim()) {
      const rawHeaderSig = req.headers.get("x-shopee-signature") || req.headers.get("X-Shopee-Signature");
      const headerSig = rawHeaderSig ? rawHeaderSig.replace(/^sha256=/i, "").trim() : "";
      if (headerSig) {
        const computed = await hmacSha256Hex(partnerKey, bodyText);
        const ok = headerSig.toLowerCase() === computed.toLowerCase();
        if (!ok) {
          console.warn("shopee-sync-all signature_invalid", { correlationId });
          return jsonResponse({ ok: false, error: "Invalid signature", correlationId }, 401);
        }
      }
    }

    const orderSn = payload ? detectOrderSn(payload) : null;
    const shopId = payload ? detectShopId(payload) : null;
    if (!orderSn) {
      console.warn("shopee-sync-all no_order_detected", { correlationId });
      return jsonResponse({ ok: false, error: "No order detected", correlationId }, 200);
    }

    const invHeaders = {
      "x-request-id": correlationId,
      "x-correlation-id": correlationId,
      "x-origin": "webhook",
      "apikey": SERVICE_ROLE_KEY,
      "authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      "x-internal-call": "1",
    } as const;
    const forwardBody = { order_sn: orderSn, shop_id: shopId, notification: payload } as const;
    console.log("shopee-sync-all -> orders invoke_start", { correlationId, order_sn: orderSn, shop_id: shopId });
    const { data, error } = await admin.functions.invoke("shopee-webhook-orders", { body: forwardBody, headers: invHeaders });
    const success = !error && data && typeof data === "object" && data !== null && "ok" in (data as Record<string, unknown>) && Boolean((data as Record<string, unknown>).ok);
    console.log("shopee-sync-all -> orders invoke_done", { correlationId, ok: success });
    return jsonResponse(data ?? { ok: success, correlationId }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("shopee-sync-all unexpected_error", { message: msg });
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
