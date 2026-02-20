import { useMemo } from "react";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs, eventToSPEpochMs } from "@/lib/datetime";
import { normalizeMarketplaceId, normalizeShippingType } from "@/utils/orderUtils";
import { DateRange } from "react-day-picker";

/** Normalize a status string for comparison (strip accents, lowercase, trim). */
export function normStatus(v: any): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/** Check whether an order matches a given board/status id. */
export function matchStatus(p: any, id: string): boolean {
  if (id === 'todos') return true;
  const base = (p?.status_interno ?? p?.status ?? '').toString();
  const s = normStatus(base);
  const target = String(id || '').toLowerCase().trim();
  if (!s && target !== 'a-vincular') return false;
  if (target === 'impressao') return s === 'impressao';
  if (target === 'aguardando-coleta') return s === 'aguardando coleta';
  if (target === 'a-vincular') return s === 'a vincular';
  if (target === 'cancelado') return s === 'cancelado' || s === 'devolucao';
  if (target === 'emissao-nf') return s === 'emissao nf';
  if (target === 'enviado') return s === 'enviado';
  const normalized = s.replace(/ /g, '-');
  return normalized === target;
}

interface UseOrderFilteringParams {
  pedidos: any[];
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
  nfeFocusStatusByPedidoId: Record<string, string>;
  pageSize: number;
  currentPage: number;
  totalPedidosCount: number | null;
  statusCountsGlobal: Record<string, number> | null;
}

interface OrderFilteringResult {
  baseFiltered: any[];
  filteredPedidos: any[];
  sortedPedidos: any[];
  paginatedPedidos: any[];
  totalFiltered: number;
  totalPages: number;
  safeCurrentPage: number;
  showingFrom: number;
  showingTo: number;
  pedidosImpressao: any[];
  pedidosNaoImpressos: any[];
  pedidosImpressos: any[];
  nfePedidosAll: any[];
  badgeCountEmitir: number;
  badgeCountFalha: number;
  badgeCountProcessando: number;
  badgeCountSubirXml: number;
}

export function useOrderFiltering({
  pedidos,
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
  nfeFocusStatusByPedidoId,
  pageSize,
  currentPage,
  totalPedidosCount,
  statusCountsGlobal,
}: UseOrderFilteringParams): OrderFilteringResult {

  const effectiveFromMs = dateRange?.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
  const effectiveToMs = dateRange?.to
    ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
    : (dateRange?.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);

  // ── Base filter: date + search ──
  const baseFiltered = useMemo(() => pedidos.filter(p => {
    const baseDateStr = p.dataPagamento || p.data;
    const eventMs = baseDateStr ? eventToSPEpochMs(baseDateStr) : null;
    const inDate = effectiveFromMs === undefined
      ? true
      : (eventMs !== null && eventMs >= effectiveFromMs && (effectiveToMs === undefined || eventMs <= effectiveToMs));
    const term = (searchTerm || "").toLowerCase();
    const searchTermMatch = term === "" ||
      p.id?.toLowerCase?.().includes(term) ||
      String(p.marketplace_order_id || '').toLowerCase().includes(term) ||
      String(p.pack_id || '').toLowerCase().includes(term) ||
      p.cliente?.toLowerCase?.().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (Array.isArray(p.itens) && p.itens.some((it: any) =>
        (it?.nome && String(it.nome).toLowerCase().includes(term)) ||
        (it?.product_name && String(it.product_name).toLowerCase().includes(term)) ||
        String(it?.pack_id || '').toLowerCase().includes(term)
      ));
    return inDate && searchTermMatch;
  }), [pedidos, searchTerm, effectiveFromMs, effectiveToMs]);

  // ── Printing subsets ──
  const pedidosImpressao = useMemo(() => pedidos.filter(p => matchStatus(p, 'impressao')), [pedidos]);
  const pedidosNaoImpressos = useMemo(() => pedidosImpressao.filter(p => !p.impressoEtiqueta || !p.impressoLista), [pedidosImpressao]);
  const pedidosImpressos = useMemo(() => pedidosImpressao.filter(p => p.impressoEtiqueta && p.impressoLista), [pedidosImpressao]);

  // ── NFe badge counts ──
  const nfePedidosAll = useMemo(() => pedidos.filter(p =>
    p && (normStatus(p.status_interno) === 'emissao nf' || normStatus(p.status_interno) === 'falha na emissao' || normStatus(p.status_interno) === 'subir xml')
  ), [pedidos]);

  const badgeCountFalha = useMemo(() => nfePedidosAll.filter(p => normStatus(p.status_interno) === 'falha na emissao').length, [nfePedidosAll]);
  const badgeCountProcessando = useMemo(() => pedidos.filter(p => normStatus(p.status_interno) === 'processando nf').length, [pedidos]);
  const badgeCountEmitir = useMemo(() => nfePedidosAll.filter(p => {
    const st = String(nfeFocusStatusByPedidoId[String(p.id)] || '').toLowerCase();
    return normStatus(p.status_interno) === 'emissao nf' &&
      normStatus(p.subStatus) !== 'falha na emissao' &&
      !processingIdsSet.has(p.id) &&
      st !== 'processando_autorizacao' &&
      st !== 'pendente' &&
      st !== 'erro_autorizacao' &&
      st !== 'rejeitado' &&
      st !== 'denegado';
  }).length, [nfePedidosAll, nfeFocusStatusByPedidoId, processingIdsSet]);
  const badgeCountSubirXml = useMemo(() => nfePedidosAll.filter(p => normStatus(p.status_interno) === 'subir xml').length, [nfePedidosAll]);

  // ── Status + board-specific filters ──
  const activeMarketplaceFilter = marketplaceFilters[activeStatus] ?? 'all';
  const activeShippingTypeFilter = shippingTypeFilters[activeStatus] ?? 'all';

  const filteredPedidos = useMemo(() => {
    let result = baseFiltered.filter(p => matchStatus(p, activeStatus));

    // Marketplace and shipping type filters
    if (activeStatus === 'impressao' || activeStatus === 'enviado' || activeStatus === 'cancelado') {
      if (activeMarketplaceFilter !== 'all') {
        result = result.filter(p => normalizeMarketplaceId(String(p.marketplace || '')) === activeMarketplaceFilter);
      }
      if (activeStatus !== 'cancelado' && activeShippingTypeFilter !== 'all') {
        result = result.filter(p => normalizeShippingType(String(p.tipoEnvio ?? '')) === activeShippingTypeFilter);
      }
    }

    // NFe tab sub-filters
    if (activeStatus === "emissao-nf") {
      if (nfBadgeFilter === "falha") {
        result = baseFiltered.filter(p => normStatus(p.status_interno) === 'falha na emissao');
      } else if (nfBadgeFilter === "processando") {
        result = baseFiltered.filter(p => normStatus(p.status_interno) === 'processando nf');
      } else if (nfBadgeFilter === "subir_xml") {
        result = baseFiltered.filter(p => normStatus(p.status_interno) === 'subir xml');
      } else {
        result = result.filter(p => {
          const st = String(nfeFocusStatusByPedidoId[String(p.id)] || '').toLowerCase();
          return (normStatus(p.status_interno) === 'emissao nf') &&
            normStatus(p.subStatus) !== "falha na emissao" &&
            normStatus(p.subStatus) !== "falha ao enviar" &&
            !processingIdsSet.has(p.id) &&
            st !== "processando_autorizacao" &&
            st !== "pendente" &&
            st !== "erro_autorizacao" &&
            st !== "rejeitado" &&
            st !== "denegado";
        });
      }
    }

    // Vincular tab sub-filters
    if (activeStatus === "a-vincular") {
      if (vincularBadgeFilter === "sem_estoque") {
        result = baseFiltered.filter(p => normStatus(p.status_interno) === 'sem estoque');
      } else {
        result = baseFiltered.filter(p => normStatus(p.status_interno) === 'a vincular');
      }
    }

    return result;
  }, [baseFiltered, activeStatus, activeMarketplaceFilter, activeShippingTypeFilter, nfBadgeFilter, vincularBadgeFilter, processingIdsSet, nfeFocusStatusByPedidoId]);

  // ── Sorting ──
  const sortedPedidos = useMemo(() => [...filteredPedidos].sort((a, b) => {
    const dir = sortDir === 'desc' ? -1 : 1;
    if (sortKey === 'sku') {
      return String(a?.sku ?? '').toLowerCase().localeCompare(String(b?.sku ?? '').toLowerCase()) * dir;
    }
    if (sortKey === 'items') {
      const av = Number(a?.quantidadeTotal ?? 0);
      const bv = Number(b?.quantidadeTotal ?? 0);
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    if (sortKey === 'shipping') {
      const order = ['full', 'flex', 'envios', 'correios', 'no_shipping', ''];
      const ai = order.indexOf(normalizeShippingType(String(a?.tipoEnvio ?? '')));
      const bi = order.indexOf(normalizeShippingType(String(b?.tipoEnvio ?? '')));
      if (ai === bi) return 0;
      return ai > bi ? dir : -dir;
    }
    if (sortKey === 'sla') {
      const aExp = a?.slaDespacho?.expected_date ? new Date(a.slaDespacho.expected_date).getTime() : Number.POSITIVE_INFINITY;
      const bExp = b?.slaDespacho?.expected_date ? new Date(b.slaDespacho.expected_date).getTime() : Number.POSITIVE_INFINITY;
      if (aExp === bExp) return 0;
      return aExp > bExp ? dir : -dir;
    }
    // 'recent' default
    const ad = a?.dataPagamento || a?.data;
    const bd = b?.dataPagamento || b?.data;
    const at = ad ? (eventToSPEpochMs(ad) ?? 0) : 0;
    const bt = bd ? (eventToSPEpochMs(bd) ?? 0) : 0;
    if (at === bt) return 0;
    return at > bt ? dir : -dir;
  }), [filteredPedidos, sortKey, sortDir]);

  // ── Pagination ──
  const isServerPaged = totalPedidosCount !== null;
  const totalFiltered = useMemo(() => {
    const hasLocalFilterImpact = (activeMarketplaceFilter !== 'all' || activeShippingTypeFilter !== 'all');
    if (!isServerPaged || hasLocalFilterImpact) return sortedPedidos.length;
    if (activeStatus === 'todos') return (totalPedidosCount ?? sortedPedidos.length);
    const gs = statusCountsGlobal?.[activeStatus];
    return typeof gs === 'number' ? gs : sortedPedidos.length;
  }, [sortedPedidos.length, isServerPaged, activeMarketplaceFilter, activeShippingTypeFilter, activeStatus, totalPedidosCount, statusCountsGlobal]);

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPedidos = isServerPaged ? sortedPedidos : sortedPedidos.slice(startIndex, startIndex + pageSize);
  const showingFrom = totalFiltered === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + paginatedPedidos.length, totalFiltered);

  return {
    baseFiltered,
    filteredPedidos,
    sortedPedidos,
    paginatedPedidos,
    totalFiltered,
    totalPages,
    safeCurrentPage,
    showingFrom,
    showingTo,
    pedidosImpressao,
    pedidosNaoImpressos,
    pedidosImpressos,
    nfePedidosAll,
    badgeCountEmitir,
    badgeCountFalha,
    badgeCountProcessando,
    badgeCountSubirXml,
  };
}
