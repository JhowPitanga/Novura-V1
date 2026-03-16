/**
 * DEPRECATED: Use orders-sync-ml instead. This function will be removed in a future release.
 * Cycle 0 sync is implemented in orders-sync-ml (normalize + upsert, optional raw).
 */
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { importAesGcmKey, aesGcmEncryptToString, aesGcmDecryptFromString } from "../_shared/adapters/infra/token-utils.ts";
import { isMlOrderResponse, MlOrderNormalizeService } from "../_shared/orders-normalize/index.ts";
import { upsertOrder } from "../orders-upsert/upsert-order.ts";

const mlNormalizer = new MlOrderNormalizeService();
const ML_MARKETPLACE_NAME = "Mercado Livre";

// Decode base64url (JWT payload) to bytes
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

// Extract user id (sub) from JWT without calling auth APIs
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

// Cycle 0: list order IDs → GET full order per ID → normalize (_shared/orders-normalize) → upsert (orders-upsert).
// No marketplace_orders_raw, no enrichment (shipments/labels/billing), no process-presented.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions();
  }
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  // Enhanced logging for debugging
  const correlationId = req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || crypto.randomUUID();
  console.log(`[SYNC-ORDERS] Received ${req.method} for ${req.url} (cid=${correlationId})`);
  const headersObject = Object.fromEntries(req.headers.entries());
  console.log(`[SYNC-ORDERS] Headers: ${JSON.stringify(headersObject, null, 2)} (cid=${correlationId})`);

  try {
    let body: any = {};
    if (req.method === "POST") {
      const bodyText = await req.text();
      console.log(`[SYNC-ORDERS] Body: ${bodyText}`);
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
        } catch (e) {
          console.error("[SYNC-ORDERS] Failed to parse JSON body:", e);
          return jsonResponse({ error: "Invalid JSON format" }, 400);
        }
      }
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
      console.error("[SYNC-ORDERS] Missing service configuration");
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    const authHeader = req.headers.get("Authorization") || "";
    const apiKeyHeader = req.headers.get("apikey") || "";
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const internalHeader = req.headers.get("x-internal-call") === "1";
    // Considerar chamada interna quando o cabeçalho x-internal-call=1 e
    // o token de Authorization OU o apikey correspondem à service role key.
    const isInternalCall = internalHeader && (apiKeyHeader === SERVICE_ROLE_KEY || bearerToken === SERVICE_ROLE_KEY);
    if (!authHeader && !isInternalCall) {
      console.error("[SYNC-ORDERS] Missing Authorization header or invalid internal call");
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const admin = createAdminClient();

    // Input
    const url = new URL(req.url);
    // Suporte a sincronização completa (ignorar watermark): body { full: true } ou query ?full=1
    const fullSync = body?.full === true || ["1","true","yes"].includes(String(url.searchParams.get("full") || "").toLowerCase());
    const sellerIdFromQuery = url.searchParams.get("seller_id");
    let organizationId: string | undefined = body?.organizationId as string | undefined;
    const sellerIdInput: string | undefined = (body?.seller_id as string) || (body?.sellerId as string) || sellerIdFromQuery || undefined;

    if (!organizationId && !sellerIdInput) {
      return jsonResponse({ error: "Missing organizationId or seller_id" }, 400);
    }

    // If only seller_id provided, resolve organizationId from marketplace_integrations
    if (!organizationId && sellerIdInput) {
      const { data: orgLookup, error: orgLookupErr } = await admin
        .from("marketplace_integrations")
        .select("organizations_id")
        .eq("meli_user_id", sellerIdInput)
        .eq("marketplace_name", "Mercado Livre")
        .limit(1)
        .single();
      if (orgLookupErr || !orgLookup?.organizations_id) {
        return jsonResponse({ error: orgLookupErr?.message || "Integration not found for seller_id" }, 404);
      }
      organizationId = orgLookup.organizations_id as string;
    }

    // Validate membership using JWT subject (skip for internal calls using service role key)
    let userIdFromJwt: string | null = null;
    if (!isInternalCall) {
      const tokenValue = authHeader.replace(/^Bearer\s+/i, "").trim();
      userIdFromJwt = decodeJwtSub(tokenValue);
      if (!userIdFromJwt) return jsonResponse({ error: "Invalid Authorization token" }, 401);
      const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", { p_user_id: userIdFromJwt, p_organization_id: organizationId });
      if (permErr) return jsonResponse({ error: permErr.message }, 500);
      const permRow = Array.isArray(permData) ? (permData[0] as any) : (permData as any);
      if (!permRow?.role) return jsonResponse({ error: "Forbidden: You don't belong to this organization" }, 403);
    }

    // Integration
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name, organizations_id, company_id")
      .eq("organizations_id", organizationId as string)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    // Decrypt access token with fallback to plaintext (legacy rows)
    let accessToken: string;
    try {
      accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If value is not in enc:gcm:<iv>:<ct> format, treat as plaintext
      if (typeof integration.access_token === "string" && !integration.access_token.startsWith("enc:")) {
        accessToken = integration.access_token;
      } else {
        return jsonResponse({ error: `Failed to decrypt access token: ${msg}` }, 500);
      }
    }

    const sellerId = integration.meli_user_id;
    if (!sellerId) return jsonResponse({ error: "Missing meli_user_id" }, 400);

    // Refresh token if expired
    const now = new Date();
    const expiresAt = integration.expires_in ? new Date(integration.expires_in) : null;
    if (expiresAt && now >= expiresAt) {
      // Get app credentials
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
        .single();
      if (!appErr && appRow && integration.refresh_token) {
        let refreshTokenPlain: string | null = null;
        try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch { refreshTokenPlain = null; }
        if (refreshTokenPlain) {
          const form = new URLSearchParams();
          form.append("grant_type", "refresh_token");
          form.append("client_id", appRow.client_id);
          form.append("client_secret", appRow.client_secret);
          form.append("refresh_token", refreshTokenPlain);
          const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
            method: "POST",
            headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
            body: form.toString(),
          });
          const refreshJson = await refreshResp.json();
          if (refreshResp.ok) {
            const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
            const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
            const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
            const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
            await admin
              .from("marketplace_integrations")
              .update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, expires_in: newExpiresAtIso, meli_user_id: user_id })
              .eq("id", integration.id);
            accessToken = newAccessToken;
          }
        }
      }
    }

    // Incremental watermark from new orders table (max last_synced_at)
    const overlapMs = 10 * 60 * 1000; // 10 min overlap
    let safeFromIso: string | null = null;
    try {
      const { data: maxRow } = await admin
        .from("orders")
        .select("last_synced_at")
        .eq("organization_id", organizationId as string)
        .eq("marketplace", "mercado_livre")
        .not("last_synced_at", "is", null)
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .single();
      if (maxRow?.last_synced_at) {
        const t = new Date(maxRow.last_synced_at).getTime() - overlapMs;
        safeFromIso = new Date(Math.max(0, t)).toISOString();
      }
    } catch (_) { /* ignore */ }

    // Se solicitado full sync, ignorar completamente o watermark
    if (fullSync) {
      safeFromIso = null;
      console.log(`[SYNC-ORDERS] Full sync solicitado: ignorando watermark incremental`);
    }

    // Carregar pedidos: modo forçado por IDs (order_ids) ou modo incremental via /orders/search
    const orders: any[] = [];
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } as const;
    const forcedOrderIds: string[] = Array.isArray(body?.order_ids)
      ? [...new Set((body.order_ids as unknown[]).map((v: unknown) => String(v)).filter((v: string) => /^\d+$/.test(v) && v !== "2000010000000000"))]
      : [];
    const forceUpdate = forcedOrderIds.length > 0;
    if (forceUpdate) {
      for (const id of forcedOrderIds) orders.push({ id });
    } else {
      const nowIsoBound = new Date().toISOString();
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const effectiveFromIso = (() => {
        if (!safeFromIso) return thirtyDaysAgoIso;
        const a = Date.parse(safeFromIso);
        const b = Date.parse(thirtyDaysAgoIso);
        if (Number.isNaN(a)) return thirtyDaysAgoIso;
        return new Date(Math.max(a, b)).toISOString();
      })();
      let offset = 0;
      const limit = 50;
      for (let page = 0; page < 200; page++) {
        const listUrl = new URL("https://api.mercadolibre.com/orders/search");
        listUrl.searchParams.set("seller", String(sellerId));
        listUrl.searchParams.set("offset", String(offset));
        listUrl.searchParams.set("limit", String(limit));
        listUrl.searchParams.set("sort", "date_desc");
        // Optionally filter by date/status with extra params if passed
        if (body?.status) listUrl.searchParams.set("order.status", String(body.status));
        // Try to filter by last updated when available in API; safe to ignore if not supported
        listUrl.searchParams.set("order.last_updated.from", effectiveFromIso);
        listUrl.searchParams.set("order.last_updated.to", nowIsoBound);

        let resp = await fetch(listUrl.toString(), { headers });
        let json: any = null; try { json = await resp.json(); } catch { json = {}; }
        if (!resp.ok) {
          // On 401/403 try one-time refresh using refresh_token
          if (resp.status === 401 || resp.status === 403) {
            try {
              const { data: appRow, error: appErr } = await admin
                .from("apps")
                .select("client_id, client_secret")
                .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
                .single();
              if (!appErr && appRow && integration.refresh_token) {
                let refreshTokenPlain: string | null = null;
                try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch { refreshTokenPlain = null; }
                if (refreshTokenPlain) {
                  const form = new URLSearchParams();
                  form.append("grant_type", "refresh_token");
                  form.append("client_id", appRow.client_id);
                  form.append("client_secret", appRow.client_secret);
                  form.append("refresh_token", refreshTokenPlain);
                  const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", {
                    method: "POST",
                    headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" },
                    body: form.toString(),
                  });
                  const refreshJson = await refreshResp.json();
                  if (refreshResp.ok) {
                    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson;
                    const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
                    const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken);
                    const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
                    await admin
                      .from("marketplace_integrations")
                      .update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, expires_in: newExpiresAtIso, meli_user_id: user_id })
                      .eq("id", integration.id);
                    accessToken = newAccessToken;
                    // retry request
                    resp = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
                    try { json = await resp.json(); } catch { json = {}; }
                  }
                }
              }
            } catch { /* ignore */ }
          }
          const details = { meli: json, request: { sellerId, offset, limit }, context: { organizationId, userIdFromJwt } };
          return jsonResponse({ error: json?.error || json?.message || "Failed to list orders", details }, resp.status);
        }
        const batch = Array.isArray(json?.results) ? json.results : [];
        orders.push(...batch);
        const total = Number(json?.paging?.total || 0);
        offset += batch.length;
        // Early stop: if batch is empty or we already went past our window
        if (batch.length === 0) break;
        {
          const last = batch[batch.length - 1];
          const lastUpdatedStr = String(last?.last_updated || last?.date_last_updated || last?.date_created || "");
          if (lastUpdatedStr) {
            const lastUpdatedTs = Date.parse(lastUpdatedStr);
            const safeFromTs = Date.parse(effectiveFromIso);
            if (!Number.isNaN(lastUpdatedTs) && lastUpdatedTs < safeFromTs) {
              break;
            }
          }
        }
        if (offset >= total) break;
      }
    }

    // Cycle 0: per order → GET full → normalize → upsert (orders, order_items, order_shipping, order_status_history only)
    let synced = 0;
    let failed = 0;
    const errors: Array<{ order_id: string; error: string }> = [];

    const doRefresh = async (): Promise<string | null> => {
      if (!integration.refresh_token) return null;
      const { data: appRow, error: appErr } = await admin
        .from("apps")
        .select("client_id, client_secret")
        .eq("name", ML_MARKETPLACE_NAME)
        .single();
      if (appErr || !appRow) return null;
      let refreshPlain: string | null = null;
      try { refreshPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch { return null; }
      if (!refreshPlain) return null;
      const form = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appRow.client_id,
        client_secret: appRow.client_secret,
        refresh_token: refreshPlain,
      });
      const resp = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const json = await resp.json();
      if (!resp.ok || !json.access_token) return null;
      const newEnc = await aesGcmEncryptToString(aesKey, json.access_token);
      const newRefEnc = await aesGcmEncryptToString(aesKey, json.refresh_token ?? refreshPlain);
      await admin
        .from("marketplace_integrations")
        .update({
          access_token: newEnc,
          refresh_token: newRefEnc,
          expires_in: new Date(Date.now() + (Number(json.expires_in) || 0) * 1000).toISOString(),
          meli_user_id: json.user_id ?? integration.meli_user_id,
        })
        .eq("id", integration.id);
      return json.access_token;
    };

    for (const o of orders) {
      const marketplaceOrderId = String(o?.id ?? "");
      if (!marketplaceOrderId) continue;

      try {
        let fullOrderResp = await fetch(`https://api.mercadolibre.com/orders/${marketplaceOrderId}`, { headers });
        if ((fullOrderResp.status === 401 || fullOrderResp.status === 403) && integration.refresh_token) {
          const newToken = await doRefresh();
          if (newToken) {
            accessToken = newToken;
            fullOrderResp = await fetch(`https://api.mercadolibre.com/orders/${marketplaceOrderId}`, {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
            });
          }
        }
        if (fullOrderResp.status === 403) continue; // cancelled/confidential
        if (!fullOrderResp.ok) {
          failed++;
          errors.push({ order_id: marketplaceOrderId, error: fullOrderResp.statusText || "Fetch failed" });
          continue;
        }
        const orderData = await fullOrderResp.json();
        if (!isMlOrderResponse(orderData)) {
          failed++;
          errors.push({ order_id: marketplaceOrderId, error: "Invalid order response" });
          continue;
        }
        const normalized = mlNormalizer.normalize(orderData);
        const result = await upsertOrder(admin, {
          organization_id: organizationId as string,
          order: normalized,
          source: "sync",
        });
        if (!result.success) {
          failed++;
          errors.push({ order_id: marketplaceOrderId, error: result.error ?? "Upsert failed" });
          continue;
        }
        synced++;
      } catch (e) {
        failed++;
        errors.push({ order_id: marketplaceOrderId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const summary: any = { ok: true, orders_found: orders.length, synced, failed, errors };
    if (forceUpdate) summary.orders_forced = forcedOrderIds.length;
    return jsonResponse(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
