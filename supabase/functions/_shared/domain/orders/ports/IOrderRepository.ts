import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { OrderStatus } from "../OrderStatus.ts";
import type { OrderStatusChangedEvent } from "../OrderDomainEvents.ts";

/** Immutable order item payload used by status workflows. */
export interface OrderRecordItem {
  readonly id: string;
  readonly productId: string | null;
  readonly marketplaceItemId: string | null;
  readonly quantity: number;
}

/** Immutable aggregate used by the application layer to recalculate status. */
export interface OrderRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly marketplace: "mercado_livre" | "shopee";
  readonly marketplaceOrderId: string;
  readonly currentStatus: OrderStatus | null;
  readonly marketplaceSignals: MarketplaceSignals;
  readonly items: ReadonlyArray<OrderRecordItem>;
}

/** Immutable status update metadata returned by repository writes. */
export interface StatusUpdateResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly updatedAt: string;
}

/** Port for order persistence and status transitions. */
export interface IOrderRepository {
  /** Returns full immutable order DTO or null when not found. */
  findById(orderId: string): Promise<OrderRecord | null>;

  /**
   * Updates order status with optimistic locking using currentStatus.
   * Implementations must be idempotent for safe retries.
   */
  updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void>;

  /** Persists product links on order items; retries must be safe. */
  updateOrderItemsProductId(
    orderId: string,
    items: ReadonlyArray<{ readonly id: string; readonly productId: string }>,
  ): Promise<void>;

  /**
   * Updates internal status-driving flags (e.g., print/pickup markers).
   * Implementations must be idempotent for repeated writes.
   */
  updateInternalFlags(
    orderId: string,
    flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>,
  ): Promise<void>;

  /** Appends immutable audit history; duplicate retries must not double-write. */
  addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void>;
}
