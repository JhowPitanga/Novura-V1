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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Input
    const url = new URL(req.url);
    const sellerIdFromQuery = url.searchParams.get("seller_id");
    let body: any = null;
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = null; }
    }
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

    // Validate membership using JWT subject
    const tokenValue = authHeader.replace(/^Bearer\s+/i, "").trim();
    const userIdFromJwt = decodeJwtSub(tokenValue);
    if (!userIdFromJwt) return jsonResponse({ error: "Invalid Authorization token" }, 401);
    const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", { p_user_id: userIdFromJwt, p_organization_id: organizationId });
    if (permErr) return jsonResponse({ error: permErr.message }, 500);
    const permRow = Array.isArray(permData) ? (permData[0] as any) : (permData as any);
    if (!permRow?.role) return jsonResponse({ error: "Forbidden: You don't belong to this organization" }, 403);

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

    // Decrypt access token
    let accessToken: string;
    try { accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token); }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); return jsonResponse({ error: `Failed to decrypt access token: ${msg}` }, 500); }

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

    // Fetch orders via /orders/search?seller={sellerId}
    const orders: any[] = [];
    let offset = 0;
    const limit = 50;
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } as const;
    for (let page = 0; page < 200; page++) {
      const listUrl = new URL("https://api.mercadolibre.com/orders/search");
      listUrl.searchParams.set("seller", String(sellerId));
      listUrl.searchParams.set("offset", String(offset));
      listUrl.searchParams.set("limit", String(limit));
      // Optionally filter by date/status with extra params if passed
      if (body?.status) listUrl.searchParams.set("order.status", String(body.status));

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
      if (offset >= total || batch.length === 0) break;
    }

    // Upsert orders and items
    let created = 0, updated = 0, itemsUpserted = 0;
    for (const o of orders) {
      const marketplaceOrderId = String(o?.id ?? "");
      if (!marketplaceOrderId) continue;

      // Try find existing order by marketplace_order_id
      const { data: existingOrder } = await admin
        .from("orders")
        .select("id")
        .eq("marketplace_order_id", marketplaceOrderId)
        .eq("company_id", finalCompanyId)
        .limit(1)
        .single();

      const orderPayload: any = {
        company_id: finalCompanyId,
        marketplace: "Mercado Livre",
        marketplace_order_id: marketplaceOrderId,
        order_total: typeof o?.total_amount === 'number' ? o.total_amount : (Number(o?.total_amount) || 0),
        order_cost: 0,
        status: String(o?.status || ""),
        customer_name: o?.buyer?.nickname || "",
        customer_email: null,
        customer_phone: null,
        shipping_address: "",
        shipping_city: "",
        shipping_state: "",
        shipping_zip_code: "",
        shipping_type: Array.isArray(o?.tags) && o.tags.includes("no_shipping") ? "no_shipping" : (o?.shipping?.id ? "shipping" : null),
        platform_id: o?.shipping?.id ? String(o.shipping.id) : marketplaceOrderId,
      };

      let orderId: string | null = existingOrder?.id || null;
      if (!orderId) {
        const { data: inserted, error: insErr } = await admin
          .from("orders")
          .insert(orderPayload)
          .select("id")
          .single();
        if (insErr || !inserted?.id) return jsonResponse({ error: insErr?.message || "Failed to insert order", details: { marketplaceOrderId } }, 500);
        orderId = inserted.id; created++;
      } else {
        const { error: updErr } = await admin
          .from("orders")
          .update(orderPayload)
          .eq("id", orderId);
        if (updErr) return jsonResponse({ error: updErr.message, details: { marketplaceOrderId } }, 500);
        updated++;
      }

      // Upsert order items
      const items = Array.isArray(o?.order_items) ? o.order_items : [];
      for (const it of items) {
        const mlItem = it?.item || {};
        const mlItemId = mlItem?.id ? String(mlItem.id) : null;
        const sku = mlItem?.seller_sku || mlItem?.seller_custom_field || null;
        const productName = mlItem?.title || null;
        const pricePerUnit = typeof it?.unit_price === 'number' ? it.unit_price : (Number(it?.unit_price) || 0);
        const quantity = typeof it?.quantity === 'number' ? it.quantity : (Number(it?.quantity) || 0);

        const itemPayload: any = {
          order_id: orderId,
          company_id: finalCompanyId,
          product_id: null,
          product_name: productName,
          price_per_unit: pricePerUnit,
          quantity,
          sku,
          marketplace_item_id: mlItemId,
        };

        // There is no unique constraint; insert always, or replace simplistic by delete+insert for this order id + ml item id
        if (mlItemId) {
          await admin.from("order_items").delete().eq("order_id", orderId).eq("marketplace_item_id", mlItemId);
        }
        const { error: insItemErr } = await admin.from("order_items").insert(itemPayload);
        if (insItemErr) return jsonResponse({ error: insItemErr.message, details: { orderId, mlItemId } }, 500);
        itemsUpserted++;
      }
    }

    return jsonResponse({ ok: true, orders_found: orders.length, created, updated, items_upserted: itemsUpserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});


