/** Immutable permanent link between SKU/listing and catalog product. */
export interface OrderItemLink {
  readonly organizationId: string;
  readonly sku: string;
  readonly productId: string;
}

/** Port for permanent product-link lookup operations. */
export interface IProductLinkRepository {
  /** Finds a single link by organization and SKU, or null when missing. */
  findLink(organizationId: string, sku: string): Promise<OrderItemLink | null>;

  /**
   * Batch SKU lookup optimized for performance.
   * Implementations must be idempotent and retry-safe.
   */
  listLinks(organizationId: string, skus: ReadonlyArray<string>): Promise<ReadonlyArray<OrderItemLink>>;

  /** Batch link resolution: resolves items via SKU first, then permanent links. */
  checkLinks(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly items: ReadonlyArray<{ marketplaceItemId: string; variationId: string; sellerSku: string }>;
  }): Promise<ReadonlyArray<{ marketplaceItemId: string; variationId: string; productId: string | null; source: string | null }>>;

  /**
   * Persists a permanent link between a marketplace item and catalog product.
   * Implementations must be idempotent for repeated calls with same payload.
   */
  upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
  }): Promise<void>;

  /** Counts order items that have no product link resolved. */
  countUnlinkedItems(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly orderId: string;
    readonly items: ReadonlyArray<{ marketplaceItemId: string; variationId: string; sellerSku: string }>;
  }): Promise<number>;
}
