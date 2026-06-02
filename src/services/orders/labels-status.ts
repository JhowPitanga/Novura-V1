import { supabase } from "@/integrations/supabase/client";

export async function markOrdersPrinted(
  orderIds: string[],
  organizationId: string,
): Promise<void> {
  if (!orderIds || orderIds.length === 0) return;
  const { error } = await (supabase as any).functions.invoke("mark-labels-printed", {
    body: { orderIds, organizationId },
  });
  if (error) {
    throw new Error(`markOrdersPrinted failed: ${error.message}`);
  }
}

export async function updateOrdersInternalStatus(
  orderIds: string[],
  status: string,
): Promise<void> {
  if (!orderIds || orderIds.length === 0) return;
  await (supabase as any)
    .from("orders")
    .update({ status })
    .in("id", orderIds);
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  source: string;
}

/** Fetch append-only status history for an order (newest last). */
export async function fetchOrderStatusHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
  const { data, error } = await (supabase as any)
    .from("order_status_history")
    .select("id, order_id, from_status, to_status, changed_at, source")
    .eq("order_id", orderId)
    .order("changed_at", { ascending: true });

  if (error) throw new Error(`fetchOrderStatusHistory failed: ${error.message}`);

  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    orderId: String(row.order_id),
    fromStatus: row.from_status != null ? String(row.from_status) : null,
    toStatus: String(row.to_status),
    changedAt: String(row.changed_at),
    source: String(row.source),
  }));
}
