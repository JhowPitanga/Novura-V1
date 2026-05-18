import { useMemo } from "react";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs, eventToSPEpochMs } from "@/lib/datetime";
import { normalizeMarketplaceId, normalizeShippingType } from "@/utils/orderUtils";
import { DateRange } from "react-day-picker";
import type { Order } from "@/types/orders";

/** Normalize a status string for comparison (strip accents, lowercase, trim). */
export function normStatus(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .trim();
}

/** Returns the effective status string for NFe comparisons, preferring the EN slug over the PT legacy value. */
function effectiveNfeStatusSlug(order: Order): string {
  return normStatus(order.status ?? order.internalStatus);
}

/** True if the order is in any NFe-workflow status (EN slugs or legacy PT strings). */
export function isNfeStatus(order: Order): boolean {
  const s = effectiveNfeStatusSlug(order);
  return s === 'invoice_pending' || s === 'emissao_nf' ||
    s === 'falha_na_emissao' || s === 'nfe_error' ||
    s === 'subir_xml' || s === 'nfe_xml_pending';
}

/** True if the order is in a failed NFe state. */
export function isNfeFailStatus(order: Order): boolean {
  const s = effectiveNfeStatusSlug(order);
  return s === 'falha_na_emissao' || s === 'nfe_error';
}

/** True if the order is in an XML-pending state. */
export function isNfeXmlPendingStatus(order: Order): boolean {
  const s = effectiveNfeStatusSlug(order);
  return s === 'subir_xml' || s === 'nfe_xml_pending';
}

/** True if the order is actively being processed for NFe emission. */
export function isNfeProcessingStatus(order: Order): boolean {
  return effectiveNfeStatusSlug(order) === 'processando_nf';
}

/** True if the order is pending NFe emission (the main emitir bucket). */
export function isNfeEmitirStatus(order: Order): boolean {
  const s = effectiveNfeStatusSlug(order);
  return s === 'invoice_pending' || s === 'emissao_nf';
}

/** Check whether an order matches a given board/status id. */
export function matchStatus(order: Order, id: string): boolean {
  if (id === 'todos') return true;
  const base = (order.internalStatus ?? order.status ?? "").toString();
  const s = normStatus(base);
  const target = String(id || '').toLowerCase().trim();
  if (!s && target !== 'a-vincular') return false;
  if (target === 'impressao') return s === 'impressao' || s === 'ready_to_print';
  if (target === 'aguardando-coleta') return s === 'aguardando_coleta' || s === 'awaiting_pickup';
  if (target === 'a-vincular') return s === 'a_vincular' || s === 'unlinked';
  if (target === 'cancelado') return s === 'cancelado' || s === 'devolucao' || s === 'cancelled' || s === 'returned';
  if (target === 'emissao-nf') return s === 'emissao_nf' || s === 'invoice_pending';
  if (target === 'enviado') return s === 'enviado' || s === 'shipped';
  const normalized = s.replace(/_/g, '-');
  return normalized === target;
}

interface UseOrderFilteringParams {
  orders: Order[];
  searchTerm: string;
  dateRange: DateRange | undefined;
  activeStatus: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  marketplaceFilters: Record<string, string>;
  shippingTypeFilters: Record<string, string>;
  nfBadgeFilter: string;
  vincularBadgeFilter: string;
  processingIdsSet: Set<string>;
  nfeFocusStatusByOrderId: Record<string, string>;
  pageSize: number;
  currentPage: number;
  totalPedidosCount: number | null;
}

interface OrderFilteringResult {
  baseFiltered: Order[];
  filteredOrders: Order[];
  sortedOrders: Order[];
  paginatedOrders: Order[];
  totalFiltered: number;
  totalPages: number;
  safeCurrentPage: number;
  showingFrom: number;
  showingTo: number;
  printOrders: Order[];
  notPrintedOrders: Order[];
  printedOrders: Order[];
  nfeOrdersAll: Order[];
  badgeCountEmitir: number;
  badgeCountFalha: number;
  badgeCountProcessando: number;
  badgeCountSubirXml: number;
}

export function useOrderFiltering({
  orders,
  searchTerm,
  dateRange,
  activeStatus,
  sortKey,
  sortDir,
  marketplaceFilters,
  shippingTypeFilters,
  nfBadgeFilter,
  vincularBadgeFilter,
  processingIdsSet,
  nfeFocusStatusByOrderId,
  pageSize,
  currentPage,
  totalPedidosCount,
}: UseOrderFilteringParams): OrderFilteringResult {

  const effectiveFromMs = dateRange?.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
  const effectiveToMs = dateRange?.to
    ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
    : (dateRange?.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);

  // ── Base filter: date + search ──
  const baseFiltered = useMemo(() => orders.filter(order => {
    const baseDateStr = order.paidAt ?? order.createdAt;
    const eventMs = baseDateStr ? eventToSPEpochMs(baseDateStr) : null;
    const inDate = effectiveFromMs === undefined
      ? true
      : (eventMs !== null && eventMs >= effectiveFromMs && (effectiveToMs === undefined || eventMs <= effectiveToMs));
    const term = (searchTerm || "").toLowerCase();
    const searchTermMatch = term === "" ||
      order.id.toLowerCase().includes(term) ||
      String(order.marketplaceOrderId ?? '').toLowerCase().includes(term) ||
      String(order.platformId ?? '').toLowerCase().includes(term) ||
      order.customerName.toLowerCase().includes(term) ||
      (order.sku && order.sku.toLowerCase().includes(term)) ||
      (Array.isArray(order.items) && order.items.some(it =>
        (it.name && it.name.toLowerCase().includes(term)) ||
        String(it.marketplaceItemId ?? '').toLowerCase().includes(term)
      ));
    return inDate && searchTermMatch;
  }), [orders, searchTerm, effectiveFromMs, effectiveToMs]);

  // ── Printing subsets ──
  const printOrders = useMemo(() => orders.filter(order => matchStatus(order, 'impressao')), [orders]);
  const notPrintedOrders = useMemo(() => printOrders.filter(order => !order.labelPrinted || !order.pickingListPrinted), [printOrders]);
  const printedOrders = useMemo(() => printOrders.filter(order => order.labelPrinted && order.pickingListPrinted), [printOrders]);

  // ── NFe badge counts ──
  const nfeOrdersAll = useMemo(() => orders.filter(isNfeStatus), [orders]);

  const badgeCountFalha = useMemo(() => nfeOrdersAll.filter(isNfeFailStatus).length, [nfeOrdersAll]);
  const badgeCountProcessando = useMemo(() => orders.filter(isNfeProcessingStatus).length, [orders]);
  const badgeCountEmitir = useMemo(() => nfeOrdersAll.filter(order => {
    const st = String(nfeFocusStatusByOrderId[String(order.id)] || '').toLowerCase();
    const BLOCKING_FOCUS_STATUSES = new Set(['processando_autorizacao', 'pendente', 'erro_autorizacao', 'rejeitado', 'denegado']);
    return isNfeEmitirStatus(order) &&
      !isNfeFailStatus(order) &&
      !processingIdsSet.has(order.id) &&
      !BLOCKING_FOCUS_STATUSES.has(st);
  }).length, [nfeOrdersAll, nfeFocusStatusByOrderId, processingIdsSet]);
  const badgeCountSubirXml = useMemo(() => nfeOrdersAll.filter(isNfeXmlPendingStatus).length, [nfeOrdersAll]);

  // ── Status + board-specific filters ──
  const activeMarketplaceFilter = marketplaceFilters[activeStatus] ?? 'all';
  const activeShippingTypeFilter = shippingTypeFilters[activeStatus] ?? 'all';

  const filteredOrders = useMemo(() => {
    let result = baseFiltered.filter(order => matchStatus(order, activeStatus));

    // Marketplace and shipping type filters
    if (activeStatus === 'impressao' || activeStatus === 'enviado' || activeStatus === 'cancelado') {
      if (activeMarketplaceFilter !== 'all') {
        result = result.filter(order => normalizeMarketplaceId(String(order.marketplace || '')) === activeMarketplaceFilter);
      }
      if (activeStatus !== 'cancelado' && activeShippingTypeFilter !== 'all') {
        result = result.filter(order => normalizeShippingType(String(order.shippingType ?? '')) === activeShippingTypeFilter);
      }
    }

    // NFe tab sub-filters
    if (activeStatus === "emissao-nf") {
      if (nfBadgeFilter === "falha") {
        result = baseFiltered.filter(isNfeFailStatus);
      } else if (nfBadgeFilter === "processando") {
        result = baseFiltered.filter(isNfeProcessingStatus);
      } else if (nfBadgeFilter === "subir_xml") {
        result = baseFiltered.filter(isNfeXmlPendingStatus);
      } else {
        const BLOCKING_FOCUS_STATUSES = new Set(['processando_autorizacao', 'pendente', 'erro_autorizacao', 'rejeitado', 'denegado']);
        result = result.filter(order => {
          const st = String(nfeFocusStatusByOrderId[String(order.id)] || '').toLowerCase();
          return isNfeEmitirStatus(order) &&
            !isNfeFailStatus(order) &&
            !processingIdsSet.has(order.id) &&
            !BLOCKING_FOCUS_STATUSES.has(st);
        });
      }
    }

    // Vincular tab sub-filters
    if (activeStatus === "a-vincular") {
      if (vincularBadgeFilter === "sem_estoque") {
        result = baseFiltered.filter(order => normStatus(order.internalStatus) === 'sem_estoque');
      } else {
        result = baseFiltered.filter(order => {
          const status = normStatus(order.internalStatus);
          return status === 'a_vincular' || status === 'unlinked';
        });
      }
    }

    return result;
  }, [baseFiltered, activeStatus, activeMarketplaceFilter, activeShippingTypeFilter, nfBadgeFilter, vincularBadgeFilter, processingIdsSet, nfeFocusStatusByOrderId]);

  // ── Sorting ──
  const sortedOrders = useMemo(() => [...filteredOrders].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    if (sortKey === 'sku') {
      return String(a?.sku ?? '').toLowerCase().localeCompare(String(b?.sku ?? '').toLowerCase()) * dir;
    }
    if (sortKey === 'items') {
      const av = Number(a.totalQuantity ?? 0);
      const bv = Number(b.totalQuantity ?? 0);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    if (sortKey === 'shipping') {
      const order = ['full', 'flex', 'envios', 'correios', 'no_shipping', ''];
      const ai = order.indexOf(normalizeShippingType(String(a.shippingType ?? '')));
      const bi = order.indexOf(normalizeShippingType(String(b.shippingType ?? '')));
      if (ai === bi) return 0;
      return ai > bi ? dir : -dir;
    }
    if (sortKey === 'sla') {
      const aExp = a?.shippingSla?.expectedDate ? new Date(a.shippingSla.expectedDate).getTime() : Number.POSITIVE_INFINITY;
      const bExp = b?.shippingSla?.expectedDate ? new Date(b.shippingSla.expectedDate).getTime() : Number.POSITIVE_INFINITY;
      if (aExp === bExp) return 0;
      return aExp > bExp ? dir : -dir;
    }
    // 'recent' default
    const ad = a.paidAt ?? a.createdAt;
    const bd = b.paidAt ?? b.createdAt;
    const at = ad ? (eventToSPEpochMs(ad) ?? 0) : 0;
    const bt = bd ? (eventToSPEpochMs(bd) ?? 0) : 0;
    if (at === bt) return 0;
    return at > bt ? dir : -dir;
  }), [filteredOrders, sortKey, sortDir]);

  // ── Pagination ──
  const isServerPaged = totalPedidosCount !== null;
  const totalFiltered = useMemo(() => {
    const hasLocalFilterImpact = (activeMarketplaceFilter !== 'all' || activeShippingTypeFilter !== 'all');
    if (!isServerPaged || hasLocalFilterImpact) return sortedOrders.length;
    return (totalPedidosCount ?? sortedOrders.length);
  }, [sortedOrders.length, isServerPaged, activeMarketplaceFilter, activeShippingTypeFilter, totalPedidosCount]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedOrders = isServerPaged ? sortedOrders : sortedOrders.slice(startIndex, startIndex + pageSize);
  const showingFrom = totalFiltered === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + paginatedOrders.length, totalFiltered);

  return {
    baseFiltered,
    filteredOrders,
    sortedOrders,
    paginatedOrders,
    totalFiltered,
    totalPages,
    safeCurrentPage,
    showingFrom,
    showingTo,
    printOrders,
    notPrintedOrders,
    printedOrders,
    nfeOrdersAll,
    badgeCountEmitir,
    badgeCountFalha,
    badgeCountProcessando,
    badgeCountSubirXml,
  };
}
