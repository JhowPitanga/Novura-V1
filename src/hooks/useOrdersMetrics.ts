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

export type OrdersMetrics = {
  totals: {
    vendas: number;
    unidades: number;
    pedidos: number;
    ticketMedio: number;
  };
  series: MetricPoint[];
  byMarketplace: { marketplace: string; total: number }[];
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

  // Fetch orders (optionally filter by marketplace)
  let q: any = supabase
    .from('orders')
    .select(`
      id,
      marketplace_order_id,
      order_total,
      marketplace,
      order_items ( quantity )
    `);
  if (selectedMarketplaceDisplay && selectedMarketplaceDisplay !== 'todos') {
    q = q.eq('marketplace', selectedMarketplaceDisplay);
  }
  const { data: orders, error: ordersErr } = await q;
  if (ordersErr) throw ordersErr;

  const orderList = Array.isArray(orders) ? orders : [];
  const orderIds = Array.from(new Set(orderList.map((o: any) => o.marketplace_order_id).filter(Boolean)));

  // Fetch marketplace_orders to compute payment date
  let mq = supabase
    .from('marketplace_orders')
    .select('marketplace_order_id, payments, date_created')
    .in('marketplace_order_id', orderIds);
  if (organizationId) mq = (mq as any).eq('organizations_id', organizationId);
  const { data: mqRows, error: mqErr } = await mq;
  if (mqErr) throw mqErr;
  const mqById: Record<string, any> = Object.fromEntries((mqRows || []).map((r: any) => [r.marketplace_order_id, r]));

  // Prepare buckets
  const seriesMap: Record<string, MetricPoint> = {};
  if (from && to) {
    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        const d = new Date(from);
        d.setHours(h, 0, 0, 0);
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

  // Filter orders by payment date, aggregate totals and series
  let totalVendas = 0;
  let totalUnidades = 0;
  let totalPedidos = 0;
  const byMarketplace: Record<string, number> = {};

  for (const o of orderList) {
    const mqRow = o?.marketplace_order_id ? mqById[o.marketplace_order_id] : null;
    const paymentISO = computePaymentDateISO(mqRow);
    const evtMs = paymentISO ? eventToSPEpochMs(paymentISO) : null;
    const inRange = fromMs === undefined || (evtMs !== null && toMs !== undefined
      ? (evtMs >= fromMs && evtMs <= toMs)
      : (evtMs >= fromMs));
    if (!inRange) continue;

    const venda = Number(o?.order_total || 0) || 0;
    const unidades = Array.isArray(o?.order_items) ? (o.order_items as any[]).reduce((acc, it: any) => acc + Number(it?.quantity || 0), 0) : 0;
    totalVendas += venda;
    totalUnidades += unidades;
    totalPedidos += 1;

    const mk = (o?.marketplace || 'Outros') as string;
    byMarketplace[mk] = (byMarketplace[mk] || 0) + venda;

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

  const totals = {
    vendas: totalVendas,
    unidades: totalUnidades,
    pedidos: totalPedidos,
    ticketMedio: totalPedidos > 0 ? totalVendas / totalPedidos : 0,
  };

  const byMarketplaceArr = Object.entries(byMarketplace).map(([marketplace, total]) => ({ marketplace, total }));

  return { totals, series, byMarketplace: byMarketplaceArr };
}