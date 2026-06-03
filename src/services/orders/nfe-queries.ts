import { supabase } from "@/integrations/supabase/client";

/** Row shape returned by fetchNfeStatusRows. */
export interface NfeStatusRow {
  order_id: string | null;
  marketplace_order_id: string | null;
  /** Normalised status (was status_focus in notas_fiscais). */
  status_focus: string | null;
  /** Emission environment (was emissao_ambiente in notas_fiscais). */
  emissao_ambiente: string | null;
  marketplace: string | null;
  xml_url: string | null;
  marketplace_submission_status: string | null;
  /** Plain-text error message (was error_details jsonb in notas_fiscais). */
  error_details: string | null;
}

/** Maps an invoices row to the NfeStatusRow shape consumed by useNfeStatus. */
function normalizeInvoiceToNfeRow(row: Record<string, unknown>): NfeStatusRow {
  return {
    order_id: row.order_id != null ? String(row.order_id) : null,
    marketplace_order_id: row.marketplace_order_id != null ? String(row.marketplace_order_id) : null,
    status_focus: row.status != null ? String(row.status) : null,
    emissao_ambiente: row.emission_environment != null ? String(row.emission_environment) : null,
    marketplace: row.marketplace != null ? String(row.marketplace) : null,
    xml_url: row.xml_url != null ? String(row.xml_url) : null,
    marketplace_submission_status: row.marketplace_submission_status != null ? String(row.marketplace_submission_status) : null,
    error_details: row.error_message != null ? String(row.error_message) : null,
  };
}

export async function fetchNfeStatusRows(
  companyId: string,
  orderIds: string[],
  marketplaceOrderIds: string[],
): Promise<NfeStatusRow[]> {
  let q: any = (supabase as any)
    .from("invoices")
    .select("order_id, marketplace_order_id, status, emission_environment, marketplace, xml_url, marketplace_submission_status, error_message")
    .eq("company_id", companyId);
  if (orderIds.length > 0 && marketplaceOrderIds.length > 0) {
    const a = orderIds.join(",");
    const b = marketplaceOrderIds.join(",");
    q = q.or(`order_id.in.(${a}),marketplace_order_id.in.(${b})`);
  } else if (orderIds.length > 0) {
    q = q.in("order_id", orderIds);
  } else if (marketplaceOrderIds.length > 0) {
    q = q.in("marketplace_order_id", marketplaceOrderIds);
  }
  const { data } = await q;
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  return rows.map(normalizeInvoiceToNfeRow);
}

/** Row shape returned by fetchNfeEmissionOrders, used by NfeEmissionList. */
export interface NfeEmissionOrderData {
  id: string;
  marketplace_order_id: string;
  customer_name: string;
  order_total: number;
  status: string;
  created_at: string;
  order_items: Array<{ product_name: string; quantity: number; sku: string }>;
  marketplace: string;
  platform_id: string;
  shipping_type: string;
}

export interface NfeEmissionOrdersResult {
  orders: NfeEmissionOrderData[];
  count: number;
}

/** Fetch orders pending NFe emission for a given organization. */
export async function fetchNfeEmissionOrders(
  orgId: string | null,
  offset: number,
  limit: number,
): Promise<NfeEmissionOrdersResult> {
  const NFE_STATUSES = ['invoice_pending'];
  let q: any = (supabase as any)
    .from('orders')
    .select(
      `id, marketplace_order_id, created_at, marketplace, gross_amount, status, buyer_name, pack_id,
       order_items (title, quantity, sku, marketplace_item_id),
       order_shipping (logistic_type)`,
      { count: 'exact' },
    )
    .in('status', NFE_STATUSES)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (orgId) q = q.eq('organization_id', orgId);
  const { data, error, count } = await q;
  if (error) throw new Error(`fetchNfeEmissionOrders failed: ${error.message}`);
  const rows: any[] = Array.isArray(data) ? data : [];
  const orders: NfeEmissionOrderData[] = rows.map((o: any) => {
    const items: any[] = Array.isArray(o?.order_items) ? o.order_items : [];
    const firstItem = items[0];
    const shipping = Array.isArray(o?.order_shipping) ? o.order_shipping[0] : o?.order_shipping;
    const totalQty = items.reduce((sum: number, it: any) => sum + Number(it?.quantity ?? 0), 0) || 1;
    return {
      id: String(o.id),
      marketplace_order_id: String(o.marketplace_order_id || o.id),
      customer_name: String(o.buyer_name ?? ''),
      order_total: Number(o.gross_amount ?? 0),
      status: String(o.status ?? ''),
      created_at: String(o.created_at),
      order_items: items.length > 0
        ? items.map((it: any) => ({
            product_name: String(it?.title ?? ''),
            quantity: Number(it?.quantity ?? 1),
            sku: String(it?.sku ?? ''),
          }))
        : [{ product_name: '', quantity: totalQty, sku: '' }],
      marketplace: String(o.marketplace ?? ''),
      platform_id: String(firstItem?.marketplace_item_id ?? o.pack_id ?? o.marketplace_order_id ?? o.id),
      shipping_type: String(shipping?.logistic_type ?? ''),
    };
  });
  return { orders, count: count ?? 0 };
}
