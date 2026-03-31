/**
 * Immutable item payload used for stock reservation.
 */
export interface InventoryItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly quantity: number;
}

/**
 * Port for stock operations triggered by order status transitions.
 *
 * All operations must be idempotent to tolerate retries and duplicated events.
 */
export interface IInventoryPort {
  /**
   * Synchronous reservation step.
   *
   * This call is part of the critical path: if reservation fails because of
   * stock shortage or timeout, status processing must be interrupted.
   * Implementations must be safe for retry with the same order/items payload.
   */
  reserveStockNow(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void>;

  /**
   * Asynchronous definitive stock consumption.
   *
   * This method only enqueues a job and must not block status persistence.
   * Failures here should be handled via retry/requeue policies externally.
   * Enqueue must be idempotent for repeated calls with the same orderId.
   */
  enqueueConsumeStock(orderId: string): Promise<void>;

  /**
   * Asynchronous stock refund flow.
   *
   * This method only enqueues a compensation job and must not block status
   * processing. Enqueue must be idempotent for repeated calls.
   */
  enqueueRefundStock(orderId: string): Promise<void>;
}
