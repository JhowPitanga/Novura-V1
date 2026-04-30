/**
 * Represents the linking state of items in an order.
 *
 * Built by consulting `marketplace_item_product_links` and checking `seller_sku`
 * for each order item.
 *
 * If unlinkedCount > 0, the order must receive UNLINKED status (blocking).
 * Linking can be resolved automatically (by SKU or permanent link) or manually
 * by the seller.
 */
export interface ProductLinkState {
  /** Number of items not yet linked to a catalog product */
  readonly unlinkedCount: number;

  /** True when all items are linked to catalog products */
  get isFullyLinked(): boolean;
}

/**
 * Creates a ProductLinkState with runtime validation.
 *
 * Use this factory function instead of constructing the object directly —
 * it prevents invalid states (negative count) from entering the system.
 *
 * @throws {Error} if unlinkedCount is negative
 */
export function createProductLinkState(unlinkedCount: number): ProductLinkState {
  if (!Number.isInteger(unlinkedCount) || unlinkedCount < 0) {
    throw new Error('unlinkedCount must be a non-negative integer');
  }
  return Object.freeze({
    unlinkedCount,
    get isFullyLinked() { return this.unlinkedCount === 0; },
  });
}

/**
 * Convenience constant for the fully-linked state.
 * Use when all order items are confirmed to have a catalog product mapping.
 */
export const FULLY_LINKED: ProductLinkState = createProductLinkState(0);
