import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  promotionKeys,
  fetchPromotions,
  fetchPromotionById,
  fetchPromotionItems,
  fetchPromotionsByMlKind,
  fetchMlItemPromotions,
  manageMlExclusionList,
  syncPromotions,
  createStandardDiscount,
  updatePromotion,
  deletePromotion,
  addItemsToPromotion,
  updatePromotionItems,
  removeItemFromPromotion,
  listShopeeFlashSlots,
  fetchMlFlashSaleInvites,
} from "@/services/promotions.service";
import type {
  PromotionType,
  MlPromotionKind,
  CreateStandardDiscountInput,
  AddItemsInput,
  UpdateItemsInput,
  RemoveItemInput,
  MlExclusionInput,
} from "@/types/promotions";

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePromotionsByMarketplace(orgId: string, marketplaceKey: string) {
  return useQuery({
    queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey),
    queryFn: () => fetchPromotions(orgId, marketplaceKey),
    enabled: !!orgId && !!marketplaceKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Filtered query by native ML promotion kind (reads from ml_kind column). */
export function usePromotionsByMlKind(orgId: string, mlKind: MlPromotionKind | null) {
  return useQuery({
    queryKey: promotionKeys.byMlKind(orgId, mlKind!),
    queryFn: () => fetchPromotionsByMlKind(orgId, mlKind!),
    enabled: !!orgId && !!mlKind,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function usePromotionItems(promotionId: string | null) {
  return useQuery({
    queryKey: promotionKeys.items(promotionId ?? ""),
    queryFn: () => fetchPromotionItems(promotionId!),
    enabled: !!promotionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePromotionById(orgId: string | null, promotionId: string | null) {
  return useQuery({
    queryKey: promotionKeys.detailForOrg(orgId ?? "", promotionId ?? ""),
    queryFn: () => fetchPromotionById(orgId!, promotionId!),
    enabled: !!orgId && !!promotionId,
    staleTime: 60 * 1000,
  });
}

export function useShopeeFlashSlots(integrationId: string | null) {
  return useQuery({
    queryKey: promotionKeys.flashSlots(integrationId ?? ""),
    queryFn: () => listShopeeFlashSlots(integrationId!),
    enabled: !!integrationId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useMlFlashSaleInvites(orgId: string, enabled = true) {
  return useQuery({
    queryKey: promotionKeys.mlInvites(orgId),
    queryFn: () => fetchMlFlashSaleInvites(orgId),
    enabled: !!orgId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 360° view of all ML promotions for a single item.
 * Calls GET /seller-promotions/items/{item_id} via edge function.
 */
export function useMlItemPromotions(integrationId: string | null, marketplaceItemId: string | null) {
  return useQuery({
    queryKey: promotionKeys.mlItemPromotions(integrationId ?? "", marketplaceItemId ?? ""),
    queryFn: () => fetchMlItemPromotions(integrationId!, marketplaceItemId!),
    enabled: !!integrationId && !!marketplaceItemId,
    staleTime: 3 * 60 * 1000,
  });
}

/** Query or poll the ML automatic campaign exclusion status for seller or item. */
export function useMlExclusionStatus(
  integrationId: string | null,
  target: "seller" | "item",
  itemId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: promotionKeys.mlExclusion(integrationId ?? "", target, itemId),
    queryFn: () => manageMlExclusionList({ integrationId: integrationId!, target, itemId }),
    enabled: !!integrationId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useSyncPromotions(orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => syncPromotions(integrationId),
    onSuccess: (result) => {
      toast.success(`Sincronizado: ${result.campaigns} promoções, ${result.items} produtos`);
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao sincronizar: ${err.message}`);
    },
  });
}

export function useCreateStandardDiscount(orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStandardDiscountInput) => createStandardDiscount(input),
    onSuccess: () => {
      toast.success("Desconto criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar desconto: ${err.message}`);
    },
  });
}

export function useUpdatePromotion(orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      integrationId,
      externalId,
      promotionType,
      patch,
    }: {
      integrationId: string;
      externalId: string;
      promotionType: PromotionType;
      patch: { name?: string; startDate?: string; endDate?: string };
    }) => updatePromotion(integrationId, externalId, promotionType, patch),
    onSuccess: () => {
      toast.success("Promoção atualizada!");
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar promoção: ${err.message}`);
    },
  });
}

export function useDeletePromotion(orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      integrationId,
      externalId,
      promotionType,
      force,
    }: {
      integrationId: string;
      externalId: string;
      promotionType: PromotionType;
      force?: "auto" | "end" | "delete";
    }) => deletePromotion(integrationId, externalId, promotionType, force ?? "auto"),
    onSuccess: () => {
      toast.success("Promoção encerrada!");
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao encerrar promoção: ${err.message}`);
    },
  });
}

/** Alias — semantically ends an active campaign (force="end"). */
export function useEndPromotion(orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      integrationId,
      externalId,
      promotionType,
    }: {
      integrationId: string;
      externalId: string;
      promotionType: PromotionType;
    }) => deletePromotion(integrationId, externalId, promotionType, "end"),
    onSuccess: () => {
      toast.success("Promoção encerrada!");
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao encerrar promoção: ${err.message}`);
    },
  });
}

export function useAddItemsToPromotion(promotionId: string, orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddItemsInput) => addItemsToPromotion(input),
    onSuccess: (result) => {
      const failCount = result.failed.length;
      if (failCount > 0) {
        toast.warning(`${result.successful.length} adicionados, ${failCount} falharam`);
      } else {
        toast.success(`${result.successful.length} produto(s) adicionado(s) à promoção!`);
      }
      queryClient.invalidateQueries({ queryKey: promotionKeys.items(promotionId) });
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao adicionar produtos: ${err.message}`);
    },
  });
}

export function useUpdatePromotionItems(promotionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateItemsInput) => updatePromotionItems(input),
    onSuccess: (result) => {
      if (result.failed.length > 0) {
        toast.warning(
          `${result.successful.length} atualizados. ${result.failed.length} não suportam atualização direta — remova e adicione novamente.`,
        );
      } else {
        toast.success("Preços atualizados!");
      }
      queryClient.invalidateQueries({ queryKey: promotionKeys.items(promotionId) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao atualizar produtos: ${err.message}`);
    },
  });
}

export function useRemoveItemFromPromotion(promotionId: string, orgId: string, marketplaceKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RemoveItemInput) => removeItemFromPromotion(input),
    onSuccess: () => {
      toast.success("Produto removido da promoção!");
      queryClient.invalidateQueries({ queryKey: promotionKeys.items(promotionId) });
      queryClient.invalidateQueries({ queryKey: promotionKeys.byMarketplace(orgId, marketplaceKey) });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover produto: ${err.message}`);
    },
  });
}

/** Toggle ML exclusion list (seller or item). */
export function useManageMlExclusionList(
  integrationId: string | null,
  target: "seller" | "item",
  itemId?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (exclusionStatus: boolean) =>
      manageMlExclusionList({ integrationId: integrationId!, target, itemId, exclusionStatus }),
    onSuccess: (result) => {
      const label = result.excluded === "excluded" ? "excluído" : "incluído";
      toast.success(`${target === "seller" ? "Vendedor" : "Item"} ${label} das campanhas automáticas.`);
      queryClient.invalidateQueries({
        queryKey: promotionKeys.mlExclusion(integrationId ?? "", target, itemId),
      });
    },
    onError: (err: Error) => {
      toast.error(`Erro na lista de exclusão: ${err.message}`);
    },
  });
}
