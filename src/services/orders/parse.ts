// ENGINEERING_STANDARDS §1 exception: ~220 LOC — irreducible ~40-field Order mapping;
// internal helpers (mapInternalStatusToLabel, toOrderFinancialInfo, extractEmbeddedRow) are single-caller only.

import { supabase } from "@/integrations/supabase/client";
import type { Order, OrderFinancialInfo, OrderItem } from "@/types/orders";
import { buildFinancials, buildLabelInfo, ensureHttpUrl, normalizeShippingType, resolveLinkedSku } from "@/utils/orderUtils";

const ORDERS_SELECT_FIELDS = `
  id, organization_id, marketplace, marketplace_order_id, pack_id,
  status, marketplace_status, payment_status,
  gross_amount, marketplace_fee, shipping_cost, shipping_subsidy, net_amount,
  buyer_name, buyer_document, buyer_email, buyer_phone, buyer_state,
  created_at, shipped_at, delivered_at, canceled_at, last_synced_at,
  is_printed_label, label_printed_at, has_invoice, is_fulfillment,
  order_items (
    id, marketplace_item_id, sku, title, quantity, unit_price,
    unit_cost, variation_name, image_url, product_id
  ),
  order_shipping (
    shipment_id, logistic_type, tracking_number, carrier,
    status, substatus, street_name, street_number, complement,
    neighborhood, city, state_uf, zip_code, sla_expected_date,
    sla_status, estimated_delivery
  ),
  order_labels (id)
`;


function mapInternalStatusToLabel(value: unknown): string {
  const status = String(value || "").trim().toLowerCase();
  const labels: Record<string, string> = {
    pending: "Pendente",
    unlinked: "A vincular",
    invoice_pending: "Emissao NF",
    ready_to_print: "Impressao",
    awaiting_pickup: "Aguardando Coleta",
    shipped: "Enviado",
    cancelled: "Cancelado",
    returned: "Devolução",
  };
  if (labels[status]) return labels[status];
  return String(value || "Pendente");
}

/** Maps buildFinancials (Portuguese keys) result to OrderFinancialInfo. */
function toOrderFinancialInfo(raw: {
  valorPedido?: number;
  taxaFrete?: number;
  taxaMarketplace?: number;
  cupom?: number;
  impostos?: number;
  liquido?: number;
  margem?: number;
  freteRecebido?: number;
  freteRecebidoLiquido?: number;
  saleFee?: number;
  shippingFeeBuyer?: number;
  custoProdutos?: number;
  custosExtras?: number;
}): OrderFinancialInfo {
  const toNum = (v: unknown): number => (typeof v === "number" ? v : Number(v)) || 0;
  return {
    orderAmount: toNum(raw.valorPedido),
    shippingCost: toNum(raw.taxaFrete),
    marketplaceFee: toNum(raw.taxaMarketplace),
    couponAmount: toNum(raw.cupom),
    taxAmount: toNum(raw.impostos),
    netAmount: toNum(raw.liquido),
    marginPercent: toNum(raw.margem),
    shippingReceived: raw.freteRecebido,
    shippingNetReceived: raw.freteRecebidoLiquido,
    saleFee: raw.saleFee,
    shippingFeeBuyer: raw.shippingFeeBuyer,
    productCost: raw.custoProdutos,
    extraCosts: raw.custosExtras,
  };
}

/** PostgREST may return a 1:1 embed as an object or as a single-element array. */
function extractEmbeddedRow(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (Array.isArray(value)) return (value[0] as Record<string, unknown>) ?? null;
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

/** Parse a single raw DB row from orders + nested order_items/order_shipping into Order. */
export function parseOrderRow(row: Record<string, unknown>): Order {
  const itemsRaw: Record<string, unknown>[] = Array.isArray(row?.order_items) ? row.order_items as Record<string, unknown>[] : [];
  const shippingRaw = extractEmbeddedRow(row?.order_shipping);

  const toNum = (v: unknown): number => (typeof v === "number" ? v : Number(v)) || 0;

  const mappedItems: OrderItem[] =
    itemsRaw.length > 0
      ? itemsRaw.map((it: Record<string, unknown>, idx: number) => ({
          id: `${row.marketplace_order_id || row.id}-ITEM-${idx + 1}`,
          // dbId holds the real order_items.id UUID — required by link-order-product edge function
          dbId: it.id ? String(it.id) : undefined,
          name: (it.title as string) || "Item",
          sku: (it.sku as string) ?? null,
          quantity: typeof it.quantity === "number" ? it.quantity : Number(it.quantity ?? 1) || 1,
          unitPrice: typeof it.unit_price === "number" ? it.unit_price : Number(it.unit_price ?? 0) || 0,
          unitCost: it.unit_cost != null ? toNum(it.unit_cost) : null,
          linked: Boolean(it.product_id),
          marketplace: row.marketplace as string,
          scanned: false,
          imageUrl: ensureHttpUrl(it.image_url as string) || "/placeholder.svg",
          marketplaceItemId: (it.marketplace_item_id as string) ?? null,
          variationId: (it.variation_name as string) ?? null,
          permalink: null,
          variationLabel: (it.variation_name as string) ?? null,
        }))
      : [
          {
            id: `${row.marketplace_order_id || row.id}-ITEM-1`,
            name: (row.buyer_name as string) || "Item",
            sku: null,
            quantity: 1,
            unitPrice: toNum(row.gross_amount),
            linked: false,
            marketplace: row.marketplace as string,
            scanned: false,
            imageUrl: "/placeholder.svg",
            marketplaceItemId: null,
            variationId: null,
            permalink: null,
            variationLabel: null,
          },
        ];

  const orderTotal = toNum(row.gross_amount);
  const totalQuantity = mappedItems.reduce((sum, it) => sum + it.quantity, 0);
  const shipmentStatusLower = String(shippingRaw?.status || "").toLowerCase();
  const statusUI =
    shipmentStatusLower === "delivered"
      ? "Entregue"
      : mapInternalStatusToLabel(row.status) || (row.marketplace_status as string) || "Pendente";

  const shippingReceived = toNum(row.shipping_subsidy);
  const marketplaceFee = toNum(row.marketplace_fee);
  const shippingCost = toNum(row.shipping_cost);
  const legacyItems = mappedItems.map((it) => ({ valor: it.unitPrice, quantidade: it.quantity }));
  const rawFinancials = buildFinancials(
    legacyItems,
    orderTotal,
    shippingReceived,
    marketplaceFee,
    (shippingRaw?.carrier as string) ?? null,
  );
  rawFinancials.taxaFrete = shippingCost;
  const financial = toOrderFinancialInfo(rawFinancials);

  const labelInfo = buildLabelInfo(row);
  // Build linked-products array from order_items when row.linked_products is absent (new schema)
  const linkedProductsArr: unknown[] = Array.isArray(row?.linked_products)
    ? (row.linked_products as unknown[])
    : itemsRaw
        .filter((it: Record<string, unknown>) => it.product_id)
        .map((it: Record<string, unknown>) => ({
          marketplace_item_id: it.marketplace_item_id,
          variation_id: it.variation_name,
          sku: it.sku,
          product_id: it.product_id,
        }));
  const rowForSku = {
    ...row,
    first_item_id: itemsRaw[0]?.marketplace_item_id ?? row.first_item_id,
    first_item_variation_id: itemsRaw[0]?.variation_name ?? row.first_item_variation_id,
  };
  const skuLinked = resolveLinkedSku(rowForSku, linkedProductsArr);

  // is_printed_label (new schema) takes precedence; fallback to order_labels join count (legacy)
  const printedLabel =
    Boolean(row?.is_printed_label) ||
    (Array.isArray(row?.order_labels) ? row.order_labels.length > 0 : Boolean(row?.printed_label));

  return {
    id: String(row.id),
    marketplace: String(row.marketplace),
    marketplaceOrderId: row.marketplace_order_id != null ? String(row.marketplace_order_id) : null,
    productTitle: mappedItems[0]?.name ?? "",
    sku: mappedItems[0]?.sku ?? null,
    customerName: String(row.buyer_name ?? ""),
    totalAmount: orderTotal,
    createdAt: String(row.created_at),
    paidAt: row.created_at != null ? String(row.created_at) : null,
    status: statusUI,
    internalStatus: row.status != null ? String(row.status) : null,
    subStatus: undefined,
    shippingType: normalizeShippingType(
      (shippingRaw?.logistic_type as string) ?? (row.is_fulfillment ? "fulfillment" : null),
    ),
    platformId: String(row.pack_id || row.marketplace_order_id || row.id),
    totalQuantity,
    imageUrl: mappedItems[0]?.imageUrl ?? "/placeholder.svg",
    items: mappedItems,
    financial,
    shippingCity: (shippingRaw?.city as string) ?? null,
    shippingStateName: null,
    shippingStateUf: (shippingRaw?.state_uf as string) ?? null,
    labelPrinted: printedLabel,
    pickingListPrinted: false,
    linkedSku: skuLinked ?? undefined,
    label: labelInfo,
    linkedProducts: linkedProductsArr.length ? linkedProductsArr : undefined,
    hasUnlinkedItems: itemsRaw.some((it) => !it.product_id),
    shipmentStatus: (shippingRaw?.status as string) ?? null,
    shippingSla: {
      status: (shippingRaw?.sla_status as string) ?? null,
      service: (shippingRaw?.carrier as string) ?? null,
      expectedDate: (shippingRaw?.sla_expected_date ?? shippingRaw?.estimated_delivery) as string ?? null,
      lastUpdated: null,
    },
    shippingDelays: undefined,
    shippedAt: row.shipped_at != null ? String(row.shipped_at) : null,
    deliveredAt: row.delivered_at != null ? String(row.delivered_at) : null,
    canceledAt: row.canceled_at != null ? String(row.canceled_at) : null,
    labelPrintedAt: row.label_printed_at != null ? String(row.label_printed_at) : null,
    hasInvoice: Boolean(row.has_invoice),
    lastSyncedAt: row.last_synced_at != null ? String(row.last_synced_at) : null,
    paymentStatus: row.payment_status != null ? String(row.payment_status) : null,
    buyerState: row.buyer_state != null ? String(row.buyer_state) : null,
  };
}

/** Fetch all orders for an organization. Returns Order[] from normalized tables. */
export async function fetchAllOrders(orgId: string): Promise<Order[]> {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(ORDERS_SELECT_FIELDS)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchAllOrders failed: ${error.message}`);
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [];
  return rows.map(parseOrderRow);
}

/** Fetch a single order by id (for realtime updates). Returns full Order with items and shipping. */
export async function fetchOrderById(orgId: string, orderId: string): Promise<Order> {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(ORDERS_SELECT_FIELDS)
    .eq("organization_id", orgId)
    .eq("id", orderId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Pedido não encontrado");
  return parseOrderRow(data as Record<string, unknown>);
}
