/**
 * Persistence adapter for pgmq via Supabase's pgmq_public schema.
 * Implements OrdersQueuePort.
 * pgmq_public is the Data API-safe wrapper over pgmq (see Supabase Queues docs).
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { OrdersQueuePort } from "../../ports/orders-queue-port.ts";
import type {
  OrderSyncQueueMessage,
  QueueEnvelope,
} from "../../domain/orders/order-queue-message.types.ts";

const QUEUE_NAME = "orders_sync";

export class SupabaseOrdersQueueAdapter implements OrdersQueuePort {
  constructor(private readonly admin: SupabaseClient) {}

  async enqueue(message: OrderSyncQueueMessage): Promise<bigint> {
    const { data, error } = await this.admin
      .schema("pgmq_public")
      .rpc("send", { queue_name: QUEUE_NAME, message });
    if (error) {
      throw new Error(`[orders-queue] enqueue failed: ${error.message}`);
    }
    return BigInt(data as number);
  }

  async readBatch(
    size: number,
    visibilityTimeoutSec: number,
  ): Promise<QueueEnvelope[]> {
    const { data, error } = await this.admin.schema("pgmq_public").rpc("read", {
      queue_name: QUEUE_NAME,
      sleep_seconds: visibilityTimeoutSec,
      n: size,
    });
    if (error) {
      throw new Error(`[orders-queue] readBatch failed: ${error.message}`);
    }
    return (data as QueueEnvelope[]) ?? [];
  }

  async archive(msgId: bigint): Promise<void> {
    const { error } = await this.admin
      .schema("pgmq_public")
      .rpc("archive", { queue_name: QUEUE_NAME, msg_id: Number(msgId) });
    if (error) {
      // Log but do not throw — archive failure must not re-queue an already-processed order
      console.error(
        `[orders-queue] archive failed for msg ${msgId}: ${error.message}`,
      );
    }
  }
}

