/**
 * Shopee order push/notification payload.
 * Example: { data: { ordersn: "220810QSK8S7BX", status: "PROCESSED", completed_scenario: "NORMAL", update_time: 1660123127, items: [] }, shop_id: 727720655, code: 3, timestamp: 1660123127 }
 */

export interface ShopeeOrderPushData {
  ordersn?: string;
  status?: string;
  completed_scenario?: string;
  update_time?: number;
  items?: unknown[];
}

export interface ShopeeOrderPushPayload {
  data?: ShopeeOrderPushData;
  shop_id?: number;
  code?: number;
  timestamp?: number;
  /** Some senders put order_sn at top level. */
  order_sn?: string;
  ordersn?: string;
}

export function isShopeeOrderPushPayload(x: unknown): x is ShopeeOrderPushPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const hasShopId = typeof o.shop_id === "number";
  const data = o.data as Record<string, unknown> | undefined;
  const hasOrderSn =
    (data != null && typeof data.ordersn === "string") ||
    typeof o.order_sn === "string" ||
    typeof o.ordersn === "string";
  return hasShopId && hasOrderSn;
}

export function getShopeePushOrderSn(payload: ShopeeOrderPushPayload): string | null {
  const sn =
    payload.data?.ordersn ??
    payload.order_sn ??
    payload.ordersn ??
    null;
  return sn != null && typeof sn === "string" && sn.trim() !== "" ? String(sn).trim() : null;
}

export function getShopeePushShopId(payload: ShopeeOrderPushPayload): number | null {
  const id = payload.shop_id ?? null;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}
