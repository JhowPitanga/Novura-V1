import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
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
    .from("marketplace_orders_presented_new")
    .update({ status_interno: status })
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
    .from("marketplace_orders_presented_new")
    .select("marketplace_order_id, marketplace")
    .eq("id", orderId)
    .limit(1)
    .single();
  if (rowErr || !row) throw new Error(rowErr?.message || "Pedido não encontrado");
  return {
    marketplace_order_id: String(row.marketplace_order_id || ""),
    marketplace: String(row.marketplace || ""),
  };
}

// --- Order row parsing (shared between initial load and real-time updates) ---

const ORDERS_SELECT_FIELDS = `
  id,
  pack_id,
  marketplace_order_id,
  customer_name,
  billing_name,
  first_name_buyer,
  order_total,
  status,
  status_interno,
  created_at,
  marketplace,
  shipping_type,
  payment_status,
  payment_date_created,
  payment_date_approved,
  items_total_quantity,
  items_total_amount,
  items_total_sale_fee,
  first_item_id,
  first_item_title,
  first_item_permalink,
  first_item_sku,
  first_item_variation_id,
  variation_color_names,
  has_unlinked_items,
  unlinked_items_count,
  shipment_status,
  shipment_substatus,
  shipping_method_name,
  shipment_sla_status,
  shipment_sla_service,
  shipment_sla_expected_date,
  shipment_sla_last_updated,
  shipment_delays,
  label_cached,
  label_response_type,
  label_fetched_at,
  label_size_bytes,
  label_content_base64,
  label_content_type,
  label_pdf_base64,
  label_zpl2_base64,
  printed_label,
  printed_schedule,
  pack_id,
  linked_products,
  marketplace_order_items:marketplace_order_items!fk_moi_presented_new_id(
    row_id,
    model_sku_externo,
    model_id_externo,
    variation_name,
    pack_id,
    item_name,
    quantity,
    unit_price,
    image_url
  )
`;

/** Parse a single raw DB/realtime row into the UI order model. */
export function parseOrderRow(o: any): any {
  const itemsFromDb: any[] = Array.isArray(o?.marketplace_order_items) ? o.marketplace_order_items : [];
  const varLabelFromItems = itemsFromDb
    .map((it: any) => String(it?.variation_name || '').trim())
    .filter(Boolean)
    .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i)
    .join(' • ');
  const varLabel = varLabelFromItems;

  const items = itemsFromDb.length > 0
    ? itemsFromDb.map((it: any, idx: number) => ({
        id: `${o.marketplace_order_id || o.id}-ITEM-${idx + 1}`,
        rowId: it?.row_id || null,
        nome: it.item_name || 'Item',
        sku: it.sku || it.model_sku_externo || null,
        quantidade: (typeof it?.quantity === 'number' ? it.quantity : Number(it?.quantity)) || 1,
        valor: (typeof it?.unit_price === 'number' ? it.unit_price : Number(it?.unit_price)) || 0,
        bipado: false,
        vinculado: Boolean(it?.sku),
        imagem: ensureHttpUrl(it?.image_url) || "/placeholder.svg",
        marketplace: o.marketplace,
        marketplaceItemId: null,
        variationId: it?.model_id_externo || '',
        permalink: o.first_item_permalink || null,
        variationLabel: it?.variation_name || varLabel,
      }))
    : (() => {
        const qtyAgg = (typeof o?.items_total_quantity === 'number' ? o.items_total_quantity : Number(o?.items_total_quantity)) || 1;
        const amtAgg = (typeof o?.items_total_amount === 'number' ? o.items_total_amount : Number(o?.items_total_amount)) || 0;
        const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
        const varLabelAgg = Array.isArray(o?.variation_color_names) ? (o.variation_color_names as any[]).filter(Boolean).join(' • ') : String(o?.variation_color_names || '');
        return [{
          id: `${o.marketplace_order_id || o.id}-ITEM-1`,
          nome: o.first_item_title || 'Item',
          sku: o.first_item_sku || null,
          quantidade: qtyAgg,
          valor: unitPriceAgg,
          bipado: false,
          vinculado: !!o.first_item_sku,
          imagem: "/placeholder.svg",
          marketplace: o.marketplace,
          marketplaceItemId: o.first_item_id || null,
          variationId: (typeof o?.first_item_variation_id === 'number' || typeof o?.first_item_variation_id === 'string') ? o.first_item_variation_id : '',
          permalink: o.first_item_permalink || null,
          variationLabel: varLabelAgg,
        }];
      })();

  const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;
  const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
  const valorRecebidoFrete = toNum(o?.payment_shipping_cost);
  const saleFeeOrderItems = (typeof o?.items_total_sale_fee === 'number' ? o.items_total_sale_fee : Number(o?.items_total_sale_fee)) || 0;
  const taxaMarketplace = saleFeeOrderItems;

  const shipmentStatusLower = String(o?.shipment_status || '').toLowerCase();
  const statusUI = shipmentStatusLower === 'delivered' ? 'Entregue' : (o.status_interno ?? o.status ?? 'Pendente');

  const labelInfo = buildLabelInfo(o);
  const linkedProductsArr: any[] = Array.isArray(o?.linked_products) ? o.linked_products : [];
  const skuLinked = resolveLinkedSku(o, linkedProductsArr);

  return {
    id: o.id,
    marketplace_order_id: o.marketplace_order_id || null,
    marketplace: o.marketplace,
    produto: items[0]?.nome || "",
    sku: items[0]?.sku || null,
    permalink: o.first_item_permalink || null,
    cliente: o?.billing_name || o.first_name_buyer || o.customer_name || '',
    valor: orderTotal,
    data: o.created_at,
    status: statusUI,
    status_interno: o?.status_interno ?? null,
    has_unlinked_items: Boolean(o?.has_unlinked_items),
    shipment_status: o?.shipment_status || null,
    slaDespacho: {
      status: o?.shipment_sla_status ?? null,
      service: o?.shipment_sla_service ?? null,
      expected_date: o?.estimated_delivery_limit_at ?? o?.shipment_sla_expected_date ?? null,
      last_updated: o?.shipment_sla_last_updated ?? null,
    },
    variationColorNames: varLabel,
    atrasos: Array.isArray(o?.shipment_delays) ? o.shipment_delays : null,
    dataPagamento: o?.payment_date_approved || o?.payment_date_created || o?.created_at || null,
    payment_status: o?.payment_status || null,
    payment_date_approved: o?.payment_date_approved || null,
    tipoEnvio: normalizeShippingType(o?.shipping_type),
    idPlataforma: o?.pack_id || o.pack_id || o.marketplace_order_id || "",
    shippingCity: o?.shipping_city_name || null,
    shippingState: o?.shipping_state_name || null,
    shippingUF: o?.shipping_state_uf || null,
    quantidadeTotal: items.reduce((sum: number, it: any) => sum + (it.quantidade || 0), 0),
    imagem: (items[0]?.imagem || "/placeholder.svg"),
    itens: items,
    linked_products: o?.linked_products || null,
    financeiro: buildFinancials(items, orderTotal, valorRecebidoFrete, taxaMarketplace, o?.shipping_method_name || null),
    impressoEtiqueta: Boolean(o?.printed_label),
    impressoLista: false,
    label: labelInfo,
    linkedSku: skuLinked,
  };
}

/** Fetch all orders for an organization. Returns raw parsed order objects. */
export async function fetchAllOrders(orgId: string): Promise<any[]> {
  const q = (supabase as any)
    .from("marketplace_orders_presented_new")
    .select(ORDERS_SELECT_FIELDS)
    .eq('organizations_id', orgId);

  const { data, error } = await q;
  if (error) throw error;

  const rows: any[] = Array.isArray(data) ? data : [];
  return rows.map(parseOrderRow);
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
