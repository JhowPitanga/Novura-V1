import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/infra/object-utils.ts";
import { importAesGcmKey, tryDecryptToken, hmacSha256Hex } from "../_shared/adapters/infra/token-utils.ts";

// ─── Shopee API constants ─────────────────────────────────────────────────────

const SHOPEE_HOST = "https://openplatform.shopee.com.br";
const UPDATE_ITEM_PATH = "/api/v2/product/update_item";
const UPDATE_MODEL_PATH = "/api/v2/product/update_model";
const UPDATE_STOCK_PATH = "/api/v2/product/update_stock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function arr(v: unknown): any[] {
  return Array.isArray(v) ? (v as any[]) : [];
}

function buildShopeeSignature(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken: string, shopId: number): string {
  const base = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return hmacSha256Hex(partnerKey, base);
}

async function shopeePost(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) return jsonResponse({ ok: false, error: "Missing service configuration" }, 200);

  const admin = createAdminClient() as any;
  const aesKey = await importAesGcmKey(ENC_KEY_B64);

  const correlationId = req.headers.get("x-request-id") || crypto.randomUUID();

  let body: Record<string, unknown> = {};
  try { body = JSON.parse(await req.text()); } catch (_) { /**/ }

  const organizationId = getStr(body, ["organizationId"]) || undefined;
  const itemIdStr = getStr(body, ["itemId"]) || getStr(body, ["item_id"]) || null;
  if (!itemIdStr || !/^\d+$/.test(itemIdStr)) {
    return jsonResponse({ ok: false, error: "Missing or invalid itemId", correlationId }, 200);
  }
  const itemId = Number(itemIdStr);

  // The updates patch — keys from NormalizedListingItem
  const updates: any = getField(body, "updates") || {};

  // Load app credentials
  const { data: appRow, error: appErr } = await admin
    .from("apps")
    .select("client_id, client_secret")
    .eq("name", "Shopee")
    .single();
  if (appErr || !appRow) return jsonResponse({ ok: false, error: appErr?.message || "App not found", correlationId }, 200);
  const partnerId = String(getField(appRow, "client_id") || "").trim();
  const partnerKey = String(getField(appRow, "client_secret") || "").trim();
  if (!partnerId || !partnerKey) return jsonResponse({ ok: false, error: "Missing Shopee credentials", correlationId }, 200);

  // Load integration
  let integrations: any[] = [];
  if (organizationId) {
    const { data } = await admin
      .from("marketplace_integrations")
      .select("id, organizations_id, access_token, refresh_token, config, meli_user_id")
      .eq("marketplace_name", "Shopee")
      .eq("organizations_id", organizationId);
    integrations = Array.isArray(data) ? data : [];
  }
  if (!integrations.length) return jsonResponse({ ok: false, error: "No Shopee integrations found", correlationId }, 200);

  const results: any[] = [];

  for (const integration of integrations) {
    const encToken = getStr(integration, ["access_token"]) || "";
    const rawToken = encToken ? await tryDecryptToken(encToken, aesKey).catch(() => encToken) : encToken;
    const accessToken = rawToken || "";
    const shopIdRaw = getField(integration, "config")?.shopee_shop_id ?? getField(integration, "meli_user_id");
    const shopId = Number(shopIdRaw || 0);
    if (!shopId || !accessToken) {
      results.push({ integration_id: integration.id, ok: false, error: "Missing credentials" });
      continue;
    }

    const opResults: any = {};

    // ── update_item: title, description, attributes, weight, dimensions ─────────
    const itemPatch: any = {};
    if (typeof updates.title === "string" && updates.title.trim()) itemPatch.item_name = updates.title.trim();
    if (typeof updates.description === "string") itemPatch.description = updates.description;
    if (Array.isArray(updates.attributes) && updates.attributes.length > 0) itemPatch.attribute_list = updates.attributes;
    if (updates.shipping) {
      const sh = updates.shipping;
      const w = Number(sh?.weight || sh?.weight_kg || 0);
      if (w > 0) itemPatch.weight = w;
      const dim = sh?.dimensions || {};
      const h = Number(dim?.height || sh?.height || 0);
      const l = Number(dim?.length || sh?.length || 0);
      const ww = Number(dim?.width || sh?.width || 0);
      if (h && l && ww) itemPatch.dimension = { package_height: h, package_length: l, package_width: ww };
    }
    if (Array.isArray(updates.pictures) && updates.pictures.length > 0) {
      const imageUrls = (updates.pictures as any[]).filter((u: any) => typeof u === "string" && /^https?:\/\//i.test(u));
      if (imageUrls.length > 0) itemPatch.image = { image_url_list: imageUrls.slice(0, 9) };
    }

    if (Object.keys(itemPatch).length > 0) {
      const ts = Math.floor(Date.now() / 1000);
      const sig = buildShopeeSignature(partnerId, partnerKey, UPDATE_ITEM_PATH, ts, accessToken, shopId);
      const url = `${SHOPEE_HOST}${UPDATE_ITEM_PATH}?partner_id=${partnerId}&timestamp=${ts}&access_token=${accessToken}&shop_id=${shopId}&sign=${sig}`;
      const res = await shopeePost(url, { item_id: itemId, ...itemPatch }).catch((e: any) => ({ error: e?.message }));
      opResults.update_item = { ok: !(res?.error || res?.message), data: res };
    }

    // ── update_model: price per variation ─────────────────────────────────────
    if (Array.isArray(updates.variations) && updates.variations.length > 0) {
      const modelList = updates.variations.map((v: any) => ({
        model_id: Number(v?.id || 0),
        price: Number(v?.price || 0),
      })).filter((m: any) => m.model_id && m.price);

      if (modelList.length > 0) {
        const ts = Math.floor(Date.now() / 1000);
        const sig = buildShopeeSignature(partnerId, partnerKey, UPDATE_MODEL_PATH, ts, accessToken, shopId);
        const url = `${SHOPEE_HOST}${UPDATE_MODEL_PATH}?partner_id=${partnerId}&timestamp=${ts}&access_token=${accessToken}&shop_id=${shopId}&sign=${sig}`;
        const res = await shopeePost(url, { item_id: itemId, model_list: modelList }).catch((e: any) => ({ error: e?.message }));
        opResults.update_model = { ok: !(res?.error || res?.message), data: res };
      }

      // ── update_stock: stock per model ──────────────────────────────────────
      const stockList = updates.variations.map((v: any) => {
        const sellerStock = [{
          location_id: "",
          quantity: Math.max(0, Number(v?.available_quantity || 0)),
        }];
        return { model_id: Number(v?.id || 0), seller_stock: sellerStock };
      }).filter((s: any) => s.model_id);

      if (stockList.length > 0) {
        const ts = Math.floor(Date.now() / 1000);
        const sig = buildShopeeSignature(partnerId, partnerKey, UPDATE_STOCK_PATH, ts, accessToken, shopId);
        const url = `${SHOPEE_HOST}${UPDATE_STOCK_PATH}?partner_id=${partnerId}&timestamp=${ts}&access_token=${accessToken}&shop_id=${shopId}&sign=${sig}`;
        const res = await shopeePost(url, { item_id: itemId, stock_list: stockList }).catch((e: any) => ({ error: e?.message }));
        opResults.update_stock = { ok: !(res?.error || res?.message), data: res };
      }
    }

    const overallOk = Object.values(opResults).every((r: any) => r.ok !== false);
    results.push({ integration_id: integration.id, ok: overallOk, operations: opResults });
  }

  const allOk = results.every((r: any) => r.ok !== false);
  return jsonResponse({ ok: allOk, results, correlationId }, 200);
});
