import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchNfeStatusRows } from "@/services/orders.service";

/** EN slugs and legacy PT strings that identify orders in the NFe workflow. */
const NFE_ACTIVE_STATUSES = new Set([
  'emissao nf', 'subir xml', 'falha na emissao',
  'invoice_pending', 'nfe_error', 'nfe_xml_pending',
]);

const normStr = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

interface UseNfeStatusParams {
  organizationId: string | null | undefined;
  pedidos: any[];
  emitEnvironment: string;
  activeStatus: string;
  nfBadgeFilter: string;
  getCompanyId: () => Promise<string | null>;
}

interface NfeStatusResult {
  nfeAuthorizedByPedidoId: Record<string, boolean>;
  nfeFocusStatusByPedidoId: Record<string, string>;
  nfeXmlPendingByPedidoId: Record<string, boolean>;
  nfeErrorMessageByPedidoId: Record<string, string>;
  refreshNfeAuthorizedMapForList: () => Promise<void>;
}

export const nfeStatusKeys = {
  all: ['nfe-status'] as const,
  list: (orgId: string, pedidoIds: string, env: string) =>
    ['nfe-status', orgId, pedidoIds, env] as const,
};

// Stable empty references used as fallbacks when the query hasn't returned data
// yet. Creating `{}` inline on every render causes identity changes that break
// downstream `useEffect`/`useMemo` dependency comparisons and can lead to
// infinite re-render loops in consumers.
const EMPTY_AUTHORIZED_MAP: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_FOCUS_STATUS_MAP: Readonly<Record<string, string>> = Object.freeze({});
const EMPTY_XML_PENDING_MAP: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_ERROR_MESSAGE_MAP: Readonly<Record<string, string>> = Object.freeze({});

type NfeMaps = {
  authorized: Record<string, boolean>;
  focusStatus: Record<string, string>;
  xmlPending: Record<string, boolean>;
  errorMessage: Record<string, string>;
};

/** Extract error message string from Focus NFe error_details field. */
function extractFocusErrorMessage(errorDetails: unknown): string {
  const SEFAZ_RE = /"mensagem_sefaz"\s*:\s*"([^"]+)"/;
  try {
    let rawStr: string | null = null;
    if (typeof errorDetails === 'string') {
      const si = errorDetails.indexOf('{');
      const sj = errorDetails.lastIndexOf('}');
      rawStr = si !== -1 && sj > si ? errorDetails.slice(si, sj + 1) : errorDetails;
    }
    const ed = rawStr ? JSON.parse(rawStr) : errorDetails;
    const raw = typeof ed?.mensagem_sefaz === 'string' ? ed.mensagem_sefaz : '';
    return raw ? raw.replace(/\s*\[.*$/s, '').trim() : '';
  } catch {
    const s = typeof errorDetails === 'string' ? errorDetails : '';
    const m = SEFAZ_RE.exec(s);
    const extracted = m?.[1] ?? '';
    return extracted ? extracted.replace(/\s*\[.*$/s, '').trim() : '';
  }
}

type RawMaps = {
  byMarketId: Record<string, boolean>;
  byMarketStatus: Record<string, string>;
  byXmlPending: Record<string, boolean>;
  byErrorMessage: Record<string, string>;
};

/** Resolve the internal pedido ID for a single NFe row. */
function resolveRowPedidoId(
  r: any,
  idByOrderId: Map<string, string>,
  idByMarketplaceId: Map<string, string>,
): string {
  const orderIdRaw = String(r?.order_id || '');
  const mkIdRaw = String(r?.marketplace_order_id || '');
  if (orderIdRaw && idByOrderId.has(orderIdRaw)) return idByOrderId.get(orderIdRaw) ?? '';
  if (mkIdRaw && idByMarketplaceId.has(mkIdRaw)) return idByMarketplaceId.get(mkIdRaw) ?? '';
  return String(orderIdRaw || mkIdRaw || '');
}

/** Apply a single NFe row to the raw accumulator maps. */
function applyNfeRow(
  r: any,
  mk: string,
  emitEnvironment: string,
  raw: RawMaps,
): void {
  const st = String(r?.status_focus || '').toLowerCase();
  const amb = String(r?.emissao_ambiente || '').toLowerCase();
  const xmlHas = !!(r?.xml_url);
  const marketplace = String(r?.marketplace || '').toLowerCase();
  const mlSub = String(r?.marketplace_submission_status || '').toLowerCase();
  const ambMatches = emitEnvironment === 'producao' ? amb === 'producao' : amb === 'homologacao';
  const okAmb = amb ? ambMatches : true;

  if (st === 'autorizado' && okAmb) raw.byMarketId[mk] = true;
  if (okAmb) raw.byMarketStatus[mk] = st;
  if (okAmb) raw.byXmlPending[mk] = st === 'autorizado' && marketplace.includes('mercado') && xmlHas && mlSub !== 'sent';
  if (r?.error_details) {
    const msg = extractFocusErrorMessage(r.error_details);
    if (msg) raw.byErrorMessage[mk] = msg;
  }
}

/** Build all four NFe status maps from fetched rows. */
function buildNfeMaps(
  nfRows: any[],
  pedidosAtivos: any[],
  emitEnvironment: string,
  idByOrderId: Map<string, string>,
  idByMarketplaceId: Map<string, string>,
): NfeMaps {
  const raw: RawMaps = { byMarketId: {}, byMarketStatus: {}, byXmlPending: {}, byErrorMessage: {} };

  for (const r of nfRows) {
    const mk = resolveRowPedidoId(r, idByOrderId, idByMarketplaceId);
    if (mk) applyNfeRow(r, mk, emitEnvironment, raw);
  }

  const authorized: Record<string, boolean> = {};
  const focusStatus: Record<string, string> = {};
  const xmlPending: Record<string, boolean> = {};
  const errorMessage: Record<string, string> = {};
  for (const p of pedidosAtivos) {
    const mk = String(p.id);
    authorized[mk] = raw.byMarketId[mk] === true;
    focusStatus[mk] = raw.byMarketStatus[mk] || '';
    xmlPending[mk] = raw.byXmlPending[mk] === true;
    if (raw.byErrorMessage[mk]) errorMessage[mk] = raw.byErrorMessage[mk];
  }

  return { authorized, focusStatus, xmlPending, errorMessage };
}

export function useNfeStatus({
  organizationId,
  pedidos,
  emitEnvironment,
  activeStatus,
  getCompanyId,
}: UseNfeStatusParams): NfeStatusResult {
  const { toast } = useToast();

  const pedidosAtivos = useMemo(
    () => pedidos.filter(p => NFE_ACTIVE_STATUSES.has(normStr(String(p?.internalStatus || '')))),
    [pedidos],
  );

  const sortedIds = useMemo(
    () => pedidosAtivos.map(p => String(p.id)).sort((a, b) => a.localeCompare(b)).join(','),
    [pedidosAtivos],
  );

  const queryKey = nfeStatusKeys.list(organizationId ?? '', sortedIds, emitEnvironment);

  const { data, error, isError, refetch } = useQuery<NfeMaps | null>({
    queryKey,
    queryFn: async () => {
      if (!organizationId) return null;
      const companyId = await getCompanyId();
      if (!companyId) return null;

      const idsToCheck = pedidosAtivos.map(p => String(p.id));
      const mkIdsToCheck = pedidosAtivos.map(p => String(p?.marketplaceOrderId || '')).filter(Boolean);
      const idByOrderId = new Map<string, string>();
      const idByMarketplaceId = new Map<string, string>();
      for (const p of pedidosAtivos) {
        const pid = String(p.id);
        idByOrderId.set(pid, pid);
        const mk = String(p?.marketplaceOrderId || '');
        if (mk) idByMarketplaceId.set(mk, pid);
      }

      const nfRows = await fetchNfeStatusRows(companyId, idsToCheck, mkIdsToCheck);
      return buildNfeMaps(nfRows, pedidosAtivos, emitEnvironment, idByOrderId, idByMarketplaceId);
    },
    enabled: !!organizationId && activeStatus === 'emissao-nf' && pedidosAtivos.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });

  useEffect(() => {
    if (isError && error) {
      console.error('[useNfeStatus] Erro ao carregar status NFe:', error);
      toast({
        title: 'Erro ao carregar status NFe',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [isError, error, toast]);

  const refreshNfeAuthorizedMapForList = useCallback(async () => {
    await refetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch]);

  return {
    nfeAuthorizedByPedidoId: data?.authorized ?? EMPTY_AUTHORIZED_MAP,
    nfeFocusStatusByPedidoId: data?.focusStatus ?? EMPTY_FOCUS_STATUS_MAP,
    nfeXmlPendingByPedidoId: data?.xmlPending ?? EMPTY_XML_PENDING_MAP,
    nfeErrorMessageByPedidoId: data?.errorMessage ?? EMPTY_ERROR_MESSAGE_MAP,
    refreshNfeAuthorizedMapForList,
  };
}
