import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { OrderStatus } from "../OrderStatus.ts";
import type { OrderStatusChangedEvent } from "../OrderDomainEvents.ts";

/** Minimal immutable item snapshot needed by the status engine and link flows. */
export interface OrderRecordItem {
  readonly id: string;
  readonly marketplaceItemId: string | null;
  readonly variationId: string | null;
  readonly sellerSku: string | null;
  readonly productId: string | null;
  readonly quantity: number;
}

/** Immutable order DTO used by application use cases to recalculate status. */
export interface OrderRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly marketplace: MarketplaceSignals["marketplace"];
  readonly marketplaceOrderId: string;
  readonly currentStatus: OrderStatus | null;
  readonly marketplaceSignals: MarketplaceSignals;
  readonly items: ReadonlyArray<OrderRecordItem>;
}

/** Immutable status update metadata (optional for optimistic-lock-only repos). */
export interface StatusUpdateResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly updatedAt: string;
}

/**
 * Port for order persistence in the status engine.
 * Implementations must be idempotent for safe retries.
 */
export interface IOrderRepository {
  findById(orderId: string): Promise<OrderRecord | null>;

  findByMarketplaceOrderId(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceOrderId: string;
  }): Promise<OrderRecord | null>;

  updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void>;

  markLabelPrinted(params: {
    readonly orderIds: ReadonlyArray<string>;
    readonly organizationId: string;
  }): Promise<void>;

  updateOrderItemsProductId(
    orderId: string,
    items: ReadonlyArray<{ readonly id: string; readonly productId: string }>,
  ): Promise<void>;

  /**
   * Updates internal status-driving flags (e.g., print/pickup/invoice markers).
   * Implementations must be idempotent for repeated writes.
   */
  updateInternalFlags(
    orderId: string,
    flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean; hasInvoice?: boolean }>,
  ): Promise<void>;

  addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void>;
}
