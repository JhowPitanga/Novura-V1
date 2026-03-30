/**
 * Internal order status for Novura.
 *
 * Represents the current stage of the order in the seller's fulfillment pipeline.
 * This enum is the single source of truth — every other place that needs an order
 * status must import from here.
 *
 * Priority order (for calculation): see OrderStatusEngine.ts
 *
 * NOTE: Values are pt-BR slugs used in the database. Do NOT change them without
 * a corresponding database migration.
 */
export enum OrderStatus {
  /** Order cancelled by the marketplace or refunded */
  CANCELLED = 'cancelado',

  /** Order returned by the buyer */
  RETURNED = 'devolucao',

  /**
   * At least one order item is not yet linked to a catalog product.
   * BLOCKING status — prevents the order from advancing in the pipeline.
   */
  UNLINKED = 'a_vincular',

  /**
   * Invoice (NF-e) must be issued before the order is dispatched.
   * ML: shipment_substatus = 'invoice_pending'
   * Shopee: ready_to_ship without invoice_number
   */
  INVOICE_PENDING = 'emissao_nf',

  /** Order is ready to print the shipping label */
  READY_TO_PRINT = 'impressao',

  /** Label printed, awaiting carrier pickup */
  AWAITING_PICKUP = 'aguardando_coleta',

  /**
   * Order shipped / in transit / delivered.
   * Also covers fulfillment orders (ML Full / Shopee Full).
   */
  SHIPPED = 'enviado',

  /** Initial state — order arrived but no more specific condition applies */
  PENDING = 'pendente',
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
