/**
 * Domain types for marketplace integration rows.
 * Used by MarketplaceIntegrationsPort and token adapters (ML/Shopee).
 */

export interface IntegrationRow {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_in: string | null;
  meli_user_id: string | null;
  organizations_id: string;
  /** Shopee: shop_id in config or meli_user_id; ML uses meli_user_id as seller_id */
  config?: Record<string, unknown> | null;
  marketplace_name?: string | null;
}

export interface UpdateIntegrationTokensPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: string;
  meli_user_id?: string;
}
