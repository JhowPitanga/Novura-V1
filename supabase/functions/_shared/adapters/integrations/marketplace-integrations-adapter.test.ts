/**
 * Unit tests for SupabaseMarketplaceIntegrationsAdapter. Uses mock Supabase client.
 * Run with: deno test -A marketplace-integrations-adapter.test.ts
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "./marketplace-integrations-adapter.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IntegrationRow } from "../../domain/integration-types.ts";

const SELECT_COLUMNS =
  "id, access_token, refresh_token, expires_in, meli_user_id, organizations_id, config, marketplace_name";

function createMockAdmin(options: {
  getIntegration?: { row: IntegrationRow | null; error?: { message: string } };
  getByMeliUserId?: { row: IntegrationRow | null };
  getByShopId?: { rows: IntegrationRow[] };
  updateTokensError?: string;
}) {
  const updatePayloads: Array<{ id: string; payload: Record<string, unknown> }> = [];
  const from = (table: string) => {
    if (table !== "marketplace_integrations") return {};
    return {
      select: (cols: string) => ({
        eq: (col: string, val: string | number) => {
          if (col === "id") {
            const { row, error } = options.getIntegration ?? { row: null, error: { message: "not found" } };
            return {
              eq: (c2: string, v2: string) => {
                if (c2 === "marketplace_name") {
                  return {
                    single: () => Promise.resolve({ data: row, error: error ?? null }),
                  };
                }
                return { single: () => Promise.resolve({ data: row, error: error ?? null }) };
              },
              single: () => Promise.resolve({ data: row, error: error ?? null }),
            };
          }
          if (col === "meli_user_id") {
            const row = options.getByMeliUserId?.row ?? null;
            return {
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: row, error: null }),
              }),
            };
          }
          if (col === "marketplace_name") {
            const rows = options.getByShopId?.rows ?? [];
            return {
              then: (fn: (r: unknown) => unknown) =>
                Promise.resolve({ data: rows, error: null }).then(fn),
            };
          }
          return {};
        },
      }),
      update: (payload: Record<string, unknown>) => {
        return {
          eq: (_col: string, id: string) => {
            updatePayloads.push({ id, payload });
            const err = options.updateTokensError;
            return Promise.resolve({ error: err ? { message: err } : null });
          },
        };
      },
    };
  };
  const mock = { from } as unknown as SupabaseClient;
  return { mock, updatePayloads };
}

Deno.test("getIntegration: returns row when found", async () => {
  const row: IntegrationRow = {
    id: "int-1",
    access_token: "enc-token",
    refresh_token: "enc-refresh",
    expires_in: "2025-01-01T00:00:00Z",
    meli_user_id: "12345",
    organizations_id: "org-1",
    config: null,
    marketplace_name: "Mercado Livre",
  };
  const { mock } = createMockAdmin({ getIntegration: { row } });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  const result = await adapter.getIntegration("int-1", { marketplaceName: "Mercado Livre" });
  assertEquals(result.id, "int-1");
  assertEquals(result.organizations_id, "org-1");
  assertEquals(result.meli_user_id, "12345");
});

Deno.test("getIntegration: throws when not found", async () => {
  const { mock } = createMockAdmin({
    getIntegration: { row: null, error: { message: "Integration not found" } },
  });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  await assertRejects(
    () => adapter.getIntegration("missing"),
    Error,
    "Integration not found",
  );
});

Deno.test("getIntegrationByMeliUserId: returns row when found", async () => {
  const row: IntegrationRow = {
    id: "int-2",
    access_token: "t",
    refresh_token: null,
    expires_in: null,
    meli_user_id: "999",
    organizations_id: "org-2",
    marketplace_name: "Mercado Livre",
  };
  const { mock } = createMockAdmin({ getByMeliUserId: { row } });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  const result = await adapter.getIntegrationByMeliUserId("999", "Mercado Livre");
  assertEquals(result?.id, "int-2");
  assertEquals(result?.meli_user_id, "999");
});

Deno.test("getIntegrationByMeliUserId: returns null when not found", async () => {
  const { mock } = createMockAdmin({ getByMeliUserId: { row: null } });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  const result = await adapter.getIntegrationByMeliUserId("none", "Mercado Livre");
  assertEquals(result, null);
});

Deno.test("getIntegrationByShopId: finds by config.shopee_shop_id", async () => {
  const row: IntegrationRow = {
    id: "shop-int",
    access_token: "t",
    refresh_token: null,
    expires_in: null,
    meli_user_id: "0",
    organizations_id: "org-3",
    config: { shopee_shop_id: 12345 },
    marketplace_name: "Shopee",
  };
  const { mock } = createMockAdmin({ getByShopId: { rows: [row] } });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  const result = await adapter.getIntegrationByShopId(12345, "Shopee");
  assertEquals(result?.id, "shop-int");
  assertEquals((result?.config as { shopee_shop_id?: number })?.shopee_shop_id, 12345);
});

Deno.test("getIntegrationByShopId: returns null when no matching row", async () => {
  const { mock } = createMockAdmin({ getByShopId: { rows: [] } });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  const result = await adapter.getIntegrationByShopId(999, "Shopee");
  assertEquals(result, null);
});

Deno.test("updateTokens: calls update with payload", async () => {
  const { mock, updatePayloads } = createMockAdmin({});
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  await adapter.updateTokens("int-1", {
    access_token: "new-token",
    refresh_token: "new-refresh",
    expires_in: "2025-06-01T00:00:00Z",
    meli_user_id: "seller-1",
  });
  assertEquals(updatePayloads.length, 1);
  assertEquals(updatePayloads[0].id, "int-1");
  assertEquals(updatePayloads[0].payload.access_token, "new-token");
  assertEquals(updatePayloads[0].payload.refresh_token, "new-refresh");
  assertEquals(updatePayloads[0].payload.expires_in, "2025-06-01T00:00:00Z");
  assertEquals(updatePayloads[0].payload.meli_user_id, "seller-1");
});

Deno.test("updateTokens: throws when update fails", async () => {
  const { mock } = createMockAdmin({ updateTokensError: "DB error" });
  const adapter = new SupabaseMarketplaceIntegrationsAdapter(mock);
  await assertRejects(
    () => adapter.updateTokens("int-1", { access_token: "t" }),
    Error,
    "Failed to update tokens",
  );
});
