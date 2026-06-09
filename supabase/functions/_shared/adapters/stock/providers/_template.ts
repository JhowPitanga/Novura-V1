/**
 * Stock Provider Template — use this as the starting point for a new channel.
 *
 * Copy this file to providers/<channel>.ts and implement pushStock.
 * Then register the provider in registry.ts and create the supporting
 * PGMQ queue + pg_cron migration and thin edge function.
 *
 * See: docs/prds/PLANO-MIGRACAO-ADAPTADORES-UNIVERSAIS-ESTOQUE.md §3.2
 */

import type {
  IStockChannelAdapter,
  StockPushContext,
  StockPushResult,
} from "../../../domain/stock/ports/IStockChannelAdapter.ts";

export class TemplateStockProvider implements IStockChannelAdapter {
  /**
   * REQUIRED: must match the marketplace_name values in marketplace_item_product_links.
   * Examples: 'Shopee', 'Mercado Livre', 'Amazon'
   */
  readonly providerKey = "Template";

  async pushStock(ctx: StockPushContext): Promise<StockPushResult> {
    // Step 1: Resolve credentials for ctx.integrationId
    //   const { accessToken } = await resolveCredentials(ctx.integrationId);

    // Step 2: Build the channel-specific API payload using ctx.availableQty.
    //   NEVER use ctx.availableQty to recalculate — only forward it as-is.
    //   const payload = buildPayload(ctx.marketplaceItemId, ctx.variationId, ctx.availableQty);

    // Step 3: Call the channel API
    //   const response = await callChannelApi(accessToken, payload);

    // Step 4: Map the response to StockPushResult
    //   - Set retryable: true for transient errors (429, 503, timeouts)
    //   - Set retryable: false for permanent errors (invalid item, auth failure after refresh)
    //   - NEVER throw — always return a StockPushResult

    // Remove this stub once implementation is complete:
    console.warn("[TemplateStockProvider] pushStock called but not implemented", {
      eventId: ctx.eventId,
      marketplaceItemId: ctx.marketplaceItemId,
    });

    return {
      ok: false,
      channelItemId: ctx.marketplaceItemId,
      variationId: ctx.variationId,
      appliedQty: 0,
      warnings: ["Provider not implemented"],
      retryable: false,
    };
  }
}

// ── Private helpers (each < 30 lines) ──────────────────────────────────────
// async function resolveCredentials(integrationId: string): Promise<{ accessToken: string }> { ... }
// function buildPayload(itemId: string, variationId: string, qty: number): unknown { ... }
// async function callChannelApi(token: string, payload: unknown): Promise<Response> { ... }
// function mapResult(response: unknown, ctx: StockPushContext): StockPushResult { ... }
