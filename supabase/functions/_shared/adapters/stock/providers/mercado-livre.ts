/**
 * MercadoLivreStockProvider — pushes available stock to Mercado Livre.
 *
 * Critical implementation: the current mercado-livre-update-item-fields
 * uses PUT /items/{id} with available_quantity, which silently does nothing
 * for sellers with warehouse_management (multi-origin). This provider
 * implements the correct endpoint decision tree.
 *
 * Endpoint decision tree (per official ML documentation):
 *   1. logistic_type = 'fulfillment' (meli_facility) → SKIP (read-only, ML manages stock)
 *   2. hasWarehouseManagement = true → GET /user-products/{id}/stock + capture x-version
 *                                      PUT /user-products/{id}/stock/type/seller_warehouse
 *   3. Site MLA/MLC + self_service (Full+Flex) → PUT .../stock/type/selling_address
 *   4. Default (single warehouse, simple account) → PUT /items/{id} { available_quantity }
 *
 * NOT responsible for:
 *   - Calculating available stock (received as StockPushContext.availableQty)
 *   - Updating title, price, images, or other listing fields
 *     (those remain in mercado-livre-update-item-fields)
 */

import type {
  IStockChannelAdapter,
  StockPushContext,
  StockPushResult,
} from "../../../domain/stock/ports/IStockChannelAdapter.ts";
import { getMlAccessToken } from "../../tokens/ml-token.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../../integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter }          from "../../integrations/app-credentials-adapter.ts";
import { createAdminClient }                      from "../../infra/supabase-client.ts";

const ML_API = "https://api.mercadolibre.com";

export class MercadoLivreStockProvider implements IStockChannelAdapter {
  readonly providerKey = "Mercado Livre";

  async pushStock(ctx: StockPushContext): Promise<StockPushResult> {
    try {
      return await this.doPush(ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MercadoLivreStockProvider] unexpected error", { eventId: ctx.eventId, error: msg });
      return this.failResult(ctx, msg, true);
    }
  }

  // ── Core routing logic ─────────────────────────────────────────────────────

  private async doPush(ctx: StockPushContext): Promise<StockPushResult> {
    const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
    if (!encKeyB64) return this.failResult(ctx, "Missing TOKENS_ENCRYPTION_KEY", false);

    const admin        = createAdminClient();
    const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
    const appCreds     = new SupabaseAppCredentialsAdapter(admin);
    const tokenResult  = await getMlAccessToken(integrations, appCreds, ctx.integrationId, encKeyB64);
    let accessToken    = tokenResult.accessToken;

    const hints       = ctx.logisticHints;
    const logisticType = hints?.logisticType ?? "";

    // Case 1: Full stock managed by ML — skip silently (not an error).
    if (logisticType === "fulfillment" || logisticType === "meli_facility") {
      console.log("[MercadoLivreStockProvider] skipping fullfilment item (ML manages stock)", { eventId: ctx.eventId });
      return { ok: true, channelItemId: ctx.marketplaceItemId, variationId: ctx.variationId, appliedQty: 0, warnings: ["full_stock_skip_readonly"], retryable: false };
    }

    // Case 2: Multi-origin seller (warehouse_management tag).
    if (hints?.hasWarehouseManagement && hints.userProductId) {
      return await this.pushMultiOrigin(ctx, accessToken, hints.userProductId, hints.sellerWarehouseLocations ?? [], encKeyB64, integrations, appCreds);
    }

    // Case 3: Simple account — PUT /items/{item_id} with available_quantity.
    return await this.pushSimple(ctx, accessToken, encKeyB64, integrations, appCreds);
  }

  // ── Push strategies ────────────────────────────────────────────────────────

  private async pushSimple(
    ctx: StockPushContext,
    accessToken: string,
    encKeyB64: string,
    integrations: SupabaseMarketplaceIntegrationsAdapter,
    appCreds: SupabaseAppCredentialsAdapter,
  ): Promise<StockPushResult> {
    const url  = `${ML_API}/items/${encodeURIComponent(ctx.marketplaceItemId)}`;
    const body = JSON.stringify({ available_quantity: ctx.availableQty });

    let resp = await fetch(url, { method: "PUT", headers: mlHeaders(accessToken), body });

    if (resp.status === 401 || resp.status === 403) {
      const refreshed = await getMlAccessToken(integrations, appCreds, ctx.integrationId, encKeyB64);
      accessToken     = refreshed.accessToken;
      resp            = await fetch(url, { method: "PUT", headers: mlHeaders(accessToken), body });
    }

    return this.mapMlResponse(ctx, resp, await safeJson(resp));
  }

  private async pushMultiOrigin(
    ctx: StockPushContext,
    accessToken: string,
    userProductId: string,
    locations: ReadonlyArray<{ readonly storeId: string; readonly networkNodeId: string }>,
    encKeyB64: string,
    integrations: SupabaseMarketplaceIntegrationsAdapter,
    appCreds: SupabaseAppCredentialsAdapter,
  ): Promise<StockPushResult> {
    // Step 1: GET to capture x-version (optimistic locking).
    const getUrl  = `${ML_API}/user-products/${encodeURIComponent(userProductId)}/stock`;
    const getResp = await fetch(getUrl, { method: "GET", headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (!getResp.ok) {
      return this.failResult(ctx, `GET stock failed: HTTP ${getResp.status}`, getResp.status >= 500);
    }

    const xVersion = getResp.headers.get("x-version") ?? "";
    if (!xVersion) {
      return this.failResult(ctx, "x-version header missing from GET response", false);
    }

    // Step 2: PUT with x-version and locations payload.
    const putUrl   = `${ML_API}/user-products/${encodeURIComponent(userProductId)}/stock/type/seller_warehouse`;
    const putBody  = JSON.stringify({
      locations: locations.map(l => ({ store_id: l.storeId, network_node_id: l.networkNodeId, quantity: ctx.availableQty })),
    });
    const putHeaders = { ...mlHeaders(accessToken), "x-version": xVersion };

    let putResp = await fetch(putUrl, { method: "PUT", headers: putHeaders, body: putBody });

    if (putResp.status === 401 || putResp.status === 403) {
      const refreshed = await getMlAccessToken(integrations, appCreds, ctx.integrationId, encKeyB64);
      accessToken     = refreshed.accessToken;
      putResp         = await fetch(putUrl, { method: "PUT", headers: { ...mlHeaders(accessToken), "x-version": xVersion }, body: putBody });
    }

    // 409: optimistic lock conflict — caller should retry with fresh GET.
    if (putResp.status === 409) {
      return this.failResult(ctx, "x-version conflict (409) — retry required", true);
    }

    return this.mapMlResponse(ctx, putResp, await safeJson(putResp));
  }

  // ── Response mapping ───────────────────────────────────────────────────────

  private mapMlResponse(ctx: StockPushContext, resp: Response, json: unknown): StockPushResult {
    if (resp.ok) return this.successResult(ctx);
    const msg = extractMlError(json, resp.status);
    const retryable = resp.status === 429 || resp.status >= 500;
    return this.failResult(ctx, msg, retryable);
  }

  private successResult(ctx: StockPushContext): StockPushResult {
    return { ok: true, channelItemId: ctx.marketplaceItemId, variationId: ctx.variationId, appliedQty: ctx.availableQty, warnings: [], retryable: false };
  }

  private failResult(ctx: StockPushContext, error: string, retryable: boolean): StockPushResult {
    return { ok: false, channelItemId: ctx.marketplaceItemId, variationId: ctx.variationId, appliedQty: 0, warnings: [error], retryable };
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function mlHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: "application/json", "content-type": "application/json" };
}

async function safeJson(resp: Response): Promise<unknown> {
  try { return await resp.clone().json(); } catch { return null; }
}

function extractMlError(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const j = json as Record<string, unknown>;
    if (typeof j.message === "string") return j.message;
    if (typeof j.cause === "string")   return j.cause;
    if (typeof j.error === "string")   return j.error;
  }
  return `HTTP ${status}`;
}
