/**
 * Supabase implementation of MarketplaceOrdersRawPort.
 * Single place that accesses marketplace_orders_raw table.
 */

import type {
  MarketplaceOrdersRawPort,
  UpsertMarketplaceOrderRawParams,
} from "../../ports/marketplace-orders-raw-port.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

const CONFLICT_COLUMNS = "organizations_id,marketplace_name,marketplace_order_id";

export type { UpsertMarketplaceOrderRawParams };

export class SupabaseMarketplaceOrdersRawAdapter implements MarketplaceOrdersRawPort {
  constructor(private admin: SupabaseClient) {}

  async upsert(params: UpsertMarketplaceOrderRawParams): Promise<void> {
    const row: Record<string, unknown> = {
      organizations_id: params.organizationId,
      marketplace_name: params.marketplaceName,
      marketplace_order_id: params.marketplaceOrderId,
      data: params.data,
      last_synced_at: params.lastSyncedAt,
      updated_at: params.updatedAt,
    };
    if (params.integrationId != null) row.integration_id = params.integrationId;
    if (params.companyId != null) row.company_id = params.companyId;
    await this.admin
      .from("marketplace_orders_raw")
      .upsert(row, { onConflict: CONFLICT_COLUMNS })
      .then(() => {});
  }

  async upsertFullRow(row: Record<string, unknown>): Promise<void> {
    await this.admin
      .from("marketplace_orders_raw")
      .upsert(row, { onConflict: CONFLICT_COLUMNS })
      .then(() => {});
  }

  async getById(id: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.admin
      .from("marketplace_orders_raw")
      .select("*")
      .eq("id", id)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? null;
  }

  async getByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.admin
      .from("marketplace_orders_raw")
      .select("*")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_order_id", marketplaceOrderId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? null;
  }

  async getByMarketplaceAndOrderId(
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.admin
      .from("marketplace_orders_raw")
      .select("*")
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_order_id", marketplaceOrderId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown>) ?? null;
  }

  async getDataByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<unknown> {
    const { data, error } = await this.admin
      .from("marketplace_orders_raw")
      .select("data")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_order_id", marketplaceOrderId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as unknown as Record<string, unknown> | null;
    return row?.data ?? null;
  }

  async updateById(id: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.admin
      .from("marketplace_orders_raw")
      .update(payload)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async getIdByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<string | null> {
    const { data, error } = await this.admin
      .from("marketplace_orders_raw")
      .select("id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_name", marketplaceName)
      .eq("marketplace_order_id", marketplaceOrderId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const id = (data as Record<string, unknown>)?.id;
    return id != null ? String(id) : null;
  }
}

/** Backward-compatible helper: upsert via adapter. */
export async function upsertMarketplaceOrderRaw(
  admin: SupabaseClient,
  params: UpsertMarketplaceOrderRawParams,
): Promise<void> {
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(admin);
  await adapter.upsert(params);
}
