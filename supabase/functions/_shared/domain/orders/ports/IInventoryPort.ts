/** Immutable stock payload for immediate reservation. */
export interface InventoryItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly quantity: number;
}

/** Port for inventory side effects triggered by status transitions. */
export interface IInventoryPort {
  /**
   * Synchronous reservation; failures must interrupt status transaction.
   * Must be idempotent for repeated invocations.
   */
  reserveStockNow(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void>;

  /** Asynchronous consume job enqueue; failures should not block status writes. */
  enqueueConsumeStock(orderId: string): Promise<void>;

  /** Asynchronous refund job enqueue; failures should not block status writes. */
  enqueueRefundStock(orderId: string): Promise<void>;
}
