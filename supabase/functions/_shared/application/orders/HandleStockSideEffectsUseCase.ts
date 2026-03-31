import { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IInventoryPort } from "../../domain/orders/ports/IInventoryPort.ts";
import type { OrderRecord } from "../../domain/orders/ports/IOrderRepository.ts";

/** Statuses that require immediate stock reservation. */
export const STATUSES_REQUIRING_RESERVE = new Set<OrderStatus>([
  OrderStatus.READY_TO_PRINT,
  OrderStatus.INVOICE_PENDING,
  OrderStatus.AWAITING_PICKUP,
]);

/** Statuses that confirm final stock consumption. */
export const STATUSES_REQUIRING_CONSUME = new Set<OrderStatus>([OrderStatus.SHIPPED]);

/** Statuses that should refund previously reserved stock. */
export const STATUSES_REQUIRING_REFUND = new Set<OrderStatus>([OrderStatus.CANCELLED]);

/** Handles stock side effects for status transitions. */
export class HandleStockSideEffectsUseCase {
  constructor(private readonly inventoryPort: IInventoryPort) {}

  /**
   * Synchronous reservation step (must propagate failures).
   * If reserve fails, caller must abort status change.
   */
  async reserveIfNeeded(order: OrderRecord, newStatus: OrderStatus): Promise<void> {
    const oldStatus = order.currentStatus;
    const needsReserve = STATUSES_REQUIRING_RESERVE.has(newStatus);
    const alreadyReserved = oldStatus !== null && STATUSES_REQUIRING_RESERVE.has(oldStatus);
    if (!needsReserve || alreadyReserved) return;
    const items = order.items
      .filter((item) => item.productId !== null)
      .map((item) => ({
        orderItemId: item.id,
        productId: item.productId as string,
        quantity: item.quantity,
      }));
    await this.inventoryPort.reserveStockNow(order.id, items);
  }

  /**
   * Asynchronous effects after status persistence.
   * Queue errors are swallowed to avoid breaking main flow.
   */
  async handleAsyncEffects(orderId: string, oldStatus: OrderStatus | null, newStatus: OrderStatus): Promise<void> {
    try {
      if (STATUSES_REQUIRING_CONSUME.has(newStatus)) {
        await this.inventoryPort.enqueueConsumeStock(orderId);
        return;
      }
      const cameFromReserved = oldStatus !== null && STATUSES_REQUIRING_RESERVE.has(oldStatus);
      if (cameFromReserved && STATUSES_REQUIRING_REFUND.has(newStatus)) {
        await this.inventoryPort.enqueueRefundStock(orderId);
      }
    } catch (error) {
      console.error(`[HandleStockSideEffectsUseCase] async queue failure for order ${orderId}:`, error);
    }
  }
}
