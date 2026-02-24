// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { importAesGcmKey, aesGcmDecryptFromString, checkAndRefreshToken } from "../_shared/adapters/token-utils.ts";

type Pic = string | { source?: string; url?: string };
type Updates = {
  title?: string;
  price?: number | string;
  available_quantity?: number | string;
  pictures?: Pic[];
  video_id?: string | number;
  video?: string | number;
  shipping?: Record<string, unknown>;
  variations?: Array<Record<string, unknown>>;
  attributes?: Array<Record<string, unknown>>;
  sale_terms?: Array<Record<string, unknown>>;
  description?: { plain_text?: string; text?: string; html?: string };
  listing_type_id?: string;
};

function toNumberBRL(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return Number(v);
  let s = v.trim();
  s = s.replace(/\s+/g, "");
  s = s.replace(/^(?:BRL|R\$)/i, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "");
    s = s.replace(/,/g, ".");
  } else if (hasComma && !hasDot) {
    s = s.replace(/,/g, ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) s = parts.join("");
  }
  s = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") || "";
    const admin = createAdminClient();

    const bodyText = await req.text();
    let body: { organizationId?: string; itemId?: string; updates?: Updates } = {};
    try { body = JSON.parse(bodyText) as { organizationId?: string; itemId?: string; updates?: Updates }; } catch (_) { body = {}; }

    const organizationId = String(body?.organizationId || "").trim();
    const itemId = String(body?.itemId || "").trim();
    const updates: Updates = (body?.updates as Updates) || {};
    if (!organizationId || !itemId || !updates || typeof updates !== "object") {
      return jsonResponse({ error: "Missing params" }, 400);
    }

    const { data: integration, error: integErr } = await admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, marketplace_name, organizations_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .single();
    if (integErr || !integration) return jsonResponse({ error: integErr?.message || "Integration not found" }, 404);

    let accessTokenPlain = String(integration.access_token || "");
    let aesKey: CryptoKey | null = null;
    if (ENC_KEY_B64) {
      try { aesKey = await importAesGcmKey(ENC_KEY_B64); } catch (_) { aesKey = null; }
    }
    if (aesKey) {
      try {
        accessTokenPlain = await aesGcmDecryptFromString(aesKey, accessTokenPlain);
      } catch (_) {
        if (!accessTokenPlain.startsWith("enc:")) accessTokenPlain = String(integration.access_token || "");
      }
    }

    const headersBase = { Authorization: `Bearer ${accessTokenPlain}`, Accept: "application/json" };

    const mlPayload: Record<string, unknown> = {};
    if (updates.title != null) mlPayload.title = String(updates.title);
    if (updates.price != null) mlPayload.price = toNumberBRL(updates.price);
    if (updates.available_quantity != null) mlPayload.available_quantity = Math.max(0, Number(updates.available_quantity) || 0);
    if (updates.pictures && Array.isArray(updates.pictures)) {
      mlPayload.pictures = updates.pictures.map((u) => typeof u === "string" ? { source: u } : u);
    }
    if (updates.video_id != null || updates.video != null) {
      const vidRaw = updates.video_id ?? updates.video;
      if (vidRaw != null) mlPayload.video_id = String(vidRaw);
    }
    if (updates.shipping && typeof updates.shipping === "object") mlPayload.shipping = updates.shipping;
    if (updates.variations && Array.isArray(updates.variations)) mlPayload.variations = updates.variations;
    if (updates.attributes && Array.isArray(updates.attributes)) mlPayload.attributes = updates.attributes;
    if (updates.sale_terms && Array.isArray(updates.sale_terms)) mlPayload.sale_terms = updates.sale_terms;

    let mlResp: Response | null = null;
    let mlJson: unknown = null;
    if (Object.keys(mlPayload).length > 0) {
      const url = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}`;
      mlResp = await fetch(url, { method: "PUT", headers: { ...headersBase, "content-type": "application/json" }, body: JSON.stringify(mlPayload) });
      mlJson = await mlResp.json().catch(() => null) as unknown;
      if (mlResp.status === 401 || mlResp.status === 403) {
        if (aesKey) {
          const refreshRes = await checkAndRefreshToken(admin, aesKey, integration.id);
          if (refreshRes.success && refreshRes.accessToken) {
            const headersRetry = { Authorization: `Bearer ${refreshRes.accessToken}`, Accept: "application/json", "content-type": "application/json" };
            mlResp = await fetch(url, { method: "PUT", headers: headersRetry, body: JSON.stringify(mlPayload) });
            mlJson = await mlResp.json().catch(() => null) as unknown;
            accessTokenPlain = refreshRes.accessToken;
          }
        }
      }
      if (!mlResp.ok) return jsonResponse({ error: "ML update failed", details: mlJson }, mlResp.status);
    }

    const listingTypeId = typeof (updates as any)?.listing_type_id === "string" ? String((updates as any).listing_type_id) : "";
    if (listingTypeId) {
      let currentLt = "";
      try {
        const { data: itemRow } = await admin
          .from("marketplace_items_unified")
          .select("listing_type_id")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", itemId)
          .single();
        currentLt = String((itemRow as any)?.listing_type_id || "");
      } catch (_) {
        currentLt = "";
      }

      if (!(currentLt && currentLt === listingTypeId)) {
        const upUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/available_upgrades`;
        const downUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/available_downgrades`;
        let upResp = await fetch(upUrl, { method: "GET", headers: { ...headersBase } });
        let upJson: unknown = await upResp.json().catch(() => []) as unknown;
        if (upResp.status === 401 || upResp.status === 403) {
          if (aesKey) {
            const refreshRes = await checkAndRefreshToken(admin, aesKey, integration.id);
            if (refreshRes.success && refreshRes.accessToken) {
              upResp = await fetch(upUrl, { method: "GET", headers: { Authorization: `Bearer ${refreshRes.accessToken}`, Accept: "application/json" } });
              upJson = await upResp.json().catch(() => []) as unknown;
              accessTokenPlain = refreshRes.accessToken;
            }
          }
        }

        let downResp = await fetch(downUrl, { method: "GET", headers: { Authorization: `Bearer ${accessTokenPlain}`, Accept: "application/json" } });
        let downJson: unknown = await downResp.json().catch(() => []) as unknown;
        if (downResp.status === 401 || downResp.status === 403) {
          if (aesKey) {
            const refreshRes = await checkAndRefreshToken(admin, aesKey, integration.id);
            if (refreshRes.success && refreshRes.accessToken) {
              downResp = await fetch(downUrl, { method: "GET", headers: { Authorization: `Bearer ${refreshRes.accessToken}`, Accept: "application/json" } });
              downJson = await downResp.json().catch(() => []) as unknown;
              accessTokenPlain = refreshRes.accessToken;
            }
          }
        }

        const arrUp = Array.isArray(upJson) ? upJson as Array<Record<string, unknown>> : [];
        const arrDown = Array.isArray(downJson) ? downJson as Array<Record<string, unknown>> : [];
        const canUpgrade = arrUp.some((x) => String((x as any)?.id || "") === listingTypeId);
        const canDowngrade = arrDown.some((x) => String((x as any)?.id || "") === listingTypeId);
        const pair = new Set(["gold_special", "gold_pro"]);
        const allowPairToggle = pair.has(listingTypeId) && pair.has(currentLt);
        if (!canUpgrade && !canDowngrade && !allowPairToggle) {
          return jsonResponse({ error: "Listing type change not available", details: { requested: listingTypeId, available_upgrades: arrUp, available_downgrades: arrDown, current: currentLt } }, 400);
        }
      }

      const ltUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/listing_type`;
      let ltResp = await fetch(ltUrl, { method: "POST", headers: { Authorization: `Bearer ${accessTokenPlain}`, Accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ id: listingTypeId }) });
      let ltJson: unknown = await ltResp.json().catch(() => null) as unknown;
      if (ltResp.status === 401 || ltResp.status === 403) {
        if (aesKey) {
          const refreshRes = await checkAndRefreshToken(admin, aesKey, integration.id);
          if (refreshRes.success && refreshRes.accessToken) {
            ltResp = await fetch(ltUrl, { method: "POST", headers: { Authorization: `Bearer ${refreshRes.accessToken}`, Accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ id: listingTypeId }) });
            ltJson = await ltResp.json().catch(() => null) as unknown;
            accessTokenPlain = refreshRes.accessToken;
          }
        }
      }
      if (!ltResp.ok) return jsonResponse({ error: "ML listing_type update failed", details: ltJson }, ltResp.status);
    }

    if (updates.description && typeof updates.description === "object") {
      const descPayload: { plain_text?: string; text?: string; html?: string } = {};
      if (updates.description.plain_text != null) descPayload.plain_text = String(updates.description.plain_text);
      if (updates.description.text != null) descPayload.text = String(updates.description.text);
      if (updates.description.html != null) descPayload.html = String(updates.description.html);
      const dUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/description`;
      let dResp = await fetch(dUrl, { method: "PUT", headers: { ...headersBase, "content-type": "application/json" }, body: JSON.stringify(descPayload) });
      let dJson: unknown = await dResp.json().catch(() => null) as unknown;
      if (dResp.status === 401 || dResp.status === 403) {
        if (aesKey) {
          const refreshRes = await checkAndRefreshToken(admin, aesKey, integration.id);
          if (refreshRes.success && refreshRes.accessToken) {
            dResp = await fetch(dUrl, { method: "PUT", headers: { Authorization: `Bearer ${refreshRes.accessToken}`, Accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(descPayload) });
            dJson = await dResp.json().catch(() => null) as unknown;
            accessTokenPlain = refreshRes.accessToken;
          }
        }
      }
      if (!dResp.ok) return jsonResponse({ error: "ML description update failed", details: dJson }, dResp.status);
      const nowIso = new Date().toISOString();
      const { error: upErr } = await admin
        .from("marketplace_item_descriptions")
        .upsert({ organizations_id: organizationId, marketplace_name: "Mercado Livre", marketplace_item_id: itemId, plain_text: String(descPayload.plain_text || descPayload.text || ""), html: descPayload.html || null, last_updated: nowIso, updated_at: nowIso }, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
      if (upErr) return jsonResponse({ error: upErr.message }, 500);

      try {
        const { data: rawRow } = await admin
          .from("marketplace_items_raw")
          .select("data")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", itemId)
          .single();
        const curRaw = (rawRow && typeof (rawRow as any)?.data === "object") ? ((rawRow as any).data as Record<string, unknown>) : {};
        const newRaw = { ...curRaw, description_plain_text: String(descPayload.plain_text || descPayload.text || ""), description_html: descPayload.html || null, last_description_update: nowIso } as Record<string, unknown>;
        const { error: rawErr } = await admin
          .from("marketplace_items_raw")
          .update({ data: newRaw, updated_at: nowIso })
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", itemId);
        if (rawErr) return jsonResponse({ error: rawErr.message }, 500);
      } catch {}
    }

    const nowIso = new Date().toISOString();
    let baseRaw: Record<string, unknown> = {};
    try {
      const { data: rawRow } = await admin
        .from("marketplace_items_raw")
        .select("data")
        .eq("organizations_id", organizationId)
        .eq("marketplace_name", "Mercado Livre")
        .eq("marketplace_item_id", itemId)
        .single();
      baseRaw = (rawRow && typeof (rawRow as any)?.data === "object") ? ((rawRow as any).data as Record<string, unknown>) : {};
    } catch {}

    const merged: Record<string, unknown> = { ...baseRaw };
    if (mlPayload.title != null) merged.title = mlPayload.title;
    if (mlPayload.available_quantity != null) merged.available_quantity = mlPayload.available_quantity;
    if (mlPayload.pictures != null) {
      const arr = Array.isArray(mlPayload.pictures) ? (mlPayload.pictures as Pic[]) : [];
      merged.pictures = arr.map((p) => typeof p === "string" ? { source: p } : p);
    }
    if (mlPayload.shipping != null) merged.shipping = mlPayload.shipping;
    if (mlPayload.variations != null) merged.variations = mlPayload.variations;
    if (mlPayload.attributes != null) merged.attributes = mlPayload.attributes;
    if ((updates as any)?.video_id != null || (updates as any)?.video != null) merged.video_id = String((updates as any)?.video_id ?? (updates as any)?.video);
    if (mlPayload.price != null) merged.price = mlPayload.price;

    const { error: rawUpdErr } = await admin
      .from("marketplace_items_raw")
      .update({ data: merged, updated_at: nowIso })
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", "Mercado Livre")
      .eq("marketplace_item_id", itemId);
    if (rawUpdErr) return jsonResponse({ error: rawUpdErr.message }, 500);

    if (typeof mlPayload.price === "number") {
      const { error: priceErr } = await admin
        .from("marketplace_item_prices")
        .upsert({ organizations_id: organizationId, marketplace_name: "Mercado Livre", marketplace_item_id: itemId, sale_price_amount: mlPayload.price as number, updated_at: nowIso }, { onConflict: "organizations_id,marketplace_name,marketplace_item_id" });
      if (priceErr) return jsonResponse({ error: priceErr.message }, 500);
    }

    if (listingTypeId) {
      try {
        const { data: rawRow } = await admin
          .from("marketplace_items_raw")
          .select("data")
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", itemId)
          .single();
        const curRaw = (rawRow && typeof (rawRow as any)?.data === "object") ? ((rawRow as any).data as Record<string, unknown>) : {};
        const newRaw = { ...curRaw, listing_type_id: listingTypeId } as Record<string, unknown>;
        const { error: rawErr } = await admin
          .from("marketplace_items_raw")
          .update({ data: newRaw, updated_at: nowIso })
          .eq("organizations_id", organizationId)
          .eq("marketplace_name", "Mercado Livre")
          .eq("marketplace_item_id", itemId);
        if (rawErr) return jsonResponse({ error: rawErr.message }, 500);
      } catch {}
    }

    return jsonResponse({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
