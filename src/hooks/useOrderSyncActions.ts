/**
 * Marketplace sync and shipment arrangement actions.
 * §1 size exception: ~105 lines — single domain (marketplace sync) with no further
 * split axis: ML full sync, Shopee order sync, single-order sync by internal ID,
 * Shopee shop loading, and Shopee shipment arrangement all belong here.
 *
 * Shopee epoch guard (invariant): Math.floor(calendarStart/EndOfDaySPEpochMs / 1000).
 * ML exclude guard (invariant): id !== '2000010000000000'.
 * Extracted from useOrdersActions (Commit B2).
 */
import { useCallback, useRef, useState } from "react";
import {
  arrangeShopeeShipment,
  fetchOrderByInternalId,
  fetchShopeeShops as fetchShopeeShopsSvc,
  syncMercadoLivreOrders,
  syncShopeeOrders,
} from "@/services/orders.service";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs } from "@/lib/datetime";
import { toast } from "@/components/ui/use-toast";

interface UseOrderSyncActionsParams {
  organizationId: string | null | undefined;
  getCompanyId: () => Promise<string | null>;
  activeStatus: string;
  shopeeOrderSnInput: string;
  shopeeDateFrom: string;
  shopeeDateTo: string;
  selectedShopeeShopId: number | null;
  onSyncComplete: () => Promise<void>;
  onClearSelections: () => void;
  onSetIsSyncModalOpen: (v: boolean) => void;
  onSetShopeeShopOptions: (v: Array<{ id: string; shop_id: number; label: string }>) => void;
  onSetSelectedShopeeShopId: (v: number | null) => void;
}

export function useOrderSyncActions({
  organizationId,
  getCompanyId,
  activeStatus,
  shopeeOrderSnInput,
  shopeeDateFrom,
  shopeeDateTo,
  selectedShopeeShopId,
  onSyncComplete,
  onClearSelections,
  onSetIsSyncModalOpen,
  onSetShopeeShopOptions,
  onSetSelectedShopeeShopId,
}: UseOrderSyncActionsParams) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [arrangeLoadingIds, setArrangeLoadingIds] = useState<string[]>([]);

  // arrangeLoadingSet rebuilt new Set() each render — identity breaks feed rowViewModels deps.
  const arrangeLoadingSet = new Set(arrangeLoadingIds);

  const activeStatusRef = useRef(activeStatus);
  activeStatusRef.current = activeStatus;

  const handleSyncOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      await syncMercadoLivreOrders(organizationId!);
      await onSyncComplete();
    } catch (e) {
      console.error('Falha ao sincronizar pedidos:', e);
    } finally {
      setIsSyncing(false);
      onClearSelections();
    }
  }, [organizationId, onSyncComplete, onClearSelections]);

  const loadShopeeShops = useCallback(async () => {
    try {
      if (!organizationId) return;
      const opts = await fetchShopeeShopsSvc(organizationId);
      onSetShopeeShopOptions(opts);
      if (opts.length > 0 && !selectedShopeeShopId) {
        onSetSelectedShopeeShopId(Number(opts[0].shop_id));
      }
    } catch { }
  }, [organizationId, selectedShopeeShopId, onSetShopeeShopOptions, onSetSelectedShopeeShopId]);

  const handleSyncShopeeOrders = useCallback(async () => {
    try {
      setIsSyncing(true);
      const opts: { orderSnList?: string[]; timeFrom?: number; timeTo?: number } = {};
      const orderSnText = String(shopeeOrderSnInput || "").trim();
      if (orderSnText) {
        const orderSnList = orderSnText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        if (orderSnList.length > 0) opts.orderSnList = orderSnList;
      }
      if (shopeeDateFrom) {
        opts.timeFrom = Math.floor(calendarStartOfDaySPEpochMs(new Date(shopeeDateFrom)) / 1000);
      }
      if (shopeeDateTo) {
        opts.timeTo = Math.floor(calendarEndOfDaySPEpochMs(new Date(shopeeDateTo)) / 1000);
      }
      await syncShopeeOrders(organizationId!, selectedShopeeShopId, opts);
      await onSyncComplete();
      onSetIsSyncModalOpen(false);
    } catch (e) {
      console.error('Falha ao sincronizar pedidos Shopee:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [
    organizationId, shopeeOrderSnInput, shopeeDateFrom, shopeeDateTo,
    selectedShopeeShopId, onSyncComplete, onSetIsSyncModalOpen,
  ]);

  const handleSyncOrderByInternalId = useCallback(async (internalOrderId?: string) => {
    try {
      const id = String(internalOrderId || '').trim();
      if (!id) return;
      setIsSyncing(true);
      const { marketplace_order_id, marketplace } = await fetchOrderByInternalId(id);
      const marketplaceName = String(marketplace || '').toLowerCase();
      if (!marketplaceName.includes('mercado')) throw new Error('Pedido não é do Mercado Livre');
      const mlOrderId = String(marketplace_order_id || '').trim();
      if (!/^\d+$/.test(mlOrderId)) throw new Error('Pedido sem marketplace_order_id válido');
      await syncMercadoLivreOrders(organizationId!, [mlOrderId]);
      await onSyncComplete();
    } catch (e) {
      console.error('Falha ao sincronizar pedido por ID interno:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [organizationId, onSyncComplete]);

  const handleArrangeShipmentForPedido = useCallback(async (pedido: any) => {
    try {
      setArrangeLoadingIds(prev => Array.from(new Set([...prev, String(pedido.id)])));
      if (!organizationId) throw new Error('Organização não encontrada.');
      const companyId = await getCompanyId();
      if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
      const mk = String(pedido?.marketplace || '').toLowerCase();
      if (!mk.includes('shopee')) throw new Error('Apenas pedidos Shopee suportados.');
      const orderSn = String(pedido?.marketplaceOrderId ?? pedido?.platformId ?? '');
      if (!orderSn) throw new Error('order_sn ausente.');
      await arrangeShopeeShipment(organizationId, companyId, orderSn);
      toast({ title: "Organização de envio", description: "Planejamento de coleta/dropoff registrado." });
    } catch (e: any) {
      toast({ title: "Erro ao organizar envio", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setArrangeLoadingIds(prev => prev.filter(id => id !== String(pedido.id)));
    }
  }, [organizationId, getCompanyId]);

  return {
    isSyncing,
    arrangeLoadingSet,
    loadShopeeShops,
    handleSyncOrders,
    handleSyncShopeeOrders,
    handleSyncOrderByInternalId,
    handleArrangeShipmentForPedido,
  };
}
