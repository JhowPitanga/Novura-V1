import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import type { ListingItem } from "@/types/listings";

interface UseListingActionsOptions {
  organizationId: string | null | undefined;
  selectedDisplayName: string;
  selectedItems: Set<string>;
  mutations: any;
  refetch: () => void;
  patchRawItems: (updater: (prev: any[]) => any[]) => void;
  rawItems: any[];
  listingTypeByItemId: Record<string, string | null>;
  sortedAds: ListingItem[];
  selectedDraftIds: Set<string>;
  setSelectedDraftIds: (s: Set<string>) => void;
}

export function useListingActions({
  organizationId,
  selectedDisplayName,
  selectedItems,
  mutations,
  refetch,
  patchRawItems,
  rawItems,
  listingTypeByItemId,
  sortedAds,
  selectedDraftIds,
  setSelectedDraftIds,
}: UseListingActionsOptions) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmPauseFor, setConfirmPauseFor] = useState<string | null>(null);

  const toastErr = (title: string, e: any) =>
    toast({ title, description: e?.message || "Erro inesperado", variant: "destructive" });

  async function handleSync() {
    if (!organizationId) { toast({ title: "Sessão necessária", variant: "destructive" }); return; }
    try {
      await mutations.syncAll.mutateAsync({ marketplaceDisplay: selectedDisplayName });
      toast({ title: "Sincronização concluída", description: "Itens, qualidade e reviews atualizados com sucesso!" });
      refetch();
    } catch (e: any) { toastErr("Falha na sincronização", e); }
  }

  async function handleSyncSelected() {
    if (!organizationId) { toast({ title: "Sessão necessária", variant: "destructive" }); return; }
    if (selectedItems.size === 0) { toast({ title: "Nenhum anúncio selecionado" }); return; }
    try {
      await mutations.syncSelected.mutateAsync({ marketplaceDisplay: selectedDisplayName, itemIds: Array.from(selectedItems) });
      toast({ title: "Sincronização concluída", description: `Selecionados sincronizados: ${selectedItems.size}` });
      refetch();
    } catch (e: any) { toastErr("Falha na sincronização", e); }
  }

  async function handleSyncSingle(ad: ListingItem) {
    if (!organizationId) return;
    try {
      await mutations.syncSingle.mutateAsync({ marketplaceItemId: ad.marketplaceId, scope: "full" });
      toast({ title: "Anúncio sincronizado", description: ad.title });
      refetch();
    } catch (e: any) { toastErr("Falha ao sincronizar", e); }
  }

  async function handleToggleStatus(ad: ListingItem, makeActive: boolean) {
    const targetStatus = makeActive ? "active" : "paused";
    const patchStatus = (s: string) =>
      patchRawItems((prev) => prev.map((r) => {
        const mlId = r?.marketplace_item_id || r?.id;
        return String(mlId) === String(ad.marketplaceId) ? { ...r, status: s } : r;
      }));
    patchStatus(targetStatus);
    try {
      await mutations.toggleStatus.mutateAsync({ itemId: ad.marketplaceId, targetStatus });
      toast({ title: makeActive ? "Anúncio ativado" : "Anúncio pausado" });
    } catch (e: any) {
      patchStatus(makeActive ? "paused" : "active");
      toast({ title: "Falha ao atualizar status", description: e?.message || "", variant: "destructive" });
    }
  }

  async function handleDeleteItem() {
    if (!confirmDeleteItemId) return;
    const ad = sortedAds.find((a) => a.id === confirmDeleteItemId);
    if (!ad) return;
    // PRE-EXISTING: invalidation key breadth — intentionally broad, preserved verbatim
    await mutations.deleteItem.mutateAsync({ marketplaceItemId: ad.marketplaceId });
    toast({ title: "Anúncio excluído", description: "Removido do banco de dados." });
  }

  async function handleDeleteDraft(draftId: string) {
    try {
      await mutations.deleteDraftMut.mutateAsync({ draftId });
      toast({ title: "Rascunho excluído" });
    } catch (e: any) { toast({ title: "Falha ao excluir rascunho", description: e?.message || String(e), variant: "destructive" }); }
  }

  async function handleDeleteSelectedDrafts() {
    try {
      await mutations.deleteDraftsMut.mutateAsync({ draftIds: Array.from(selectedDraftIds) });
      setSelectedDraftIds(new Set());
      toast({ title: "Rascunhos excluídos" });
    } catch (e: any) { toast({ title: "Falha ao excluir rascunhos", description: e?.message || String(e), variant: "destructive" }); }
  }

  async function handleDuplicate(ad: ListingItem) {
    const itemRow = rawItems.find((r) => String(r?.marketplace_item_id || r?.id) === String(ad.id));
    if (!itemRow || !organizationId) return;
    try {
      const draftId = await mutations.createDraftMut.mutateAsync({ itemRow, listingTypeId: listingTypeByItemId[String(ad.id)] || null });
      toast({ title: "Rascunho criado", description: "Você pode editar o rascunho agora." });
      navigate(`/anuncios/criar/?draft_id=${draftId}&step=6`);
    } catch (e: any) { toast({ title: "Erro ao duplicar", description: e?.message || String(e), variant: "destructive" }); }
  }

  function handleStockSuccess(itemId: string, updates: Array<{ model_id: number; seller_stock: number }>) {
    patchRawItems((prev) => prev.map((r) => {
      if (String(r?.marketplace_item_id || r?.id) !== itemId) return r;
      return {
        ...r,
        variations: (Array.isArray(r?.variations) ? r.variations : []).map((vv: any) => {
          const upd = updates.find((u) => String(u.model_id) === String(vv?.model_id || vv?.id));
          if (!upd) return vv;
          const ns = Number(upd.seller_stock);
          const sinfo = typeof vv?.stock_info_v2 === "object" && vv.stock_info_v2 ? { ...vv.stock_info_v2 } : null;
          if (sinfo) {
            const list = Array.isArray(sinfo.seller_stock) ? [...sinfo.seller_stock] : [];
            if (list.length > 0) { list[0] = { ...list[0], stock: ns, location_id: list[0].location_id || "BRZ" }; }
            else { list.push({ stock: ns, if_saleable: true, location_id: "BRZ" }); }
            sinfo.seller_stock = list;
            sinfo.summary_info = { ...(sinfo.summary_info || {}), total_available_stock: ns };
          }
          return { ...vv, seller_stock: ns, available_quantity: ns, stock_info_v2: sinfo || vv.stock_info_v2 };
        }),
      };
    }));
  }

  return {
    confirmDeleteItemId,
    setConfirmDeleteItemId,
    confirmPauseFor,
    setConfirmPauseFor,
    handleSync,
    handleSyncSelected,
    handleSyncSingle,
    handleToggleStatus,
    handleDeleteItem,
    handleDeleteDraft,
    handleDeleteSelectedDrafts,
    handleDuplicate,
    handleStockSuccess,
  };
}
