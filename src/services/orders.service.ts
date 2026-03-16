import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import type { Order, OrderItem, OrderFinancialInfo } from "@/types/orders";
import { buildFinancials, buildLabelInfo, ensureHttpUrl, normalizeShippingType, resolveLinkedSku } from "@/utils/orderUtils";

async function getAuthToken(): Promise<string> {
  const { data: sessionRes } = await (supabase as any).auth.getSession();
  const token: string | undefined = sessionRes?.session?.access_token;
  if (!token) throw new Error("Sessão expirada ou ausente. Faça login novamente.");
  return token;
}

export async function getCompanyIdForOrg(organizationId: string): Promise<string | null> {
  if (!organizationId) return null;
  const { data: companiesForOrg } = await (supabase as any)
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);
  return Array.isArray(companiesForOrg) && companiesForOrg.length > 0
    ? String(companiesForOrg[0].id)
    : null;
}

export async function syncMercadoLivreOrders(
  organizationId: string,
  orderIds?: string[],
): Promise<any> {
  const token = await getAuthToken();
  const body: any = { organizationId };
  if (orderIds && orderIds.length > 0) {
    body.order_ids = orderIds;
  }
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function syncShopeeOrders(
  organizationId: string,
  shopId: number,
  opts?: {
    orderSnList?: string[];
    timeFrom?: number;
    timeTo?: number;
  },
): Promise<any> {
  const token = await getAuthToken();
  const payload: any = { organizationId, shop_id: shopId };
  if (opts?.orderSnList && opts.orderSnList.length > 0) {
    payload.order_sn_list = opts.orderSnList;
  }
  if (opts?.timeFrom) payload.time_from = opts.timeFrom;
  if (opts?.timeTo) payload.time_to = opts.timeTo;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function syncNfeForOrder(
  organizationId: string,
  companyId: string,
  orderId: string,
  environment: string,
): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
  const { error } = await (supabase as any).functions.invoke("focus-nfe-sync", {
    body: { organizationId, companyId, orderIds: [orderId], environment },
    headers,
  } as any);
  if (error) throw error;
}

export async function submitXmlSend(
  organizationId: string,
  companyId: string,
  marketplaceOrderId: string,
): Promise<{ notaFiscalId: string; nfeKey: string; marketplace: string }> {
  const { data: nfSel, error: nfErr } = await (supabase as any)
    .from("notas_fiscais")
    .select("id, nfe_key, marketplace, marketplace_order_id")
    .eq("company_id", companyId)
    .eq("marketplace_order_id", marketplaceOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (nfErr || !nfSel) {
    throw new Error(nfErr?.message || "Nota fiscal não encontrada para este pedido.");
  }
  const marketplace = String((nfSel as any)?.marketplace || "");
  const queueMessage: any = {
    organizations_id: organizationId,
    company_id: companyId,
    nota_fiscal_id: String((nfSel as any)?.id || ""),
    nfe_key: String((nfSel as any)?.nfe_key || ""),
    marketplace,
  };
  const { error: sendErr } = await (supabase as any).rpc("q_submit_xml_send", {
    p_message: queueMessage,
  } as any);
  if (sendErr) throw sendErr;
  return {
    notaFiscalId: String(nfSel.id),
    nfeKey: String(nfSel.nfe_key || ""),
    marketplace,
  };
}

export async function arrangeShopeeShipment(
  organizationId: string,
  companyId: string,
  orderSn: string,
): Promise<any> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
  const { data, error } = await (supabase as any).functions.invoke("shopee-arrange-shipment", {
    body: { organizationId, companyId, orderSn },
    headers,
  });
  if (error || (data && data.error)) {
    throw new Error(error?.message || data?.error || "Falha ao organizar envio");
  }
  return data;
}

export async function emitNfeQueue(
  organizationId: string,
  companyId: string,
  orderIds: string[],
  environment: string,
  opts?: { forceNewNumber?: boolean; forceNewRef?: boolean },
): Promise<void> {
  const { error: sendErr } = await (supabase as any).rpc("rpc_queues_emit", {
    p_message: {
      organizations_id: organizationId,
      company_id: companyId,
      environment,
      orderIds,
      forceNewNumber: opts?.forceNewNumber ?? false,
      forceNewRef: opts?.forceNewRef ?? false,
    },
  } as any);
  if (sendErr) throw sendErr;
}

export async function fetchShopeeShops(
  organizationId: string,
): Promise<Array<{ id: string; shop_id: number; label: string }>> {
  if (!organizationId) return [];
  const { data } = await (supabase as any)
    .from("marketplace_integrations")
    .select("id, organizations_id, marketplace_name, config, meli_user_id")
    .eq("marketplace_name", "Shopee")
    .eq("organizations_id", organizationId);
  const opts: Array<{ id: string; shop_id: number; label: string }> = Array.isArray(data)
    ? data
        .map((row: any) => {
          const cfg = row?.config || {};
          const sid = Number(cfg?.shopee_shop_id || row?.meli_user_id || 0);
          const lbl = String(cfg?.shop_name || `Shop ${sid || ""}`).trim();
          return { id: String(row.id), shop_id: sid, label: lbl || String(sid) };
        })
        .filter((x: any) => Number(x.shop_id) > 0)
    : [];
  return opts;
}

export async function markOrdersPrinted(orderIds: string[]): Promise<void> {
  if (!orderIds || orderIds.length === 0) return;
  await (supabase as any).rpc("rpc_marketplace_order_print_label", {
    p_order_ids: orderIds,
  });
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

export async function fetchNfeStatusRows(
  companyId: string,
  orderIds: string[],
  marketplaceOrderIds: string[],
): Promise<any[]> {
  let q: any = (supabase as any)
    .from("notas_fiscais")
    .select("order_id, marketplace_order_id, status_focus, emissao_ambiente, marketplace, xml_base64, xml_url, marketplace_submission_status, error_details")
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
  return Array.isArray(data) ? data : [];
}

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

// --- Order row parsing (shared between initial load and real-time updates) ---

const ORDERS_SELECT_FIELDS = `
  id, organization_id, marketplace, marketplace_order_id, pack_id,
  status, marketplace_status, payment_status,
  gross_amount, marketplace_fee, shipping_cost, shipping_subsidy, net_amount,
  buyer_name, buyer_document, buyer_email, buyer_phone, buyer_state,
  created_at, shipped_at, delivered_at, canceled_at, last_synced_at,
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

/** Parse a single raw DB row from orders + nested order_items/order_shipping into Order. */
export function parseOrderRow(row: Record<string, unknown>): Order {
  const itemsRaw: Record<string, unknown>[] = Array.isArray(row?.order_items) ? row.order_items as Record<string, unknown>[] : [];
  const shippingRaw: Record<string, unknown> | null = Array.isArray(row?.order_shipping)
    ? (row.order_shipping as Record<string, unknown>[])[0] ?? null
    : null;

  const toNum = (v: unknown): number => (typeof v === "number" ? v : Number(v)) || 0;

  const mappedItems: OrderItem[] =
    itemsRaw.length > 0
      ? itemsRaw.map((it: Record<string, unknown>, idx: number) => ({
          id: `${row.marketplace_order_id || row.id}-ITEM-${idx + 1}`,
          name: (it.title as string) || "Item",
          sku: (it.sku as string) ?? null,
          quantity: typeof it.quantity === "number" ? it.quantity : Number(it.quantity ?? 1) || 1,
          unitPrice: typeof it.unit_price === "number" ? it.unit_price : Number(it.unit_price ?? 0) || 0,
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
      : (row.status as string) ?? (row.marketplace_status as string) ?? "Pendente";

  const shippingReceived = toNum(row.shipping_subsidy);
  const marketplaceFee = toNum(row.marketplace_fee);
  const legacyItems = mappedItems.map((it) => ({ valor: it.unitPrice, quantidade: it.quantity }));
  const rawFinancials = buildFinancials(
    legacyItems,
    orderTotal,
    shippingReceived,
    marketplaceFee,
    (shippingRaw?.carrier as string) ?? null,
  );
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
        }));
  const rowForSku = {
    ...row,
    first_item_id: itemsRaw[0]?.marketplace_item_id ?? row.first_item_id,
    first_item_variation_id: itemsRaw[0]?.variation_name ?? row.first_item_variation_id,
  };
  const skuLinked = resolveLinkedSku(rowForSku, linkedProductsArr);

  const printedLabel = Array.isArray(row?.order_labels) ? row.order_labels.length > 0 : Boolean(row?.printed_label);

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
    shippingType: normalizeShippingType(shippingRaw?.logistic_type as string),
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
    linkedProducts: undefined,
    hasUnlinkedItems: mappedItems.some((it) => !it.linked),
    shipmentStatus: (shippingRaw?.status as string) ?? null,
    shippingSla: {
      status: (shippingRaw?.sla_status as string) ?? null,
      service: (shippingRaw?.carrier as string) ?? null,
      expectedDate: (shippingRaw?.sla_expected_date ?? shippingRaw?.estimated_delivery) as string ?? null,
      lastUpdated: null,
    },
    shippingDelays: undefined,
  };
}

/** Fetch all orders for an organization. Returns Order[] from normalized tables. */
export async function fetchAllOrders(orgId: string): Promise<Order[]> {
  const { data, error } = await (supabase as any)
    .from("orders")
    .select(ORDERS_SELECT_FIELDS)
    .eq("organization_id", orgId);

  if (error) throw error;
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

/** Resolve organization ID from user if not directly available. */
export async function resolveOrgId(userId: string): Promise<string | null> {
  try {
    const { data: rpcOrg } = await (supabase as any).rpc('get_user_organization_id', { p_user_id: userId });
    return Array.isArray(rpcOrg) ? (rpcOrg?.[0] as string | null) : (rpcOrg as string | null);
  } catch {
    return null;
  }
}
