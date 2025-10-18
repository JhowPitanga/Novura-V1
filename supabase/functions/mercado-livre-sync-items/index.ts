// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

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

    const { organizationId, siteId = "MLB" } = await req.json();
    if (!organizationId) return jsonResponse({ error: "Missing organizationId" }, 400);

    // Validate that the user belongs to the organization (only when ANON_KEY is available)
    let allowed = true;
    if (ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: myOrgs, error: orgErr } = await userClient.rpc("get_my_organizations");
      if (orgErr) return jsonResponse({ error: orgErr.message }, 500);
      allowed = (myOrgs || []).some((o: any) => o.id === organizationId);
      if (!allowed) return jsonResponse({ error: "Forbidden: You don't belong to this organization" }, 403);
    }

    // Resolve company by organization
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("id")
      .eq("organization_id", organizationId)
      .limit(1)
      .single();
    if (companyErr || !company?.id) return jsonResponse({ error: companyErr?.message || "Company not found" }, 404);

    // Get integration for Mercado Livre in this org
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, expires_in, meli_user_id, marketplace_name, organizations_id, company_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

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
      const url = new URL(`https://api.mercadolibre.com/sites/${siteId}/search`);
      url.searchParams.set("seller_id", String(sellerId));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("limit", String(limit));

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
      const json = await resp.json();
      if (!resp.ok) return jsonResponse({ error: json?.error || json?.message || "Failed to fetch items", details: json }, resp.status);

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
        organizations_id: organizationId,
        company_id: company.id,
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