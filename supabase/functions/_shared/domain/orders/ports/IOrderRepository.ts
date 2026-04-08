import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { OrderStatus } from "../OrderStatus.ts";
import type { OrderStatusChangedEvent } from "../OrderDomainEvents.ts";

/**
 * Minimal immutable item snapshot needed by the status engine and link flows.
 */
export interface OrderRecordItem {
  readonly id: string;
  readonly marketplaceItemId: string;
  readonly variationId: string | null;
  readonly sellerSku: string | null;
  readonly productId: string | null;
  readonly quantity: number;
}

/**
 * Immutable order DTO used by application use cases to recalculate status.
 * Implementations must return a fully populated object for status evaluation.
 */
export interface OrderRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly marketplace: MarketplaceSignals["marketplace"];
  readonly marketplaceOrderId: string;
  readonly currentStatus: OrderStatus | null;
  readonly marketplaceSignals: MarketplaceSignals;
  readonly items: ReadonlyArray<OrderRecordItem>;
}

/**
 * Immutable result contract for status update writes.
 */
export interface StatusUpdateResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly updatedAt: string;
}

/**
 * Port for order persistence in the status engine.
 *
 * Implementations must be idempotent: repeated calls with the same parameters
 * cannot create duplicated side effects or inconsistent status history records.
 */
export interface IOrderRepository {
  /**
   * Loads an order by internal id.
   * Returns null when the order does not exist.
   */
  findById(orderId: string): Promise<OrderRecord | null>;

  /**
   * Busca um pedido pelo ID do marketplace.
   * Usado pelo webhook handler quando só temos o ID externo.
   */
  findByMarketplaceOrderId(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceOrderId: string;
  }): Promise<OrderRecord | null>;

  /**
   * Updates the order status using optimistic concurrency control.
   *
   * Implementations must only update when persisted status equals currentStatus.
   * If the row was concurrently modified, the implementation should fail.
   * This operation must be idempotent for retries with identical parameters.
   */
  updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<StatusUpdateResult>;

  /**
   * Marca etiquetas como impressas e atualiza timestamp.
   * Operação atômica para batch de pedidos.
   * Chamado pelo MarkOrderLabelPrintedUseCase.
   */
  markLabelPrinted(params: {
    readonly orderIds: ReadonlyArray<string>;
    readonly organizationId: string;
  }): Promise<void>;

  /**
   * Persists product links for order items.
   * Repeated executions with the same ids/productIds must be safe.
   */
  updateOrderItemsProductId(
    orderId: string,
    items: ReadonlyArray<{
      readonly id: string;
      readonly productId: string;
    }>,
  ): Promise<void>;

  /**
   * Appends a status history audit entry.
   * Implementations must prevent duplicate history rows for retried events.
   */
  addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void>;
}
