import { supabase } from "@/integrations/supabase/client";

export async function fetchOrderByInternalId(
  orderId: string,
): Promise<{ marketplace_order_id: string; marketplace: string }> {
  const { data: row, error: rowErr } = await (supabase as any)
    .from("orders")
    .select("marketplace_order_id, marketplace")
    .eq("id", orderId)
    .limit(1)
    .single();
  if (rowErr || !row) throw new Error(rowErr?.message || "Pedido não encontrado");
  return {
    marketplace_order_id: String((row as any).marketplace_order_id || ""),
    marketplace: String((row as any).marketplace || ""),
  };
}

/** Resolve organization ID from user if not directly available. */
export async function resolveOrgId(userId: string): Promise<string | null> {
  try {
    const { data: rpcOrg } = await (supabase as any).rpc('get_user_organization_id', { p_user_id: userId });
    return Array.isArray(rpcOrg) ? (rpcOrg?.[0] as string | null) : (rpcOrg as string | null);
  } catch {
    return null;
  }
}

/** Fetch the 10 most recent orders — used by the chat module picker. */
export async function fetchRecentOrdersSummary(): Promise<Array<{
  id: string;
  marketplace_order_id: string | null;
  buyer_name: string | null;
  created_at: string;
  gross_amount: number | null;
}>> {
  const { data, error } = await (supabase as any)
    .from('orders')
    .select('id, marketplace_order_id, buyer_name, created_at, gross_amount')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[orders.service] fetchRecentOrdersSummary error:', error.message);
    return [];
  }
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    id: String(r.id ?? ''),
    marketplace_order_id: r.marketplace_order_id != null ? String(r.marketplace_order_id) : null,
    buyer_name: r.buyer_name != null ? String(r.buyer_name) : null,
    created_at: String(r.created_at ?? ''),
    gross_amount: r.gross_amount != null ? Number(r.gross_amount) : null,
  }));
}

/** Minimal order + first-item row needed to build a marketplace item link. */
interface OrderItemLinkRow {
  marketplace: string;
  firstItemPermalink: string | null;
  firstItemId: string | null;
  firstItemTitle: string | null;
}

/** Fetch the data required to build a marketplace product link for a given order. */
export async function fetchOrderItemLinkData(orderId: string): Promise<OrderItemLinkRow | null> {
  if (!orderId) return null;

  const { data, error } = await (supabase as any)
    .from('orders')
    .select('marketplace, order_items ( marketplace_item_id, title )')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('[orders.service] fetchOrderItemLinkData error:', error.message);
    return null;
  }
  if (!data) return null;

  const firstItem = Array.isArray(data.order_items) ? data.order_items[0] ?? null : null;
  return {
    marketplace: String(data.marketplace ?? ''),
    firstItemPermalink: null, // order_items does not store a permalink
    firstItemId: firstItem ? String(firstItem.marketplace_item_id ?? '') : null,
    firstItemTitle: firstItem ? String(firstItem.title ?? '') : null,
  };
}
