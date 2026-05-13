/**
 * Factory that resolves the correct PromotionsProviderPort adapter
 * based on the integration's marketplace_name or provider key.
 */

import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import type { PromotionsProviderPort } from "../../ports/promotions-port.ts";
import { MlPromotionsAdapter } from "./ml-promotions-adapter.ts";
import { ShopeePromotionsAdapter } from "./shopee-promotions-adapter.ts";
import { PromotionsAdapterError } from "../../domain/promotions/promotion-types.ts";

const MARKETPLACE_KEY_MAP: Record<string, string> = {
  "mercado livre": "mercado_livre",
  "mercadolivre": "mercado_livre",
  "mercado_livre": "mercado_livre",
  "shopee": "shopee",
};

export function normalizeMarketplaceKey(marketplaceName: string): string {
  return MARKETPLACE_KEY_MAP[String(marketplaceName).toLowerCase().trim()] ?? String(marketplaceName).toLowerCase().replace(/\s+/g, "_");
}

/**
 * Build the adapter for the given integration and marketplace.
 *
 * @param integrationId - ID from marketplace_integrations
 * @param marketplaceName - Raw marketplace_name value (e.g. "Mercado Livre", "Shopee")
 * @param encKeyB64 - AES-GCM key from TOKENS_ENCRYPTION_KEY env var
 * @param integrations - Port for reading/updating integration rows
 * @param appCredentials - Port for reading app credentials (client_id/secret)
 */
export function resolvePromotionsAdapter(
  integrationId: string,
  marketplaceName: string,
  encKeyB64: string,
  integrations: MarketplaceIntegrationsPort,
  appCredentials: AppCredentialsPort,
): PromotionsProviderPort {
  const key = normalizeMarketplaceKey(marketplaceName);

  switch (key) {
    case "mercado_livre":
      return new MlPromotionsAdapter(integrationId, encKeyB64, integrations, appCredentials);
    case "shopee":
      return new ShopeePromotionsAdapter(integrationId, encKeyB64, integrations, appCredentials);
    default:
      throw new PromotionsAdapterError(
        "UNSUPPORTED_MARKETPLACE",
        `No promotions adapter for marketplace: ${marketplaceName}`,
      );
  }
}
