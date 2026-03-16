/**
 * Domain Events for the orders sync queue.
 * Minimal information captured at the webhook boundary so the worker can
 * fetch the full order from the marketplace and upsert into the orders tables.
 */

/** ML sent a notification that an order was created or updated. */
export interface MlOrderQueueMessage {
  marketplace: "mercado_livre";
  marketplace_order_id: string; // extracted from notification.resource URL
  meli_user_id: string; // from notification.user_id — used to look up integration
}

/** Shopee sent a push that an order was created or updated. */
export interface ShopeeOrderQueueMessage {
  marketplace: "shopee";
  order_sn: string;
  shop_id: number;
}

export type OrderSyncQueueMessage =
  | MlOrderQueueMessage
  | ShopeeOrderQueueMessage;

/** pgmq message envelope — returned by pgmq_public.read() */
export interface QueueEnvelope {
  msg_id: bigint;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: OrderSyncQueueMessage;
}

export function isMlOrderQueueMessage(
  m: OrderSyncQueueMessage,
): m is MlOrderQueueMessage {
  return m.marketplace === "mercado_livre";
}

export function isShopeeOrderQueueMessage(
  m: OrderSyncQueueMessage,
): m is ShopeeOrderQueueMessage {
  return m.marketplace === "shopee";
}

