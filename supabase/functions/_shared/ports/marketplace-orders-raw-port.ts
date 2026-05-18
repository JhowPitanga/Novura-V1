/**
 * Port for marketplace_orders_raw table (audit/archive of raw order payloads).
 * Single point of access for upsert, get by id, get by order id, and update by id.
 */

export interface UpsertMarketplaceOrderRawParams {
  organizationId: string;
  marketplaceName: string;
  marketplaceOrderId: string;
  data: object;
  lastSyncedAt: string;
  updatedAt: string;
  integrationId?: string | null;
  companyId?: string | null;
}

export interface MarketplaceOrdersRawPort {
  upsert(params: UpsertMarketplaceOrderRawParams): Promise<void>;

  /** Full row upsert for webhooks that build the entire row (ML/Shopee). */
  upsertFullRow(row: Record<string, unknown>): Promise<void>;

  getById(id: string): Promise<Record<string, unknown> | null>;

  getByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<Record<string, unknown> | null>;

  /** Lookup by marketplace + order_id only (e.g. process-presented when org unknown). */
  getByMarketplaceAndOrderId(
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<Record<string, unknown> | null>;

  /** Select only `data` column by order id (e.g. for arrange-shipment). */
  getDataByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<unknown>;

  updateById(id: string, payload: Record<string, unknown>): Promise<void>;

  /** Get id after upsert by org + marketplace + order_id. */
  getIdByOrderId(
    organizationId: string,
    marketplaceName: string,
    marketplaceOrderId: string,
  ): Promise<string | null>;
}
