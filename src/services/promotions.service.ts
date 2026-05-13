import { supabase } from "@/integrations/supabase/client";
import type {
  Promotion,
  PromotionItem,
  PromotionType,
  MlPromotionKind,
  MlItemPromotion,
  MlExclusionInput,
  MlExclusionResult,
  FlashSaleSlot,
  CreateStandardDiscountInput,
  CreateFlashSaleInput,
  AddItemsInput,
  UpdateItemsInput,
  RemoveItemInput,
  BulkResult,
} from "@/types/promotions";

// ─── Query Keys ────────────────────────────────────────────────────────────────

export const promotionKeys = {
  all: ["promotions"] as const,
  byMarketplace: (orgId: string, marketplaceKey: string) =>
    ["promotions", orgId, marketplaceKey] as const,
  byMlKind: (orgId: string, mlKind: MlPromotionKind) =>
    ["promotions", orgId, "ml-kind", mlKind] as const,
  detail: (id: string) => ["promotions", "detail", id] as const,
  detailForOrg: (orgId: string, id: string) => ["promotions", "detail", orgId, id] as const,
  items: (promotionId: string) => ["promotions", "items", promotionId] as const,
  flashSlots: (integrationId: string) =>
    ["promotions", "flash-slots", integrationId] as const,
  mlInvites: (orgId: string) =>
    ["promotions", "ml-invites", orgId] as const,
  mlItemPromotions: (integrationId: string, itemId: string) =>
    ["promotions", "ml-item", integrationId, itemId] as const,
  mlExclusion: (integrationId: string, target: string, itemId?: string) =>
    ["promotions", "ml-exclusion", integrationId, target, itemId ?? ""] as const,
};

async function invokePromotionFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("Sessão expirada. Faça login novamente para continuar.");
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw error;
  return data as T;
}

// ─── Read (local DB) ───────────────────────────────────────────────────────────

export async function fetchPromotions(
  orgId: string,
  marketplaceKey: string,
): Promise<Promotion[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_promotions")
    .select("*")
    .eq("organizations_id", orgId)
    .eq("marketplace_key", marketplaceKey)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

export async function fetchPromotionsByMlKind(
  orgId: string,
  mlKind: MlPromotionKind,
): Promise<Promotion[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_promotions")
    .select("*")
    .eq("organizations_id", orgId)
    .eq("marketplace_key", "mercado_livre")
    .eq("ml_kind", mlKind)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

export async function fetchPromotionItems(promotionId: string): Promise<PromotionItem[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_promotion_items")
    .select("*")
    .eq("promotion_id", promotionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PromotionItem[];
}

/** Single promotion row (RLS: org member). */
export async function fetchPromotionById(orgId: string, promotionId: string): Promise<Promotion | null> {
  const { data, error } = await (supabase as any)
    .from("marketplace_promotions")
    .select("*")
    .eq("organizations_id", orgId)
    .eq("id", promotionId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Promotion | null;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function syncPromotions(integrationId: string): Promise<{ campaigns: number; items: number }> {
  const data = await invokePromotionFunction<any>("promotions-sync", { integrationId });
  if (!data?.ok) throw new Error(data?.error ?? "Sync failed");
  return { campaigns: data.campaigns ?? 0, items: data.items ?? 0 };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createStandardDiscount(input: CreateStandardDiscountInput): Promise<Promotion> {
  const data = await invokePromotionFunction<any>("promotions-create", {
    integrationId: input.integrationId,
    promotionType: "STANDARD_DISCOUNT" as PromotionType,
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!data?.ok) throw new Error(data?.error ?? "Create failed");
  const id = data.id as string | undefined;
  if (!id) throw new Error("Resposta sem id da promoção");
  const row = await fetchPromotionById(input.organizationId, id);
  if (!row) throw new Error("Promoção criada mas não foi possível carregar os dados locais.");
  return row;
}

export async function createShopeeFlashSale(input: CreateFlashSaleInput): Promise<{ promotionId: string }> {
  const data = await invokePromotionFunction<any>("promotions-create", {
    integrationId: input.integrationId,
    promotionType: "FLASH_SALE" as PromotionType,
    name: input.name,
    slotId: input.slotId,
  });
  if (!data?.ok) throw new Error(data?.error ?? "Flash sale create failed");
  const promotionId = data?.id as string | undefined;
  if (!promotionId) throw new Error("Resposta sem id da promoção");
  return { promotionId };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updatePromotion(
  integrationId: string,
  externalId: string,
  promotionType: PromotionType,
  patch: { name?: string; startDate?: string; endDate?: string },
): Promise<Promotion> {
  const data = await invokePromotionFunction<any>("promotions-update", { integrationId, externalId, promotionType, ...patch });
  if (!data?.ok) throw new Error(data?.error ?? "Update failed");
  return data.campaign as Promotion;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePromotion(
  integrationId: string,
  externalId: string,
  promotionType: PromotionType,
  force: "auto" | "end" | "delete" = "auto",
): Promise<void> {
  const data = await invokePromotionFunction<any>("promotions-delete", { integrationId, externalId, promotionType, force });
  if (!data?.ok) throw new Error(data?.error ?? "Delete failed");
}

// ─── Items ────────────────────────────────────────────────────────────────────

export async function addItemsToPromotion(input: AddItemsInput): Promise<BulkResult> {
  const data = await invokePromotionFunction<any>("promotions-add-items", input as unknown as Record<string, unknown>);
  if (!data?.ok && !data?.successful) throw new Error(data?.error ?? "Add items failed");
  return { successful: data.successful ?? [], failed: data.failed ?? [] } as BulkResult;
}

export async function updatePromotionItems(input: UpdateItemsInput): Promise<BulkResult> {
  const data = await invokePromotionFunction<any>("promotions-update-items", input as unknown as Record<string, unknown>);
  return { successful: data?.successful ?? [], failed: data?.failed ?? [] } as BulkResult;
}

export async function removeItemFromPromotion(input: RemoveItemInput): Promise<void> {
  const data = await invokePromotionFunction<any>("promotions-remove-item", input as unknown as Record<string, unknown>);
  if (!data?.ok) throw new Error(data?.error ?? "Remove item failed");
}

// ─── Shopee flash slots ───────────────────────────────────────────────────────

export async function listShopeeFlashSlots(integrationId: string): Promise<FlashSaleSlot[]> {
  const data = await invokePromotionFunction<any>("promotions-list-flash-slots", { integrationId });
  return (data?.slots ?? []) as FlashSaleSlot[];
}

// ─── ML Flash invites (read from local DB — synced by promotions-sync) ────────

export async function fetchMlFlashSaleInvites(
  orgId: string,
): Promise<Promotion[]> {
  const { data, error } = await (supabase as any)
    .from("marketplace_promotions")
    .select("*")
    .eq("organizations_id", orgId)
    .eq("marketplace_key", "mercado_livre")
    .eq("ml_kind", "LIGHTNING")
    .eq("source", "platform_invite")
    .eq("status", "candidate");
  if (error) throw error;
  return (data ?? []) as Promotion[];
}

// ─── ML 360° item promotions ──────────────────────────────────────────────────

/**
 * Returns all promotions an ML item participates in.
 * Calls the promotions-ml-item-promotions edge function (GET /seller-promotions/items/{id}).
 */
export async function fetchMlItemPromotions(
  integrationId: string,
  marketplaceItemId: string,
): Promise<MlItemPromotion[]> {
  const data = await invokePromotionFunction<any>("promotions-ml-item-promotions", {
    integrationId,
    marketplaceItemId,
  });
  if (!data?.ok) throw new Error(data?.error ?? "Failed to fetch item promotions");
  return (data?.promotions ?? []) as MlItemPromotion[];
}

// ─── ML exclusion list ────────────────────────────────────────────────────────

/**
 * Query or toggle the ML automatic campaign exclusion list.
 * Pass exclusionStatus=undefined to read; true/false to write.
 */
export async function manageMlExclusionList(input: MlExclusionInput): Promise<MlExclusionResult> {
  const data = await invokePromotionFunction<any>("promotions-ml-exclusion-list", input as unknown as Record<string, unknown>);
  if (!data?.ok) throw new Error(data?.error ?? "Exclusion list operation failed");
  return { excluded: data.excluded } as MlExclusionResult;
}
