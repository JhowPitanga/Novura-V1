/**
 * Unit tests for MlOrderSyncProcessor. Mocks fetch, upsert, and raw adapters.
 * Run with: deno test -A ml-order-sync-processor.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MlOrderSyncProcessor } from "./ml-order-sync-processor.ts";
import type { MlOrderFetchPort } from "../../ports/ml-order-fetch-port.ts";
import type { OrdersUpsertPort } from "../../ports/orders-upsert-port.ts";
import type {
  MarketplaceOrdersRawPort,
  UpsertMarketplaceOrderRawParams,
} from "../../ports/marketplace-orders-raw-port.ts";
import { MlOrderNormalizeService } from "../../orders-normalize/index.ts";
import type { MlOrderResponse } from "../../domain/ml/ml-order-api.types.ts";
import type { NormalizedOrder } from "../../domain/orders/orders-types.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

function minimalNormalizedOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    marketplace: "mercado_livre",
    marketplace_order_id: "ML-1",
    pack_id: null,
    status: null,
    marketplace_status: "paid",
    payment_status: null,
    gross_amount: 100,
    marketplace_fee: 0,
    shipping_cost: 0,
    shipping_subsidy: 0,
    net_amount: 100,
    buyer_name: null,
    buyer_document: null,
    buyer_email: null,
    buyer_phone: null,
    buyer_state: null,
    created_at: "2025-01-01T00:00:00Z",
    shipped_at: null,
    delivered_at: null,
    canceled_at: null,
    items: [],
    shipping: null,
    ...overrides,
  };
}

Deno.test("MlOrderSyncProcessor processOneOrder: returns ok true when fetch and upsert succeed", async () => {
  const rawOrder = { id: 1, status: "paid", date_created: "2025-01-01", order_items: [], payments: [], shipping: null, buyer: null } as MlOrderResponse;
  let rawUpserted: UpsertMarketplaceOrderRawParams | null = null;
  const fetchAdapter: MlOrderFetchPort = {
    fetchFullOrder: () => Promise.resolve({ ok: true, order: rawOrder }),
  };
  const upsertAdapter: OrdersUpsertPort = {
    upsert: () => Promise.resolve({ success: true, order_id: "ord-1", created: true }),
  };
  const rawAdapter: MarketplaceOrdersRawPort = {
    upsert: (params) => {
      rawUpserted = params;
      return Promise.resolve();
    },
    upsertFullRow: () => Promise.resolve(),
    getById: () => Promise.resolve(null),
    getByOrderId: () => Promise.resolve(null),
    getByMarketplaceAndOrderId: () => Promise.resolve(null),
    getDataByOrderId: () => Promise.resolve(null),
    updateById: () => Promise.resolve(),
    getIdByOrderId: () => Promise.resolve(null),
  };
  const normalizer = new MlOrderNormalizeService();
  const ctx = {
    admin: {} as SupabaseClient,
    accessToken: "token",
    orgId: "org-1",
    integrationId: "int-1",
    nowIso: "2025-01-01T12:00:00Z",
  };
  const processor = new MlOrderSyncProcessor(ctx, fetchAdapter, upsertAdapter, rawAdapter, normalizer);
  const result = await processor.processOneOrder("1");
  assertEquals(result.ok, true);
  const params = rawUpserted as UpsertMarketplaceOrderRawParams | null;
  assertEquals(params?.organizationId, "org-1");
  assertEquals(params?.marketplaceOrderId, "1");
  assertEquals(params?.marketplaceName, "Mercado Livre");
});

Deno.test("MlOrderSyncProcessor processOneOrder: returns ok false and 403 message when fetch returns 403", async () => {
  const fetchAdapter: MlOrderFetchPort = {
    fetchFullOrder: () => Promise.resolve({ ok: false, reason: "http", status: 403 }),
  };
  const upsertAdapter: OrdersUpsertPort = {
    upsert: () => Promise.resolve({ success: false, order_id: null, created: false }),
  };
  const rawAdapter: MarketplaceOrdersRawPort = {
    upsert: () => Promise.resolve(),
    upsertFullRow: () => Promise.resolve(),
    getById: () => Promise.resolve(null),
    getByOrderId: () => Promise.resolve(null),
    getByMarketplaceAndOrderId: () => Promise.resolve(null),
    getDataByOrderId: () => Promise.resolve(null),
    updateById: () => Promise.resolve(),
    getIdByOrderId: () => Promise.resolve(null),
  };
  const normalizer = new MlOrderNormalizeService();
  const ctx = {
    admin: {} as SupabaseClient,
    accessToken: "t",
    orgId: "org-1",
    integrationId: "int-1",
    nowIso: "2025-01-01T00:00:00Z",
  };
  const processor = new MlOrderSyncProcessor(ctx, fetchAdapter, upsertAdapter, rawAdapter, normalizer);
  const result = await processor.processOneOrder("999");
  assertEquals(result.ok, false);
  assertEquals(result.error, "403 (cancelled/confidential)");
});

Deno.test("MlOrderSyncProcessor processOneOrder: returns ok false when fetch returns parse error", async () => {
  const fetchAdapter: MlOrderFetchPort = {
    fetchFullOrder: () => Promise.resolve({ ok: false, reason: "parse" }),
  };
  const upsertAdapter: OrdersUpsertPort = {
    upsert: () => Promise.resolve({ success: false, order_id: null, created: false }),
  };
  const rawAdapter: MarketplaceOrdersRawPort = {
    upsert: () => Promise.resolve(),
    upsertFullRow: () => Promise.resolve(),
    getById: () => Promise.resolve(null),
    getByOrderId: () => Promise.resolve(null),
    getByMarketplaceAndOrderId: () => Promise.resolve(null),
    getDataByOrderId: () => Promise.resolve(null),
    updateById: () => Promise.resolve(),
    getIdByOrderId: () => Promise.resolve(null),
  };
  const normalizer = new MlOrderNormalizeService();
  const ctx = {
    admin: {} as SupabaseClient,
    accessToken: "t",
    orgId: "org-1",
    integrationId: "int-1",
    nowIso: "2025-01-01T00:00:00Z",
  };
  const processor = new MlOrderSyncProcessor(ctx, fetchAdapter, upsertAdapter, rawAdapter, normalizer);
  const result = await processor.processOneOrder("1");
  assertEquals(result.ok, false);
  assertEquals(result.error, "Invalid or empty order response");
});

Deno.test("MlOrderSyncProcessor processOneOrder: returns ok false when upsert fails", async () => {
  const rawOrder = { id: 2, status: "paid", date_created: "2025-01-01", order_items: [], payments: [], shipping: null, buyer: null } as MlOrderResponse;
  const fetchAdapter: MlOrderFetchPort = {
    fetchFullOrder: () => Promise.resolve({ ok: true, order: rawOrder }),
  };
  const upsertAdapter: OrdersUpsertPort = {
    upsert: () => Promise.resolve({ success: false, order_id: null, created: false, error: "Conflict" }),
  };
  const rawAdapter: MarketplaceOrdersRawPort = {
    upsert: () => Promise.resolve(),
    upsertFullRow: () => Promise.resolve(),
    getById: () => Promise.resolve(null),
    getByOrderId: () => Promise.resolve(null),
    getByMarketplaceAndOrderId: () => Promise.resolve(null),
    getDataByOrderId: () => Promise.resolve(null),
    updateById: () => Promise.resolve(),
    getIdByOrderId: () => Promise.resolve(null),
  };
  const normalizer = new MlOrderNormalizeService();
  const ctx = {
    admin: {} as SupabaseClient,
    accessToken: "t",
    orgId: "org-1",
    integrationId: "int-1",
    nowIso: "2025-01-01T00:00:00Z",
  };
  const processor = new MlOrderSyncProcessor(ctx, fetchAdapter, upsertAdapter, rawAdapter, normalizer);
  const result = await processor.processOneOrder("2");
  assertEquals(result.ok, false);
  assertEquals(result.error, "Conflict");
});
