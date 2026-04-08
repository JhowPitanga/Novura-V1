import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import type { IProductLinkRepository } from "../../domain/orders/ports/IProductLinkRepository.ts";
import type { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface LinkProductInput {
  readonly orderId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly organizationId: string;
  readonly isPermanent: boolean;
}

export interface LinkProductResult {
  readonly orderId: string;
  readonly remainingUnlinkedCount: number;
  readonly statusChanged: boolean;
  readonly newStatus?: OrderStatus;
}

/** Orchestrates order-item product linking and post-link status recalculation. */
export class LinkProductToOrderItemUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly productLinkRepo: IProductLinkRepository,
    private readonly recalculateStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: LinkProductInput): Promise<LinkProductResult> {
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) throw new Error(`Order ${input.orderId} not found`);

    const targetItem = order.items.find((i) => i.id === input.orderItemId);
    if (!targetItem)
      throw new Error(
        `OrderItem ${input.orderItemId} not found in order ${input.orderId}`,
      );

    if (input.isPermanent && targetItem.marketplaceItemId) {
      await this.productLinkRepo.upsertPermanentLink({
        organizationId: input.organizationId,
        marketplace: order.marketplace,
        marketplaceItemId: targetItem.marketplaceItemId,
        variationId: targetItem.variationId ?? "",
        productId: input.productId,
      });
    }

    if (targetItem.productId !== input.productId) {
      await this.orderRepo.updateOrderItemsProductId(input.orderId, [
        { id: input.orderItemId, productId: input.productId },
      ]);
    }

    const afterOrder = await this.orderRepo.findById(input.orderId);
    if (!afterOrder)
      throw new Error(`Order ${input.orderId} not found after update`);

    const unlinkedCount = afterOrder.items.filter((i) => !i.productId && !i.sellerSku).length;

    if (unlinkedCount === 0) {
      const result = await this.recalculateStatus.execute(input.orderId, "user_action");
      return {
        orderId: input.orderId,
        remainingUnlinkedCount: 0,
        statusChanged: result !== null,
        newStatus: result?.newStatus,
      };
    }

    return {
      orderId: input.orderId,
      remainingUnlinkedCount: unlinkedCount,
      statusChanged: false,
    };
  }
}
