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

// AES-GCM helpers (shared)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

// Decode base64url (JWT payload)
function b64UrlToUint8(b64url: string): Uint8Array { let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/"); const pad = b64.length % 4; if (pad) b64 += "=".repeat(4 - pad); const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
function decodeJwtSub(jwt: string): string | null { try { const parts = jwt.split("."); if (parts.length < 2) return null; const payloadBytes = b64UrlToUint8(parts[1]); const payload = JSON.parse(new TextDecoder().decode(payloadBytes)); return (payload?.sub as string) || (payload?.user_id as string) || null; } catch { return null; } }

// Concurrency limiter
function createLimiter(maxConcurrent: number) {
  let active = 0; const queue: (() => void)[] = [];
  const next = () => { if (active >= maxConcurrent || queue.length === 0) return; active++; const fn = queue.shift()!; fn(); };
  const run = async <T>(task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => { const start = () => { task().then((v) => { active--; next(); resolve(v); }).catch((e) => { active--; next(); reject(e); }); }; queue.push(start); next(); });
  return { run };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" } });
  }
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("apikey") || "";
    const isInternalCall = req.headers.get("x-internal-call") === "1" && !!apiKeyHeader && apiKeyHeader === SERVICE_ROLE_KEY;
    if (!authHeader && !isInternalCall) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const url = new URL(req.url);
    let body: any = null; if (req.method === "POST") { try { body = await req.json(); } catch { body = null; } }
    const organizationId = (body?.organizationId as string) || url.searchParams.get("organizationId") || undefined;
    const itemIds: string[] = Array.isArray(body?.itemIds) ? body.itemIds.map((x: any) => String(x)) : [];
    let siteId: string = (body?.siteId as string) || "MLB";
    if (!organizationId) return jsonResponse({ error: "Missing organizationId" }, 400);

    // Membership check
    if (!isInternalCall) {
      const tokenValue = authHeader!.replace(/^Bearer\s+/i, "").trim();
      const userIdFromJwt = decodeJwtSub(tokenValue);
      if (!userIdFromJwt) return jsonResponse({ error: "Invalid Authorization token" }, 401);
      const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", { p_user_id: userIdFromJwt, p_organization_id: organizationId });
      if (permErr) return jsonResponse({ error: permErr.message }, 500);
      const permRow = Array.isArray(permData) ? (permData[0] as any) : (permData as any);
      if (!permRow?.role) return jsonResponse({ error: "Forbidden: You don't belong to this organization" }, 403);
    }

    // Get integration
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, company_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    let accessToken: string;
    try { accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token); }
    catch (e) { return jsonResponse({ error: `Failed to decrypt access token: ${e instanceof Error ? e.message : String(e)}` }, 500); }

    // Refresh if expired
    const now = new Date();
    const expiresAt = new Date(integration.expires_in);
    if (now >= expiresAt) {
      const { data: appRow, error: appErr } = await admin.from("apps").select("client_id, client_secret").eq("name", "Mercado Livre").single();
      if (appErr || !appRow) return jsonResponse({ error: "App credentials not found for token refresh" }, 404);
      let refreshTokenPlain: string; try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch (e) { return jsonResponse({ error: `Failed to decrypt refresh token: ${e instanceof Error ? e.message : String(e)}` }, 500); }
      const form = new URLSearchParams(); form.append("grant_type", "refresh_token"); form.append("client_id", appRow.client_id); form.append("client_secret", appRow.client_secret); form.append("refresh_token", refreshTokenPlain);
      const rResp = await fetch("https://api.mercadolibre.com/oauth/token", { method: "POST", headers: { "accept": "application/json", "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
      const rJson = await rResp.json(); if (!rResp.ok) return jsonResponse({ error: "Token refresh failed", details: { meli: rJson } }, rResp.status);
      accessToken = String(rJson.access_token);
      const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, String(rJson.refresh_token));
      const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, accessToken);
      const newExpiresAtIso = new Date(Date.now() + (Number(rJson.expires_in) || 0) * 1000).toISOString();
      await admin.from("marketplace_integrations").update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, expires_in: newExpiresAtIso }).eq("id", integration.id);
    }

    // Select items with TTL 12h
    const TTL_MS = 12 * 60 * 60 * 1000;
    const cutoffIso = new Date(Date.now() - TTL_MS).toISOString();
    let targetItems: { marketplace_item_id: string }[] = [];
    if (itemIds.length > 0) {
      targetItems = itemIds.map((id) => ({ marketplace_item_id: id }));
    } else {
      const { data: rows } = await admin
        .from("marketplace_items")
        .select("marketplace_item_id, last_prices_update")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", "Mercado Livre")
        .or(`last_prices_update.is.null,last_prices_update.lt.${cutoffIso}`)
        .order("updated_at", { ascending: false })
        .limit(200);
      targetItems = (rows || []).map((r: any) => ({ marketplace_item_id: String(r.marketplace_item_id) }));
    }

    const limiter = createLimiter(3);
    const cacheListingPrices = new Map<string, any>();
    const results: Record<string, any> = {};

    const processOne = async (itemId: string) => {
      const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } as Record<string, string>;
      // Get item details to resolve site/category/listing_type
      let itemSiteId: string = siteId; let categoryId: string | null = null; let listingTypeId: string | null = null; let currencyId: string | null = null; let basePrice: number | null = null;
      try {
        const iResp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, { headers });
        const ij = await iResp.json();
        if (iResp.ok) {
          itemSiteId = String(ij?.site_id || itemSiteId);
          categoryId = ij?.category_id ? String(ij.category_id) : null;
          listingTypeId = ij?.listing_type_id ? String(ij.listing_type_id) : null;
          currencyId = ij?.currency_id ? String(ij.currency_id) : null;
          basePrice = typeof ij?.price === "number" ? ij.price : (Number(ij?.price) || null);
        }
      } catch (_) { /* ignore */ }

      // Sale price
      let salePrice: { amount: number | null; regular_amount: number | null; currency_id: string | null } = { amount: null, regular_amount: null, currency_id: currencyId };
      try {
        const spUrl = `https://api.mercadolibre.com/items/${itemId}/sale_price?context=channel_marketplace`;
        const spResp = await fetch(spUrl, { headers });
        const spJson = await spResp.json();
        if (spResp.ok) {
          const node = spJson?.price || spJson; // alguns sites retornam como { price: {...} }
          const amt = typeof node?.amount === "number" ? node.amount : (typeof node?.sale_price?.amount === "number" ? node.sale_price.amount : null);
          const reg = typeof node?.regular_amount === "number" ? node.regular_amount : (typeof node?.sale_price?.regular_amount === "number" ? node.sale_price.regular_amount : null);
          const cur = String(node?.currency_id || salePrice.currency_id || currencyId || "");
          salePrice = { amount: amt ?? basePrice ?? null, regular_amount: reg ?? null, currency_id: cur || null };
        }
      } catch (_) { /* ignore */ }

      // Listing prices (custos por vender / comissão). Sempre tentar pelo menos com preço.
      let listingPrices: any = null;
      try {
        const priceParam = salePrice.amount ?? basePrice ?? 0;
        if (priceParam && priceParam > 0) {
          const lpUrl = new URL(`https://api.mercadolibre.com/sites/${itemSiteId}/listing_prices`);
          lpUrl.searchParams.set("price", String(priceParam));
          // Adiciona filtros quando disponíveis para precisão
          if (listingTypeId) lpUrl.searchParams.set("listing_type_id", listingTypeId);
          if (categoryId) lpUrl.searchParams.set("category_id", categoryId);
          const lpKey = `${itemSiteId}|${categoryId || '-'}|${listingTypeId || '-'}|${Math.round(priceParam * 100)}`;
          if (cacheListingPrices.has(lpKey)) {
            listingPrices = cacheListingPrices.get(lpKey);
          } else {
            const lpResp = await fetch(lpUrl.toString(), { headers });
            const lpJson = await lpResp.json();
            if (lpResp.ok) {
              listingPrices = lpJson;
              cacheListingPrices.set(lpKey, listingPrices);
            }
          }
        }
      } catch (_) { /* ignore */ }

      // Prices by quantity
      let pricesByQty: any = null;
      try {
        const pqUrl = `https://api.mercadolibre.com/items/${itemId}/prices?context=user_type_business,channel_marketplace`;
        const pqResp = await fetch(pqUrl, { headers: { ...headers, "show-all-prices": "true" } });
        const pqJson = await pqResp.json();
        if (pqResp.ok) pricesByQty = pqJson;
      } catch (_) { /* ignore */ }

      const nowIso = new Date().toISOString();
      const saleAmt = typeof salePrice.amount === "number" ? salePrice.amount : null;
      const saleReg = typeof salePrice.regular_amount === "number" ? salePrice.regular_amount : null;
      const saleCur = salePrice.currency_id || currencyId || null;
      const context = { site_id: itemSiteId, category_id: categoryId, listing_type_id: listingTypeId, channel: "marketplace" };

      // Upsert normalized table
      const { error: upErr } = await admin
        .from("marketplace_item_prices")
        .upsert({
          organizations_id: organizationId,
          marketplace_name: "Mercado Livre",
          marketplace_item_id: itemId,
          sale_price_amount: saleAmt,
          sale_price_regular_amount: saleReg,
          sale_price_currency_id: saleCur,
          sale_price_context: context,
          listing_prices: listingPrices,
          prices_by_quantity: pricesByQty,
          updated_at: nowIso,
        }, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
      if (upErr) return { ok: false, error: upErr.message };

      // Update convenience price and TTL on marketplace_items
      const { error: updErr } = await admin
        .from("marketplace_items")
        .update({ price: saleAmt ?? basePrice ?? null, last_prices_update: nowIso })
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", "Mercado Livre")
        .eq("marketplace_item_id", itemId);
      if (updErr) return { ok: false, error: updErr.message };

      return { ok: true, sale_price: saleAmt, listing_prices: !!listingPrices, prices_by_quantity: !!pricesByQty };
    };

    for (const it of targetItems) {
      results[it.marketplace_item_id] = await limiter.run(() => processOne(it.marketplace_item_id));
    }

    return jsonResponse({ ok: true, processed: Object.keys(results).length, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});