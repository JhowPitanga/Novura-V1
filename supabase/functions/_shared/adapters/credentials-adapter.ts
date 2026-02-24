import type { CredentialsPort } from "../ports/credentials-port.ts";
import type { MarketplaceCredentials, MarketplaceName } from "../domain/types.ts";
import {
  aesGcmDecryptFromString,
  aesGcmEncryptToString,
  checkAndRefreshToken,
  importAesGcmKey,
} from "./token-utils.ts";
import type { SupabaseClient } from "./supabase-client.ts";

/**
 * Supabase-backed implementation of CredentialsPort.
 * Reads from marketplace_integrations table (no schema changes).
 * Handles token decryption, expiry checks, and automatic Mercado Livre refresh.
 */
export class SupabaseCredentialsAdapter implements CredentialsPort {
  private admin: SupabaseClient;
  private aesKeyPromise: Promise<CryptoKey>;

  constructor(admin: SupabaseClient) {
    this.admin = admin;
    const rawKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
    if (!rawKey) throw new Error("TOKEN_ENCRYPTION_KEY env var is required");
    this.aesKeyPromise = importAesGcmKey(rawKey);
  }

  async getValidCredentials(
    integrationId: string,
  ): Promise<MarketplaceCredentials> {
    const aesKey = await this.aesKeyPromise;

    const { data: row, error } = await this.admin
      .from("marketplace_integrations")
      .select("id, access_token, refresh_token, expires_in, meli_user_id, marketplace_name")
      .eq("id", integrationId)
      .single();

    if (error || !row) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    const marketplace = this.normalizeMarketplaceName(row.marketplace_name);
    const isExpired = new Date() >= new Date(row.expires_in);

    if (!isExpired) {
      const accessToken = await aesGcmDecryptFromString(aesKey, row.access_token);
      return {
        integrationId: row.id,
        accessToken,
        marketplace,
        isExpired: false,
        meliUserId: row.meli_user_id ?? undefined,
      };
    }

    return this.refreshIfExpired(integrationId);
  }

  async refreshIfExpired(
    integrationId: string,
  ): Promise<MarketplaceCredentials> {
    const aesKey = await this.aesKeyPromise;
    const result = await checkAndRefreshToken(this.admin, aesKey, integrationId);

    if (!result.success || !result.accessToken) {
      throw new Error(result.error ?? "Token refresh failed");
    }

    const { data: row } = await this.admin
      .from("marketplace_integrations")
      .select("id, marketplace_name, meli_user_id")
      .eq("id", integrationId)
      .single();

    return {
      integrationId,
      accessToken: result.accessToken,
      marketplace: this.normalizeMarketplaceName(row?.marketplace_name),
      isExpired: false,
      meliUserId: row?.meli_user_id ?? undefined,
    };
  }

  private normalizeMarketplaceName(raw: string | null | undefined): MarketplaceName {
    if (raw === "mercado_livre" || raw === "Mercado Livre") return "mercado_livre";
    if (raw === "shopee" || raw === "Shopee") return "shopee";
    return "mercado_livre";
  }
}
