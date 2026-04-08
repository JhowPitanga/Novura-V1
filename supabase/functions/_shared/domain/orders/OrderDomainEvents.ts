import type { OrderStatus } from './OrderStatus.ts';

/**
 * Domain events emitted by the order status subsystem.
 *
 * These events decouple status calculation from side effects (inventory,
 * notifications, etc.). Handlers subscribe to events instead of being invoked
 * directly from the engine.
 *
 * All event shapes are immutable: every field is readonly.
 */

import type { OrderStatus } from './OrderStatus.ts';

/** Fired when an order's internal status changes. */
export type OrderStatusChangedEvent = {
  readonly type: 'ORDER_STATUS_CHANGED';
  readonly orderId: string;
  readonly organizationId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  /** ISO 8601 timestamp when the change was recorded */
  readonly changedAt: string;
  readonly source: 'webhook' | 'user_action' | 'sync';
};

/** Fired when an order line item is linked to a catalog product. */
export type ProductLinkedEvent = {
  readonly type: 'PRODUCT_LINKED';
  readonly orderId: string;
  readonly organizationId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly isPermanent: boolean;
  /** ISO 8601 timestamp when the link was created */
  readonly linkedAt: string;
};

/** Fired when the shipping label is marked as printed. */
export type LabelPrintedEvent = {
  readonly type: 'LABEL_PRINTED';
  readonly orderId: string;
  readonly organizationId: string;
  /** ISO 8601 timestamp when printing was recorded */
  readonly printedAt: string;
};

/** Discriminated union of all order-related domain events. */
export type OrderDomainEvent =
  | OrderStatusChangedEvent
  | ProductLinkedEvent
  | LabelPrintedEvent;

/**
 * Builds an OrderStatusChangedEvent with `changedAt` set to the current instant (ISO 8601).
 *
 * Callers must supply identifiers, status transition, and the change source;
 * the timestamp is always generated here so it stays consistent.
 */
export function createStatusChangedEvent(params: {
  orderId: string;
  organizationId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  source: OrderStatusChangedEvent['source'];
}): OrderStatusChangedEvent {
  return {
    type: 'ORDER_STATUS_CHANGED',
    orderId: params.orderId,
    organizationId: params.organizationId,
    previousStatus: params.previousStatus,
    newStatus: params.newStatus,
    changedAt: new Date().toISOString(),
    source: params.source,
  };
}
