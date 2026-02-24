import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString, checkAndRefreshToken, b64ToUint8 } from "../_shared/adapters/token-utils.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ error: "Missing service configuration" }, 500);

  try {
    const rid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let parsed: any = {};
    try { parsed = await req.json(); } catch { parsed = {}; }
    const organizationId: string | undefined = parsed?.organizationId;
    const integrationId: string | undefined = parsed?.integrationId;
    const payload: any = parsed?.payload || {};
    const description: any = parsed?.description || {};
    const sellerShippingPreferences: any = parsed?.seller_shipping_preferences || null;
    const uploadVariationFiles: any[] = Array.isArray(parsed?.upload_variation_files) ? parsed.upload_variation_files : [];
    if (!organizationId) return jsonResponse({ error: "organizationId required", rid }, 400);

    const admin = createAdminClient();
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

    let accessToken: string | null = null;
    const initial = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
    if (initial.success && initial.accessToken) {
      accessToken = initial.accessToken;
    } else {
      try {
        accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token);
      } catch (e) {
        const raw = integration.access_token;
        if (typeof raw === "string" && !raw.startsWith("enc:")) accessToken = raw; else return jsonResponse({ error: `Failed to decrypt access token: ${String(e)}`, rid }, 500);
      }
    }

    const buildHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "content-type": "application/json", Accept: "application/json" });
    let variationPictureIds: string[][] = [];
    if (Array.isArray(uploadVariationFiles) && uploadVariationFiles.length > 0) {
      for (const filesArr of uploadVariationFiles) {
        const ids: string[] = [];
        const arr = Array.isArray(filesArr) ? filesArr : [];
        for (const f of arr) {
          try {
            const fileBytes = b64ToUint8(String(f?.data_b64 || ""));
            const file = new File([fileBytes], String(f?.filename || "image.jpg"), { type: String(f?.type || "image/jpeg") });
            const fd = new FormData();
            fd.append("file", file);
            let upResp = await fetch("https://api.mercadolibre.com/pictures/items/upload", { method: "POST", headers: { Authorization: `Bearer ${String(accessToken)}` }, body: fd });
            let upJson = await upResp.json();
            if (!upResp.ok && (upResp.status === 401 || upResp.status === 403)) {
              const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
              if (refreshed.success && refreshed.accessToken) {
                upResp = await fetch("https://api.mercadolibre.com/pictures/items/upload", { method: "POST", headers: { Authorization: `Bearer ${refreshed.accessToken}` }, body: fd });
                upJson = await upResp.json();
              }
            }
            const picId = upJson?.id ? String(upJson.id) : null;
            if (picId) ids.push(picId);
          } catch (_) {}
          if (ids.length >= 10) break;
        }
        variationPictureIds.push(ids);
      }
    }

    try {
      if (Array.isArray(payload?.variations) && payload.variations.length > 0 && Array.isArray(variationPictureIds) && variationPictureIds.length > 0) {
        for (let i = 0; i < payload.variations.length && i < variationPictureIds.length; i++) {
          const pics = Array.isArray(variationPictureIds[i]) ? variationPictureIds[i].slice(0, 10) : [];
          if (pics.length > 0) payload.variations[i].picture_ids = pics;
        }
      }
    } catch (_) {}
    try {
      const hasPictures = Array.isArray(payload?.pictures) && payload.pictures.length > 0;
      if (!hasPictures && Array.isArray(variationPictureIds) && variationPictureIds.length > 0) {
        const allIdsPre = Array.from(new Set(variationPictureIds.flat().filter(Boolean)));
        if (allIdsPre.length > 0) {
          payload.pictures = allIdsPre.slice(0, 6).map((id) => ({ id }));
        }
      }
    } catch (_) {}

    try {
      if (Array.isArray(payload?.variations)) {
        for (let i = 0; i < payload.variations.length; i++) {
          const v = payload.variations[i] || {};
          const gtin = String(v?.gtin || "").trim();
          if (gtin) {
            const baseAttrs = Array.isArray(v?.attributes) ? (v.attributes as any[]).filter((a: any) => String(a?.id || "").toUpperCase() !== "GTIN") : [];
            payload.variations[i].attributes = [ ...baseAttrs, { id: "GTIN", value_name: gtin } ];
            delete payload.variations[i].gtin;
          }
          const combos = Array.isArray(v?.attribute_combinations) ? (v.attribute_combinations as any[]) : [];
          payload.variations[i].attribute_combinations = combos.filter((c: any) => {
            const id = String(c?.id || "").toUpperCase();
            return id !== "GTIN" && id !== "SELLER_SKU";
          });
        }
      }
    } catch (_) {}

    let createResp = await fetch("https://api.mercadolibre.com/items", { method: "POST", headers: buildHeaders(String(accessToken)), body: JSON.stringify(payload || {}) });
    let createJson = await createResp.json();
    if (!createResp.ok && (createResp.status === 401 || createResp.status === 403)) {
      const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
      if (refreshed.success && refreshed.accessToken) {
        createResp = await fetch("https://api.mercadolibre.com/items", { method: "POST", headers: buildHeaders(refreshed.accessToken), body: JSON.stringify(payload || {}) });
        createJson = await createResp.json();
      }
    }
    if (!createResp.ok) return jsonResponse({ error: "Failed to publish item", rid, meli: createJson }, createResp.status || 400);

    const itemId = createJson?.id as string;
    if (itemId && Array.isArray(variationPictureIds) && variationPictureIds.length > 0) {
      const allIds = Array.from(new Set(variationPictureIds.flat().filter(Boolean)));
      for (const id of allIds) {
        try {
          await fetch(`https://api.mercadolibre.com/items/${itemId}/pictures`, { method: "POST", headers: buildHeaders(String(accessToken)), body: JSON.stringify({ id }) });
        } catch (_) {}
      }
      const createdVars = Array.isArray(createJson?.variations) ? createJson.variations : [];
      const varUpdates: any[] = [];
      for (let i = 0; i < variationPictureIds.length && i < createdVars.length; i++) {
        const pics = Array.isArray(variationPictureIds[i]) ? variationPictureIds[i] : [];
        const vid = createdVars[i]?.id ? String(createdVars[i].id) : null;
        if (vid && pics.length > 0) varUpdates.push({ id: vid, picture_ids: pics });
      }
      if (varUpdates.length > 0) {
        try {
          await fetch(`https://api.mercadolibre.com/global/items/${itemId}`, { method: "PUT", headers: buildHeaders(String(accessToken)), body: JSON.stringify({ variations: varUpdates }) });
        } catch (_) {}
      }
    }
    let descResult: any = null;
    if (itemId && description && description.plain_text) {
      const descResp = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ plain_text: description.plain_text }),
      });
      descResult = await descResp.json();
    }

    let flexAction: string | null = null;
    let flexError: any = null;
    try {
      const preferFlex = !!(sellerShippingPreferences && sellerShippingPreferences.prefer_flex === true);
      const siteId = String(payload?.site_id || createJson?.site_id || "");
      const categoryId = String(payload?.category_id || createJson?.category_id || "");
      if (itemId && siteId) {
        let allowedSelfService = false;
        if (categoryId) {
          try {
            let catResp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/shipping_preferences`, { headers: { Authorization: `Bearer ${String(accessToken)}`, Accept: "application/json" } });
            let catJson: any = null; try { catJson = await catResp.json(); } catch { catJson = {}; }
            if (!catResp.ok && (catResp.status === 401 || catResp.status === 403)) {
              const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
              if (refreshed.success && refreshed.accessToken) {
                catResp = await fetch(`https://api.mercadolibre.com/categories/${categoryId}/shipping_preferences`, { headers: { Authorization: `Bearer ${refreshed.accessToken}`, Accept: "application/json" } });
                try { catJson = await catResp.json(); } catch { catJson = {}; }
              }
            }
            const logisticsArr = Array.isArray(catJson?.logistics) ? catJson.logistics : [];
            const typesSet = new Set<string>((logisticsArr.flatMap((e: any) => Array.isArray(e?.types) ? e.types : []) || []).map((t: any) => String(t?.type || t)));
            allowedSelfService = typesSet.has("self_service");
          } catch {}
        }
        let hasFlex = false;
        try {
          let chkResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { headers: { Authorization: `Bearer ${String(accessToken)}`, Accept: "application/json" } });
          let chkJson: any = null; try { chkJson = await chkResp.json(); } catch { chkJson = {}; }
          if (!chkResp.ok && (chkResp.status === 401 || chkResp.status === 403)) {
            const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
            if (refreshed.success && refreshed.accessToken) {
              chkResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { headers: { Authorization: `Bearer ${refreshed.accessToken}`, Accept: "application/json" } });
              try { chkJson = await chkResp.json(); } catch { chkJson = {}; }
            }
          }
          hasFlex = !!chkJson?.has_flex;
        } catch {}
        if (preferFlex && allowedSelfService) {
          if (!hasFlex) {
            try {
              let actResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { method: "POST", headers: { Authorization: `Bearer ${String(accessToken)}` } });
              if (!actResp.ok && (actResp.status === 401 || actResp.status === 403)) {
                const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
                if (refreshed.success && refreshed.accessToken) {
                  actResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { method: "POST", headers: { Authorization: `Bearer ${refreshed.accessToken}` } });
                }
              }
              if (actResp.status === 204) flexAction = "enabled"; else { flexError = { status: actResp.status }; }
            } catch (e) { flexError = String(e); }
          } else {
            flexAction = "enabled";
          }
        } else {
          if (hasFlex) {
            try {
              let delResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { method: "DELETE", headers: { Authorization: `Bearer ${String(accessToken)}` } });
              if (!delResp.ok && (delResp.status === 401 || delResp.status === 403)) {
                const refreshed = await checkAndRefreshToken(admin as any, aesKey, String(integration.id));
                if (refreshed.success && refreshed.accessToken) {
                  delResp = await fetch(`https://api.mercadolibre.com/flex/sites/${siteId}/items/${itemId}/v2`, { method: "DELETE", headers: { Authorization: `Bearer ${refreshed.accessToken}` } });
                }
              }
              if (delResp.status === 204) flexAction = "disabled"; else { flexError = { status: delResp.status }; }
            } catch (e) { flexError = String(e); }
          } else {
            flexAction = "disabled";
          }
        }
      }
    } catch (e) { flexError = String(e); }

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

    return jsonResponse({ ok: true, item_id: itemId, permalink: createJson?.permalink || null, description_result: descResult || null, flex_action: flexAction, flex_error: flexError, rid }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
