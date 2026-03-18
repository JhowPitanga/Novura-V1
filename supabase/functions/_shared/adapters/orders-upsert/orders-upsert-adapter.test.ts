/**
 * Unit tests for OrdersUpsertAdapter. Run with: deno test -A orders-upsert-adapter.test.ts
 * Uses a mock Supabase client that returns configured results.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { NormalizedOrder, UpsertOrderInput } from "../../domain/orders/orders-types.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";
import { OrdersUpsertAdapter } from "./orders-upsert-adapter.ts";

function minimalOrder(overrides: Partial<NormalizedOrder> = {}): NormalizedOrder {
  return {
    marketplace: "mercado_livre",
    marketplace_order_id: "ML-001",
    pack_id: null,
    status: null,
    marketplace_status: "paid",
    payment_status: null,
    gross_amount: 100,
    marketplace_fee: 10,
    shipping_cost: 5,
    shipping_subsidy: 0,
    net_amount: 85,
    buyer_name: "Buyer",
    buyer_document: null,
    buyer_email: null,
    buyer_phone: null,
    buyer_state: "SP",
    created_at: "2024-01-01T00:00:00Z",
    shipped_at: null,
    delivered_at: null,
    canceled_at: null,
    items: [
      {
        marketplace_item_id: "MLB123",
        sku: "SKU-1",
        title: "Item",
        quantity: 1,
        unit_price: 100,
        variation_name: null,
        image_url: null,
      },
    ],
    shipping: {
      shipment_id: null,
      logistic_type: null,
      tracking_number: null,
      carrier: null,
      status: null,
      substatus: null,
      street_name: "Rua A",
      street_number: "1",
      complement: null,
      neighborhood: null,
      city: "São Paulo",
      state_uf: "SP",
      zip_code: "01000-000",
      sla_expected_date: null,
      sla_status: null,
      estimated_delivery: null,
    },
    ...overrides,
  };
}

/** Mock that returns existing order on first select and orderId on upsert; records history inserts. */
function createMockClient(initialOrder: { id: string; marketplace_status: string; status: string | null } | null) {
  const historyInserts: Array<{ from_status: unknown; to_status: unknown; source: string }> = [];
  const orderId = initialOrder?.id ?? "new-order-id";

  const makeThenable = <T>(value: T) => ({
    then: (resolve: (v: T) => void) => Promise.resolve(value).then(resolve),
  });

  const from = (table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: initialOrder, error: null }),
              }),
            }),
          }),
        }),
        upsert: (_row: unknown, _opts?: unknown) => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: orderId }, error: null }),
          }),
        }),
      };
    }
    if (table === "order_status_history") {
      return {
        insert: (payload: Record<string, unknown>) => {
          historyInserts.push({
            from_status: payload.from_status,
            to_status: payload.to_status,
            source: String(payload.source),
          });
          return makeThenable(undefined);
        },
      };
    }
    if (table === "order_items") {
      return {
        delete: () => ({ eq: () => makeThenable({ error: null }) }),
        insert: () => makeThenable({ error: null }),
      };
    }
    if (table === "order_shipping") {
      return {
        upsert: () => makeThenable(undefined),
      };
    }
    return {};
  };

  return {
    mock: { from } as unknown as SupabaseClient,
    historyInserts,
  };
}

Deno.test("OrdersUpsertAdapter.upsert: returns success and order_id when upsert succeeds", async () => {
  const adapter = new OrdersUpsertAdapter();
  const { mock } = createMockClient(null);
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder(),
    source: "sync",
  };

  const result = await adapter.upsert(mock, input);

  assertEquals(result.success, true);
  assertEquals(result.order_id, "new-order-id");
  assertEquals(result.created, true);
});

Deno.test("upsertOrder: valid Shopee order (new) returns success=true and created=true", async () => {
  const { mock } = createMockClient(null);
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder({ marketplace: "shopee", marketplace_order_id: "SHOPEE-001" }),
    source: "sync",
  };

  const result = await adapter.upsert(mock, input);

  assertEquals(result.success, true);
  assertEquals(result.order_id, "new-order-id");
  assertEquals(result.created, true);
});

Deno.test("upsertOrder: valid Shopee order (new) returns success=true and created=true", async () => {
  const { mock } = createMockClient(null);
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder({ marketplace: "shopee", marketplace_order_id: "SHOPEE-001" }),
    source: "sync",
  };

  const result = await adapter.upsert(mock, input);

  assertEquals(result.success, true);
  assertEquals(result.order_id, "new-order-id");
  assertEquals(result.created, true);
});

Deno.test("upsertOrder: valid Shopee order (new) returns success=true and created=true", async () => {
  const { mock } = createMockClient(null);
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder({ marketplace: "shopee", marketplace_order_id: "SHOPEE-001" }),
    source: "sync",
  };

  const result = await adapter.upsert(mock, input);

  assertEquals(result.success, true);
  assertEquals(result.order_id, "new-order-id");
  assertEquals(result.created, true);
});

Deno.test("OrdersUpsertAdapter.upsert: inserts into order_status_history when status changes", async () => {
  const adapter = new OrdersUpsertAdapter();
  const { mock, historyInserts } = createMockClient({
    id: "existing-id",
    marketplace_status: "confirmed",
    status: "pending",
  });
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder({ marketplace_status: "paid" }),
    source: "webhook",
  };

  await adapter.upsert(mock, input);

  assertEquals(historyInserts.length >= 1, true);
  assertEquals(historyInserts[0].from_status, "confirmed");
  assertEquals(historyInserts[0].to_status, "paid");
  assertEquals(historyInserts[0].source, "webhook");
});

Deno.test("OrdersUpsertAdapter.upsert: created is false when order already existed", async () => {
  const adapter = new OrdersUpsertAdapter();
  const { mock } = createMockClient({
    id: "existing-id",
    marketplace_status: "paid",
    status: null,
  });
  const input: UpsertOrderInput = {
    organization_id: "org-1",
    order: minimalOrder({ marketplace_status: "paid" }),
    source: "sync",
  };

  const result = await adapter.upsert(mock, input);

  assertEquals(result.success, true);
  assertEquals(result.created, false);
});

Deno.test("OrdersUpsertAdapter.upsert: returns error when orders upsert fails", async () => {
  const from = (table: string) => {
    if (table === "orders") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
        upsert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: { message: "Conflict" },
              }),
          }),
        }),
      };
    }
    return {};
  };
  const mock = { from } as unknown as SupabaseClient;
  const adapter = new OrdersUpsertAdapter();
  const result = await adapter.upsert(mock, {
    organization_id: "org-1",
    order: minimalOrder(),
    source: "sync",
  });

  assertEquals(result.success, false);
  assertEquals(result.order_id, null);
  assertEquals(result.error, "Conflict");
});
