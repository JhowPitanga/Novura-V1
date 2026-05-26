/**
 * Mercado Livre promotions adapter.
 *
 * Supported ml_kind values (native ML promotion_type):
 *   SELLER_CAMPAIGN      → STANDARD_DISCOUNT, seller_created  (create/update supported)
 *   DEAL                 → STANDARD_DISCOUNT, platform_invite
 *   MARKETPLACE_CAMPAIGN → STANDARD_DISCOUNT, platform_invite
 *   VOLUME               → STANDARD_DISCOUNT, platform_invite
 *   PRICE_DISCOUNT       → STANDARD_DISCOUNT, seller_created  (no in-place update)
 *   PRE_NEGOTIATED       → STANDARD_DISCOUNT, platform_invite
 *   SMART                → STANDARD_DISCOUNT, platform_invite (automatic)
 *   PRICE_MATCHING       → STANDARD_DISCOUNT, platform_invite (automatic)
 *   PRICE_MATCHING_MELI_ALL → STANDARD_DISCOUNT, platform_invite (automatic)
 *   UNHEALTHY_STOCK      → STANDARD_DISCOUNT, platform_invite
 *   SELLER_COUPON_CAMPAIGN → STANDARD_DISCOUNT, seller_created
 *   BANK                 → STANDARD_DISCOUNT, platform_invite  (PIX; no price update in-place)
 *   LIGHTNING            → FLASH_SALE, platform_invite        (no in-place update)
 *   DOD                  → FLASH_SALE, platform_invite        (no in-place update)
 *
 * Reference: https://developers.mercadolivre.com.br/pt_br/gerenciar-ofertas
 */

import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import type { PromotionsProviderPort, CampaignFilters } from "../../ports/promotions-port.ts";
import { getMlAccessToken } from "../tokens/ml-token.ts";
import {
  UniversalCampaign,
  UniversalCampaignItem,
  FlashSaleSlot,
  MlItemPromotion,
  MlExclusionTarget,
  MlExclusionResult,
  PromotionType,
  CreateStandardDiscountInput,
  UpdateCampaignInput,
  AddItemInput,
  UpdateItemInput,
  BulkResult,
  PromotionsAdapterError,
  ProviderUnsupportedError,
  mapMlStatusToUniversal,
  mapMlItemStatusToUniversal,
  mlKindToPromotionType,
  mlKindToSource,
  ML_KINDS_NO_UPDATE_IN_PLACE,
} from "../../domain/promotions/promotion-types.ts";

const ML_BASE = "https://api.mercadolibre.com";
const APP_VERSION = "v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function logMl(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ scope: "ml-promotions-adapter", marketplace: "mercado_livre", event, ...data }));
}

function logMlError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "ml-promotions-adapter",
    marketplace: "mercado_livre",
    level: "error",
    event,
    message: err?.message ?? String(error),
    name: err?.name ?? null,
    code: err?.code ?? null,
    marketplaceCode: err?.marketplaceCode ?? null,
    retriable: err?.retriable ?? null,
    ...data,
  }));
}

function buildUrl(path: string, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ app_version: APP_VERSION, ...params });
  return `${ML_BASE}${path}?${qs.toString()}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function mlFetch<T>(
  url: string,
  options: RequestInit,
  getToken: () => Promise<string>,
): Promise<T> {
  let res = await fetch(url, options);
  // Retry once on 401/403 with a fresh token
  if (res.status === 401 || res.status === 403) {
    const freshToken = await getToken();
    const newHeaders = { ...options.headers as Record<string, string>, Authorization: `Bearer ${freshToken}` };
    res = await fetch(url, { ...options, headers: newHeaders });
  }
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch (_) { /* ignore */ }
    throw new PromotionsAdapterError(
      `ML_HTTP_${res.status}`,
      body?.message || body?.error || `HTTP ${res.status}`,
      String(body?.status || res.status),
      res.status >= 500,
    );
  }
  return res.json() as Promise<T>;
}

// ─── Mapper helpers ───────────────────────────────────────────────────────────

function mapCampaignRow(row: any, source?: UniversalCampaign["source"]): UniversalCampaign {
  const mlKind = String(row.type ?? "");
  const promotionType = mlKindToPromotionType(mlKind);
  const resolvedSource = source ?? mlKindToSource(mlKind);

  return {
    externalId: String(row.id ?? ""),
    promotionType,
    mlKind: mlKind || undefined,
    source: resolvedSource,
    status: mapMlStatusToUniversal(row.status ?? ""),
    name: String(row.name ?? ""),
    startDate: row.start_date ?? null,
    finishDate: row.finish_date ?? null,
    deadlineDate: row.deadline_date ?? null,
    discountPercent: null,
    meliPercent: row.benefits?.meli_percent ?? row.meli_percentage ?? null,
    sellerPercent: row.benefits?.seller_percent ?? row.seller_percentage ?? null,
    raw: row,
  };
}

function mapItemRow(row: any): UniversalCampaignItem {
  return {
    marketplaceItemId: String(row.id ?? ""),
    variationId: null,
    status: mapMlItemStatusToUniversal(row.status ?? ""),
    originalPrice: row.original_price ?? null,
    dealPrice: row.price ?? null,
    topDealPrice: row.top_deal_price ?? null,
    minDiscountedPrice: row.min_discounted_price ?? null,
    maxDiscountedPrice: row.max_discounted_price ?? null,
    suggestedDiscountedPrice: row.suggested_discounted_price ?? null,
    promotionStock: row.stock?.min ?? null,
    purchaseLimit: null,
    raw: row,
  };
}

function mapMlItemPromotion(row: any): MlItemPromotion {
  return {
    id: row.id ?? null,
    type: String(row.type ?? ""),
    subType: row.sub_type ?? undefined,
    status: String(row.status ?? ""),
    price: row.price ?? null,
    originalPrice: row.original_price ?? null,
    meliPercentage: row.meli_percentage ?? null,
    sellerPercentage: row.seller_percentage ?? null,
    minDiscountedPrice: row.min_discounted_price ?? null,
    maxDiscountedPrice: row.max_discounted_price ?? null,
    suggestedDiscountedPrice: row.suggested_discounted_price ?? null,
    fixedPercentage: row.fixed_percentage ?? null,
    fixedAmount: row.fixed_amount ?? null,
    stock: row.stock ?? null,
    startDate: row.start_date ?? null,
    finishDate: row.finish_date ?? null,
    name: row.name ?? null,
    paymentMethod: row.payment_method ?? null,
    refId: row.ref_id ?? null,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class MlPromotionsAdapter implements PromotionsProviderPort {
  private integrationId: string;
  private encKeyB64: string;
  private integrations: MarketplaceIntegrationsPort;
  private appCredentials: AppCredentialsPort;

  constructor(
    integrationId: string,
    encKeyB64: string,
    integrations: MarketplaceIntegrationsPort,
    appCredentials: AppCredentialsPort,
  ) {
    this.integrationId = integrationId;
    this.encKeyB64 = encKeyB64;
    this.integrations = integrations;
    this.appCredentials = appCredentials;
  }

  private async getToken(): Promise<string> {
    const result = await getMlAccessToken(this.integrations, this.appCredentials, this.integrationId, this.encKeyB64);
    return result.accessToken;
  }

  private async getSellerId(): Promise<string> {
    const result = await getMlAccessToken(this.integrations, this.appCredentials, this.integrationId, this.encKeyB64);
    return result.sellerId;
  }

  // ── List all campaigns (all ML types) ─────────────────────────────────────

  async listCampaigns(filters: CampaignFilters): Promise<UniversalCampaign[]> {
    const token = await this.getToken();
    const sellerId = await this.getSellerId();

    const url = buildUrl(`/seller-promotions/users/${sellerId}`);
    logMl("list_campaigns_request", {
      integrationId: this.integrationId,
      sellerId,
      filters,
    });

    const res = await mlFetch<{ results?: any[]; paging?: any }>(
      url,
      { method: "GET", headers: authHeaders(token) },
      () => this.getToken(),
    );

    const rawResults = res.results ?? [];
    logMl("list_campaigns_response", {
      integrationId: this.integrationId,
      sellerId,
      rawCount: rawResults.length,
      byType: rawResults.reduce((acc: Record<string, number>, row: any) => {
        const t = row?.type ?? "unknown";
        acc[t] = (acc[t] ?? 0) + 1;
        return acc;
      }, {}),
    });

    const campaigns: UniversalCampaign[] = [];

    for (const row of rawResults) {
      const campaign = mapCampaignRow(row);

      // Apply universal type filter if requested
      if (filters.type && campaign.promotionType !== filters.type) {
        logMl("campaign_filtered_by_type", {
          externalId: campaign.externalId,
          mlKind: campaign.mlKind,
          mappedType: campaign.promotionType,
          requestedType: filters.type,
        });
        continue;
      }

      // Apply status filter if requested
      if (filters.status && !filters.status.includes(campaign.status)) {
        logMl("campaign_filtered_by_status", {
          externalId: campaign.externalId,
          mlKind: campaign.mlKind,
          status: campaign.status,
          requestedStatuses: filters.status,
        });
        continue;
      }

      campaigns.push(campaign);
    }

    logMl("list_campaigns_mapped", {
      integrationId: this.integrationId,
      sellerId,
      count: campaigns.length,
      byMlKind: campaigns.reduce((acc: Record<string, number>, c) => {
        const k = c.mlKind ?? "unknown";
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    });

    return campaigns;
  }

  // ── Get single campaign ───────────────────────────────────────────────────

  async getCampaign(externalId: string, type: PromotionType, mlKind?: string): Promise<UniversalCampaign | null> {
    const token = await this.getToken();
    const promotionTypeParam = mlKind ?? (type === "FLASH_SALE" ? "LIGHTNING" : "SELLER_CAMPAIGN");
    const url = buildUrl(`/seller-promotions/promotions/${externalId}`, { promotion_type: promotionTypeParam });
    try {
      const row = await mlFetch<any>(
        url,
        { method: "GET", headers: authHeaders(token) },
        () => this.getToken(),
      );
      return mapCampaignRow(row);
    } catch (e) {
      logMlError("get_campaign_failed", e, { externalId, type, mlKind });
      return null;
    }
  }

  // ── Get campaign items (paginated) ────────────────────────────────────────

  async getCampaignItems(externalId: string, type: PromotionType, mlKind?: string): Promise<UniversalCampaignItem[]> {
    const token = await this.getToken();
    // Prefer mlKind if provided; fall back to old 2-type mapping for backwards compat
    const promotionTypeParam = mlKind ?? (type === "FLASH_SALE" ? "LIGHTNING" : "SELLER_CAMPAIGN");
    const items: UniversalCampaignItem[] = [];
    let searchAfter: string | null = null;

    do {
      const params: Record<string, string> = { promotion_type: promotionTypeParam, limit: "50" };
      if (searchAfter) params.search_after = searchAfter;
      const url = buildUrl(`/seller-promotions/promotions/${externalId}/items`, params);
      logMl("get_campaign_items_request", { externalId, promotionTypeParam, searchAfter });

      const res = await mlFetch<{ results?: any[]; paging?: any }>(
        url,
        { method: "GET", headers: authHeaders(token) },
        () => this.getToken(),
      );

      logMl("get_campaign_items_response", {
        externalId,
        promotionTypeParam,
        pageCount: (res.results ?? []).length,
        hasNext: Boolean(res.paging?.searchAfter ?? res.paging?.search_after),
      });

      for (const row of res.results ?? []) {
        items.push(mapItemRow(row));
      }
      searchAfter = res.paging?.searchAfter ?? res.paging?.search_after ?? null;
    } while (searchAfter);

    logMl("get_campaign_items_finished", { externalId, promotionTypeParam, totalItems: items.length });
    return items;
  }

  // ── Create (seller-created only: SELLER_CAMPAIGN) ─────────────────────────

  async createStandardDiscount(input: CreateStandardDiscountInput): Promise<UniversalCampaign> {
    const token = await this.getToken();
    const url = buildUrl("/seller-promotions/promotions");
    const body = {
      promotion_type: "SELLER_CAMPAIGN",
      sub_type: "FLEXIBLE_PERCENTAGE",
      name: input.name,
      start_date: input.startDate,
      finish_date: input.endDate,
    };
    const row = await mlFetch<any>(
      url,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
      () => this.getToken(),
    );
    return mapCampaignRow(row);
  }

  // ── Update campaign metadata ───────────────────────────────────────────────

  async updateCampaign(externalId: string, _type: PromotionType, patch: UpdateCampaignInput): Promise<UniversalCampaign> {
    const token = await this.getToken();
    const url = buildUrl(`/seller-promotions/promotions/${externalId}`);
    const body: Record<string, unknown> = { promotion_type: "SELLER_CAMPAIGN" };
    if (patch.name) body.name = patch.name;
    if (patch.startDate) body.start_date = patch.startDate;
    if (patch.endDate) body.finish_date = patch.endDate;
    const row = await mlFetch<any>(
      url,
      { method: "PUT", headers: authHeaders(token), body: JSON.stringify(body) },
      () => this.getToken(),
    );
    return mapCampaignRow(row);
  }

  // ── Delete campaign ───────────────────────────────────────────────────────

  async deleteCampaign(externalId: string, type: PromotionType): Promise<void> {
    if (type === "FLASH_SALE") throw new ProviderUnsupportedError("deleteCampaign for LIGHTNING/DOD", "Mercado Livre");
    const token = await this.getToken();
    const url = buildUrl(`/seller-promotions/promotions/${externalId}`, { promotion_type: "SELLER_CAMPAIGN" });
    await mlFetch<void>(
      url,
      { method: "DELETE", headers: authHeaders(token) },
      () => this.getToken(),
    );
  }

  // ── Bulk add items ─────────────────────────────────────────────────────────

  async addItems(externalId: string, type: PromotionType, items: AddItemInput[]): Promise<BulkResult> {
    const token = await this.getToken();
    const successful: string[] = [];
    const failed: BulkResult["failed"] = [];

    for (const item of items) {
      // Determine ML promotion_type: prefer item.mlKind, then campaign mlKind from externalId prefix, then universal mapping
      const mlKind = item.mlKind ?? (type === "FLASH_SALE" ? "LIGHTNING" : "SELLER_CAMPAIGN");

      const body: Record<string, unknown> = {
        promotion_id: externalId,
        promotion_type: mlKind,
      };

      // Include offer_id when doing candidate opt-in
      if (item.offerId) body.offer_id = item.offerId;

      // Price only for types where seller sets it
      if (item.dealPrice != null) body.deal_price = item.dealPrice;
      if (item.topDealPrice != null) body.top_deal_price = item.topDealPrice;

      // Stock is required for LIGHTNING and informative for DOD
      if ((mlKind === "LIGHTNING" || mlKind === "DOD") && item.promotionStock != null) {
        body.stock = item.promotionStock;
      }

      const url = buildUrl(`/seller-promotions/items/${item.marketplaceItemId}`);
      try {
        await mlFetch<any>(
          url,
          { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
          () => this.getToken(),
        );
        successful.push(item.marketplaceItemId);
      } catch (e: any) {
        logMlError("add_item_failed", e, { externalId, mlKind, marketplaceItemId: item.marketplaceItemId });
        failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) });
      }
    }

    return { successful, failed };
  }

  // ── Bulk update items ─────────────────────────────────────────────────────

  async updateItems(externalId: string, _type: PromotionType, items: UpdateItemInput[]): Promise<BulkResult> {
    const token = await this.getToken();
    const successful: string[] = [];
    const failed: BulkResult["failed"] = [];

    for (const item of items) {
      const mlKind = item.mlKind ?? "SELLER_CAMPAIGN";

      // Types that don't support in-place update
      if (ML_KINDS_NO_UPDATE_IN_PLACE.has(mlKind)) {
        failed.push({
          marketplaceItemId: item.marketplaceItemId,
          error: `ml_kind ${mlKind} does not support in-place update. Remove and re-add the item.`,
        });
        continue;
      }

      const body: Record<string, unknown> = {
        promotion_id: externalId,
        promotion_type: mlKind,
      };
      if (item.dealPrice != null) body.deal_price = item.dealPrice;
      if (item.topDealPrice != null) body.top_deal_price = item.topDealPrice;
      if (item.purchaseLimit != null) body.purchase_limit = item.purchaseLimit;
      if (item.removeLoyalty) body.remove_loyalty = true;

      const url = buildUrl(`/seller-promotions/items/${item.marketplaceItemId}`);
      try {
        await mlFetch<any>(
          url,
          { method: "PUT", headers: authHeaders(token), body: JSON.stringify(body) },
          () => this.getToken(),
        );
        successful.push(item.marketplaceItemId);
      } catch (e: any) {
        logMlError("update_item_failed", e, { externalId, mlKind, marketplaceItemId: item.marketplaceItemId });
        failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) });
      }
    }

    return { successful, failed };
  }

  // ── Remove single item ────────────────────────────────────────────────────

  async removeItem(
    externalId: string,
    type: PromotionType,
    itemId: string,
    _variationId?: string,
    mlKind?: string,
  ): Promise<void> {
    const token = await this.getToken();
    const promotionTypeParam = mlKind ?? (type === "FLASH_SALE" ? "LIGHTNING" : "SELLER_CAMPAIGN");
    const url = buildUrl(`/seller-promotions/items/${itemId}`, {
      promotion_type: promotionTypeParam,
      promotion_id: externalId,
    });
    await mlFetch<void>(
      url,
      { method: "DELETE", headers: authHeaders(token) },
      () => this.getToken(),
    );
  }

  // ── ML-specific: list LIGHTNING invites ───────────────────────────────────

  async listMlFlashSaleInvites(): Promise<UniversalCampaign[]> {
    const all = await this.listCampaigns({ type: "FLASH_SALE" });
    return all.filter(c => c.source === "platform_invite" && c.status === "candidate");
  }

  // ── ML-specific: 360° item promotions ────────────────────────────────────

  async getMlItemPromotions(itemId: string): Promise<MlItemPromotion[]> {
    const token = await this.getToken();
    const url = buildUrl(`/seller-promotions/items/${itemId}`);
    logMl("get_ml_item_promotions_request", { itemId });

    try {
      // ML returns a JSON array or object — normalize to array
      const raw = await mlFetch<any>(
        url,
        { method: "GET", headers: authHeaders(token) },
        () => this.getToken(),
      );
      const rows: any[] = Array.isArray(raw) ? raw : (raw?.results ?? (raw ? [raw] : []));
      const result = rows.map(mapMlItemPromotion);
      logMl("get_ml_item_promotions_response", { itemId, count: result.length });
      return result;
    } catch (e) {
      logMlError("get_ml_item_promotions_failed", e, { itemId });
      throw e;
    }
  }

  // ── ML-specific: exclusion list management ────────────────────────────────

  async manageMlExclusionList(
    target: MlExclusionTarget,
    itemId?: string,
    exclusionStatus?: boolean,
  ): Promise<MlExclusionResult> {
    const token = await this.getToken();
    const isItem = target === "item";
    const isRead = exclusionStatus === undefined;

    let path: string;
    if (isItem && itemId) {
      path = isRead
        ? `/seller-promotions/exclusion-list/seller/${itemId}`
        : `/seller-promotions/exclusion-list/item`;
    } else {
      path = `/seller-promotions/exclusion-list/seller`;
    }

    const url = buildUrl(path);

    if (isRead) {
      const res = await mlFetch<MlExclusionResult>(
        url,
        { method: "GET", headers: authHeaders(token) },
        () => this.getToken(),
      );
      return res;
    }

    const bodyObj: Record<string, unknown> = { exclusion_status: String(exclusionStatus) };
    if (isItem && itemId) bodyObj.item_id = itemId;

    const res = await mlFetch<MlExclusionResult>(
      url,
      { method: "POST", headers: authHeaders(token), body: JSON.stringify(bodyObj) },
      () => this.getToken(),
    );
    return res;
  }

  // ── Unsupported Shopee-only operations ────────────────────────────────────

  async listFlashSaleSlots(): Promise<FlashSaleSlot[]> {
    throw new ProviderUnsupportedError("listFlashSaleSlots", "Mercado Livre");
  }

  async createFlashSaleFromSlot(_slotId: string, _name: string): Promise<UniversalCampaign> {
    throw new ProviderUnsupportedError("createFlashSaleFromSlot", "Mercado Livre");
  }
}
