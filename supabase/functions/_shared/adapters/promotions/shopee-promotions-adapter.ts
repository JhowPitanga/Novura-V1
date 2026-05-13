/**
 * Shopee promotions adapter.
 *
 * STANDARD_DISCOUNT → /api/v2/discount/* (add_discount, add_discount_item, etc.)
 * FLASH_SALE        → /api/v2/shop_flash_sale/*
 *   get_time_slot_id, get_item_criteria, create_shop_flash_sale, get_shop_flash_sale_list,
 *   get_shop_flash_sale, get_shop_flash_sale_items, add_shop_flash_sale_items,
 *   update_shop_flash_sale, update_shop_flash_sale_items, delete_shop_flash_sale,
 *   delete_shop_flash_sale_items
 *
 * All requests are signed with HMAC-SHA256 using the shared shopeeSign helper.
 */

import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import type { PromotionsProviderPort, CampaignFilters } from "../../ports/promotions-port.ts";
import { getShopeeAccessToken } from "../tokens/shopee-token.ts";
import { shopeeSign } from "../infra/shopee-sign.ts";
import {
  UniversalCampaign,
  UniversalCampaignItem,
  FlashSaleSlot,
  FlashSaleItemCriteria,
  PromotionType,
  CreateStandardDiscountInput,
  UpdateCampaignInput,
  AddItemInput,
  UpdateItemInput,
  BulkResult,
  PromotionsAdapterError,
  ProviderUnsupportedError,
  mapShopeeStatusToUniversal,
  mapShopeeItemStatusToUniversal,
} from "../../domain/promotions/promotion-types.ts";

const SHOPEE_HOST = "https://openplatform.shopee.com.br";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TokenContext = {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: number;
};

function isInvalidShopeeTokenError(error: unknown): boolean {
  const err = error as any;
  const code = String(err?.code ?? "").toLowerCase();
  const marketplaceCode = String(err?.marketplaceCode ?? "").toLowerCase();
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code.includes("invalid_access_token") ||
    code.includes("invalid_acceess_token") ||
    marketplaceCode.includes("invalid_access_token") ||
    marketplaceCode.includes("invalid_acceess_token") ||
    msg.includes("invalid access_token")
  );
}

function logShopee(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    scope: "shopee-promotions-adapter",
    marketplace: "shopee",
    event,
    ...data,
  }));
}

function logShopeeWarn(event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({
    scope: "shopee-promotions-adapter",
    marketplace: "shopee",
    level: "warn",
    event,
    ...data,
  }));
}

function logShopeeError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "shopee-promotions-adapter",
    marketplace: "shopee",
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

async function tokenFingerprint(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  if (typeof value !== "object") return value;
  if (depth >= 4) return "[max_depth]";
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeForLog(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes("token") ||
      normalizedKey.includes("secret") ||
      normalizedKey.includes("sign") ||
      normalizedKey.includes("key")
    ) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeForLog(raw, depth + 1);
  }
  return output;
}

async function shopeeFetch<T>(
  path: string,
  ctx: TokenContext,
  method: "GET" | "POST",
  bodyObj?: Record<string, unknown>,
  extraParams: Record<string, string> = {},
): Promise<T> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = await shopeeSign(ctx.partnerId, path, timestamp, ctx.partnerKey, ctx.accessToken, ctx.shopId);

  const qs = new URLSearchParams({
    partner_id: ctx.partnerId,
    timestamp: String(timestamp),
    access_token: ctx.accessToken,
    shop_id: String(ctx.shopId),
    sign,
    ...extraParams,
  });

  const url = `${SHOPEE_HOST}${path}?${qs.toString()}`;
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (method === "POST" && bodyObj !== undefined) {
    init.body = JSON.stringify(bodyObj);
  }

  const startedAt = Date.now();
  logShopee("api_request", {
    path,
    method,
    shopId: ctx.shopId,
    partnerId: ctx.partnerId,
    accessTokenFingerprint: await tokenFingerprint(ctx.accessToken),
    accessTokenLength: ctx.accessToken.length,
    extraParams,
    bodySummary: sanitizeForLog(bodyObj ?? null),
    hasBody: bodyObj !== undefined,
  });

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    logShopeeError("api_fetch_failed", e, {
      path,
      method,
      shopId: ctx.shopId,
      partnerId: ctx.partnerId,
      elapsedMs: Date.now() - startedAt,
    });
    throw e;
  }

  const responseText = await res.text().catch(() => "");
  let json: any = {};
  let parseOk = true;
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch (_) {
    parseOk = false;
    json = { error: "parse_error", message: responseText.slice(0, 500) };
  }

  logShopee("api_response", {
    path,
    method,
    status: res.status,
    elapsedMs: Date.now() - startedAt,
    parseOk,
    shopeeError: json?.error ?? null,
    shopeeMessage: json?.message ?? null,
    shopeeRequestId: json?.request_id ?? null,
    responseKeys: json?.response ? Object.keys(json.response) : [],
    responseTextLength: responseText.length,
  });

  if (!res.ok || (json.error && json.error !== "")) {
    logShopeeWarn("api_error_response", {
      path,
      method,
      status: res.status,
      shopId: ctx.shopId,
      partnerId: ctx.partnerId,
      accessTokenFingerprint: await tokenFingerprint(ctx.accessToken),
      shopeeError: json?.error ?? null,
      shopeeMessage: json?.message ?? null,
      shopeeRequestId: json?.request_id ?? null,
      response: sanitizeForLog(json),
      elapsedMs: Date.now() - startedAt,
    });
    throw new PromotionsAdapterError(
      `SHOPEE_${json.error ?? res.status}`,
      json.message ?? `HTTP ${res.status}`,
      String(json.error ?? res.status),
      res.status >= 500,
    );
  }
  return json as T;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapDiscountRow(row: any): UniversalCampaign {
  return {
    externalId: String(row.discount_id),
    promotionType: "STANDARD_DISCOUNT",
    source: "seller_created",
    status: mapShopeeStatusToUniversal(row.status ?? ""),
    name: String(row.discount_name ?? ""),
    startDate: row.start_time ? new Date(Number(row.start_time) * 1000).toISOString() : null,
    finishDate: row.end_time ? new Date(Number(row.end_time) * 1000).toISOString() : null,
    deadlineDate: null,
    discountPercent: null,
    meliPercent: null,
    sellerPercent: null,
    raw: row,
  };
}

function mapFlashSaleRow(row: any): UniversalCampaign {
  return {
    externalId: String(row.flash_sale_id ?? row.promotionid ?? ""),
    promotionType: "FLASH_SALE",
    source: "time_slot",
    status: mapShopeeStatusToUniversal(row.status ?? ""),
    name: String(row.name ?? ""),
    startDate: row.start_time ? new Date(Number(row.start_time) * 1000).toISOString() : null,
    finishDate: row.end_time ? new Date(Number(row.end_time) * 1000).toISOString() : null,
    deadlineDate: null,
    discountPercent: null,
    meliPercent: null,
    sellerPercent: null,
    raw: row,
  };
}

function mapDiscountItem(item: any): UniversalCampaignItem {
  // Use first model's prices if present, otherwise item-level
  const model = Array.isArray(item.model_list) ? item.model_list[0] : null;
  return {
    marketplaceItemId: String(item.item_id),
    variationId: model ? String(model.model_id) : null,
    status: mapShopeeItemStatusToUniversal("ongoing"),
    originalPrice: model?.model_original_price ?? item.item_original_price ?? null,
    dealPrice: model?.model_promotion_price ?? item.item_promotion_price ?? null,
    topDealPrice: null,
    minDiscountedPrice: null,
    maxDiscountedPrice: null,
    suggestedDiscountedPrice: null,
    promotionStock: model?.model_promotion_stock ?? item.item_promotion_stock ?? null,
    purchaseLimit: item.purchase_limit ?? null,
    raw: item,
  };
}

function mapFlashSaleItem(item: any): UniversalCampaignItem {
  return {
    marketplaceItemId: String(item.item_id),
    variationId: item.model_id ? String(item.model_id) : null,
    status: mapShopeeItemStatusToUniversal(item.status ?? ""),
    originalPrice: item.original_price ?? null,
    dealPrice: item.promotion_price ?? null,
    topDealPrice: null,
    minDiscountedPrice: item.min_price ?? null,
    maxDiscountedPrice: item.max_price ?? null,
    suggestedDiscountedPrice: null,
    promotionStock: item.stock ?? null,
    purchaseLimit: item.purchase_limit ?? null,
    raw: item,
  };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ShopeePromotionsAdapter implements PromotionsProviderPort {
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

  private async buildCtx(options?: { forceRefresh?: boolean }): Promise<TokenContext> {
    logShopee("build_ctx_started", {
      integrationId: this.integrationId,
      forceRefresh: options?.forceRefresh === true,
    });
    const appRow = await this.appCredentials.getByName("Shopee");
    if (!appRow) throw new Error("Shopee app credentials not found");
    const { accessToken, shopId } = await getShopeeAccessToken(
      this.integrations,
      this.appCredentials,
      this.integrationId,
      this.encKeyB64,
      { forceRefresh: options?.forceRefresh === true },
    );
    logShopee("build_ctx_finished", {
      integrationId: this.integrationId,
      shopId,
      partnerId: String(appRow.client_id),
      forceRefresh: options?.forceRefresh === true,
      accessTokenFingerprint: await tokenFingerprint(accessToken),
      accessTokenLength: accessToken.length,
    });
    return {
      partnerId: String(appRow.client_id),
      partnerKey: String(appRow.client_secret),
      accessToken,
      shopId,
    };
  }

  // ── Standard discount (add_discount / get_discount_list) ─────────────────

  async listCampaigns(filters: CampaignFilters): Promise<UniversalCampaign[]> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const forceRefresh = attempt === 2;
      const ctx = await this.buildCtx({ forceRefresh });
      const campaigns: UniversalCampaign[] = [];
      const discountErrors: Array<{ status: string; error: string; code?: string | null }> = [];
      let invalidTokenDetected = false;

      logShopee("list_campaigns_started", {
        integrationId: this.integrationId,
        shopId: ctx.shopId,
        filters,
        attempt,
        forceRefresh,
      });

      // List discounts
      if (!filters.type || filters.type === "STANDARD_DISCOUNT") {
        const statuses = ["ongoing", "upcoming", "expired"] as const;
        for (const discountStatus of statuses) {
          try {
            let pageNo = 1;
            let hasMore = true;
            while (hasMore) {
              const res = await shopeeFetch<any>(
                "/api/v2/discount/get_discount_list",
                ctx,
                "GET",
                undefined,
                { discount_status: discountStatus, page_no: String(pageNo), page_size: "100" },
              );
              const list = res.response?.discount_list ?? [];
              logShopee("discount_list_response", {
                integrationId: this.integrationId,
                shopId: ctx.shopId,
                discountStatus,
                pageNo,
                rawCount: list.length,
                more: res.response?.more ?? null,
                sample: list.slice(0, 5).map((row: any) => ({
                  discountId: row?.discount_id ?? null,
                  status: row?.status ?? null,
                  name: row?.discount_name ?? null,
                  startTime: row?.start_time ?? null,
                  endTime: row?.end_time ?? null,
                })),
              });
              for (const row of list) {
                const c = mapDiscountRow(row);
                if (filters.status && !filters.status.includes(c.status)) continue;
                campaigns.push(c);
              }
              hasMore = res.response?.more === true;
              pageNo++;
            }
          } catch (e: any) {
            const entry = {
              status: discountStatus,
              error: e?.message ?? String(e),
              code: e?.code ?? e?.marketplaceCode ?? null,
            };
            discountErrors.push(entry);
            if (isInvalidShopeeTokenError(e)) invalidTokenDetected = true;
            logShopeeError("discount_list_failed", e, {
              integrationId: this.integrationId,
              shopId: ctx.shopId,
              discountStatus,
              attempt,
            });
          }
        }
      }

      // List flash sales
      if (!filters.type || filters.type === "FLASH_SALE") {
        try {
          let fsPage = 1;
          let fsMore = true;
          while (fsMore) {
            const res = await shopeeFetch<any>(
              "/api/v2/shop_flash_sale/get_shop_flash_sale_list",
              ctx,
              "GET",
              undefined,
              { page_no: String(fsPage), page_size: "100" },
            );
            const list = res.response?.flash_sale_list ?? [];
            logShopee("flash_sale_list_response", {
              integrationId: this.integrationId,
              shopId: ctx.shopId,
              pageNo: fsPage,
              rawCount: list.length,
              more: res.response?.more ?? null,
              sample: list.slice(0, 5).map((row: any) => ({
                flashSaleId: row?.flash_sale_id ?? row?.promotionid ?? null,
                status: row?.status ?? null,
                name: row?.name ?? null,
                startTime: row?.start_time ?? null,
                endTime: row?.end_time ?? null,
              })),
            });
            for (const row of list) {
              const c = mapFlashSaleRow(row);
              if (filters.status && !filters.status.includes(c.status)) continue;
              campaigns.push(c);
            }
            fsMore = res.response?.more === true;
            fsPage++;
          }
        } catch (e: any) {
          if (isInvalidShopeeTokenError(e)) invalidTokenDetected = true;
          logShopeeError("flash_sale_list_failed", e, {
            integrationId: this.integrationId,
            shopId: ctx.shopId,
            attempt,
          });
        }
      }

      if (invalidTokenDetected && attempt === 1) {
        logShopeeWarn("list_campaigns_retry_after_token_refresh", {
          integrationId: this.integrationId,
          shopId: ctx.shopId,
          filters,
        });
        continue;
      }

      if (campaigns.length === 0) {
        logShopeeWarn("list_campaigns_zero_result", {
          integrationId: this.integrationId,
          shopId: ctx.shopId,
          filters,
          discountErrors,
          attempt,
        });
      }

      logShopee("list_campaigns_finished", {
        integrationId: this.integrationId,
        shopId: ctx.shopId,
        mappedCount: campaigns.length,
        attempt,
        byType: campaigns.reduce((acc: Record<string, number>, campaign) => {
          acc[campaign.promotionType] = (acc[campaign.promotionType] ?? 0) + 1;
          return acc;
        }, {}),
        byStatus: campaigns.reduce((acc: Record<string, number>, campaign) => {
          acc[campaign.status] = (acc[campaign.status] ?? 0) + 1;
          return acc;
        }, {}),
      });

      return campaigns;
    }

    return [];
  }

  async getCampaign(externalId: string, type: PromotionType): Promise<UniversalCampaign | null> {
    const ctx = await this.buildCtx();
    try {
      if (type === "STANDARD_DISCOUNT") {
        const res = await shopeeFetch<any>(
          "/api/v2/discount/get_discount",
          ctx,
          "GET",
          undefined,
          { discount_id: externalId, page_no: "1", page_size: "1" },
        );
        return mapDiscountRow({ ...res.response, discount_id: externalId });
      } else {
        const res = await shopeeFetch<any>(
          "/api/v2/shop_flash_sale/get_shop_flash_sale",
          ctx,
          "GET",
          undefined,
          { flash_sale_id: externalId },
        );
        return mapFlashSaleRow(res.response ?? {});
      }
    } catch (e) {
      logShopeeError("get_campaign_failed", e, { externalId, type, integrationId: this.integrationId });
      return null;
    }
  }

  async getCampaignItems(externalId: string, type: PromotionType): Promise<UniversalCampaignItem[]> {
    const ctx = await this.buildCtx();
    const items: UniversalCampaignItem[] = [];

    if (type === "STANDARD_DISCOUNT") {
      let pageNo = 1;
      let hasMore = true;
      while (hasMore) {
        logShopee("get_discount_items_request", { externalId, pageNo, pageSize: 50 });
        const res = await shopeeFetch<any>(
          "/api/v2/discount/get_discount",
          ctx,
          "GET",
          undefined,
          { discount_id: externalId, page_no: String(pageNo), page_size: "50" },
        );
        const list = res.response?.item_list ?? [];
        logShopee("get_discount_items_response", {
          externalId,
          pageNo,
          rawCount: list.length,
          more: res.response?.more ?? null,
        });
        for (const item of list) {
          items.push(mapDiscountItem(item));
        }
        hasMore = res.response?.more === true;
        pageNo++;
      }
    } else {
      let pageNo = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await shopeeFetch<any>(
          "/api/v2/shop_flash_sale/get_shop_flash_sale_items",
          ctx,
          "GET",
          undefined,
          { flash_sale_id: externalId, page_no: String(pageNo), page_size: "100" },
        );
        const list = res.response?.item_list ?? [];
        logShopee("get_flash_sale_items_response", {
          externalId,
          pageNo,
          rawCount: list.length,
          more: res.response?.more ?? null,
        });
        for (const item of list) {
          items.push(mapFlashSaleItem(item));
        }
        hasMore = res.response?.more === true;
        pageNo++;
      }
    }

    logShopee("get_campaign_items_finished", {
      externalId,
      type,
      itemCount: items.length,
    });

    return items;
  }

  async createStandardDiscount(input: CreateStandardDiscountInput): Promise<UniversalCampaign> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logShopee("create_standard_discount_attempt_started", {
          integrationId: this.integrationId,
          attempt,
          forceRefresh: attempt === 2,
          nameLength: input.name.length,
          startDate: input.startDate,
          endDate: input.endDate,
        });
        const ctx = await this.buildCtx({ forceRefresh: attempt === 2 });
        const startTs = Math.floor(new Date(input.startDate).getTime() / 1000);
        const endTs = Math.floor(new Date(input.endDate).getTime() / 1000);
        const nowSec = Math.floor(Date.now() / 1000);
        logShopee("create_standard_discount_window", {
          integrationId: this.integrationId,
          attempt,
          shopId: ctx.shopId,
          startTs,
          endTs,
          nowSec,
          startsInSec: startTs - nowSec,
          durationSec: endTs - startTs,
          accessTokenFingerprint: await tokenFingerprint(ctx.accessToken),
        });
        // Shopee: start >= 1h from now; end >= start + 1h; period < 180 days
        if (startTs < nowSec + 3600) {
          throw new PromotionsAdapterError(
            "INVALID_DISCOUNT_WINDOW",
            "Shopee exige que o início da promoção seja pelo menos 1 hora após o horário atual.",
            "invalid_start_time",
            false,
          );
        }
        if (endTs < startTs + 3600) {
          throw new PromotionsAdapterError(
            "INVALID_DISCOUNT_WINDOW",
            "Shopee exige que o término seja pelo menos 1 hora após o início.",
            "invalid_end_time",
            false,
          );
        }
        const maxSpanSec = 180 * 86400;
        if (endTs - startTs > maxSpanSec) {
          throw new PromotionsAdapterError(
            "INVALID_DISCOUNT_WINDOW",
            "Shopee limita o período da promoção a menos de 180 dias.",
            "invalid_period",
            false,
          );
        }
        const res = await shopeeFetch<any>(
          "/api/v2/discount/add_discount",
          ctx,
          "POST",
          { discount_name: input.name, start_time: startTs, end_time: endTs },
        );
        const discountId = res.response?.discount_id;
        logShopee("create_standard_discount_success", {
          integrationId: this.integrationId,
          attempt,
          shopId: ctx.shopId,
          discountId: discountId ?? null,
          accessTokenFingerprint: await tokenFingerprint(ctx.accessToken),
        });
        return {
          externalId: String(discountId),
          promotionType: "STANDARD_DISCOUNT",
          source: "seller_created",
          status: "scheduled",
          name: input.name,
          startDate: input.startDate,
          finishDate: input.endDate,
          deadlineDate: null,
          discountPercent: null,
          meliPercent: null,
          sellerPercent: null,
          raw: res.response ?? {},
        };
      } catch (e) {
        lastErr = e;
        const invalidToken = isInvalidShopeeTokenError(e);
        logShopeeError("create_standard_discount_attempt_failed", e, {
          integrationId: this.integrationId,
          attempt,
          forceRefresh: attempt === 2,
          invalidToken,
        });
        if (attempt === 1 && invalidToken) {
          logShopeeWarn("create_standard_discount_retry_after_token_refresh", {
            integrationId: this.integrationId,
            attempt,
          });
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async updateCampaign(externalId: string, type: PromotionType, patch: UpdateCampaignInput): Promise<UniversalCampaign> {
    const ctx = await this.buildCtx();
    if (type === "FLASH_SALE") {
      const body: Record<string, unknown> = { flash_sale_id: Number(externalId) };
      if (patch.startDate) body.start_time = Math.floor(new Date(patch.startDate).getTime() / 1000);
      if (patch.endDate) body.end_time = Math.floor(new Date(patch.endDate).getTime() / 1000);
      await shopeeFetch<any>("/api/v2/shop_flash_sale/update_shop_flash_sale", ctx, "POST", body);
    } else {
      const body: Record<string, unknown> = { discount_id: Number(externalId) };
      if (patch.name) body.discount_name = patch.name;
      if (patch.startDate) body.start_time = Math.floor(new Date(patch.startDate).getTime() / 1000);
      if (patch.endDate) body.end_time = Math.floor(new Date(patch.endDate).getTime() / 1000);
      await shopeeFetch<any>("/api/v2/discount/update_discount", ctx, "POST", body);
    }
    const updated = await this.getCampaign(externalId, type);
    if (!updated) throw new PromotionsAdapterError("NOT_FOUND", "Campaign not found after update");
    return updated;
  }

  async endCampaign(externalId: string, type: PromotionType): Promise<void> {
    const ctx = await this.buildCtx();
    if (type === "FLASH_SALE") {
      // Flash sales can only be deleted, not ended
      await shopeeFetch<any>(
        "/api/v2/shop_flash_sale/delete_shop_flash_sale",
        ctx,
        "POST",
        { flash_sale_id: Number(externalId) },
      );
    } else {
      await shopeeFetch<any>(
        "/api/v2/discount/end_discount",
        ctx,
        "POST",
        { discount_id: Number(externalId) },
      );
    }
  }

  async deleteCampaign(externalId: string, type: PromotionType, force?: "auto" | "end" | "delete"): Promise<void> {
    const ctx = await this.buildCtx();
    if (type === "FLASH_SALE") {
      await shopeeFetch<any>(
        "/api/v2/shop_flash_sale/delete_shop_flash_sale",
        ctx,
        "POST",
        { flash_sale_id: Number(externalId) },
      );
      return;
    }

    // For STANDARD_DISCOUNT, auto-detect whether to end or delete based on campaign status
    const effectiveForce = force ?? "auto";
    if (effectiveForce === "end") {
      await shopeeFetch<any>("/api/v2/discount/end_discount", ctx, "POST", { discount_id: Number(externalId) });
      return;
    }
    if (effectiveForce === "delete") {
      await shopeeFetch<any>("/api/v2/discount/delete_discount", ctx, "POST", { discount_id: Number(externalId) });
      return;
    }

    // auto: fetch current status to decide
    let currentStatus: string | null = null;
    try {
      const campaign = await this.getCampaign(externalId, type);
      currentStatus = campaign?.status ?? null;
    } catch (_) { /* if we can't fetch, fall back to delete */ }

    if (currentStatus === "active") {
      logShopee("delete_campaign_auto_routing_end", { externalId, currentStatus });
      await shopeeFetch<any>("/api/v2/discount/end_discount", ctx, "POST", { discount_id: Number(externalId) });
    } else {
      logShopee("delete_campaign_auto_routing_delete", { externalId, currentStatus });
      await shopeeFetch<any>("/api/v2/discount/delete_discount", ctx, "POST", { discount_id: Number(externalId) });
    }
  }

  async addItems(externalId: string, type: PromotionType, items: AddItemInput[]): Promise<BulkResult> {
    const ctx = await this.buildCtx();
    const successful: string[] = [];
    const failed: BulkResult["failed"] = [];

    // Process in batches of 50 (Shopee limit)
    const BATCH = 50;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);

      if (type === "STANDARD_DISCOUNT") {
        // Shopee: purchase_limit required (0 = no limit). Promotion stock is optional — omit for "no limit";
        // sending 0 can be rejected as zero reserved stock. Prices must be > 0.
        const ready: AddItemInput[] = [];
        for (const item of batch) {
          const deal = item.dealPrice;
          if (deal == null || !Number.isFinite(Number(deal)) || Number(deal) <= 0) {
            failed.push({
              marketplaceItemId: item.marketplaceItemId,
              error: "Preço promocional inválido ou ausente (item_promotion_price / model_promotion_price)",
            });
            continue;
          }
          ready.push(item);
        }
        if (ready.length === 0) continue;

        const itemList = ready.map(item => {
          const price = Math.round(Number(item.dealPrice) * 100) / 100;
          const purchaseLimit =
            item.purchaseLimit != null && Number.isFinite(Number(item.purchaseLimit))
              ? Math.max(0, Math.floor(Number(item.purchaseLimit)))
              : 0;
          const stockRaw = item.promotionStock;
          const stockNum =
            stockRaw != null && Number.isFinite(Number(stockRaw)) ? Number(stockRaw) : null;

          const row: Record<string, unknown> = {
            item_id: Number(item.marketplaceItemId),
            purchase_limit: purchaseLimit,
          };
          if (item.variationId) {
            const model: Record<string, unknown> = {
              model_id: Number(item.variationId),
              model_promotion_price: price,
            };
            if (stockNum != null && stockNum > 0) {
              model.model_promotion_stock = Math.floor(stockNum);
            }
            row.model_list = [model];
          } else {
            row.item_promotion_price = price;
            if (stockNum != null && stockNum > 0) {
              row.item_promotion_stock = Math.floor(stockNum);
            }
          }
          return row;
        });

        try {
          const res = await shopeeFetch<any>(
            "/api/v2/discount/add_discount_item",
            ctx,
            "POST",
            { discount_id: Number(externalId), item_list: itemList },
          );
          const errorList: any[] = res.response?.error_list ?? [];
          const errorIds = new Set(errorList.map((e: any) => String(e.item_id)));
          for (const item of ready) {
            if (errorIds.has(item.marketplaceItemId)) {
              const errEntry = errorList.find((e: any) => String(e.item_id) === item.marketplaceItemId);
              failed.push({ marketplaceItemId: item.marketplaceItemId, error: errEntry?.fail_message ?? "Unknown" });
            } else {
              successful.push(item.marketplaceItemId);
            }
          }
        } catch (e: any) {
          ready.forEach(item => failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) }));
        }

      } else {
        // Flash sale items
        const itemList = batch.map(item => ({
          item_id: Number(item.marketplaceItemId),
          purchase_limit: item.purchaseLimit ?? 0,
          promotion_price: item.dealPrice,
          stock: item.promotionStock ?? 0,
          ...(item.variationId ? { model_id: Number(item.variationId) } : {}),
        }));

        try {
          const res = await shopeeFetch<any>(
            "/api/v2/shop_flash_sale/add_shop_flash_sale_items",
            ctx,
            "POST",
            { flash_sale_id: Number(externalId), item_list: itemList },
          );
          const errIds = new Set((res.response?.fail_list ?? []).map((e: any) => String(e.item_id)));
          for (const item of batch) {
            errIds.has(item.marketplaceItemId)
              ? failed.push({ marketplaceItemId: item.marketplaceItemId, error: "Failed to add" })
              : successful.push(item.marketplaceItemId);
          }
        } catch (e: any) {
          batch.forEach(item => failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) }));
        }
      }
    }

    return { successful, failed };
  }

  async updateItems(externalId: string, type: PromotionType, items: UpdateItemInput[]): Promise<BulkResult> {
    const ctx = await this.buildCtx();
    const successful: string[] = [];
    const failed: BulkResult["failed"] = [];

    const BATCH = 50;
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);

      if (type === "STANDARD_DISCOUNT") {
        const itemList = batch.map(item => {
          const purchaseLimit =
            item.purchaseLimit != null && Number.isFinite(Number(item.purchaseLimit))
              ? Math.max(0, Math.floor(Number(item.purchaseLimit)))
              : 0;
          return {
            item_id: Number(item.marketplaceItemId),
            purchase_limit: purchaseLimit,
            ...(item.variationId
              ? { model_list: [{ model_id: Number(item.variationId), model_promotion_price: item.dealPrice }] }
              : { item_promotion_price: item.dealPrice }),
          };
        });

        try {
          const res = await shopeeFetch<any>(
            "/api/v2/discount/update_discount_item",
            ctx,
            "POST",
            { discount_id: Number(externalId), item_list: itemList },
          );
          const errIds = new Set((res.response?.error_list ?? []).map((e: any) => String(e.item_id)));
          for (const item of batch) {
            errIds.has(item.marketplaceItemId)
              ? failed.push({ marketplaceItemId: item.marketplaceItemId, error: "Update failed" })
              : successful.push(item.marketplaceItemId);
          }
        } catch (e: any) {
          batch.forEach(item => failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) }));
        }
      } else {
        // Flash sale item update
        const itemList = batch.map(item => ({
          item_id: Number(item.marketplaceItemId),
          ...(item.dealPrice != null ? { promotion_price: item.dealPrice } : {}),
          ...(item.variationId ? { model_id: Number(item.variationId) } : {}),
        }));

        try {
          const res = await shopeeFetch<any>(
            "/api/v2/shop_flash_sale/update_shop_flash_sale_items",
            ctx,
            "POST",
            { flash_sale_id: Number(externalId), item_list: itemList },
          );
          const errIds = new Set((res.response?.fail_list ?? []).map((e: any) => String(e.item_id)));
          for (const item of batch) {
            errIds.has(item.marketplaceItemId)
              ? failed.push({ marketplaceItemId: item.marketplaceItemId, error: "Update failed" })
              : successful.push(item.marketplaceItemId);
          }
        } catch (e: any) {
          batch.forEach(item => failed.push({ marketplaceItemId: item.marketplaceItemId, error: e.message ?? String(e) }));
        }
      }
    }

    return { successful, failed };
  }

  async removeItem(externalId: string, type: PromotionType, itemId: string, variationId?: string): Promise<void> {
    const ctx = await this.buildCtx();
    if (type === "STANDARD_DISCOUNT") {
      const body: Record<string, unknown> = {
        discount_id: Number(externalId),
        item_id: Number(itemId),
      };
      if (variationId) body.model_id = Number(variationId);
      await shopeeFetch<any>("/api/v2/discount/delete_discount_item", ctx, "POST", body);
    } else {
      const body: Record<string, unknown> = {
        flash_sale_id: Number(externalId),
        item_id: Number(itemId),
      };
      if (variationId) body.model_id = Number(variationId);
      await shopeeFetch<any>("/api/v2/shop_flash_sale/delete_shop_flash_sale_items", ctx, "POST", body);
    }
  }

  // ── Shopee-specific: flash sale slots ───────────────────────────────────

  async listFlashSaleSlots(): Promise<FlashSaleSlot[]> {
    const ctx = await this.buildCtx();
    const res = await shopeeFetch<any>(
      "/api/v2/shop_flash_sale/get_time_slot_id",
      ctx,
      "GET",
    );
    const slots: FlashSaleSlot[] = [];
    for (const row of res.response?.time_slot_list ?? []) {
      let criteria: FlashSaleItemCriteria | null = null;
      try {
        const cRes = await shopeeFetch<any>(
          "/api/v2/shop_flash_sale/get_item_criteria",
          ctx,
          "GET",
          undefined,
          { time_slot_id: String(row.time_slot_id) },
        );
        const c = cRes.response?.criteria;
        if (c) {
          criteria = {
            minPrice: c.min_price ?? null,
            maxPrice: c.max_price ?? null,
            minStock: c.min_stock ?? null,
            maxStock: c.max_stock ?? null,
          };
        }
      } catch (_) { /* criteria is optional */ }

      slots.push({
        slotId: String(row.time_slot_id),
        startTime: row.start_time ? new Date(Number(row.start_time) * 1000).toISOString() : "",
        endTime: row.end_time ? new Date(Number(row.end_time) * 1000).toISOString() : "",
        criteria,
      });
    }
    return slots;
  }

  async createFlashSaleFromSlot(slotId: string, name: string): Promise<UniversalCampaign> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const ctx = await this.buildCtx({ forceRefresh: attempt === 2 });
        const res = await shopeeFetch<any>(
          "/api/v2/shop_flash_sale/create_shop_flash_sale",
          ctx,
          "POST",
          { time_slot_id: Number(slotId), name },
        );
        const flashSaleId = res.response?.flash_sale_id;
        return {
          externalId: String(flashSaleId),
          promotionType: "FLASH_SALE",
          source: "time_slot",
          status: "scheduled",
          name,
          startDate: null,
          finishDate: null,
          deadlineDate: null,
          discountPercent: null,
          meliPercent: null,
          sellerPercent: null,
          raw: res.response ?? {},
        };
      } catch (e) {
        lastErr = e;
        if (attempt === 1 && isInvalidShopeeTokenError(e)) {
          logShopeeWarn("create_flash_sale_retry_after_token_refresh", {
            integrationId: this.integrationId,
            attempt,
          });
          continue;
        }
        throw e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  // ── Not supported on Shopee ──────────────────────────────────────────────

  async listMlFlashSaleInvites(): Promise<UniversalCampaign[]> {
    return []; // graceful no-op on Shopee
  }
}
