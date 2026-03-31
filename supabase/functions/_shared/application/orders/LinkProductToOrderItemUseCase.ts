import { createStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import { createProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import type { IProductLinkRepository } from "../../domain/orders/ports/IProductLinkRepository.ts";
import { OrderStatusEngine } from "./OrderStatusEngine.ts";

export interface LinkProductInput {
  readonly orderId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly organizationId: string;
  readonly isPermanent: boolean;
}

export interface LinkProductResult {
  readonly orderId: string;
  readonly newStatus: OrderStatus;
  readonly statusChanged: boolean;
}

/** Orchestrates order-item product linking and post-link status recalculation. */
export class LinkProductToOrderItemUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly productLinkRepo: IProductLinkRepository,
    private readonly engine: OrderStatusEngine,
  ) {}

  async execute(input: LinkProductInput): Promise<LinkProductResult> {
    const beforeOrder = await this.orderRepo.findById(input.orderId);
    if (!beforeOrder) throw new Error(`Order ${input.orderId} not found`);

    const targetItem = beforeOrder.items.find((item) => item.id === input.orderItemId);
    if (!targetItem) throw new Error(`Order item ${input.orderItemId} not found`);

    if (input.isPermanent && targetItem.marketplaceItemId) {
      await this.productLinkRepo.upsertPermanentLink({
        organizationId: input.organizationId,
        marketplaceItemId: targetItem.marketplaceItemId,
        productId: input.productId,
      });
    }

    if (targetItem.productId !== input.productId) {
      await this.orderRepo.updateOrderItemsProductId(input.orderId, [{ id: input.orderItemId, productId: input.productId }]);
    }

    const afterOrder = await this.orderRepo.findById(input.orderId);
    if (!afterOrder) throw new Error(`Order ${input.orderId} not found after linking`);

    const unlinkedCount = afterOrder.items.filter((item) => item.productId === null).length;
    const newStatus = this.engine.calculate(afterOrder.marketplaceSignals, createProductLinkState(unlinkedCount));
    const statusChanged = newStatus !== afterOrder.currentStatus;

    if (statusChanged) {
      await this.orderRepo.updateStatus({
        orderId: input.orderId,
        currentStatus: afterOrder.currentStatus,
        newStatus,
      });
      await this.orderRepo.addStatusHistory(
        input.orderId,
        createStatusChangedEvent({
          orderId: input.orderId,
          organizationId: input.organizationId,
          previousStatus: afterOrder.currentStatus,
          newStatus,
          source: "user_action",
        }),
      );
    }

    return { orderId: input.orderId, newStatus, statusChanged };
  }
}
