/**
 * Supabase implementation of MarketplaceIntegrationsPort.
 * Single place that accesses marketplace_integrations table.
 */

import type { IntegrationRow, UpdateIntegrationTokensPayload } from "../../domain/integration-types.ts";
import type { MarketplaceIntegrationsPort } from "../../ports/marketplace-integrations-port.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

const SELECT_COLUMNS =
  "id, access_token, refresh_token, expires_in, meli_user_id, organizations_id, config, marketplace_name";

export class SupabaseMarketplaceIntegrationsAdapter implements MarketplaceIntegrationsPort {
  constructor(private readonly admin: SupabaseClient) {}

  async getIntegration(
    integrationId: string,
    options?: { marketplaceName?: string },
  ): Promise<IntegrationRow> {
    let q = this.admin
      .from("marketplace_integrations")
      .select(SELECT_COLUMNS)
      .eq("id", integrationId);
    if (options?.marketplaceName) {
      q = q.eq("marketplace_name", options.marketplaceName);
    }
    const { data: row, error } = await q.single();
    if (error || !row) throw new Error(error?.message ?? "Integration not found");
    return row as IntegrationRow;
  }

  async getIntegrationByMeliUserId(
    meliUserId: string,
    marketplaceName: string,
  ): Promise<IntegrationRow | null> {
    const { data: row, error } = await this.admin
      .from("marketplace_integrations")
      .select(SELECT_COLUMNS)
      .eq("meli_user_id", Number(meliUserId))
      .eq("marketplace_name", marketplaceName)
      .maybeSingle();
    if (error || !row) return null;
    return row as IntegrationRow;
  }

  async getIntegrationByShopId(
    shopId: number,
    marketplaceName: string,
  ): Promise<IntegrationRow | null> {
    const { data: rows, error } = await this.admin
      .from("marketplace_integrations")
      .select(SELECT_COLUMNS)
      .eq("marketplace_name", marketplaceName);
    if (error || !Array.isArray(rows)) return null;
    const cfg = rows.find((r: Record<string, unknown>) => {
      const c = r.config as { shopee_shop_id?: number } | null;
      const configShopId = c?.shopee_shop_id ?? Number.NaN;
      const meliId = r.meli_user_id ?? Number.NaN;
      return configShopId === shopId || meliId === shopId;
    });
    return cfg ? (cfg as IntegrationRow) : null;
  }

  async updateTokens(
    integrationId: string,
    payload: UpdateIntegrationTokensPayload,
  ): Promise<void> {
    const update: Record<string, unknown> = { access_token: payload.access_token };
    if (payload.refresh_token != null) update.refresh_token = payload.refresh_token;
    if (payload.expires_in != null) update.expires_in = payload.expires_in;
    if (payload.meli_user_id != null) update.meli_user_id = payload.meli_user_id;

    const { error } = await this.admin
      .from("marketplace_integrations")
      .update(update)
      .eq("id", integrationId);
    if (error) throw new Error(`Failed to update tokens: ${error.message}`);
  }
}
