// Universal promotion types mirroring the backend domain.
// Matches marketplace_promotions and marketplace_promotion_items tables.

export type PromotionType = "STANDARD_DISCOUNT" | "FLASH_SALE";

export type PromotionStatus =
  | "draft"
  | "pending"
  | "scheduled"
  | "active"
  | "ended"
  | "cancelled"
  | "candidate";

export type PromotionItemStatus =
  | "candidate"
  | "pending"
  | "started"
  | "finished"
  | "paused";

export type PromotionSource =
  | "seller_created"
  | "platform_invite"
  | "time_slot";

// ─── Mercado Livre native promotion kinds ──────────────────────────────────────

export type MlPromotionKind =
  | "SELLER_CAMPAIGN"
  | "DEAL"
  | "MARKETPLACE_CAMPAIGN"
  | "VOLUME"
  | "PRICE_DISCOUNT"
  | "PRE_NEGOTIATED"
  | "SMART"
  | "PRICE_MATCHING"
  | "PRICE_MATCHING_MELI_ALL"
  | "UNHEALTHY_STOCK"
  | "SELLER_COUPON_CAMPAIGN"
  | "BANK"
  | "LIGHTNING"
  | "DOD";

/** Human-readable label for each ML promotion kind (pt-BR). */
export const ML_PROMO_LABELS: Record<MlPromotionKind, string> = {
  SELLER_CAMPAIGN: "Campanha do Vendedor",
  DEAL: "Campanha Tradicional",
  MARKETPLACE_CAMPAIGN: "Co-participação",
  VOLUME: "Desconto por Quantidade",
  PRICE_DISCOUNT: "Desconto Individual",
  PRE_NEGOTIATED: "Pré-acordado por Item",
  SMART: "Co-participação Automatizada",
  PRICE_MATCHING: "Preços Competitivos",
  PRICE_MATCHING_MELI_ALL: "Preços Competitivos (ML)",
  UNHEALTHY_STOCK: "Liquidação Estoque Full",
  SELLER_COUPON_CAMPAIGN: "Cupom do Vendedor",
  BANK: "Co-participação PIX",
  LIGHTNING: "Oferta Relâmpago",
  DOD: "Oferta do Dia",
};

/** ML kinds that the seller CAN create via API. */
export const ML_KINDS_SELLER_CREATED = new Set<MlPromotionKind>([
  "SELLER_CAMPAIGN",
  "PRICE_DISCOUNT",
  "SELLER_COUPON_CAMPAIGN",
]);

/** ML kinds where in-place item update is NOT supported (remove + re-add). */
export const ML_KINDS_NO_UPDATE_IN_PLACE = new Set<MlPromotionKind>([
  "PRICE_DISCOUNT",
  "LIGHTNING",
  "DOD",
  "BANK",
]);

/** Returns true if the ML kind requires invite/opt-in rather than seller-created flow. */
export function isMlInviteOnly(mlKind: MlPromotionKind | string): boolean {
  return !ML_KINDS_SELLER_CREATED.has(mlKind as MlPromotionKind);
}

/** Returns true if the item cannot be updated in-place for this ML kind. */
export function isMlNoUpdateInPlace(mlKind: MlPromotionKind | string): boolean {
  return ML_KINDS_NO_UPDATE_IN_PLACE.has(mlKind as MlPromotionKind);
}

/** Returns the human-readable label, falling back to the raw kind string. */
export function getMlKindLabel(mlKind: string): string {
  return ML_PROMO_LABELS[mlKind as MlPromotionKind] ?? mlKind;
}

// ─── Core entities ─────────────────────────────────────────────────────────────

export interface Promotion {
  id: string;                    // UUID from marketplace_promotions
  organizations_id: string;
  integration_id: string | null;
  marketplace_key: string;       // 'mercado_livre' | 'shopee'
  external_id: string;
  promotion_type: PromotionType;
  /** Native ML promotion type stored in the ml_kind column. Null for Shopee. */
  ml_kind: MlPromotionKind | null;
  source: PromotionSource;
  status: PromotionStatus;
  name: string;
  start_date: string | null;
  finish_date: string | null;
  deadline_date: string | null;
  discount_percent: number | null;
  meli_percent: number | null;
  seller_percent: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  /** Raw API response from the marketplace (source of truth for type-specific fields). */
  raw?: Record<string, unknown>;
}

export interface PromotionItem {
  id: string;
  promotion_id: string;
  marketplace_item_id: string;
  variation_id: string | null;
  status: PromotionItemStatus;
  original_price: number | null;
  deal_price: number | null;
  top_deal_price: number | null;
  min_discounted_price: number | null;
  max_discounted_price: number | null;
  suggested_discounted_price: number | null;
  promotion_stock: number | null;
  purchase_limit: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Represents an entry from GET /seller-promotions/items/{item_id} (360° view). */
export interface MlItemPromotion {
  id: string | null;
  type: string;
  subType?: string;
  status: string;
  price: number | null;
  originalPrice: number | null;
  meliPercentage?: number | null;
  sellerPercentage?: number | null;
  minDiscountedPrice?: number | null;
  maxDiscountedPrice?: number | null;
  suggestedDiscountedPrice?: number | null;
  fixedPercentage?: number | null;
  fixedAmount?: number | null;
  stock?: { min?: number; max?: number; remainingStock?: number } | null;
  startDate?: string | null;
  finishDate?: string | null;
  name?: string | null;
  paymentMethod?: string | null;
  refId?: string | null;
}

export interface FlashSaleSlot {
  slotId: string;
  startTime: string;
  endTime: string;
  criteria: {
    minPrice: number | null;
    maxPrice: number | null;
    minStock: number | null;
    maxStock: number | null;
  } | null;
}

// ─── Input types ───────────────────────────────────────────────────────────────

export interface CreateStandardDiscountInput {
  organizationId: string;
  integrationId: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface CreateFlashSaleInput {
  integrationId: string;
  name: string;
  slotId: string;
}

export interface AddItemsInput {
  integrationId: string;
  externalId: string;
  promotionType: PromotionType;
  /** Native ML promotion type — required for ML to route the correct API call. */
  mlKind?: MlPromotionKind | string;
  items: Array<{
    marketplaceItemId: string;
    variationId?: string;
    dealPrice?: number;
    discountPercent?: number;
    topDealPrice?: number;
    promotionStock?: number;
    purchaseLimit?: number;
    /** Per-item ML kind override. Falls back to top-level mlKind. */
    mlKind?: string;
    /** Candidate offer ID for ML opt-in flows. */
    offerId?: string;
  }>;
}

export interface UpdateItemsInput {
  integrationId: string;
  externalId: string;
  promotionType: PromotionType;
  /** Native ML promotion type — used to check no-update-in-place rule and set API param. */
  mlKind?: MlPromotionKind | string;
  items: Array<{
    marketplaceItemId: string;
    variationId?: string;
    dealPrice?: number;
    discountPercent?: number;
    topDealPrice?: number;
    purchaseLimit?: number;
    removeLoyalty?: boolean;
  }>;
}

export interface RemoveItemInput {
  integrationId: string;
  externalId: string;
  promotionType: PromotionType;
  marketplaceItemId: string;
  variationId?: string;
  /** Native ML promotion type — required for correct DELETE query params. */
  mlKind?: MlPromotionKind | string;
}

export interface BulkResult {
  successful: string[];
  failed: Array<{ marketplaceItemId: string; variationId?: string; error: string }>;
}

export interface MlExclusionInput {
  integrationId: string;
  target: "seller" | "item";
  itemId?: string;
  exclusionStatus?: boolean;
}

export interface MlExclusionResult {
  excluded: "excluded" | "not_excluded";
}

/** Summary counts shown on PromotionTypeCard */
export interface PromotionTypeSummary {
  active: number;
  scheduled: number;
  ended: number;
  totalItems: number;
}
