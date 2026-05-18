/**
 * Unit tests for SupabaseMarketplaceOrdersRawAdapter and upsertMarketplaceOrderRaw.
 * Uses mock Supabase client. Run with: deno test -A marketplace-orders-raw.test.ts
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  SupabaseMarketplaceOrdersRawAdapter,
  upsertMarketplaceOrderRaw,
} from "./marketplace-orders-raw.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

function createMockAdmin(options: {
  upsertCalls?: Array<{ row: Record<string, unknown>; onConflict: string }>;
  getById?: Record<string, unknown> | null;
  getByOrderId?: Record<string, unknown> | null;
  getDataByOrderId?: unknown;
  getIdByOrderId?: string | null;
  updateError?: string;
}) {
  const upsertCalls = options.upsertCalls ?? [];
  const limitMaybeSingle = (data: unknown) => ({
    limit: () => ({
      maybeSingle: () => Promise.resolve({ data, error: null }),
    }),
  });
  const from = (table: string) => {
    if (table !== "marketplace_orders_raw") return {};
    return {
      upsert: (row: Record<string, unknown>, opts: { onConflict?: string }) => {
        upsertCalls.push({ row, onConflict: opts?.onConflict ?? "" });
        return Promise.resolve({ error: null });
      },
      select: (cols: string) => ({
        eq: (col: string, _val: string) => {
          if (col === "id") {
            return limitMaybeSingle(options.getById ?? null);
          }
          if (col === "organizations_id") {
            return {
              eq: (_c2: string, _v2: string) => ({
                eq: (_c3: string, _v3: string) =>
                  limitMaybeSingle(
                    cols === "data"
                      ? (options.getDataByOrderId !== undefined
                        ? { data: options.getDataByOrderId }
                        : options.getByOrderId)
                      : cols === "id"
                        ? (options.getIdByOrderId != null ? { id: options.getIdByOrderId } : null)
                        : options.getByOrderId,
                  ),
              }),
            };
          }
          return limitMaybeSingle(null);
        },
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: () =>
          Promise.resolve({
            error: options.updateError ? { message: options.updateError } : null,
          }),
      }),
    };
  };
  const mock = { from } as unknown as SupabaseClient;
  return { mock, upsertCalls };
}

Deno.test("SupabaseMarketplaceOrdersRawAdapter upsert: builds row with required fields", async () => {
  const upsertCalls: Array<{ row: Record<string, unknown>; onConflict: string }> = [];
  const from = (table: string) => {
    if (table !== "marketplace_orders_raw") return {};
    return {
      upsert: (row: Record<string, unknown>, opts: { onConflict?: string }) => {
        upsertCalls.push({ row, onConflict: opts?.onConflict ?? "" });
        return Promise.resolve({ error: null });
      },
    };
  };
  const mock = { from } as unknown as SupabaseClient;
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  await adapter.upsert({
    organizationId: "org-1",
    marketplaceName: "Mercado Livre",
    marketplaceOrderId: "ML-123",
    data: { id: 123, status: "paid" },
    lastSyncedAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });
  assertEquals(upsertCalls.length, 1);
  assertEquals(upsertCalls[0].row.organizations_id, "org-1");
  assertEquals(upsertCalls[0].row.marketplace_name, "Mercado Livre");
  assertEquals(upsertCalls[0].row.marketplace_order_id, "ML-123");
  assertEquals(upsertCalls[0].row.data, { id: 123, status: "paid" });
  assertEquals(upsertCalls[0].onConflict, "organizations_id,marketplace_name,marketplace_order_id");
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter upsert: includes integrationId and companyId when provided", async () => {
  const upsertCalls: Array<{ row: Record<string, unknown> }> = [];
  const from = (table: string) => {
    if (table !== "marketplace_orders_raw") return {};
    return {
      upsert: (row: Record<string, unknown>) => {
        upsertCalls.push({ row });
        return Promise.resolve({ error: null });
      },
    };
  };
  const mock = { from } as unknown as SupabaseClient;
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  await adapter.upsert({
    organizationId: "org-1",
    marketplaceName: "Shopee",
    marketplaceOrderId: "SP-456",
    data: {},
    lastSyncedAt: "",
    updatedAt: "",
    integrationId: "int-1",
    companyId: "company-1",
  });
  assertEquals(upsertCalls[0].row.integration_id, "int-1");
  assertEquals(upsertCalls[0].row.company_id, "company-1");
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter getById: returns row when found", async () => {
  const row = { id: "raw-1", organizations_id: "org-1", data: { x: 1 } };
  const { mock } = createMockAdmin({ getById: row });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  const result = await adapter.getById("raw-1");
  assertEquals(result?.id, "raw-1");
  assertEquals((result as Record<string, unknown>)?.data, { x: 1 });
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter getById: returns null when not found", async () => {
  const { mock } = createMockAdmin({ getById: null });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  const result = await adapter.getById("missing");
  assertEquals(result, null);
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter getDataByOrderId: returns data field", async () => {
  const { mock } = createMockAdmin({
    getDataByOrderId: { order_sn: "SP-789", items: [] },
  });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  const result = await adapter.getDataByOrderId("org-1", "Shopee", "SP-789");
  assertEquals(result, { order_sn: "SP-789", items: [] });
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter getIdByOrderId: returns id when found", async () => {
  const { mock } = createMockAdmin({ getIdByOrderId: "raw-id-123" });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  const result = await adapter.getIdByOrderId("org-1", "Mercado Livre", "ML-999");
  assertEquals(result, "raw-id-123");
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter getIdByOrderId: returns null when not found", async () => {
  const { mock } = createMockAdmin({ getIdByOrderId: null });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  const result = await adapter.getIdByOrderId("org-1", "Mercado Livre", "missing");
  assertEquals(result, null);
});

Deno.test("SupabaseMarketplaceOrdersRawAdapter updateById: throws when update fails", async () => {
  const { mock } = createMockAdmin({ updateError: "Constraint violation" });
  const adapter = new SupabaseMarketplaceOrdersRawAdapter(mock);
  await assertRejects(
    () => adapter.updateById("id-1", { data: {} }),
    Error,
    "Constraint violation",
  );
});

Deno.test("upsertMarketplaceOrderRaw: delegates to adapter", async () => {
  const upsertCalls: Array<{ row: Record<string, unknown> }> = [];
  const from = (table: string) => {
    if (table !== "marketplace_orders_raw") return {};
    return {
      upsert: (row: Record<string, unknown>) => {
        upsertCalls.push({ row });
        return Promise.resolve({ error: null });
      },
    };
  };
  const mock = { from } as unknown as SupabaseClient;
  await upsertMarketplaceOrderRaw(mock, {
    organizationId: "org-1",
    marketplaceName: "Mercado Livre",
    marketplaceOrderId: "ML-1",
    data: { id: 1 },
    lastSyncedAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });
  assertEquals(upsertCalls.length, 1);
  assertEquals(upsertCalls[0].row.marketplace_order_id, "ML-1");
});
