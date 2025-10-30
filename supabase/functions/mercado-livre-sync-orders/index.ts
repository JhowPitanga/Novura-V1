// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// AES-GCM helpers (same format used across ML functions)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

// Decode base64url (JWT payload) to bytes
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }

// Extract user id (sub) from JWT without calling auth APIs
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

// (Removido) Qualquer derivação de status/logística e enriquecimento de shipments;
// a função grava apenas os payloads brutos retornados por `orders/{id}`.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  // Enhanced logging for debugging
  console.log(`[SYNC-ORDERS] Received ${req.method} for ${req.url}`);
  const headersObject = Object.fromEntries(req.headers.entries());
  console.log(`[SYNC-ORDERS] Headers: ${JSON.stringify(headersObject, null, 2)}`);

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

    // Resolve company id
    let finalCompanyId: string | null = integration.company_id || null;
    if (!finalCompanyId) {
      const { data: company, error: companyErr } = await admin
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId as string)
        .limit(1)
        .single();
      if (companyErr || !company?.id) return jsonResponse({ error: companyErr?.message || "Company not found" }, 404);
      finalCompanyId = company.id;
    }

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

    // Determine incremental watermark from DB (max last_updated already persisted)
    const overlapMs = 10 * 60 * 1000; // 10 min overlap to be safe
    let safeFromIso: string | null = null;
    try {
      const { data: maxRow } = await admin
        .from("marketplace_orders_raw")
        .select("last_updated")
        .eq("organizations_id", organizationId as string)
        .eq("marketplace_name", "Mercado Livre")
        .order("last_updated", { ascending: false })
        .limit(1)
        .single();
      if (maxRow?.last_updated) {
        const t = new Date(maxRow.last_updated).getTime() - overlapMs;
        safeFromIso = new Date(Math.max(0, t)).toISOString();
      }
    } catch (_) { /* ignore: no watermark yet */ }

    // Se solicitado full sync, ignorar completamente o watermark
    if (fullSync) {
      safeFromIso = null;
      console.log(`[SYNC-ORDERS] Full sync solicitado: ignorando watermark incremental`);
    }

    // Carregar pedidos: modo forçado por IDs (order_ids) ou modo incremental via /orders/search
    const orders: any[] = [];
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } as const;
    const forcedOrderIds: string[] = Array.isArray(body?.order_ids)
      ? [...new Set(body.order_ids.map((v: any) => String(v)).filter((v) => /^\d+$/.test(v) && v !== "2000010000000000"))]
      : [];
    const forceUpdate = forcedOrderIds.length > 0;
    if (forceUpdate) {
      for (const id of forcedOrderIds) orders.push({ id });
    } else {
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
        if (safeFromIso) listUrl.searchParams.set("order.last_updated.from", safeFromIso);

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
        if (safeFromIso) {
          // If the last item in this batch is older than our safeFrom, we can stop
          const last = batch[batch.length - 1];
          const lastUpdatedStr = String(last?.last_updated || last?.date_last_updated || last?.date_created || "");
          if (lastUpdatedStr) {
            const lastUpdatedTs = Date.parse(lastUpdatedStr);
            const safeFromTs = Date.parse(safeFromIso);
            if (!Number.isNaN(lastUpdatedTs) && lastUpdatedTs < safeFromTs) {
              break;
            }
          }
        }
        if (offset >= total) break;
      }
    }

    // Build map of existing marketplace_orders last_updated for delta comparison
    const ids = Array.from(new Set(orders.map((o:any)=> String(o?.id)).filter(Boolean)));
    const existingMap = new Map<string, string | null>();
    if (ids.length > 0) {
      const { data: existingRows } = await admin
        .from("marketplace_orders_raw")
        .select("marketplace_order_id,last_updated")
        .eq("organizations_id", organizationId as string)
        .eq("marketplace_name", "Mercado Livre")
        .in("marketplace_order_id", ids);
      for (const r of (existingRows || [])) {
        existingMap.set(String(r.marketplace_order_id), r.last_updated ? String(r.last_updated) : null);
      }
    }

    // Upsert orders and items (only new/changed)
    let created = 0, updated = 0, itemsUpserted = 0;
    for (const o of orders) {
      const marketplaceOrderId = String(o?.id ?? "");
      if (!marketplaceOrderId) continue;

      // Skip unchanged orders by comparing last_updated (desativado em modo forçado por IDs)
      if (!forceUpdate) {
        const remoteUpdatedStr = String(o?.last_updated || o?.date_last_updated || o?.date_created || "");
        const existingUpdatedStr = existingMap.get(marketplaceOrderId) || null;
        if (existingUpdatedStr && remoteUpdatedStr) {
          const remoteTs = Date.parse(remoteUpdatedStr);
          const localTs = Date.parse(existingUpdatedStr);
          if (!Number.isNaN(remoteTs) && !Number.isNaN(localTs) && remoteTs <= localTs) {
            // Already up-to-date, skip heavy work
            continue;
          }
        }
      }

      // Não buscar/enriquecer envios: vamos persistir apenas o payload bruto do pedido

      // Buscar detalhes completos do pedido e upsert em marketplace_orders para organização
      try {
        let fullOrderResp = await fetch(`https://api.mercadolibre.com/orders/${marketplaceOrderId}`, { headers });
        if (!fullOrderResp.ok && (fullOrderResp.status === 401 || fullOrderResp.status === 403) && integration.refresh_token) {
          try {
            const { data: appRow, error: appErr } = await admin
              .from("apps")
              .select("client_id, client_secret")
              .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
              .single();
            if (!appErr && appRow) {
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
                  // retry com novo token
                  fullOrderResp = await fetch(`https://api.mercadolibre.com/orders/${marketplaceOrderId}`, { headers: { Authorization: `Bearer ${newAccessToken}`, Accept: "application/json" } });
                }
              }
            }
          } catch (_) { /* ignore */ }
        }
        if (fullOrderResp.ok) {
          const orderData = await fullOrderResp.json();
          const nowIso = new Date().toISOString();
          const rawPayments = Array.isArray(orderData?.payments) ? orderData.payments : [];
          const paymentsEnriched: any[] = [];
          for (const p of rawPayments) {
            const paymentId = String((p && (p.id ?? p.payment_id)) ?? "");
            if (!paymentId) { paymentsEnriched.push(p); continue; }
            const chargesUrl = `https://api.mercadolibre.com/billing/integration/payment/${encodeURIComponent(paymentId)}/charges?limit=1000`;
            let chargesResp = await fetch(chargesUrl, { headers });
            if (!chargesResp.ok && (chargesResp.status === 401 || chargesResp.status === 403) && integration.refresh_token) {
              try {
                const { data: appRow, error: appErr } = await admin
                  .from("apps")
                  .select("client_id, client_secret")
                  .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
                  .single();
                if (!appErr && appRow) {
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
                      chargesResp = await fetch(chargesUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
                    }
                  }
                }
              } catch { /* ignore */ }
            }
            try {
              const chargesJson = await chargesResp.json();
              const paymentDetails = Array.isArray(chargesJson?.payment_details)
                ? chargesJson.payment_details
                : (Array.isArray(chargesJson?.charges) ? chargesJson.charges : []);
              const feesTotal = Array.isArray(paymentDetails)
                ? paymentDetails.reduce((sum: number, d: any) => sum + (Number(d?.amount || 0)), 0)
                : 0;
              const marketplaceFee = (Number(p?.marketplace_fee) > 0) ? Number(p.marketplace_fee) : feesTotal;
              paymentsEnriched.push({
                ...p,
                billing_charges: paymentDetails,
                fee_details: paymentDetails,
                fees_total: feesTotal,
                marketplace_fee: marketplaceFee,
                billing_charges_fetched_at: nowIso,
              });
            } catch {
              paymentsEnriched.push(p);
            }
          }
          // Enriquecer envios: buscar detalhes via API de shipments quando houver IDs
          async function fetchShipmentDetails(shipmentId: string, token: string): Promise<any | null> {
            if (!shipmentId) return null;
            try {
              const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: "application/json",
                  "x-format-new": "true",
                },
              });
              if (!resp.ok) return null;
              return await resp.json();
            } catch (_) { return null; }
          }

          // Sub-recursos de envio: tracking e costs
          async function fetchShipmentTracking(shipmentId: string, token: string): Promise<any | null> {
            if (!shipmentId) return null;
            try {
              const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/tracking`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              });
              if (!resp.ok) return null;
              return await resp.json();
            } catch (_) { return null; }
          }

          async function fetchShipmentCosts(shipmentId: string, token: string): Promise<any | null> {
            if (!shipmentId) return null;
            try {
              const resp = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/costs`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
              });
              if (!resp.ok) return null;
              return await resp.json();
            } catch (_) { return null; }
          }

          const candidateShipmentIds = new Set<string>();
          if (orderData?.shipping?.id) {
            try { candidateShipmentIds.add(String(orderData.shipping.id)); } catch { /* ignore */ }
          }
          if (Array.isArray(orderData?.shipments)) {
            for (const s of orderData.shipments) {
              const sid = (s && (s.id ?? s.shipment_id)) ? String(s.id ?? s.shipment_id) : null;
              if (sid) candidateShipmentIds.add(sid);
            }
          }

          const shipmentsDetailed: any[] = [];
          for (const sid of candidateShipmentIds) {
            const det = await fetchShipmentDetails(sid, accessToken);
            if (det) shipmentsDetailed.push(det);
          }

          // Base de envios a enriquecer (detalhados ou fallback)
          const baseShipments = (
            shipmentsDetailed.length > 0
              ? shipmentsDetailed
              : ((Array.isArray(orderData?.shipments) && orderData.shipments.length > 0)
                  ? orderData.shipments
                  : (orderData?.shipping ? [orderData.shipping] : []))
          );

          // Enriquecer cada envio com /tracking e /costs
          const shipmentsNormalized: any[] = [];
          for (const sh of baseShipments) {
            const sid = (sh && (sh.id ?? sh.shipment_id)) ? String(sh.id ?? sh.shipment_id) : null;
            let tracking: any | null = null;
            let costs: any | null = null;
            if (sid) {
              tracking = await fetchShipmentTracking(sid, accessToken);
              costs = await fetchShipmentCosts(sid, accessToken);
            }
            shipmentsNormalized.push({
              ...sh,
              tracking: tracking ?? (sh?.tracking ?? null),
              costs: costs ?? (sh?.costs ?? null),
              tracking_fetched_at: tracking ? nowIso : (sh?.tracking_fetched_at ?? null),
              costs_fetched_at: costs ? nowIso : (sh?.costs_fetched_at ?? null),
            });
          }
          // Determina se é criação ou atualização no raw
          const isNewRaw = !existingMap.has(marketplaceOrderId);
          const upsertData = {
            organizations_id: organizationId,
            company_id: finalCompanyId,
            marketplace_name: "Mercado Livre",
            marketplace_order_id: orderData.id,
            status: orderData.status || null,
            status_detail: orderData.status_detail || null,
            order_items: Array.isArray(orderData.order_items) ? orderData.order_items : [],
            buyer: orderData.buyer || null,
            seller: orderData.seller || null,
            payments: paymentsEnriched,
            shipments: Array.isArray(shipmentsNormalized) ? shipmentsNormalized : [],
            feedback: orderData.feedback || null,
            tags: Array.isArray(orderData.tags) ? orderData.tags : [],
            data: orderData,
            date_created: orderData.date_created || null,
            date_closed: orderData.date_closed || null,
            last_updated: orderData.last_updated || null,
            last_synced_at: nowIso,
            updated_at: nowIso,
          } as const;
          try {
            await admin
              .from("marketplace_orders_raw")
              .upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_order_id" });
            if (isNewRaw) created++; else updated++;
            // Upsert normalized shipments rows
            // Não gravar mais em marketplace_shipments: todos os dados de envio ficam em marketplace_orders_raw.shipments
          } catch (_) { /* ignore */ }
        }
      } catch (_) { /* ignore */ }
    }

    // Resumo da execução
    const summary: any = { ok: true, orders_found: orders.length, created, updated, items_upserted: itemsUpserted };
    if (forceUpdate) summary.orders_forced = forcedOrderIds.length;
    return jsonResponse(summary);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});



// ... existing code ...


