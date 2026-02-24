import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/object-utils.ts";
import { importAesGcmKey, tryDecryptToken, hmacSha256Hex, aesGcmEncryptToString } from "../_shared/adapters/token-utils.ts";

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
    const url = new URL(req.url);
    const organizationId = getStr(body, ["organizationId"]) || url.searchParams.get("organizationId") || undefined;
    const shopIdStr = getStr(body, ["shop_id"]) || getStr(body, ["shopId"]) || url.searchParams.get("shop_id") || url.searchParams.get("shopId") || null;
    const payload = (body as any)?.payload || null;
    const shopIdInput = shopIdStr ? Number(shopIdStr) : null;
    if (!payload || typeof payload !== "object") return jsonResponse({ ok: false, error: "Missing payload" }, 200);
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", "Shopee")
      .single();
    if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
    const partnerId = String(getField(appRow, "client_id") || "").trim();
    const partnerKey = String(getField(appRow, "client_secret") || "").trim();
    if (!partnerId || !partnerKey || !/^\d+$/.test(partnerId)) return jsonResponse({ ok: false, error: "Missing or invalid Shopee partner credentials", correlationId }, 200);
    const hosts = ["https://openplatform.shopee.com.br", "https://partner.shopeemobile.com"];
    let integration: any = null;
    if (shopIdInput) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .or(`config->>shopee_shop_id.eq.${shopIdInput},meli_user_id.eq.${shopIdInput}`)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    } else if (organizationId) {
      const { data } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, marketplace_name, access_token, refresh_token, config, meli_user_id")
        .eq("marketplace_name", "Shopee")
        .eq("organizations_id", organizationId)
        .limit(1);
      integration = (Array.isArray(data) && data.length > 0) ? data[0] : null;
    }
    if (!integration) return jsonResponse({ ok: false, error: "No Shopee integration found", correlationId }, 200);
    const cfg = getField(integration, "config") as Record<string, unknown> | null;
    const shopIdCandidate = (cfg && typeof cfg?.["shopee_shop_id"] !== "undefined")
      ? Number(cfg?.["shopee_shop_id"])
      : Number(getField(integration, "meli_user_id") || 0);
    if (!Number.isFinite(shopIdCandidate) || shopIdCandidate <= 0) return jsonResponse({ ok: false, error: "Integration missing shop_id", correlationId }, 200);
    const integrationId = String(getField(integration, "id"));
    const accRaw = String(getField(integration, "access_token") || "");
    const refRaw = String(getField(integration, "refresh_token") || "");
    let accessToken = await tryDecryptToken(aesKey, accRaw);
    let refreshTokenPlain = await tryDecryptToken(aesKey, refRaw);
    const refreshPath = "/api/v2/auth/access_token/get";
    const tryRefreshAccessToken = async (): Promise<boolean> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = await hmacSha256Hex(partnerKey, `${partnerId}${refreshPath}${timestamp}`);
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
    if (!accessToken) await tryRefreshAccessToken();
    const ts = Math.floor(Date.now() / 1000);
    const path = "/api/v2/product/add_item";
    let sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
    const buildUrl = (host: string) => {
      const qs = new URLSearchParams({
        partner_id: String(partnerId),
        timestamp: String(ts),
        access_token: String(accessToken),
        shop_id: String(shopIdCandidate),
        sign: String(sign),
      });
      return `${host}${path}?${qs.toString()}`;
    };
    const normalizedPayload = (() => {
      const p: any = payload || {};
      if (typeof p.category_id === "string") {
        const n = Number(p.category_id);
        if (Number.isFinite(n)) p.category_id = n;
      }
      if (Array.isArray(p.attribute_list) && p.attribute_list.length === 0 && Array.isArray(p.attributes)) {
        const attrsArr: any[] = (p.attributes as any[]) || [];
        const brandAttr = attrsArr.find((a: any) => String(a?.id || a?.attribute_id || "").toUpperCase() === "BRAND");
        if (brandAttr) {
          const vidNum = Number((brandAttr as any)?.value_id);
          if (Number.isFinite(vidNum)) p.brand_id = vidNum;
        }
        p.attribute_list = attrsArr
          .filter((a: any) => String(a?.id || a?.attribute_id || "").toUpperCase() !== "BRAND")
          .map((a: any) => {
          const idNum = Number(a?.id || a?.attribute_id || 0);
          const item: any = { attribute_id: Number.isFinite(idNum) ? idNum : a?.id || a?.attribute_id };
          if (typeof a?.value_id !== "undefined" && a.value_id !== null) {
            const vidNum = Number(a.value_id);
            if (Number.isFinite(vidNum)) item.option_id = vidNum;
          } else if (typeof a?.value_name === "string" && a.value_name.trim()) {
            item.value = String(a.value_name).trim();
          }
          return item;
        });
      }
      return p;
    })();
    for (const host of hosts) {
      const urlReq = buildUrl(host);
      try {
        const resp = await fetch(urlReq, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(normalizedPayload) });
        const text = await resp.text();
        let json: any = null;
        try { json = JSON.parse(text); } catch (_) { json = null; }
        if (!resp.ok) {
          const errCode = (json as any)?.code ?? (json as any)?.error ?? null;
          if ((resp.status === 401 || resp.status === 403 || String(errCode).includes("invalid_access_token"))) {
            const refreshed = await tryRefreshAccessToken();
            if (refreshed) sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopIdCandidate}`);
          }
        }
        if (resp.status === 401 || resp.status === 403) continue;
        if (resp.ok) return jsonResponse({ ok: true, correlationId, data: json }, 200);
        return jsonResponse({ ok: false, correlationId, status: resp.status, error: (json as any)?.message || (json as any)?.msg || "Shopee API error", data: json }, 200);
      } catch (_) { continue; }
    }
    return jsonResponse({ ok: false, correlationId, error: "Shopee API unreachable" }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || "Unknown error");
    return jsonResponse({ ok: false, error: msg }, 200);
  }
})
