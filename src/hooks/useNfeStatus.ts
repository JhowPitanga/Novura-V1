import { useCallback, useEffect, useState } from "react";
import { fetchNfeStatusRows } from "@/services/orders.service";

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

export function useNfeStatus({
  organizationId,
  pedidos,
  emitEnvironment,
  activeStatus,
  nfBadgeFilter,
  getCompanyId,
}: UseNfeStatusParams): NfeStatusResult {
  const [nfeAuthorizedByPedidoId, setNfeAuthorizedByPedidoId] = useState<Record<string, boolean>>({});
  const [nfeFocusStatusByPedidoId, setNfeFocusStatusByPedidoId] = useState<Record<string, string>>({});
  const [nfeXmlPendingByPedidoId, setNfeXmlPendingByPedidoId] = useState<Record<string, boolean>>({});
  const [nfeErrorMessageByPedidoId, setNfeErrorMessageByPedidoId] = useState<Record<string, string>>({});

  const refreshNfeAuthorizedMapForList = useCallback(async () => {
    try {
      if (!organizationId) return;
      const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      const pedidosAtivos = pedidos.filter(p => {
        const si = norm(String(p?.status_interno || ''));
        return si === 'emissao nf' || si === 'subir xml' || si === 'falha na emissao';
      });
      if (pedidosAtivos.length === 0) {
        setNfeAuthorizedByPedidoId({});
        setNfeFocusStatusByPedidoId({});
        setNfeXmlPendingByPedidoId({});
        setNfeErrorMessageByPedidoId({});
        return;
      }
      const idsToCheck = pedidosAtivos.map(p => String(p.id));
      const mkIdsToCheck = pedidosAtivos
        .map(p => String(p?.marketplace_order_id || p?.idPlataforma || ''))
        .filter(Boolean);
      const idByOrderId = new Map<string, string>();
      const idByMarketplaceId = new Map<string, string>();
      for (const p of pedidosAtivos) {
        const pid = String(p.id);
        idByOrderId.set(pid, pid);
        const mk = String(p?.marketplace_order_id || p?.idPlataforma || '');
        if (mk) idByMarketplaceId.set(mk, pid);
      }
      const companyId = await getCompanyId();
      if (!companyId) return;
      const nfRows = await fetchNfeStatusRows(companyId, idsToCheck, mkIdsToCheck);
      const envSel = emitEnvironment;
      const byMarketId: Record<string, boolean> = {};
      const byMarketStatus: Record<string, string> = {};
      const byXmlPending: Record<string, boolean> = {};
      const byErrorMessage: Record<string, string> = {};
      (Array.isArray(nfRows) ? nfRows : []).forEach((r: any) => {
        const orderIdRaw = String(r?.order_id || '');
        const mkIdRaw = String(r?.marketplace_order_id || '');
        let pid: string | undefined = undefined;
        if (orderIdRaw && idByOrderId.has(orderIdRaw)) {
          pid = idByOrderId.get(orderIdRaw);
        } else if (mkIdRaw && idByMarketplaceId.has(mkIdRaw)) {
          pid = idByMarketplaceId.get(mkIdRaw);
        }
        const mk = String(pid || orderIdRaw || mkIdRaw || '');
        const st = String(r?.status_focus || '').toLowerCase();
        const amb = String(r?.emissao_ambiente || '').toLowerCase();
        const xmlHas = !!(r?.xml_base64 || r?.xml_url);
        const marketplace = String(r?.marketplace || '');
        const mlSub = String(r?.marketplace_submission_status || '').toLowerCase();
        if (!mk) return;
        const okAmb = amb ? (envSel === 'producao' ? amb === 'producao' : amb === 'homologacao') : true;
        if (st === 'autorizado' && okAmb) byMarketId[mk] = true;
        if (okAmb) byMarketStatus[mk] = st;
        if (okAmb) byXmlPending[mk] = (st === 'autorizado') && marketplace.toLowerCase().includes('mercado') && xmlHas && mlSub !== 'sent';
        if (r?.error_details) {
          try {
            let rawStr: string | null = null;
            if (typeof r.error_details === 'string') {
              const s = r.error_details as string;
              const si = s.indexOf('{');
              const sj = s.lastIndexOf('}');
              if (si !== -1 && sj !== -1 && sj > si) {
                rawStr = s.slice(si, sj + 1);
              } else {
                rawStr = s;
              }
            }
            const ed = rawStr ? JSON.parse(rawStr) : r.error_details;
            const raw = String(ed?.mensagem_sefaz || '');
            const msg = raw ? raw.replace(/\s*\[.*$/s, '').trim() : '';
            if (msg) byErrorMessage[mk] = msg;
          } catch {
            const s = String(r.error_details || '');
            let extracted = '';
            const m = s.match(/"mensagem_sefaz"\s*:\s*"([^"]+)"/);
            if (m && m[1]) extracted = m[1];
            const msg = extracted ? extracted.replace(/\s*\[.*$/s, '').trim() : '';
            if (msg) byErrorMessage[mk] = msg;
          }
        }
      });
      const nextMap: Record<string, boolean> = {};
      const nextStatusMap: Record<string, string> = {};
      const nextXmlMap: Record<string, boolean> = {};
      const nextErrMap: Record<string, string> = {};
      for (const p of pedidosAtivos) {
        const mk = String(p.id);
        nextMap[mk] = byMarketId[mk] === true;
        nextStatusMap[mk] = byMarketStatus[mk] || '';
        nextXmlMap[mk] = byXmlPending[mk] === true;
        if (byErrorMessage[mk]) nextErrMap[mk] = byErrorMessage[mk];
      }
      setNfeAuthorizedByPedidoId(nextMap);
      setNfeFocusStatusByPedidoId(nextStatusMap);
      setNfeXmlPendingByPedidoId(nextXmlMap);
      setNfeErrorMessageByPedidoId(nextErrMap);
    } catch { }
  }, [organizationId, pedidos, emitEnvironment, getCompanyId]);

  useEffect(() => {
    if (activeStatus === 'emissao-nf') {
      refreshNfeAuthorizedMapForList();
    }
  }, [activeStatus, refreshNfeAuthorizedMapForList]);

  useEffect(() => {
    if (activeStatus === 'emissao-nf' && nfBadgeFilter === 'falha') {
      refreshNfeAuthorizedMapForList();
    }
  }, [nfBadgeFilter, activeStatus, refreshNfeAuthorizedMapForList]);

  return {
    nfeAuthorizedByPedidoId,
    nfeFocusStatusByPedidoId,
    nfeXmlPendingByPedidoId,
    nfeErrorMessageByPedidoId,
    refreshNfeAuthorizedMapForList,
  };
}
