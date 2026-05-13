/**
 * Universal port for marketplace promotions.
 * Each marketplace adapter implements this interface.
 * Optional methods indicate marketplace-specific capabilities.
 */

import type {
  UniversalCampaign,
  UniversalCampaignItem,
  FlashSaleSlot,
  PromotionType,
  PromotionStatus,
  CreateStandardDiscountInput,
  UpdateCampaignInput,
  AddItemInput,
  UpdateItemInput,
  BulkResult,
  MlItemPromotion,
  MlExclusionTarget,
  MlExclusionResult,
} from "../domain/promotions/promotion-types.ts";

export interface CampaignFilters {
  type?: PromotionType;
  status?: PromotionStatus[];
}

export interface PromotionsProviderPort {
  /** List all campaigns visible to the seller for the given filters. */
  listCampaigns(filters: CampaignFilters): Promise<UniversalCampaign[]>;

  /** Fetch a single campaign by its marketplace external id. */
  getCampaign(externalId: string, type: PromotionType, mlKind?: string): Promise<UniversalCampaign | null>;

  /**
   * Fetch all items participating in a campaign.
   * @param mlKind - Native ML promotion type (e.g. "DEAL", "BANK"). Overrides `type` mapping for ML.
   */
  getCampaignItems(externalId: string, type: PromotionType, mlKind?: string): Promise<UniversalCampaignItem[]>;

  /** Create a new standard discount campaign (STANDARD_DISCOUNT / SELLER_CAMPAIGN). */
  createStandardDiscount(input: CreateStandardDiscountInput): Promise<UniversalCampaign>;

  /** Update metadata (name, dates) of an existing campaign. */
  updateCampaign(externalId: string, type: PromotionType, patch: UpdateCampaignInput): Promise<UniversalCampaign>;

  /** Delete / end a campaign. */
  deleteCampaign(externalId: string, type: PromotionType): Promise<void>;

  /**
   * End an active campaign gracefully without deleting it.
   * Shopee requires end_discount for ongoing discounts; delete_discount only works for upcoming ones.
   * Falls back to deleteCampaign on marketplaces that don't distinguish.
   */
  endCampaign?(externalId: string, type: PromotionType): Promise<void>;

  /** Bulk-add items to a campaign. */
  addItems(externalId: string, type: PromotionType, items: AddItemInput[]): Promise<BulkResult>;

  /** Bulk-update prices / limits for items already in a campaign. */
  updateItems(externalId: string, type: PromotionType, items: UpdateItemInput[]): Promise<BulkResult>;

  /** Remove a single item (and optionally its variation) from a campaign. */
  removeItem(externalId: string, type: PromotionType, itemId: string, variationId?: string, mlKind?: string): Promise<void>;

  // ── Marketplace-specific optional operations ──────────────────────────────

  /**
   * Shopee only: list available flash-sale time slots with optional item criteria.
   * Throws ProviderUnsupportedError on other marketplaces.
   */
  listFlashSaleSlots?(): Promise<FlashSaleSlot[]>;

  /**
   * Shopee only: create a flash-sale campaign from a time slot.
   * Throws ProviderUnsupportedError on other marketplaces.
   */
  createFlashSaleFromSlot?(slotId: string, name: string): Promise<UniversalCampaign>;

  /**
   * Mercado Livre only: list LIGHTNING invites available to the seller.
   * Returns empty array on other marketplaces (graceful degradation).
   */
  listMlFlashSaleInvites?(): Promise<UniversalCampaign[]>;

  /**
   * Mercado Livre only: returns all promotions an item participates in (360° view).
   * GET /seller-promotions/items/{item_id}
   */
  getMlItemPromotions?(itemId: string): Promise<MlItemPromotion[]>;

  /**
   * Mercado Livre only: query or toggle the automatic campaign exclusion list.
   * - "seller" scope: no itemId required.
   * - "item" scope: itemId required.
   * When exclusionStatus is undefined, performs a read (GET). Otherwise writes (POST).
   */
  manageMlExclusionList?(
    target: MlExclusionTarget,
    itemId?: string,
    exclusionStatus?: boolean,
  ): Promise<MlExclusionResult>;
}
