/**
 * ShopeeStockProvider — pushes available stock to Shopee /api/v2/product/update_stock.
 *
 * Extracted from shopee-update-stock/index.ts. The edge function is now a thin
 * HTTP wrapper that delegates to this provider via StockAdapterRegistry.
 *
 * Responsibilities:
 *   - Resolve Shopee credentials (partner key, shop_id, access token)
 *   - Build normalized stock_list payload (model_id + seller_stock BRZ)
 *   - Sign request with HMAC-SHA256
 *   - Auto-refresh access token on 401/403
 *   - Retry on error_sign (re-sign)
 *   - Map Shopee API response to StockPushResult
 *
 * NOT responsible for:
 *   - Calculating available stock (received via StockPushContext.availableQty)
 *   - Queue management or retry scheduling (done by stock-sync-worker)
 */

import type {
  IStockChannelAdapter,
  StockPushContext,
  StockPushResult,
} from "../../../domain/stock/ports/IStockChannelAdapter.ts";
import {
  importAesGcmKey,
  aesGcmEncryptToString,
  tryDecryptToken,
  hmacSha256Hex,
} from "../../infra/token-utils.ts";
import { createAdminClient } from "../../infra/supabase-client.ts";

const SHOPEE_HOST       = "https://openplatform.shopee.com.br";
const UPDATE_STOCK_PATH = "/api/v2/product/update_stock";
const REFRESH_PATH      = "/api/v2/auth/access_token/get";

export class ShopeeStockProvider implements IStockChannelAdapter {
  readonly providerKey = "Shopee";

  async pushStock(ctx: StockPushContext): Promise<StockPushResult> {
    try {
      return await this.doPush(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ShopeeStockProvider] unexpected error", { eventId: ctx.eventId, error: msg });
      return this.failResult(ctx, msg, true);
    }
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  private async doPush(ctx: StockPushContext): Promise<StockPushResult> {
    const admin      = createAdminClient();
    const encKeyB64  = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    if (!encKeyB64) return this.failResult(ctx, "Missing TOKENS_ENCRYPTION_KEY", false);

    const aesKey     = await importAesGcmKey(encKeyB64);
    const creds      = await resolveShopeeCredentials(admin, ctx.integrationId);
    if (!creds.ok) return this.failResult(ctx, creds.error, false);

    const { partnerId, partnerKey, shopId, integrationId } = creds;
    let { accessToken, refreshToken } = creds;

    const stockList = buildStockList(ctx.marketplaceItemId, ctx.variationId, ctx.availableQty);
    if (!stockList.length) {
      return this.failResult(ctx, "Invalid variation_id or qty — could not build stock_list", false);
    }

    const callApi = async (): Promise<{ ok: boolean; error: string | null; shouldRefresh: boolean; shouldResign: boolean }> => {
      const ts      = Math.floor(Date.now() / 1000);
      const sign    = await hmacSha256Hex(partnerKey, `${partnerId}${UPDATE_STOCK_PATH}${ts}${accessToken}${shopId}`);
      const qs      = new URLSearchParams({
        partner_id: partnerId, timestamp: String(ts),
        access_token: accessToken, shop_id: String(shopId), sign,
      });
      const body    = JSON.stringify({ item_id: Number(ctx.marketplaceItemId), stock_list: stockList });
      const resp    = await fetch(`${SHOPEE_HOST}${UPDATE_STOCK_PATH}?${qs}`, {
        method: "POST", headers: { "content-type": "application/json" }, body,
      });
      const text    = await resp.text();
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text) as Record<string, unknown>; } catch (_) { json = { raw: text }; }

      const shopeeErr  = (json?.error as string) ?? null;
      const shopeeMsg  = (json?.message as string) ?? null;
      if (!shopeeErr && resp.ok) return { ok: true, error: null, shouldRefresh: false, shouldResign: false };
      if (resp.status === 401 || resp.status === 403 || String(shopeeErr).includes("invalid_access_token")) {
        return { ok: false, error: shopeeMsg ?? String(shopeeErr), shouldRefresh: true, shouldResign: false };
      }
      if (String(shopeeErr).toLowerCase() === "error_sign") {
        return { ok: false, error: "error_sign", shouldRefresh: false, shouldResign: true };
      }
      return { ok: false, error: shopeeMsg ?? String(shopeeErr ?? `HTTP ${resp.status}`), shouldRefresh: false, shouldResign: false };
    };

    let attempt = await callApi();
    if (attempt.ok) return this.successResult(ctx);

    if (attempt.shouldRefresh) {
      const refreshed = await tryRefreshShopeeToken(aesKey, admin, partnerId, partnerKey, shopId, refreshToken, integrationId);
      if (!refreshed.ok) return this.failResult(ctx, "Token refresh failed", false);
      accessToken  = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      attempt      = await callApi();
      if (attempt.ok) return this.successResult(ctx);
      return this.failResult(ctx, attempt.error ?? "unknown after refresh", attempt.shouldRefresh);
    }

    if (attempt.shouldResign) {
      attempt = await callApi();
      if (attempt.ok) return this.successResult(ctx);
    }

    const retryable = attempt.error?.includes("429") || attempt.error?.includes("503") || false;
    return this.failResult(ctx, attempt.error ?? "unknown", retryable);
  }

  // ── Result builders ────────────────────────────────────────────────────────

  private successResult(ctx: StockPushContext): StockPushResult {
    return { ok: true, channelItemId: ctx.marketplaceItemId, variationId: ctx.variationId, appliedQty: ctx.availableQty, warnings: [], retryable: false };
  }

  private failResult(ctx: StockPushContext, error: string, retryable: boolean): StockPushResult {
    return { ok: false, channelItemId: ctx.marketplaceItemId, variationId: ctx.variationId, appliedQty: 0, warnings: [error], retryable };
  }
}

// ── Private helpers ─────────────────────────────────────────────────────────

interface ShopeeCredentials {
  ok: true;
  partnerId: string;
  partnerKey: string;
  shopId: number;
  integrationId: string;
  accessToken: string;
  refreshToken: string;
}

interface ShopeeCredentialsError {
  ok: false;
  error: string;
}

async function resolveShopeeCredentials(
  admin: ReturnType<typeof createAdminClient>,
  integrationId: string,
): Promise<ShopeeCredentials | ShopeeCredentialsError> {
  const { data: app, error: appErr } = await admin
    .from("apps")
    .select("client_id, client_secret")
    .eq("name", "Shopee")
    .single();
  if (appErr || !app) return { ok: false, error: appErr?.message ?? "Shopee app not found" };

  const partnerId  = String((app as Record<string, unknown>).client_id  ?? "").trim();
  const partnerKey = String((app as Record<string, unknown>).client_secret ?? "").trim();
  if (!partnerId || !/^\d+$/.test(partnerId)) return { ok: false, error: "Invalid Shopee partner credentials" };

  const { data: integ, error: integErr } = await admin
    .from("marketplace_integrations")
    .select("id, access_token, refresh_token, config, meli_user_id")
    .eq("id", integrationId)
    .single();
  if (integErr || !integ) return { ok: false, error: "Integration not found" };

  const cfg    = (integ as Record<string, unknown>).config as Record<string, unknown> | null;
  const shopId = cfg?.shopee_shop_id ? Number(cfg.shopee_shop_id) : Number((integ as Record<string, unknown>).meli_user_id ?? 0);
  if (!Number.isFinite(shopId) || shopId <= 0) return { ok: false, error: "Invalid Shopee shop_id" };

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
  const aesKey    = await importAesGcmKey(encKeyB64);
  const accessToken  = await tryDecryptToken(aesKey, String((integ as Record<string, unknown>).access_token  ?? "")) ?? "";
  const refreshToken = await tryDecryptToken(aesKey, String((integ as Record<string, unknown>).refresh_token ?? "")) ?? "";

  return { ok: true, partnerId, partnerKey, shopId, integrationId, accessToken, refreshToken };
}

function buildStockList(itemId: string, variationId: string, qty: number): unknown[] {
  const modelId = variationId && /^\d+$/.test(variationId) ? Number(variationId) : null;
  if (!modelId) return [];
  return [{ model_id: modelId, seller_stock: [{ location_id: "BRZ", stock: Math.max(0, Math.floor(qty)) }] }];
}

async function tryRefreshShopeeToken(
  aesKey: CryptoKey,
  admin: ReturnType<typeof createAdminClient>,
  partnerId: string,
  partnerKey: string,
  shopId: number,
  refreshToken: string,
  integrationId: string,
): Promise<{ ok: boolean; accessToken: string; refreshToken: string }> {
  if (!refreshToken) return { ok: false, accessToken: "", refreshToken: "" };
  const ts       = Math.floor(Date.now() / 1000);
  const sign     = await hmacSha256Hex(partnerKey, `${partnerId}${REFRESH_PATH}${ts}`);
  const tokenUrl = `${SHOPEE_HOST}${REFRESH_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${ts}&sign=${sign}`;
  try {
    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shop_id: shopId, refresh_token: refreshToken, partner_id: Number(partnerId) }),
    });
    const json = await resp.json().catch(() => null) as Record<string, unknown> | null;
    if (!resp.ok || !json?.access_token) return { ok: false, accessToken: "", refreshToken: "" };
    const newAccess  = String(json.access_token);
    const newRefresh = String(json.refresh_token ?? refreshToken);
    const accEnc     = await aesGcmEncryptToString(aesKey, newAccess);
    const refEnc     = await aesGcmEncryptToString(aesKey, newRefresh);
    const expiresAt  = new Date(Date.now() + (Number(json.expire_in) || 14400) * 1000).toISOString();
    await admin.from("marketplace_integrations")
      .update({ access_token: accEnc, refresh_token: refEnc, expires_in: expiresAt })
      .eq("id", integrationId);
    return { ok: true, accessToken: newAccess, refreshToken: newRefresh };
  } catch {
    return { ok: false, accessToken: "", refreshToken: "" };
  }
}
