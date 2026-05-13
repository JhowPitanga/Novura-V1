/**
 * Universal domain types for marketplace promotions.
 * All marketplace-specific data is translated into these types by adapters.
 */

// ─── Universal enums ──────────────────────────────────────────────────────────

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

// ─── Mercado Livre native promotion kinds ─────────────────────────────────────

/**
 * Native ML promotion_type values from the /seller-promotions API.
 * Stored in marketplace_promotions.ml_kind (NULL for Shopee rows).
 */
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

/** ML kinds that allow the seller to create via API (not just invite/opt-in). */
export const ML_KINDS_SELLER_CREATED: ReadonlySet<string> = new Set([
  "SELLER_CAMPAIGN",
  "PRICE_DISCOUNT",
  "SELLER_COUPON_CAMPAIGN",
]);

/** ML kinds where in-place item update (PUT) is NOT supported — must remove and re-add. */
export const ML_KINDS_NO_UPDATE_IN_PLACE: ReadonlySet<string> = new Set([
  "PRICE_DISCOUNT",
  "LIGHTNING",
  "DOD",
  "BANK",
]);

/** ML kinds that are invite-only (seller receives a deadline_date to accept). */
export const ML_KINDS_INVITE_ONLY: ReadonlySet<string> = new Set([
  "DEAL",
  "MARKETPLACE_CAMPAIGN",
  "VOLUME",
  "PRE_NEGOTIATED",
  "UNHEALTHY_STOCK",
  "LIGHTNING",
  "DOD",
  "BANK",
]);

/** ML kinds that are created automatically by ML (no explicit invite/deadline). */
export const ML_KINDS_AUTOMATIC: ReadonlySet<string> = new Set([
  "SMART",
  "PRICE_MATCHING",
  "PRICE_MATCHING_MELI_ALL",
]);

/** ML kinds that map to FLASH_SALE in the universal domain. */
export const ML_KINDS_FLASH: ReadonlySet<string> = new Set(["LIGHTNING", "DOD"]);

/**
 * Returns the universal PromotionType for a given ML kind.
 * Defaults to STANDARD_DISCOUNT for unknown kinds.
 */
export function mlKindToPromotionType(mlKind: string): PromotionType {
  return ML_KINDS_FLASH.has(mlKind) ? "FLASH_SALE" : "STANDARD_DISCOUNT";
}

/**
 * Returns the universal PromotionSource for a given ML kind.
 */
export function mlKindToSource(mlKind: string): PromotionSource {
  if (ML_KINDS_SELLER_CREATED.has(mlKind)) return "seller_created";
  if (ML_KINDS_AUTOMATIC.has(mlKind)) return "platform_invite";
  return "platform_invite";
}

// ─── Core domain objects ──────────────────────────────────────────────────────

export interface UniversalCampaign {
  externalId: string;
  promotionType: PromotionType;
  /** Native ML promotion_type (e.g. DEAL, BANK). Undefined for Shopee campaigns. */
  mlKind?: MlPromotionKind | string;
  source: PromotionSource;
  status: PromotionStatus;
  name: string;
  startDate: string | null;    // ISO 8601
  finishDate: string | null;
  deadlineDate: string | null; // deadline to join (ML invites)
  discountPercent: number | null;
  meliPercent: number | null;
  sellerPercent: number | null;
  raw: Record<string, unknown>;
}

export interface UniversalCampaignItem {
  marketplaceItemId: string;
  variationId: string | null;
  status: PromotionItemStatus;
  originalPrice: number | null;
  dealPrice: number | null;
  topDealPrice: number | null;
  minDiscountedPrice: number | null;
  maxDiscountedPrice: number | null;
  suggestedDiscountedPrice: number | null;
  promotionStock: number | null;
  purchaseLimit: number | null;
  raw: Record<string, unknown>;
}

/** 360° view of a single item's participation across all promotions. */
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

// ─── Flash sale specific ──────────────────────────────────────────────────────

export interface FlashSaleSlot {
  slotId: string;
  startTime: string;   // ISO 8601
  endTime: string;
  criteria: FlashSaleItemCriteria | null;
}

export interface FlashSaleItemCriteria {
  minPrice: number | null;
  maxPrice: number | null;
  minStock: number | null;
  maxStock: number | null;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateStandardDiscountInput {
  name: string;
  startDate: string;
  endDate: string;
}

export interface UpdateCampaignInput {
  name?: string;
  startDate?: string;
  endDate?: string;
}

export interface AddItemInput {
  marketplaceItemId: string;
  variationId?: string;
  /** Absolute promotional price. Takes priority over discountPercent. */
  dealPrice?: number;
  /** Percentage discount (0–99). Used when dealPrice is not provided. */
  discountPercent?: number;
  topDealPrice?: number;
  promotionStock?: number;
  purchaseLimit?: number;
  /**
   * Native ML promotion_type to use in the API call.
   * When provided on ML, overrides the universal PromotionType mapping.
   * Also used as the offer_id for candidate opt-in calls.
   */
  mlKind?: string;
  /** offer_id (candidate ID) for ML opt-in flows. */
  offerId?: string;
}

export interface UpdateItemInput {
  marketplaceItemId: string;
  variationId?: string;
  dealPrice?: number;
  /** Percentage discount (0–99). Used when dealPrice is not provided. */
  discountPercent?: number;
  topDealPrice?: number;
  purchaseLimit?: number;
  removeLoyalty?: boolean;
  /** Native ML promotion_type — required when updating ML items. */
  mlKind?: string;
}

export interface BulkResult {
  successful: string[];
  failed: Array<{ marketplaceItemId: string; variationId?: string; error: string }>;
}

// ─── ML exclusion list ────────────────────────────────────────────────────────

export type MlExclusionTarget = "seller" | "item";

export interface MlExclusionResult {
  excluded: "excluded" | "not_excluded";
}

// ─── Status mappers ───────────────────────────────────────────────────────────

export function mapMlStatusToUniversal(mlStatus: string): PromotionStatus {
  switch (mlStatus?.toLowerCase()) {
    case "started":   return "active";
    case "pending":   return "scheduled";
    case "finished":  return "ended";
    case "cancelled": return "cancelled";
    case "candidate": return "candidate";
    default:          return "pending";
  }
}

export function mapMlItemStatusToUniversal(mlStatus: string): PromotionItemStatus {
  switch (mlStatus?.toLowerCase()) {
    case "started":   return "started";
    case "pending":   return "pending";
    case "finished":  return "finished";
    case "candidate": return "candidate";
    default:          return "candidate";
  }
}

export function mapShopeeStatusToUniversal(shopeeStatus: string): PromotionStatus {
  switch (shopeeStatus?.toLowerCase()) {
    case "ongoing":   return "active";
    case "upcoming":  return "scheduled";
    case "expired":   return "ended";
    default:          return "pending";
  }
}

export function mapShopeeItemStatusToUniversal(shopeeStatus: string): PromotionItemStatus {
  switch (shopeeStatus?.toLowerCase()) {
    case "ongoing":  return "started";
    case "upcoming": return "pending";
    case "expired":  return "finished";
    default:         return "candidate";
  }
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class PromotionsAdapterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly marketplaceCode: string | null = null,
    public readonly retriable: boolean = false,
  ) {
    super(message);
    this.name = "PromotionsAdapterError";
  }
}

export class ProviderUnsupportedError extends PromotionsAdapterError {
  constructor(operation: string, marketplace: string) {
    super(
      "PROVIDER_UNSUPPORTED",
      `Operation "${operation}" is not supported by ${marketplace}`,
      null,
      false,
    );
    this.name = "ProviderUnsupportedError";
  }
}
