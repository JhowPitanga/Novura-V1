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
}
