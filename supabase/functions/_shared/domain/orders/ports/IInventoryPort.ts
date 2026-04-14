/** Immutable item payload used for stock reservation. */
export interface InventoryItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly quantity: number;
}

/** Port for stock operations triggered by order status transitions. */
export interface IInventoryPort {
  /**
   * Immediately reserves stock for the order. Called synchronously before
   * the status transition is committed.
   * storageId: when null the RPC resolves via orders.storage_id → org default.
   */
  reserveStockNow(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
    readonly storageId?: string | null;
  }): Promise<void>;

  /**
   * Immediately consumes reserved stock when an order ships.
   * storageId: when null the RPC resolves via orders.storage_id → org default.
   * RPCs are idempotent — safe to call multiple times.
   */
  consumeStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly storageId?: string | null;
  }): Promise<void>;

  /**
   * Immediately refunds (cancels) previously reserved stock.
   * storageId: when null the RPC resolves via orders.storage_id → org default.
   * RPCs are idempotent — safe to call multiple times.
   */
  refundStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly storageId?: string | null;
  }): Promise<void>;
}
