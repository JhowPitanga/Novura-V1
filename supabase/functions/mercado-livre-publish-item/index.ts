import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { importAesGcmKey, aesGcmDecryptFromString } from "../_shared/token-utils.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse(null, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let parsed: any = {};
    try { parsed = await req.json(); } catch { parsed = {}; }
    const organizationId: string | undefined = parsed?.organizationId;
    const integrationId: string | undefined = parsed?.integrationId;
    const payload: any = parsed?.payload || {};
    const description: any = parsed?.description || {};
    if (!organizationId) return jsonResponse({ error: "organizationId required", rid }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const aesKey = await importAesGcmKey(ENC_KEY_B64);

    let integration: any = null;
    if (integrationId) {
      const { data, error } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
        .eq("id", integrationId)
        .single();
      if (error || !data) return jsonResponse({ error: error?.message || "Integration not found", rid }, 404);
      integration = data;
    } else {
      const { data, error } = await admin
        .from("marketplace_integrations")
        .select("id, organizations_id, company_id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", "Mercado Livre")
        .order("expires_in", { ascending: false })
        .limit(1)
        .single();
      if (error || !data) return jsonResponse({ error: error?.message || "Integration not found", rid }, 404);
      integration = data;
    }

    let accessToken: string;
    try {
      accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
    } catch (e) {
      const raw = integration.access_token;
      if (typeof raw === "string" && !raw.startsWith("enc:")) accessToken = raw; else return jsonResponse({ error: `Failed to decrypt access token: ${String(e)}`, rid }, 500);
    }

    const createResp = await fetch("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const createJson = await createResp.json();
    if (!createResp.ok) return jsonResponse({ error: "Failed to publish item", rid, meli: createJson }, 200);

    const itemId = createJson?.id as string;
    let descResult: any = null;
    if (itemId && description && description.plain_text) {
      const descResp = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ plain_text: description.plain_text }),
      });
      descResult = await descResp.json();
    }

    const nowIso = new Date().toISOString();
    const upsertData = {
      organizations_id: integration.organizations_id,
      company_id: integration.company_id,
      marketplace_name: "Mercado Livre",
      marketplace_item_id: itemId,
      title: createJson?.title || payload?.title || null,
      sku: createJson?.seller_custom_field || null,
      condition: createJson?.condition || null,
      status: createJson?.status || null,
      price: typeof createJson?.price === "number" ? createJson?.price : (Number(payload?.price) || null),
      available_quantity: typeof createJson?.available_quantity === "number" ? createJson?.available_quantity : null,
      category_id: createJson?.category_id || payload?.category_id || null,
      permalink: createJson?.permalink || null,
      attributes: Array.isArray(createJson?.attributes) ? createJson?.attributes : (Array.isArray(payload?.attributes) ? payload?.attributes : []),
      variations: Array.isArray(createJson?.variations) ? createJson?.variations : (Array.isArray(payload?.variations) ? payload?.variations : null),
      pictures: Array.isArray(createJson?.pictures) ? createJson?.pictures : (Array.isArray(payload?.pictures) ? payload?.pictures : []),
      tags: Array.isArray(createJson?.tags) ? createJson?.tags : null,
      seller_id: String(integration.meli_user_id || ""),
      data: createJson,
      published_at: createJson?.date_created || nowIso,
      last_synced_at: nowIso,
      updated_at: nowIso,
    };
    await admin.from("marketplace_items").upsert(upsertData, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });

    if (description && description.plain_text) {
      await admin.from("marketplace_item_descriptions").upsert({
        organizations_id: integration.organizations_id,
        company_id: integration.company_id,
        marketplace_name: "Mercado Livre",
        marketplace_item_id: itemId,
        plain_text: String(description.plain_text || ""),
        last_updated: nowIso,
      }, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
    }

    return jsonResponse({ ok: true, item_id: itemId, permalink: createJson?.permalink || null, description_result: descResult || null, rid }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});