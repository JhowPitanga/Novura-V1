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

// AES-GCM helpers (same format as callback/refresh)
function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
    // Relax config requirement: allow missing ANON_KEY (skip membership check when absent)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const aesKey = await importAesGcmKey(ENC_KEY_B64);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Accept seller_id via query or POST body; accept organizationId via body
    const url = new URL(req.url);
    const sellerIdFromQuery = url.searchParams.get("seller_id");
    const debug = url.searchParams.get("debug") === "1";

    let body: any = null;
    if (req.method === "POST") {
      try { body = await req.json(); } catch { body = null; }
    }

    let siteId: string = (body?.siteId as string) || "MLB";
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

    // Validate membership using JWT subject and rpc_get_member_permissions (no refresh)
    const tokenValue = authHeader.replace(/^Bearer\s+/i, "").trim();
    const userIdFromJwt = decodeJwtSub(tokenValue);
    if (!userIdFromJwt) {
      return jsonResponse({ error: "Invalid Authorization token" }, 401);
    }
    const { data: permData, error: permErr } = await admin.rpc("rpc_get_member_permissions", {
      p_user_id: userIdFromJwt,
      p_organization_id: organizationId,
    });
    if (permErr) return jsonResponse({ error: permErr.message }, 500);
    const permRow = Array.isArray(permData) ? (permData[0] as any) : (permData as any);
    if (!permRow?.role) {
      return jsonResponse({
        error: "Forbidden: You don't belong to this organization",
        details: { requested: organizationId, role: permRow?.role ?? null, userId: userIdFromJwt },
      }, 403);
    }

    // Get integration for Mercado Livre in this org
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, expires_in, meli_user_id, marketplace_name, organizations_id, company_id")
      .eq("organizations_id", organizationId as string)
      .eq("marketplace_name", "Mercado Livre")
      .order("expires_in", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    // Resolve company id: prefer integration.company_id, fallback to org company
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
    try {
      accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse({ error: `Failed to decrypt access token: ${msg}` }, 500);
    }

    const sellerId = integration.meli_user_id;
    if (!sellerId) return jsonResponse({ error: "Missing meli_user_id" }, 400);

    // Paginated fetch from Mercado Livre: /sites/{SITE_ID}/search?seller_id={SELLER_ID}
    const items: any[] = [];
    let offset = 0;
    const limit = 50;
    for (let page = 0; page < 200; page++) { // safety cap
      const urlMl = new URL(`https://api.mercadolibre.com/sites/${siteId}/search`);
      urlMl.searchParams.set("seller_id", String(sellerId));
      urlMl.searchParams.set("offset", String(offset));
      urlMl.searchParams.set("limit", String(limit));

      const resp = await fetch(urlMl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const json = await resp.json();
      if (!resp.ok) {
        const details = {
          meli: json,
          request: { siteId, sellerId: String(sellerId), offset, limit },
          context: { organizationId: organizationId as string, userIdFromJwt },
        };
        return jsonResponse({ error: json?.error || json?.message || "Failed to fetch items", details }, resp.status);
      }

      const batch = Array.isArray(json?.results) ? json.results : [];
      items.push(...batch);
      const total = Number(json?.paging?.total || 0);
      offset += batch.length;
      if (offset >= total || batch.length === 0) break;
    }

    // Map items to marketplace_items rows
    const nowIso = new Date().toISOString();
    const upserts = items.map((it) => {
      const pictures = it?.thumbnail ? [it.thumbnail] : (Array.isArray(it?.pictures) ? it.pictures : []);
      const attributes = Array.isArray(it?.attributes) ? it.attributes : [];
      return {
        organizations_id: organizationId as string,
        company_id: finalCompanyId,
        marketplace_name: "Mercado Livre",
        marketplace_item_id: it?.id || String(it?.id || ""),
        title: it?.title || null,
        sku: it?.seller_sku || it?.catalog_product_id || null,
        condition: it?.condition || null,
        status: it?.status || null,
        price: typeof it?.price === "number" ? it.price : (Number(it?.price) || null),
        available_quantity: typeof it?.available_quantity === "number" ? it.available_quantity : null,
        sold_quantity: typeof it?.sold_quantity === "number" ? it.sold_quantity : null,
        category_id: it?.category_id || null,
        permalink: it?.permalink || null,
        attributes,
        variations: Array.isArray(it?.variations) ? it.variations : null,
        pictures,
        tags: Array.isArray(it?.tags) ? it.tags : null,
        seller_id: it?.seller?.id ? String(it.seller.id) : String(sellerId),
        data: it || null,
        published_at: it?.stop_time ? null : (it?.date_created ? it.date_created : null),
        last_synced_at: nowIso,
        updated_at: nowIso,
      };
    });

    // Upsert into marketplace_items
    const { error: upErr } = await admin
      .from("marketplace_items")
      .upsert(upserts, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
    if (upErr) return jsonResponse({ error: upErr.message }, 500);

    return jsonResponse({ ok: true, synced: upserts.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});