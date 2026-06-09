/**
 * Hexagonal port for outbound stock synchronization.
 *
 * CRITICAL INVARIANT: availableQty in StockPushContext is ALWAYS sourced from
 * products_stock.available (calculated by the Core ERP as current − reserved).
 * No provider implementation may recalculate, derive, or substitute this value.
 * The Motor de Integracao is a resilient messenger — it never computes stock.
 */

export interface StockLogisticHints {
  /** ML logistic_type for endpoint routing (fulfillment → skip; seller_warehouse → multi-origin). */
  readonly logisticType?: string;
  /** True when ML seller has warehouse_management tag (multi-origin routing required). */
  readonly hasWarehouseManagement?: boolean;
  /** ML user_product_id for /user-products/... endpoints. */
  readonly userProductId?: string;
  /** Warehouse locations for PUT /stock/type/seller_warehouse. */
  readonly sellerWarehouseLocations?: ReadonlyArray<{
    readonly storeId: string;
    readonly networkNodeId: string;
  }>;
}

export interface StockPushContext {
  /** Internal Novura UUID for the organization (tenant). */
  readonly organizationId: string;
  /** Internal Novura UUID of the product. */
  readonly productId: string;
  /**
   * Available stock quantity to propagate.
   * Source: products_stock.available snapshot from stock_sync_outbox.
   * MUST NOT be recalculated by any provider.
   */
  readonly availableQty: number;
  /**
   * Monotonic version from products_stock.version.
   * Providers MUST discard events with version <= last processed version
   * for the same (marketplaceItemId, variationId) pair.
   */
  readonly version: number;
  /** Marketplace item ID (item_id for Shopee, MLB... for ML). */
  readonly marketplaceItemId: string;
  /** Variation ID (model_id for Shopee, variation.id for ML). Empty string for no variation. */
  readonly variationId: string;
  /** Integration UUID — identifies the marketplace account (multi-store support). */
  readonly integrationId: string;
  /** UUID of this specific sync event — idempotency key for the provider. */
  readonly eventId: string;
  /** Optional logistics routing hints populated by the dispatcher. */
  readonly logisticHints?: StockLogisticHints;
}

export interface StockPushResult {
  readonly ok: boolean;
  readonly channelItemId: string;
  readonly variationId: string;
  /** Quantity that was actually sent to the channel (equals availableQty on success). */
  readonly appliedQty: number;
  readonly warnings: string[];
  /**
   * If false, the error is unrecoverable — route directly to DLQ without retry.
   * If true, apply Exponential Backoff and retry up to the configured maximum.
   */
  readonly retryable: boolean;
  /** Raw API response for debugging (truncated to 512 chars by the worker). */
  readonly rawResponse?: unknown;
}

export interface IStockChannelAdapter {
  /**
   * Unique key used by StockAdapterRegistry to look up this provider.
   * Must match the marketplace_name values in marketplace_item_product_links.
   * Examples: 'Shopee', 'Mercado Livre'
   */
  readonly providerKey: string;

  /**
   * Push the available stock quantity to the external channel.
   * Must never throw — return { ok: false, retryable } instead.
   */
  pushStock(ctx: StockPushContext): Promise<StockPushResult>;
}
