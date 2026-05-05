import type { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs, eventToSPEpochMs } from "@/lib/datetime";

type MetricPoint = {
  label: string;
  vendas: number;
  unidades: number;
  pedidos: number;
  ticketMedio: number;
};

export type LogisticBreakdown = {
  marketplace: string;
  logistic_type: string;
  count: number;
  total: number;
};

export type OrdersMetrics = {
  totals: {
    vendas: number;
    unidades: number;
    pedidos: number;
    ticketMedio: number;
    margem_pct: number | null;
  };
  series: MetricPoint[];
  byMarketplace: { marketplace: string; total: number }[];
  byLogistic: LogisticBreakdown[];
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

function formatLabelSP(ms: number, hourly: boolean): string {
  const df = new Intl.DateTimeFormat('pt-BR', hourly
    ? { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }
    : { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }
  );
  return df.format(new Date(ms)) + (hourly ? ':00' : '');
}

export async function getOrdersMetrics(
  dateRange: DateRange | undefined,
  selectedMarketplaceDisplay: string,
  organizationId?: string | null
): Promise<OrdersMetrics> {
  const from = dateRange?.from;
  const to = dateRange?.to || dateRange?.from;
  const isSingleDay = !!from && !!to && from.toDateString() === to.toDateString();

  const fromMs = from ? calendarStartOfDaySPEpochMs(from) : undefined;
  const toMs = to ? calendarEndOfDaySPEpochMs(to) : undefined;
  const fromISO = fromMs !== undefined ? new Date(fromMs).toISOString() : undefined;
  const toISO = toMs !== undefined ? new Date(toMs).toISOString() : undefined;

  let q: any = supabase
    .from('orders')
    .select('id, marketplace_order_id, gross_amount, marketplace, created_at');
  if (organizationId) {
    q = (q as any).eq('organization_id', organizationId);
  }
  if (selectedMarketplaceDisplay && selectedMarketplaceDisplay !== 'todos') {
    q = q.eq('marketplace', selectedMarketplaceDisplay);
  }
  if (fromISO) q = q.gte('created_at', fromISO);
  if (toISO) q = q.lte('created_at', toISO);

  const { data: orders, error: ordersErr } = await q;
  if (ordersErr) throw ordersErr;

  const orderList = Array.isArray(orders) ? orders : [];
  const orderIds = Array.from(new Set(orderList.map((o: any) => o.id).filter(Boolean)));

  if (orderIds.length === 0) {
    const totals = { vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0, margem_pct: null };
    return { totals, series: [], byMarketplace: [], byLogistic: [] };
  }

  const chunkSize = 200;

  // Fetch quantities + cost from order_items
  const qtyByOrderId: Record<string, number> = {};
  const costByOrderId: Record<string, number> = {};
  const revenueByOrderId: Record<string, number> = {};

  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data: itemsRows, error: itemsErr } = await (supabase as any)
      .from('order_items')
      .select('order_id, quantity, unit_cost, unit_price')
      .in('order_id', chunk);
    if (itemsErr) throw itemsErr;
    (itemsRows || []).forEach((it: any) => {
      const k = String(it?.order_id || '');
      const qty = Number(it?.quantity || 0) || 0;
      const cost = it?.unit_cost != null ? Number(it.unit_cost) * qty : null;
      const rev = Number(it?.unit_price || 0) * qty;
      qtyByOrderId[k] = (qtyByOrderId[k] || 0) + qty;
      if (cost !== null) costByOrderId[k] = (costByOrderId[k] || 0) + cost;
      revenueByOrderId[k] = (revenueByOrderId[k] || 0) + rev;
    });
  }

  // Fetch logistics from order_shipping
  const logisticByOrderId: Record<string, string> = {};
  for (let i = 0; i < orderIds.length; i += chunkSize) {
    const chunk = orderIds.slice(i, i + chunkSize);
    const { data: shippingRows, error: shippingErr } = await (supabase as any)
      .from('order_shipping')
      .select('order_id, logistic_type')
      .in('order_id', chunk);
    if (!shippingErr && shippingRows) {
      (shippingRows as any[]).forEach((s: any) => {
        if (s?.order_id && s?.logistic_type) {
          logisticByOrderId[String(s.order_id)] = String(s.logistic_type);
        }
      });
    }
  }

  // Prepare time-series buckets
  const seriesMap: Record<string, MetricPoint> = {};
  if (from && to) {
    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        const ms = calendarStartOfDaySPEpochMs(from) + h * 60 * 60 * 1000;
        const label = formatLabelSP(ms, true);
        seriesMap[label] = { label, vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 };
      }
    } else {
      const dayMs = 24 * 60 * 60 * 1000;
      const start = calendarStartOfDaySPEpochMs(from);
      const end = calendarEndOfDaySPEpochMs(to);
      for (let ms = start; ms <= end; ms += dayMs) {
        const label = formatLabelSP(ms, false);
        seriesMap[label] = { label, vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 };
      }
    }
  }

  let totalVendas = 0;
  let totalUnidades = 0;
  let totalPedidos = 0;
  let totalCost = 0;
  let hasCostData = false;
  const byMarketplace: Record<string, number> = {};
  const byLogisticMap: Record<string, LogisticBreakdown> = {};

  for (const o of orderList) {
    const evtMs = o?.created_at ? eventToSPEpochMs(o.created_at) : null;
    const venda = Number(o?.gross_amount ?? 0) || 0;
    const k = String(o?.id || '');
    const unidades = qtyByOrderId[k] ?? 0;
    const cost = costByOrderId[k];

    totalVendas += venda;
    totalUnidades += unidades;
    totalPedidos += 1;
    if (cost != null) { totalCost += cost; hasCostData = true; }

    const mk = (o?.marketplace || 'Outros') as string;
    byMarketplace[mk] = (byMarketplace[mk] || 0) + venda;

    // Aggregate logistics
    const logType = logisticByOrderId[k] || 'Não informado';
    const logKey = `${mk}::${logType}`;
    if (!byLogisticMap[logKey]) {
      byLogisticMap[logKey] = { marketplace: mk, logistic_type: logType, count: 0, total: 0 };
    }
    byLogisticMap[logKey].count += 1;
    byLogisticMap[logKey].total += venda;

    if (from && to && evtMs !== null) {
      const label = formatLabelSP(evtMs, isSingleDay);
      const bucket = seriesMap[label] || { label, vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 };
      bucket.vendas += venda;
      bucket.unidades += unidades;
      bucket.pedidos += 1;
      seriesMap[label] = bucket;
    }
  }

  const series = Object.values(seriesMap).map((pt) => ({
    ...pt,
    ticketMedio: pt.pedidos > 0 ? pt.vendas / pt.pedidos : 0,
  }));

  const margem_pct = hasCostData && totalVendas > 0
    ? ((totalVendas - totalCost) / totalVendas) * 100
    : null;

  const totals = {
    vendas: totalVendas,
    unidades: totalUnidades,
    pedidos: totalPedidos,
    ticketMedio: totalPedidos > 0 ? totalVendas / totalPedidos : 0,
    margem_pct,
  };

  const byMarketplaceArr = Object.entries(byMarketplace).map(([marketplace, total]) => ({ marketplace, total }));
  const byLogistic = Object.values(byLogisticMap).sort((a, b) => b.total - a.total);

  return { totals, series, byMarketplace: byMarketplaceArr, byLogistic };
}
