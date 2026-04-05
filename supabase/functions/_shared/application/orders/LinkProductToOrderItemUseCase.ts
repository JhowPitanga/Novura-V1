import type { IOrderRepository } from "../../domain/orders/ports/IOrderRepository.ts";
import type { IProductLinkRepository } from "../../domain/orders/ports/IProductLinkRepository.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import type { RecalculateOrderStatusUseCase } from "./RecalculateOrderStatusUseCase.ts";

export interface LinkProductInput {
  readonly orderId: string;
  readonly organizationId: string;
  readonly marketplace: string;
  readonly links: ReadonlyArray<{
    /** Real UUID from order_items.id — must not be a synthetic/display ID. */
    readonly orderItemId: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
    /** When true, persists link in marketplace_item_product_links for future orders. */
    readonly isPermanent: boolean;
  }>;
}

export interface LinkProductResult {
  readonly orderId: string;
  /** Items still without a product link after this operation. */
  readonly remainingUnlinkedCount: number;
  /** Whether the order status changed as a result of all items being linked. */
  readonly statusChanged: boolean;
  readonly newStatus?: OrderStatus;
}

/**
 * Orchestrates batch product linking for order items.
 *
 * Steps:
 * 1. Persist permanent links to marketplace_item_product_links
 * 2. Update order_items.product_id for each linked item
 * 3. Count remaining unlinked items from the updated order
 * 4. Trigger status recalculation when all items are linked (unlinkedCount === 0)
 *
 * Does NOT manage stock directly — HandleStockSideEffectsUseCase is called
 * internally by RecalculateOrderStatusUseCase when the status changes.
 */
export class LinkProductToOrderItemUseCase {
  constructor(
    private readonly orderRepo: IOrderRepository,
    private readonly productLinkRepo: IProductLinkRepository,
    private readonly recalculate: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: LinkProductInput): Promise<LinkProductResult> {
    // 1. Persist permanent links in parallel
    const permanentLinks = input.links.filter((l) => l.isPermanent);
    await Promise.all(
      permanentLinks.map((link) =>
        this.productLinkRepo.upsertPermanentLink({
          organizationId: input.organizationId,
          marketplaceItemId: link.marketplaceItemId,
          productId: link.productId,
        })
      ),
    );

    // 2. Update order_items.product_id for all links in batch
    await this.orderRepo.updateOrderItemsProductId(
      input.orderId,
      input.links.map((l) => ({ id: l.orderItemId, productId: l.productId })),
    );

    // 3. Reload order to get authoritative unlinked count
    const updatedOrder = await this.orderRepo.findById(input.orderId);
    if (!updatedOrder) throw new Error(`Order ${input.orderId} not found after linking`);
    const remainingUnlinkedCount = updatedOrder.items.filter((i) => i.productId === null).length;

    // 4. Recalculate status only when all items are now linked
    if (remainingUnlinkedCount === 0) {
      const result = await this.recalculate.execute(input.orderId);
      return {
        orderId: input.orderId,
        remainingUnlinkedCount: 0,
        statusChanged: result !== null,
        newStatus: result?.newStatus,
      };
    }

    return {
      orderId: input.orderId,
      remainingUnlinkedCount,
      statusChanged: false,
    };
  }
}
