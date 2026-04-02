import { createStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import { createProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { OrderStatusEngine } from "./OrderStatusEngine.ts";

export interface RecalculateResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
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
    source: "webhook" | "user_action" | "sync" = "user_action",
  ): Promise<RecalculateResult | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    const unlinkedCount = order.items.filter((i) => !i.productId).length;
    const newStatus = this.engine.calculate(
      order.marketplaceSignals,
      createProductLinkState(unlinkedCount),
    );

    if (newStatus === order.currentStatus) return null;

    await this.orderRepo.updateStatus({
      orderId,
      currentStatus: order.currentStatus,
      newStatus,
    });
    await this.orderRepo.addStatusHistory(
      orderId,
      createStatusChangedEvent({
        orderId,
        organizationId: order.organizationId,
        previousStatus: order.currentStatus,
        newStatus,
        source,
      }),
    );

    return { orderId, previousStatus: order.currentStatus, newStatus };
  }
}
