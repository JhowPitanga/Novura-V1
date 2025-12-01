import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function strToUint8(str: string): Uint8Array { return new TextEncoder().encode(str); }
function uint8ToB64(bytes: Uint8Array): string { const bin = Array.from(bytes).map((b) => String.fromCharCode(b)).join(""); return btoa(bin); }
function b64ToUint8(b64: string): Uint8Array { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }
async function importAesGcmKey(base64OrHexKey: string): Promise<CryptoKey> {
  const cleaned = base64OrHexKey.trim().replace(/^0x/i, "").replace(/[\s-]/g, "");
  let keyBytes: Uint8Array | null = null;
  try {
    const b64Bytes = b64ToUint8(cleaned);
    if (b64Bytes.length === 16 || b64Bytes.length === 24 || b64Bytes.length === 32) keyBytes = b64Bytes; else keyBytes = null;
  } catch { keyBytes = null; }
  if (!keyBytes) {
    const isHex = /^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0;
    if (!isHex) throw new Error("Invalid key format");
    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
    if (!(bytes.length === 16 || bytes.length === 24 || bytes.length === 32)) throw new Error("Invalid key length");
    keyBytes = bytes;
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt","decrypt"]);
}
async function aesGcmEncryptToString(key: CryptoKey, plaintext: string): Promise<string> { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToUint8(plaintext)); const ctBytes = new Uint8Array(ct); return `enc:gcm:${uint8ToB64(iv)}:${uint8ToB64(ctBytes)}`; }
async function aesGcmDecryptFromString(key: CryptoKey, encStr: string): Promise<string> { const parts = encStr.split(":"); if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "gcm") throw new Error("Invalid token format"); const iv = b64ToUint8(parts[2]); const ct = b64ToUint8(parts[3]); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct); return new TextDecoder().decode(pt); }

type SupabaseAdmin = ReturnType<typeof createClient>;
async function checkAndRefreshToken(admin: SupabaseAdmin, aesKey: CryptoKey, integrationId: string): Promise<{ success: boolean; accessToken?: string; error?: string; details?: any; }>{
  try {
    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
      .eq("id", integrationId)
      .single();
    if (integErr || !integration) return { success: false, error: "Integration not found" };
    const now = new Date(); const expiresAt = new Date(integration.expires_in); const isExpired = now >= expiresAt;
    if (!isExpired) { try { const accessToken = await aesGcmDecryptFromString(aesKey, integration.access_token); return { success: true, accessToken }; } catch (e) { return { success: false, error: `Failed to decrypt access token: ${e}` }; } }
    const { data: appRow, error: appErr } = await admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", integration.marketplace_name === "mercado_livre" ? "Mercado Livre" : integration.marketplace_name)
      .single();
    if (appErr || !appRow) return { success: false, error: "App credentials not found for token refresh" };
    let refreshTokenPlain: string; try { refreshTokenPlain = await aesGcmDecryptFromString(aesKey, integration.refresh_token); } catch (e) { return { success: false, error: `Failed to decrypt refresh token: ${e}` }; }
    const form = new URLSearchParams(); form.append("grant_type", "refresh_token"); form.append("client_id", appRow.client_id); form.append("client_secret", appRow.client_secret); form.append("refresh_token", refreshTokenPlain);
    const refreshResp = await fetch("https://api.mercadolibre.com/oauth/token", { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: form.toString() });
    const refreshJson = await refreshResp.json();
    if (!refreshResp.ok) return { success: false, error: "Token refresh failed", details: { meli: refreshJson, original_error: "Token expired and refresh failed" } };
    const { access_token: newAccessToken, refresh_token: newRefreshToken, expires_in, user_id } = refreshJson; const newExpiresAtIso = new Date(Date.now() + (Number(expires_in) || 0) * 1000).toISOString();
    const newAccessTokenEnc = await aesGcmEncryptToString(aesKey, newAccessToken); const newRefreshTokenEnc = await aesGcmEncryptToString(aesKey, newRefreshToken);
    const { error: updErr } = await admin
      .from("marketplace_integrations")
      .update({ access_token: newAccessTokenEnc, refresh_token: newRefreshTokenEnc, expires_in: newExpiresAtIso, meli_user_id: user_id })
      .eq("id", integrationId);
    if (updErr) return { success: false, error: `Failed to save refreshed tokens: ${updErr.message}` };
    return { success: true, accessToken: newAccessToken };
  } catch (e) { const message = e instanceof Error ? e.message : "Unknown error"; return { success: false, error: message }; }
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-credentials": "true",
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
    const uploadVariationFiles: any[] = Array.isArray(parsed?.upload_variation_files) ? parsed.upload_variation_files : [];
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

    // Se houver variações e exigência da categoria, injeta picture_ids por variação ANTES de criar o item
    try {
      if (Array.isArray(payload?.variations) && payload.variations.length > 0 && Array.isArray(variationPictureIds) && variationPictureIds.length > 0) {
        for (let i = 0; i < payload.variations.length && i < variationPictureIds.length; i++) {
          const pics = Array.isArray(variationPictureIds[i]) ? variationPictureIds[i].slice(0, 10) : [];
          if (pics.length > 0) payload.variations[i].picture_ids = pics;
        }
      }
    } catch (_) {}
    // Se não há fotos globais no payload, usa os IDs pré-enviados para compor pictures
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
