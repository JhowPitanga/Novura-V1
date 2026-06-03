/**
 * Pure utilities for order status derivation.
 * Extracted from useOrdersPageController (isPedidoAtrasado + statusCounts, lines 322-359).
 */
import { matchStatus, normStatus } from "@/hooks/useOrderFiltering";
import type { Order } from "@/types/orders";

/**
 * Returns true when an order is considered overdue (SLA delayed or expected
 * delivery date already passed) and has not yet been shipped/delivered/cancelled.
 *
 * Verbatim from controller lines 333-343 — do not "optimize" without re-pinning tests.
 */
export function isPedidoAtrasado(p: any): boolean {
  const shipLower = String(p?.shipmentStatus ?? '').toLowerCase();
  const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
  const ns = normStatus(p?.internalStatus);
  const isCancelledOrReturn = ns === 'cancelado' || ns === 'devolucao' || ns === 'cancelled' || ns === 'returned';
  if (deliveredStatuses.includes(shipLower) || isCancelledOrReturn || ns === 'enviado' || ns === 'shipped') return false;
  const slaLower = String(p?.shippingSla?.status ?? '').toLowerCase();
  const ed = p?.shippingSla?.expectedDate;
  const expired = ed ? (new Date(ed).getTime() - new Date().getTime() <= 0) : false;
  return slaLower === 'delayed' || expired;
}

/**
 * Derive per-status order counts from a filtered base list.
 * Verbatim from controller lines 322-331.
 */
export function buildStatusCounts(baseFiltered: Order[]): Record<string, number> {
  return {
    todos: baseFiltered.length,
    'a-vincular': baseFiltered.filter(p => matchStatus(p, 'a-vincular')).length,
    'emissao-nf': baseFiltered.filter(p => matchStatus(p, 'emissao-nf')).length,
    impressao: baseFiltered.filter(p => matchStatus(p, 'impressao')).length,
    'aguardando-coleta': baseFiltered.filter(p => matchStatus(p, 'aguardando-coleta')).length,
    enviado: baseFiltered.filter(p => matchStatus(p, 'enviado')).length,
    cancelado: baseFiltered.filter(p => matchStatus(p, 'cancelado')).length,
    'sem-estoque': baseFiltered.filter(p => normStatus(p.internalStatus) === 'sem_estoque').length,
  };
}
