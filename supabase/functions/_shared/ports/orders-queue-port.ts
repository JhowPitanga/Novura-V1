/**
 * Port for enqueueing and consuming OrderSyncQueueMessage domain events.
 * Adapter: SupabaseOrdersQueueAdapter (adapters/orders-queue/orders-queue-adapter.ts).
 */

import type {
  OrderSyncQueueMessage,
  QueueEnvelope,
} from "../domain/orders/order-queue-message.types.ts";

export interface OrdersQueuePort {
  /** Enqueue a domain event. Returns the pgmq msg_id. */
  enqueue(message: OrderSyncQueueMessage): Promise<bigint>;

  /** Read up to `size` messages, locking them for `visibilityTimeoutSec` seconds. */
  readBatch(
    size: number,
    visibilityTimeoutSec: number,
  ): Promise<QueueEnvelope[]>;

  /**
   * Archive a successfully processed message.
   * Archived messages move to pgmq.a_orders_sync for observability — not deleted.
   */
  archive(msgId: bigint): Promise<void>;
}

