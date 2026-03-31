import { createStatusChangedEvent, type OrderStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import { createProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import { HandleStockSideEffectsUseCase } from "./HandleStockSideEffectsUseCase.ts";
import { OrderStatusEngine } from "./OrderStatusEngine.ts";

export interface RecalculateOrderStatusResult {
  readonly orderId: string;
  readonly newStatus: OrderStatus;
  readonly event: OrderStatusChangedEvent;
}

/** Recalculates and persists order status when signals/items changed. */
export class RecalculateOrderStatusUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly engine: OrderStatusEngine,
    private readonly stockUseCase: HandleStockSideEffectsUseCase,
  ) {}

  async execute(orderId: string): Promise<RecalculateOrderStatusResult | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    const unlinkedCount = order.items.filter((item) => item.productId === null).length;
    const newStatus = this.engine.calculate(order.marketplaceSignals, createProductLinkState(unlinkedCount));
    if (newStatus === order.currentStatus) return null;

    await this.stockUseCase.reserveIfNeeded(order, newStatus);

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
      source: "webhook",
    });
    await this.orderRepo.addStatusHistory(order.id, event);
    await this.stockUseCase.handleAsyncEffects(order.id, order.currentStatus, newStatus);
    return { orderId: order.id, newStatus, event };
  }
}
