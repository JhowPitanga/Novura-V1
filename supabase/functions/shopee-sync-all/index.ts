import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getStr, getNum } from "../_shared/adapters/object-utils.ts";
import { hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function sanitizeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  // Remove espaços em branco e backticks indesejados
  const s = String(raw).trim().replace(/^`+|`+$/g, "");
  return s;
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

function detectItemId(payload: unknown): string | null {
  const cand = [
    ["item_id"],["itemid"],
    ["data","item_id"],["data","itemid"],
    ["msg","item_id"],["message","item_id"],
    ["item","item_id"],["content","item_id"],
    ["data","content","content","item_id"],
    ["data","message","content","item_id"],
    ["item_list","0","item_id"],["data","item_list","0","item_id"],
    ["item_id_list","0"],["data","item_id_list","0"],
  ];
  for (const p of cand) { const v = getStr(payload, p); if (v) return v; }
  const mt = (getStr(payload, ["data","content","message_type"]) || "").toLowerCase();
  if (mt === "item") {
    const v = getStr(payload, ["data","content","content","item_id"]);
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
        const mt2 = (getStr(nested, ["data","content","message_type"]) || "").toLowerCase();
        if (mt2 === "item") {
          const vv = getStr(nested, ["data","content","content","item_id"]);
          if (vv) return vv;
        }
      } catch (_) {}
    }
    return null;
  };
  return tryNested("data") || tryNested("msg") || tryNested("message") || tryNested("raw");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  try {
    const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
    const method = req.method;
    const contentType = req.headers.get("content-type") || "";
    const origin = req.headers.get("x-origin") || null;
    
    type StartBody = { organizationId?: string; storeName?: string; connectedByUserId?: string; redirect_uri?: string };
    let body: StartBody | Record<string, unknown> | null = null;
    let rawText: string | null = null;
    let looksFormFlag = false;
    if (method !== "GET") {
      try {
        const txt = await req.text();
        rawText = txt;
        const looksForm = txt.includes("=") && txt.includes("&");
        looksFormFlag = looksForm;
        if (looksForm) {
          const params = new URLSearchParams(txt);
          const obj: Record<string, unknown> = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          const tryJson = (s: unknown) => {
            try {
              const st = String(s || "");
              if (st.trim().startsWith("{") || st.trim().startsWith("[")) return JSON.parse(st);
            } catch (_) {}
            return s;
          };
          obj["data"] = tryJson(obj["data"]);
          obj["msg"] = tryJson(obj["msg"]);
          obj["message"] = tryJson(obj["message"]);
          body = obj;
        } else {
          body = (txt && txt.trim()) ? (JSON.parse(txt) as StartBody) : {};
        }
      } catch (_) {
        try { body = await req.json() as StartBody; } catch { body = {}; }
      }
    }
    try {
      console.log("[shopee-sync-all] inbound_parsed", {
        correlationId,
        method,
        contentType,
        rawLen: (rawText || "").length,
        origin,
        looksForm: looksFormFlag,
        hasData: Boolean((body as any)?.data),
        hasMsg: Boolean((body as any)?.msg),
        hasMessage: Boolean((body as any)?.message),
      });
    } catch (_) {}
    
    // Dados para o STATE (passados para o callback)
    const organizationId = (body as any)?.organizationId || null;
    const storeName = (body as any)?.storeName || null;
    const connectedByUserId = (body as any)?.connectedByUserId || null;
    const redirectOverride = sanitizeRedirect((body as any)?.redirect_uri || null);

    const admin = createAdminClient();
    const pushCode =
      getNum(body || {}, ["code"]) ||
      getNum(body || {}, ["data","code"]) ||
      getNum(body || {}, ["message","code"]) ||
      getNum(body || {}, ["msg","code"]) ||
      getNum(body || {}, ["push_type"]) ||
      getNum(body || {}, ["data","push_type"]) ||
      getNum(body || {}, ["message","push_type"]) ||
      getNum(body || {}, ["msg","push_type"]) ||
      getNum(body || {}, ["business_type"]) ||
      getNum(body || {}, ["data","business_type"]) ||
      getNum(body || {}, ["message","business_type"]) ||
      getNum(body || {}, ["msg","business_type"]) ||
      null;
    try {
      console.log("[shopee-sync-all] push_detection", {
        correlationId,
        hasPushCode: pushCode !== null,
        pushCode,
      });
    } catch (_) {}
    if (method === "POST") {
      const hasOrdersnNested =
        Boolean(getStr(body || {}, ["data","ordersn"]) || getStr(body || {}, ["message","ordersn"]) || getStr(body || {}, ["msg","ordersn"]));
      const detectedOrderSn = detectOrderSn(body || {});
      const isOrderPush = Boolean(detectedOrderSn || hasOrdersnNested);
      try {
        console.log("[shopee-sync-all] detection_summary", {
          correlationId,
          hasOrdersnTop: Boolean(detectedOrderSn),
          hasOrdersnNested,
          pushCodePresent: pushCode !== null,
          shopId: getStr(body || {}, ["shop_id"]) || null,
        });
      } catch (_) {}
      if (isOrderPush) {
        const forwardPayload = (() => {
          const asObj = (body && typeof body === "object") ? body : {};
          return { ...asObj, raw: rawText || "" };
        })();
        try {
          console.log("[shopee-sync-all] forwarding_to_webhook", {
            correlationId,
            hasRaw: Boolean(rawText),
            origin: "live_push",
          });
        } catch (_) {}
        const { data: forwardData, error: forwardErr } = await (admin as any).functions.invoke("shopee-webhook-orders", {
          body: forwardPayload,
          headers: { "x-request-id": correlationId, "x-correlation-id": correlationId, "x-origin": "live_push" },
        });
        if (forwardErr) {
          try {
            console.warn("[shopee-sync-all] forward_error", {
              correlationId,
              message: (forwardErr as any)?.message || null,
              code: (forwardErr as any)?.code || null,
            });
          } catch (_) {}
          return jsonResponse({ error: (forwardErr as any)?.message || "Forward failed", correlationId }, 500);
        }
        return jsonResponse({ ok: true, forwarded_to: "shopee-webhook-orders", result: forwardData, correlationId }, 200);
      }

      const itemIdDetectedTop = detectItemId(body || {});
      if (itemIdDetectedTop) {
        const forwardPayload = (() => {
          const asObj = (body && typeof body === "object") ? body : {};
          return { ...asObj, raw: rawText || "" };
        })();
        try {
          console.log("[shopee-sync-all] forwarding_item_push", {
            correlationId,
            itemIdDetected: String(itemIdDetectedTop),
            hasRaw: Boolean(rawText),
            origin: "live_push",
          });
        } catch (_) {}
        const { data: forwardData, error: forwardErr } = await (admin as any).functions.invoke("shopee-webhook-items", {
          body: forwardPayload,
          headers: { "x-request-id": correlationId, "x-correlation-id": correlationId, "x-origin": "live_push" },
        });
        if (forwardErr) {
          try {
            console.warn("[shopee-sync-all] forward_error_item", {
              correlationId,
              message: (forwardErr as any)?.message || null,
              code: (forwardErr as any)?.code || null,
            });
          } catch (_) {}
          return jsonResponse({ error: (forwardErr as any)?.message || "Forward failed", correlationId }, 500);
        }
        return jsonResponse({ ok: true, forwarded_to: "shopee-webhook-items", result: forwardData, correlationId }, 200);
      } else if (pushCode !== null) {
        const itemIdDetected = detectItemId(body || {});
        const itemPushCodes = new Set<number>([8, 11, 16, 22, 27]);
        const isItemByCode = typeof pushCode === "number" && itemPushCodes.has(pushCode);
        const forwardPayload = (() => {
          const asObj = (body && typeof body === "object") ? body : {};
          return { ...asObj, raw: rawText || "" };
        })();
        try {
          console.log("[shopee-sync-all] forwarding_by_code", {
            correlationId,
            pushCode,
            isItemPush: Boolean(itemIdDetected || isItemByCode),
            hasRaw: Boolean(rawText),
            origin: "live_push",
          });
        } catch (_) {}
        const targetFn = (itemIdDetected || isItemByCode) ? "shopee-webhook-items" : "shopee-webhook-orders";
        const { data: forwardData, error: forwardErr } = await (admin as any).functions.invoke(targetFn, {
          body: forwardPayload,
          headers: { "x-request-id": correlationId, "x-correlation-id": correlationId, "x-origin": "live_push" },
        });
        if (forwardErr) {
          try {
            console.warn("[shopee-sync-all] forward_error_code", {
              correlationId,
              pushCode,
              message: (forwardErr as any)?.message || null,
              code: (forwardErr as any)?.code || null,
            });
          } catch (_) {}
          return jsonResponse({ error: (forwardErr as any)?.message || "Forward failed", correlationId }, 500);
        }
        return jsonResponse({ ok: true, forwarded_to: targetFn, result: forwardData, correlationId }, 200);
      }
      try { console.log("[shopee-sync-all] no_forward", { correlationId }); } catch (_) {}
    }

    // Busca Credenciais do App Shopee (Tabela APPS)
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret, config") // Removido auth_url, pois será fixo para produção
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ error: appErr?.message || "App not found" }, 404);

    type AppRow = { client_id?: string; client_secret?: string; config?: Record<string, unknown> };
    const app = appRow as AppRow;
    
    // --- OTIMIZAÇÃO: Recuperação segura e validação do Partner ID ---
    const partnerId = String(app.client_id || "").trim();
    const partnerKey = String(app.client_secret || "").trim();
    
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) {
      console.error("[shopee-start] partner_credentials_error", { correlationId, partnerId, hasKey: !!partnerKey });
      return jsonResponse({ error: "Missing or invalid Partner ID (client_id) or Partner Key (client_secret)" }, 400);
    }
    
    // --- CONFIGURAÇÃO ESTRITAMENTE DE PRODUÇÃO ---
    const PROD_AUTH_HOST = "https://openplatform.shopee.com.br";
    const fixedAuthPath = "/api/v2/shop/auth_partner";
    const defaultRedirectUri = "https://novuraerp.com.br/oauth/shopee/callback"; // Default de fallback

    // Lógica de REDIRECT URI
    const cfg = app.config as Record<string, unknown> | undefined;
    const redirectFromConfig = sanitizeRedirect((cfg && typeof cfg["redirect_uri"] === "string") ? String(cfg["redirect_uri"]) : null);
    const redirectEnv = sanitizeRedirect(Deno.env.get("SHOPEE_REDIRECT_URI") || null);
    
    const redirectUri = redirectOverride || redirectFromConfig || redirectEnv || defaultRedirectUri;

    // Assinatura (HMAC)
    const timestamp = Math.floor(Date.now() / 1000);
    // BaseString: partner_id + path + timestamp
    const baseString = `${partnerId}${fixedAuthPath}${timestamp}`;
    
    // CORREÇÃO: Assinatura deve ser minúscula (lowercase)
    const sign = await hmacSha256Hex(partnerKey, baseString);

    // Montagem da URL de Autorização
    const authorizationUrl = new URL(`${PROD_AUTH_HOST}${fixedAuthPath}`);
    authorizationUrl.searchParams.set("partner_id", partnerId);
    authorizationUrl.searchParams.set("timestamp", String(timestamp));
    authorizationUrl.searchParams.set("sign", sign);
    
    // Montagem do STATE e inserção na URL de Redirect
    const statePayload = { organizationId, storeName, connectedByUserId, redirect_uri: redirectUri };
    const state = btoa(JSON.stringify(statePayload));
    
    let redirectWithState = redirectUri;
    try {
      const r = new URL(redirectUri);
      r.searchParams.set("state", state);
      redirectWithState = r.toString();
    } catch (e) {
      console.warn("[shopee-start] invalid_redirect_uri", { correlationId, redirectUri, error: e instanceof Error ? e.message : String(e) });
      redirectWithState = redirectUri;
    }
    
  
    authorizationUrl.searchParams.set("redirect", redirectWithState);
    
    console.log("[shopee-start] success", { correlationId, authUrl: authorizationUrl.toString() });

    return jsonResponse({ authorization_url: authorizationUrl.toString(), state }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shopee-start] unexpected_error", { message: msg });
    return jsonResponse({ error: msg }, 500);
  }
});
