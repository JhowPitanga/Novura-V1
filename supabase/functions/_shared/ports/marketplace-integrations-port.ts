import type { IntegrationRow, UpdateIntegrationTokensPayload } from "../domain/integration-types.ts";

/**
 * Port for reading and updating marketplace_integrations table.
 * Single point of access for integration rows (tokens, expiry, org, config).
 */
export interface MarketplaceIntegrationsPort {
  getIntegration(
    integrationId: string,
    options?: { marketplaceName?: string },
  ): Promise<IntegrationRow>;

  /** Resolve integration by ML seller id (meli_user_id). Used by ML webhook. */
  getIntegrationByMeliUserId(
    meliUserId: string,
    marketplaceName: string,
  ): Promise<IntegrationRow | null>;

  /** Resolve integration by Shopee shop_id (config.shopee_shop_id or meli_user_id). Used by Shopee webhook. */
  getIntegrationByShopId(
    shopId: number,
    marketplaceName: string,
  ): Promise<IntegrationRow | null>;

  updateTokens(
    integrationId: string,
    payload: UpdateIntegrationTokensPayload,
  ): Promise<void>;
}
