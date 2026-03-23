/**
 * English order status constants for the Cycle 0 pipeline.
 * DB and code always use these values; Portuguese labels are for the frontend only.
 */

export const OrderStatus = {
  PENDING: "pending",
  NEEDS_LINKING: "needs_linking",
  INVOICE_PENDING: "invoice_pending",
  PRINTING: "printing",
  AWAITING_PICKUP: "awaiting_pickup",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
  RETURNED: "returned",
  OUT_OF_STOCK: "out_of_stock",
} as const;

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus];

/**
 * Compute the internal_status for an order.
 * Called by OrdersUpsertAdapter after items are written, so has_unlinked_items is known.
 */
export function computeInternalStatus(
  marketplace: string,
  marketplaceStatus: string,
  hasUnlinkedItems: boolean,
): string {
  const s = (marketplaceStatus ?? "").toLowerCase();

  if (marketplace === "shopee") {
    if (s === "cancelled" || s === "in_cancel") return OrderStatus.CANCELLED;
    if (s === "to_return") return OrderStatus.RETURNED;
    if (s === "retry_ship") return OrderStatus.AWAITING_PICKUP;
    if (s === "shipped" || s === "completed" || s === "pickup_done") return OrderStatus.SHIPPED;
    if (s === "ready_to_ship" || s === "processed") {
      return hasUnlinkedItems ? OrderStatus.NEEDS_LINKING : OrderStatus.INVOICE_PENDING;
    }
    return OrderStatus.PENDING;
  }

  if (marketplace === "mercado_livre") {
    if (s === "cancelled") return OrderStatus.CANCELLED;
    if (s === "shipped") return OrderStatus.SHIPPED;
    if (s === "delivered") return OrderStatus.DELIVERED;
    if (s === "paid") {
      return hasUnlinkedItems ? OrderStatus.NEEDS_LINKING : OrderStatus.INVOICE_PENDING;
    }
    return OrderStatus.PENDING;
  }

  return OrderStatus.PENDING;
}
