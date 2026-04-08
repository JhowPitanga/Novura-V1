import { createStatusChangedEvent, type OrderStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import { createProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { OrderStatusEngine } from "./OrderStatusEngine.ts";

export interface RecalculateOrderStatusResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly event: OrderStatusChangedEvent;
}

/**
 * Fetches an order, recalculates its status via the engine, and persists
 * the transition when the status actually changed.
 * Returns null when the computed status matches the current one.
 */
export class RecalculateOrderStatusUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly engine: OrderStatusEngine,
  ) {}

  async execute(
    orderId: string,
    source: "webhook" | "user_action" | "sync" = "webhook",
  ): Promise<RecalculateOrderStatusResult | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    const unlinkedCount = order.items.filter((i) => !i.productId && !i.sellerSku).length;
    const newStatus = this.engine.calculate(
      order.marketplaceSignals,
      createProductLinkState(unlinkedCount),
    );

    if (newStatus === order.currentStatus) return null;

    await this.orderRepo.updateStatus({
      orderId: order.id,
      currentStatus: order.currentStatus,
      newStatus,
    });

    const event = createStatusChangedEvent({
      orderId: order.id,
      organizationId: order.organizationId,
      previousStatus: order.currentStatus,
      newStatus,
      source,
    });
    await this.orderRepo.addStatusHistory(order.id, event);

    return { orderId: order.id, previousStatus: order.currentStatus, newStatus, event };
  }
}
