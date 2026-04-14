import { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IInventoryPort } from "../../domain/orders/ports/IInventoryPort.ts";
import type { OrderRecord } from "../../domain/orders/ports/IOrderRepository.ts";

/** Statuses that require immediate stock reservation (sync, before status write). */
export const STATUSES_REQUIRING_SYNC_RESERVE = new Set<OrderStatus>([
  OrderStatus.INVOICE_PENDING,
  OrderStatus.READY_TO_PRINT,
  OrderStatus.AWAITING_PICKUP,
]);

/** Statuses that confirm final stock consumption (order shipped). */
export const STATUSES_REQUIRING_CONSUME = new Set<OrderStatus>([OrderStatus.SHIPPED]);

/** Statuses that should refund previously reserved stock. */
export const STATUSES_REQUIRING_REFUND = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.RETURNED,
]);

/** Handles stock side effects for order status transitions. */
export class HandleStockSideEffectsUseCase {
  constructor(private readonly inventoryPort: IInventoryPort) {}

  /**
   * Synchronous reservation — must run BEFORE the status transition is committed.
   * Uses order.storageId (resolved by ResolveOrderWarehouseUseCase).
   * The RPC also falls back to orders.storage_id → org default when storageId is null.
   */
  async reserveIfNeeded(order: OrderRecord, newStatus: OrderStatus): Promise<void> {
    const oldStatus = order.currentStatus;
    const needsReserve = STATUSES_REQUIRING_SYNC_RESERVE.has(newStatus);
    const alreadyReserved = oldStatus !== null && STATUSES_REQUIRING_SYNC_RESERVE.has(oldStatus);
    if (!needsReserve || alreadyReserved) return;
    const items = order.items
      .filter((item) => item.productId !== null)
      .map((item) => ({
        orderItemId: item.id,
        productId: item.productId as string,
        quantity: item.quantity,
      }));
    await this.inventoryPort.reserveStockNow({
      orderId: order.id,
      organizationId: order.organizationId,
      items,
      storageId: order.storageId ?? null,
    });
  }

  /**
   * Stock side effects after the status has been persisted.
   * Consume and refund are called synchronously — errors are logged but do NOT
   * break the main order flow. The v2 RPCs are idempotent so retries are safe.
   * storageId is omitted here; the RPC reads it directly from orders.storage_id.
   */
  async handleAsyncEffects(params: {
    readonly orderId: string;
    readonly organizationId: string;
    readonly oldStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void> {
    const { orderId, organizationId, oldStatus, newStatus } = params;
    try {
      if (STATUSES_REQUIRING_CONSUME.has(newStatus)) {
        await this.inventoryPort.consumeStock({ orderId, organizationId, storageId: null });
        return;
      }
      const cameFromReserved = oldStatus !== null && STATUSES_REQUIRING_SYNC_RESERVE.has(oldStatus);
      if (cameFromReserved && STATUSES_REQUIRING_REFUND.has(newStatus)) {
        await this.inventoryPort.refundStock({ orderId, organizationId, storageId: null });
      }
    } catch (error) {
      console.error(`[HandleStockSideEffectsUseCase] stock effect failed for order ${orderId}:`, error);
    }
  }
}
