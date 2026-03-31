/**
 * Immutable link record between a marketplace listing and a catalog product.
 */
export interface OrderItemLink {
  readonly organizationId: string;
  readonly sku: string;
  readonly productId: string;
  readonly marketplace: "mercado_livre" | "shopee" | "any";
  readonly marketplaceItemId: string | null;
  readonly variationId: string | null;
}

/**
 * Port for product-link queries used by status and linking use cases.
 *
 * Implementations must be idempotent and stable under retries.
 */
export interface IProductLinkRepository {
  /**
   * Finds a permanent link by organization and sku.
   * Returns null when no link exists.
   */
  findLink(organizationId: string, sku: string): Promise<OrderItemLink | null>;

  /**
   * Batch version of findLink for performance-sensitive flows.
   *
   * Returned list should contain all matches for the provided skus and must be
   * safe for repeated executions with the same inputs.
   */
  listLinks(
    organizationId: string,
    skus: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<OrderItemLink>>;
}
