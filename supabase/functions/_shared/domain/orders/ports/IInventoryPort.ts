/** Immutable item payload used for stock reservation. */
export interface InventoryItem {
  readonly orderItemId: string;
  readonly productId: string;
  readonly quantity: number;
}

/** Port for stock operations triggered by order status transitions. */
export interface IInventoryPort {
  reserveStockNow(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly items: ReadonlyArray<InventoryItem>;
  }): Promise<void>;

  enqueueConsumeStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
  }): Promise<void>;

  enqueueRefundStock(params: {
    readonly orderId: string;
    readonly organizationId: string;
  }): Promise<void>;
}
