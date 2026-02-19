import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";

export type ListingRankingItem = {
  marketplace_item_id: string;
  marketplace: string;
  title: string;
  pedidos: number;
  unidades: number;
  valor: number;
  margem: number;
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
  const fromISO = fromMs !== undefined ? new Date(fromMs).toISOString() : undefined;
  const toISO = toMs !== undefined ? new Date(toMs).toISOString() : undefined;

  // Fetch orders within date range from presented_new
  let q: any = supabase
    .from('marketplace_orders_presented_new')
    .select(`
      id,
      marketplace_order_id,
      marketplace,
      order_total,
      items_total_quantity,
      items_total_amount,
      first_item_title,
      first_item_sku,
      created_at
    `);
  if (selectedMarketplaceDisplay && selectedMarketplaceDisplay !== 'todos') {
    q = q.eq('marketplace', selectedMarketplaceDisplay);
  }
  if (organizationId) {
    q = q.eq('organizations_id', organizationId);
  }
  if (fromISO) q = q.gte('created_at', fromISO);
  if (toISO) q = q.lte('created_at', toISO);
  const { data: orders, error: ordersErr } = await q;
  if (ordersErr) throw ordersErr;

  const orderList = Array.isArray(orders) ? orders : [];
  const presentedNewIds = Array.from(new Set(orderList.map((o: any) => o.id).filter(Boolean)));
  const marketplaceByOrderId: Record<string, string> = {};
  for (const o of orderList) {
    const id = String(o.id || '');
    if (id) marketplaceByOrderId[id] = o.marketplace || 'Outros';
  }

  if (presentedNewIds.length === 0) {
    return [];
  }

  // Fetch items for these orders and aggregate by model_id_externo
  const byListing: Record<string, { pedidosSet: Set<string>; unidades: number; valor: number; marketplace: string }> = {};
  const chunkSize = 200;
  for (let i = 0; i < presentedNewIds.length; i += chunkSize) {
    const chunk = presentedNewIds.slice(i, i + chunkSize);
    const iq: any = supabase
      .from('marketplace_order_items')
      .select('id, model_id_externo, quantity, unit_price')
      .in('id', chunk);
    const { data: itemRows, error: itemErr } = await iq;
    if (itemErr) throw itemErr;
    for (const it of (itemRows || [])) {
      const orderId = String(it?.id || '');
      const listingId = String(it?.model_id_externo || '').trim();
      if (!listingId || !orderId) continue;
      const qn = Number(it?.quantity || 0) || 0;
      const up = Number(it?.unit_price || 0) || 0;
      if (!byListing[listingId]) {
        byListing[listingId] = { pedidosSet: new Set<string>(), unidades: 0, valor: 0, marketplace: marketplaceByOrderId[orderId] || 'Outros' };
      }
      const agg = byListing[listingId];
      agg.pedidosSet.add(orderId);
      agg.unidades += qn;
      agg.valor += qn * up;
      if (!agg.marketplace) agg.marketplace = marketplaceByOrderId[orderId] || 'Outros';
    }
  }

  const listingIds = Object.keys(byListing);
  if (listingIds.length === 0) return [];

  // Buscar títulos a partir da tabela unificada
  let miq: any = supabase
    .from('marketplace_items_unified')
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
    const margem = 0;
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
