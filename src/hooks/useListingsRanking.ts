import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs, eventToSPEpochMs } from "@/lib/datetime";

export type ListingRankingItem = {
  marketplace_item_id: string;
  marketplace: string;
  title: string;
  pedidos: number;
  unidades: number;
  valor: number;
  margem: number; // percentual 0..1
};

function computePaymentDateISO(mq: any): string | null {
  if (!mq) return null;
  if (mq.date_created) return mq.date_created as string;
  const payments = Array.isArray(mq.payments) ? mq.payments : [];
  if (payments.length === 0) return null;
  const normDate = (p: any) => p?.date_approved || p?.date_created || p?.date_last_updated || null;
  const approved = payments.filter((p: any) => String(p?.status || '').toLowerCase() === 'approved');
  const candidates = (approved.length ? approved : payments)
    .map((p: any) => normDate(p))
    .filter(Boolean) as string[];
  if (candidates.length === 0) return null;
  let best: string = candidates[0];
  let bestMs: number = eventToSPEpochMs(best) ?? Number.POSITIVE_INFINITY;
  for (let i = 1; i < candidates.length; i++) {
    const ms = eventToSPEpochMs(candidates[i]) ?? Number.POSITIVE_INFINITY;
    if (ms < bestMs) { best = candidates[i]; bestMs = ms; }
  }
  return best;
}

function sumPaymentsNet(payments: any[]): number {
  const asArray = Array.isArray(payments) ? payments : [];
  return asArray.reduce((acc, p) => acc + (Number(p?.transaction_amount || 0) - Number(p?.coupon_amount || 0)), 0);
}

function calcFreteRecebido(mq: any): number {
  const shipments = Array.isArray(mq?.shipments) ? mq.shipments : [];
  return shipments.reduce((acc: number, s: any) => acc + Number(s?.receiver?.cost || 0), 0);
}

function calcTaxaMarketplace(mq: any): number {
  const payments = Array.isArray(mq?.payments) ? mq.payments : [];
  return payments.reduce((acc: number, p: any) => acc + Number(p?.fee_details?.reduce?.((a: number, f: any) => a + Number(f?.amount || 0), 0) || 0), 0);
}

function calcFreteCusto(mq: any): number {
  const shipments = Array.isArray(mq?.shipments) ? mq.shipments : [];
  return shipments.reduce((acc: number, s: any) => acc + Number(s?.shipping_option?.cost || s?.cost || 0), 0);
}

export async function getListingsRanking(
  dateRange: DateRange | undefined,
  selectedMarketplaceDisplay: string,
  organizationId?: string | null,
  limit: number = 50
): Promise<ListingRankingItem[]> {
  const from = dateRange?.from;
  const to = dateRange?.to || dateRange?.from;
  const fromMs = from ? calendarStartOfDaySPEpochMs(from) : undefined;
  const toMs = to ? calendarEndOfDaySPEpochMs(to) : undefined;

  // Fetch orders (aggregated fields only; item details will come from RAW)
  let q: any = supabase
    .from('marketplace_orders_presented')
    .select(`
      id,
      marketplace_order_id,
      marketplace,
      order_total,
      items_total_quantity,
      items_total_amount,
      first_item_title,
      first_item_sku
    `);
  if (selectedMarketplaceDisplay && selectedMarketplaceDisplay !== 'todos') {
    q = q.eq('marketplace', selectedMarketplaceDisplay);
  }
  const { data: orders, error: ordersErr } = await q;
  if (ordersErr) throw ordersErr;

  const orderList = Array.isArray(orders) ? orders : [];
  const marketplaceOrderIds = Array.from(new Set(orderList.map((o: any) => o.marketplace_order_id).filter(Boolean)));

  // Raw marketplace orders for payment date + costs and listing ids
  let mqq: any = supabase
    .from('marketplace_orders_raw')
    .select('marketplace_order_id, payments, shipments, date_created, marketplace_name, data')
    .in('marketplace_order_id', marketplaceOrderIds);
  if (organizationId) mqq = mqq.eq('organizations_id', organizationId);
  const { data: mqRows, error: mqErr } = await mqq;
  if (mqErr) throw mqErr;
  const mqById: Record<string, any> = Object.fromEntries((mqRows || []).map((r: any) => [r.marketplace_order_id, r]));

  // Build per-listing aggregates
  type Agg = { pedidosSet: Set<string>; unidades: number; valor: number; lucro: number; valorBruto: number; marketplace: string; };
  const byListing: Record<string, Agg> = {};

  for (const o of orderList) {
    const mq = o?.marketplace_order_id ? mqById[o.marketplace_order_id] : null;
    const paymentISO = computePaymentDateISO(mq);
    const evtMs = paymentISO ? eventToSPEpochMs(paymentISO) : null;
    const inRange = fromMs === undefined || (evtMs !== null && toMs !== undefined
      ? (evtMs >= fromMs && evtMs <= toMs)
      : (evtMs !== null && evtMs >= fromMs));
    if (!inRange) continue;

    const mkDisplay = (o?.marketplace || mq?.marketplace_name || 'Outros') as string;

    // Get listing ids for each item from raw data
    const rawItems = Array.isArray(mq?.data?.order_items) ? mq.data.order_items : [];
    const itemsBySku: Record<string, any> = {};
    for (const it of rawItems) {
      const sku = String(it?.item?.seller_sku || it?.item?.variation_attributes?.find?.((a: any) => a?.id === 'SELLER_SKU')?.value_name || it?.item?.id || '').trim();
      if (sku) itemsBySku[sku] = it;
    }
    // Derive items from RAW; fallback to aggregated single item from view
    let items: any[] = [];
    if (rawItems.length > 0) {
      items = rawItems.map((rit: any) => ({
        sku: String(rit?.item?.seller_sku || rit?.seller_sku || '').trim(),
        quantity: Number(rit?.quantity || 0),
        price_per_unit: Number(rit?.unit_price || rit?.full_unit_price || rit?.price || 0),
      }));
    } else {
      const qtyAgg = Number(o?.items_total_quantity || 0) || 1;
      const amtAgg = Number(o?.items_total_amount || 0) || 0;
      const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
      items = [{
        sku: o?.first_item_sku || '',
        quantity: qtyAgg,
        price_per_unit: unitPriceAgg,
      }];
    }
    if (items.length === 0) continue;

    // Financials per order (same basis as drawer):
    const valorBrutoItens = Number(o?.order_total || 0) || 0; // fallback; precise split below by item
    const freteRecebido = calcFreteRecebido(mq);
    const taxaMarketplace = calcTaxaMarketplace(mq);
    const freteCusto = calcFreteCusto(mq);
    const valorLiquidoReceber = sumPaymentsNet(mq?.payments);

    // Lucro do pedido ~ líquido + frete recebido - taxa - frete custo
    const lucroPedido = valorLiquidoReceber + freteRecebido - taxaMarketplace - freteCusto;

    // Ratear por item pelo valor de linha (ou proporção de quantidade)
    let somaLinhas = 0;
    const lineValues: number[] = [];
    for (const it of items) {
      const q = Number(it?.quantity || 0);
      const p = Number(it?.price_per_unit || 0);
      const line = q * p;
      lineValues.push(line);
      somaLinhas += line;
    }
    const ratioOr = (i: number) => (somaLinhas > 0 ? (lineValues[i] / somaLinhas) : (items.length > 0 ? 1 / items.length : 0));

    items.forEach((it: any, idx: number) => {
      const sku = String(it?.sku || '').trim();
      // Tentar achar marketplace_item_id no raw item correspondente
      const raw = itemsBySku[sku] || rawItems[idx] || null;
      const listingId = raw?.item?.id || raw?.item?.variation_parent_id || raw?.item_id || raw?.id;
      const marketplace_item_id = listingId ? String(listingId) : `sku:${sku || 'desconhecido'}`;

      const q = Number(it?.quantity || 0);
      const p = Number(it?.price_per_unit || 0);
      const valorLinha = q * p;

      const part = ratioOr(idx);
      const lucroLinha = lucroPedido * part;

      if (!byListing[marketplace_item_id]) {
        byListing[marketplace_item_id] = {
          pedidosSet: new Set<string>(),
          unidades: 0,
          valor: 0,
          lucro: 0,
          valorBruto: 0,
          marketplace: mkDisplay,
        };
      }
      const agg = byListing[marketplace_item_id];
      if (o?.id) agg.pedidosSet.add(String(o.id));
      agg.unidades += q;
      agg.valor += valorLinha;
      agg.valorBruto += valorLinha;
      agg.lucro += lucroLinha;
      // Keep marketplace last seen
      agg.marketplace = mkDisplay;
    });
  }

  const listingIds = Object.keys(byListing);
  if (listingIds.length === 0) return [];

  // Fetch titles from marketplace_items
  let miq: any = supabase
    .from('marketplace_items')
    .select('marketplace_item_id, title, marketplace_name')
    .in('marketplace_item_id', listingIds);
  if (organizationId) miq = miq.eq('organizations_id', organizationId);
  const { data: itemsRows, error: itemsErr } = await miq;
  if (itemsErr) throw itemsErr;
  const itemTitleById: Record<string, { title: string; marketplace_name?: string }> = {};
  for (const r of (itemsRows || [])) {
    itemTitleById[String(r.marketplace_item_id)] = { title: r.title || '', marketplace_name: r.marketplace_name } as any;
  }

  const result: ListingRankingItem[] = listingIds.map((id) => {
    const agg = byListing[id];
    const pedidos = agg.pedidosSet.size;
    const title = itemTitleById[id]?.title || `Anúncio ${id}`;
    const mk = itemTitleById[id]?.marketplace_name || agg.marketplace || 'Outros';
    const margem = agg.valorBruto > 0 ? (agg.lucro / agg.valorBruto) : 0;
    return {
      marketplace_item_id: id,
      marketplace: mk,
      title,
      pedidos,
      unidades: agg.unidades,
      valor: agg.valor,
      margem,
    };
  })
  .sort((a, b) => b.valor - a.valor)
  .slice(0, limit);

  return result;
}