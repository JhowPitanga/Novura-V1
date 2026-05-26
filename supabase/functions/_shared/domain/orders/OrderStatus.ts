/**
 * Internal order status for Novura.
 *
 * Represents the current stage of the order in the seller's fulfillment pipeline.
 * This enum is the single source of truth — every other place that needs an order
 * status must import from here.
 *
 * Priority order (for calculation): see OrderStatusEngine.ts
 *
 * NOTE: Values are canonical english slugs for persistence and integrations.
 * UI labels in pt-BR are provided by getOrderStatusLabel().
 */
export enum OrderStatus {
  /** Order cancelled by the marketplace or refunded */
  CANCELLED = 'cancelled',

  /** Order returned by the buyer */
  RETURNED = 'returned',

  /**
   * At least one order item is not yet linked to a catalog product.
   * BLOCKING status — prevents the order from advancing in the pipeline.
   */
  UNLINKED = 'unlinked',

  /**
   * Invoice (NF-e) must be issued before the order is dispatched.
   * ML: shipment_substatus = 'invoice_pending'
   * Shopee: ready_to_ship without invoice_number
   */
  INVOICE_PENDING = 'invoice_pending',

  /** Order is ready to print the shipping label */
  READY_TO_PRINT = 'ready_to_print',

  /** Label printed, awaiting carrier pickup */
  AWAITING_PICKUP = 'awaiting_pickup',

  /**
   * Order shipped / in transit / delivered.
   * Also covers fulfillment orders (ML Full / Shopee Full).
   */
  SHIPPED = 'shipped',

  /** Initial state — order arrived but no more specific condition applies */
  PENDING = 'pending',
}

/**
 * Maps an OrderStatus enum value to its display label in pt-BR.
 *
 * Used by the OrderStatusBadge frontend component.
 * Guaranteed to be exhaustive — TypeScript will error if a new enum member is
 * added without a corresponding label entry.
 */
export function getOrderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.CANCELLED]: 'Cancelado',
    [OrderStatus.RETURNED]: 'Devolução',
    [OrderStatus.UNLINKED]: 'A vincular',
    [OrderStatus.INVOICE_PENDING]: 'Emissão NF',
    [OrderStatus.READY_TO_PRINT]: 'Impressão',
    [OrderStatus.AWAITING_PICKUP]: 'Aguardando Coleta',
    [OrderStatus.SHIPPED]: 'Enviado',
    [OrderStatus.PENDING]: 'Pendente',
  };
  return labels[status];
}
