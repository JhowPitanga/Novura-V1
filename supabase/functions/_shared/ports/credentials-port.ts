import type { MarketplaceCredentials } from "../domain/types.ts";

/**
 * Port for accessing marketplace integration credentials.
 * Abstracts token decryption, expiry checks, and automatic refresh.
 */
export interface CredentialsPort {
  getValidCredentials(
    integrationId: string,
  ): Promise<MarketplaceCredentials>;

  refreshIfExpired(
    integrationId: string,
  ): Promise<MarketplaceCredentials>;
}
