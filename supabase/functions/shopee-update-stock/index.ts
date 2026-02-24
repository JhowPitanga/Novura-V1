import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/object-utils.ts";
import { importAesGcmKey, aesGcmEncryptToString, tryDecryptToken, hmacSha256Hex } from "../_shared/adapters/token-utils.ts";

function arr(obj: unknown): any[] {
  return Array.isArray(obj) ? obj as any[] : [];
}

const SHOPEE_HOSTS = ["https://openplatform.shopee.com.br"];
const UPDATE_STOCK_PATH = "/api/v2/product/update_stock";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);

  const admin = createAdminClient() as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  try {
    const correlationId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || crypto.randomUUID();
    const bodyText = await req.text();
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(bodyText); } catch (_) { body = {}; }

    const organizationId = getStr(body, ["organizationId"]) || undefined;
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || null;
    const shopIdInput = shopIdStr ? Number(shopIdStr) : null;

    const itemIdStr = getStr(body, ["item_id"]) || getStr(body, ["itemId"]) || null;
    if (!itemIdStr || !/^\d+$/.test(itemIdStr)) return jsonResponse({ ok: false, error: "Missing or invalid item_id", correlationId }, 200);
    const itemId = Number(itemIdStr);

    const stockListInput =
      arr(getField(body, "stock_list"))?.length ? arr(getField(body, "stock_list")) :
      arr(getField(body, "updates"))?.length ? arr(getField(body, "updates")) :
      [];
    if (!stockListInput.length) return jsonResponse({ ok: false, error: "Missing stock_list", correlationId }, 200);

    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);

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

    const results: Array<{ integration_id: string; updated: boolean; error?: string | null }> = [];
    for (const integration of integrations) {
      const integrationId = String(getField(integration, "id"));
      const cfg = getField(integration, "config") as Record<string, unknown> | null;
      const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
        ? Number(cfg?.["shopee_shop_id"])
        : Number(getField(integration, "meli_user_id") || 0);
      if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) {
        results.push({ integration_id: integrationId, updated: false, error: "Invalid shop_id" });
        continue;
      }

      const accRaw = String(getField(integration, "access_token") || "");
      const refRaw = String(getField(integration, "refresh_token") || "");
      let accessToken = await tryDecryptToken(aesKey, accRaw);
      let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);

      const normalizeStockList = (list: any[]): any[] => {
        const out: any[] = [];
        for (const it of list) {
          const modelIdStr = getStr(it, ["model_id"]) || getStr(it, ["modelId"]) || null;
          const modelId = modelIdStr && /^\d+$/.test(modelIdStr) ? Number(modelIdStr) : null;
          if (!modelId) continue;
          let sellerStockNum =
            typeof getField(it, "seller_stock") === "number" ? Number(getField(it, "seller_stock")) :
            typeof getField(it, "qty") === "number" ? Number(getField(it, "qty")) :
            typeof getField(it, "quantity") === "number" ? Number(getField(it, "quantity")) :
            typeof getField(it, "stock") === "object" && getField(it, "stock") !== null && typeof (getField(it, "stock") as any)?.seller_stock === "number"
              ? Number((getField(it, "stock") as any).seller_stock) : NaN;
          if (!Number.isFinite(sellerStockNum)) continue;
          sellerStockNum = Math.floor(sellerStockNum);
          if (sellerStockNum < 0) sellerStockNum = 0;
          out.push({ model_id: modelId, seller_stock: [{ location_id: "BRZ", stock: sellerStockNum }] });
        }
        return out;
      };

      const stockList = normalizeStockList(stockListInput);
      if (!stockList.length) {
        results.push({ integration_id: integrationId, updated: false, error: "No valid stock_list entries" });
        continue;
      }
      try {
        const redacted = stockList.map((x) => ({
          model_id: x?.model_id,
          seller_stock: Array.isArray(x?.seller_stock) ? x.seller_stock.map((s: any) => ({ location_id: s?.location_id ?? null, stock: s?.stock ?? null })) : null
        }));
        console.log("shopee-update-stock request_normalized", { correlationId, integration_id: integrationId, item_id: itemId, shop_id: shopIdCandidate, entries: redacted });
      } catch (_) {}

      const tryRefreshAccessToken = async (): Promise<boolean> => {
        const refreshPath = "/api/v2/auth/access_token/get";
        const timestamp = Math.floor(Date.now() / 1000);
        const baseString = `${partnerId}${refreshPath}${timestamp}`;
        const sign = await hmacSha256Hex(partnerKey, baseString);
        if (!refreshTokenPlain || !String(refreshTokenPlain).trim()) return false;
        for (const host of SHOPEE_HOSTS) {
          const tokenUrl = `${host}${refreshPath}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&sign=${sign}`;
          try {
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
                await admin.from("marketplace_integrations").update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAtIso }).eq("id", integrationId);
              } catch (_) {}
              return true;
            }
          } catch (_) { continue; }
        }
        return false;
      };

      const ts = Math.floor(Date.now() / 1000);
      const baseStr = `${partnerId}${UPDATE_STOCK_PATH}${ts}${accessToken}${shopIdCandidate}`;
      let sign = await hmacSha256Hex(partnerKey, baseStr);

      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      const bodyJson = JSON.stringify({ item_id: Number(itemId), stock_list: stockList });

      let updatedOk = false;
      let updateError: string | null = null;
      for (const host of SHOPEE_HOSTS) {
        const url = `${host}${UPDATE_STOCK_PATH}?${qs.toString()}`;
        try {
          const resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson });
          const text = await resp.text();
          let json: any = {};
          try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
          try {
            console.log("shopee-update-stock api_raw", { correlationId, integration_id: integrationId, host, status: resp.status, ok: resp.ok, body: text.slice(0, 512) });
          } catch (_) {}
          const hasShopeeError = !!((json as any)?.error) || !!((json as any)?.debug_message);
          if (hasShopeeError) {
            const errCode = (json as any)?.error ?? null;
            const errMsg = (json as any)?.message ?? (json as any)?.debug_message ?? null;
            updateError = String(errMsg || errCode || "Shopee error");
            updatedOk = false;
            try {
              console.log("shopee-update-stock api_decoded_error", { correlationId, integration_id: integrationId, host, status: resp.status, ok: resp.ok, error: errCode, message: errMsg, request_id: (json as any)?.request_id || null });
            } catch (_) {}
          } else if (!resp.ok) {
            const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
            const errMsg = (typeof (json as any)?.message === "string" ? (json as any)?.message : (typeof (json as any)?.msg === "string" ? (json as any)?.msg : "")) || null;
            if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
              const refreshed = await tryRefreshAccessToken();
              if (refreshed) {
                const ts2 = Math.floor(Date.now() / 1000);
                sign = await hmacSha256Hex(partnerKey, `${partnerId}${UPDATE_STOCK_PATH}${ts2}${accessToken}${shopIdCandidate}`);
                const qs2 = new URLSearchParams({
                  partner_id: String(partnerId),
                  timestamp: String(ts2),
                  access_token: String(accessToken),
                  shop_id: String(shopIdCandidate),
                  sign: String(sign),
                });
                const url2 = `${host}${UPDATE_STOCK_PATH}?${qs2.toString()}`;
                const retry = await fetch(url2, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson });
                const rt = await retry.text();
                let rj: any = {};
                try { rj = JSON.parse(rt); } catch (_) { rj = { raw: rt }; }
                const hasShopeeError2 = !!((rj as any)?.error) || !!((rj as any)?.debug_message);
                if (retry.ok && !hasShopeeError2) {
                  updatedOk = true;
                  break;
                } else {
                  updateError = (rj as any)?.message || (rj as any)?.error || `HTTP ${retry.status}`;
                  try {
                    console.log("shopee-update-stock api_retry_error", { correlationId, integration_id: integrationId, host, status: retry.status, ok: retry.ok, error: (rj as any)?.error || null, message: (rj as any)?.message || null, request_id: (rj as any)?.request_id || null });
                  } catch (_) {}
                }
              } else {
                updateError = errMsg || String(errCode || "");
              }
            } else if (String((json as any)?.error || "").toLowerCase() === "error_sign") {
              const ts3 = Math.floor(Date.now() / 1000);
              const sign3 = await hmacSha256Hex(partnerKey, `${partnerId}${UPDATE_STOCK_PATH}${ts3}${accessToken}${shopIdCandidate}`);
              const qs3 = new URLSearchParams({
                partner_id: String(partnerId),
                timestamp: String(ts3),
                access_token: String(accessToken),
                shop_id: String(shopIdCandidate),
                sign: String(sign3),
              });
              const url3 = `${host}${UPDATE_STOCK_PATH}?${qs3.toString()}`;
              const retry2 = await fetch(url3, { method: "POST", headers: { "content-type": "application/json" }, body: bodyJson });
              const rt2 = await retry2.text();
              let rj2: any = {};
              try { rj2 = JSON.parse(rt2); } catch (_) { rj2 = { raw: rt2 }; }
              const hasShopeeError3 = !!((rj2 as any)?.error) || !!((rj2 as any)?.debug_message);
              if (retry2.ok && !hasShopeeError3) {
                updatedOk = true;
                break;
              } else {
                updateError = (rj2 as any)?.message || (rj2 as any)?.error || `HTTP ${retry2.status}`;
                try {
                  console.log("shopee-update-stock api_resign_error", { correlationId, integration_id: integrationId, host, status: retry2.status, ok: retry2.ok, error: (rj2 as any)?.error || null, message: (rj2 as any)?.message || null, request_id: (rj2 as any)?.request_id || null });
                } catch (_) {}
              }
            } else {
              updateError = errMsg || String(errCode || "");
            }
          } else {
            updatedOk = true;
            break;
          }
        } catch (_) { continue; }
      }

      results.push({ integration_id: integrationId, updated: updatedOk, error: updateError });
    }

    const anyOk = results.some((r) => r.updated);
    const anyFail = results.some((r) => !r.updated);
    const allOk = results.length > 0 && results.every((r) => r.updated);
    try {
      console.log("shopee-update-stock summary", { correlationId, item_id: itemId, integrations_total: results.length, integrations_ok: results.filter(r => r.updated).length, integrations_fail: results.filter(r => !r.updated).length, results });
    } catch (_) {}
    if (allOk) return jsonResponse({ ok: true, results, correlationId }, 200);
    if (anyOk && anyFail) return jsonResponse({ ok: false, partial: true, results, correlationId }, 422);
    return jsonResponse({ ok: false, results, correlationId }, 422);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, error: msg }, 200);
  }
});
