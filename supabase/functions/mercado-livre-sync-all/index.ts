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

function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64Key: string): Promise<CryptoKey> { const keyBytes = b64ToUint8(base64Key); return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]); }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

// This function runs with verify_jwt disabled via config.toml and is intended for scheduled execution.
serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) {
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  // Optional: allow siteId override; default MLB
  let siteId = "MLB";
  try {
    const body = await req.json();
    if (typeof body?.siteId === "string" && body.siteId.length > 0) siteId = body.siteId;
  } catch { /* no body provided */ }

  try {
    // Fetch all enabled Mercado Livre integrations
    const { data: integrations, error: iErr } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, company_id, marketplace_name, meli_user_id, access_token, enabled")
      .eq("marketplace_name", "Mercado Livre")
      .eq("enabled", true);
    if (iErr) return jsonResponse({ error: iErr.message }, 500);

    let totalSynced = 0;

    for (const integ of integrations || []) {
      try {
        if (!integ?.organizations_id || !integ?.company_id || !integ?.meli_user_id) continue;
        const accessToken = await aesGcmDecryptFromString(aesKey, String(integ.access_token));
        const sellerId = String(integ.meli_user_id);

        const items: any[] = [];
        let offset = 0;
        const limit = 50;
        for (let page = 0; page < 200; page++) {
          const url = new URL(`https://api.mercadolibre.com/sites/${siteId}/search`);
          url.searchParams.set("seller_id", sellerId);
          url.searchParams.set("offset", String(offset));
          url.searchParams.set("limit", String(limit));
          const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
          const json = await resp.json();
          if (!resp.ok) throw new Error(json?.error || json?.message || `Failed to fetch items (${resp.status})`);
          const batch = Array.isArray(json?.results) ? json.results : [];
          items.push(...batch);
          const total = Number(json?.paging?.total || 0);
          offset += batch.length;
          if (offset >= total || batch.length === 0) break;
        }

        const nowIso = new Date().toISOString();
        const upserts = items.map((it) => ({
          organizations_id: integ.organizations_id,
          company_id: integ.company_id,
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
          attributes: Array.isArray(it?.attributes) ? it.attributes : [],
          variations: Array.isArray(it?.variations) ? it.variations : null,
          pictures: it?.thumbnail ? [it.thumbnail] : (Array.isArray(it?.pictures) ? it.pictures : []),
          tags: Array.isArray(it?.tags) ? it.tags : null,
          seller_id: it?.seller?.id ? String(it.seller.id) : sellerId,
          data: it || null,
          published_at: it?.stop_time ? null : (it?.date_created ? it.date_created : null),
          last_synced_at: nowIso,
          updated_at: nowIso,
        }));

        const { error: upErr } = await admin
          .from("marketplace_items")
          .upsert(upserts, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
        if (upErr) throw new Error(upErr.message);
        totalSynced += upserts.length;
      } catch (e) {
        console.error("Failed to sync integration", integ?.id, e);
        // Continue with next integration; collect minimal error info
      }
    }

    return jsonResponse({ ok: true, synced: totalSynced });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});