/**
 * HTTP contract tests for orders-upsert index handler.
 * Tests input validation rules (HTTP 400 cases) and success response shape (HTTP 200 / 422).
 * Mirrors the validation logic in index.ts without importing it (to avoid the serve() side effect).
 *
 * Run with: deno test -A index.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import type { UpsertOrderInput } from "../_shared/domain/orders/orders-types.ts";
import { upsertOrder } from "./upsert-order.ts";
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";

// ---------------------------------------------------------------------------
// Minimal mock Supabase client — always succeeds, returns a fixed order ID
// ---------------------------------------------------------------------------

const SUCCESS_ORDER_ID = "mock-order-id";

function makeSuccessMock(): SupabaseClient {
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
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
        upsert: (_row: unknown, _opts?: unknown) => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: { id: SUCCESS_ORDER_ID }, error: null }),
          }),
        }),
      };
    }
    if (table === "order_status_history") {
      return { insert: () => makeThenable(undefined) };
    }
    if (table === "order_items") {
      return {
        delete: () => ({ eq: () => makeThenable({ error: null }) }),
        insert: () => makeThenable({ error: null }),
      };
    }
    if (table === "order_shipping") {
      return { upsert: () => makeThenable(undefined) };
    }
    return {};
  };

  return { from } as unknown as SupabaseClient;
}

function makeFailMock(): SupabaseClient {
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
              Promise.resolve({ data: null, error: { message: "DB write failed" } }),
          }),
        }),
      };
    }
    return {};
  };
  return { from } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Handler that mirrors index.ts validation — same conditions, same responses
// ---------------------------------------------------------------------------

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: UpsertOrderInput;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Missing or invalid request body" }, 400);
  }

  const organization_id = body?.organization_id;
  const order = body?.order;
  const source = body?.source ?? "sync";

  if (!organization_id || !order?.marketplace_order_id || !order?.marketplace) {
    return jsonResponse(
      { error: "Missing organization_id, order.marketplace, or order.marketplace_order_id" },
      400,
    );
  }
  if (source !== "webhook" && source !== "sync") {
    return jsonResponse({ error: "source must be 'webhook' or 'sync'" }, 400);
  }

  const db = req.headers.get("x-test-fail") === "1" ? makeFailMock() : makeSuccessMock();
  const result = await upsertOrder(db, {
    organization_id: organization_id as string,
    order: order as UpsertOrderInput["order"],
    source: source as UpsertOrderInput["source"],
  });

  if (!result.success) {
    return jsonResponse(
      { success: false, order_id: result.order_id, created: false, error: result.error },
      422,
    );
  }

  return jsonResponse({ success: true, order_id: result.order_id, created: result.created }, 200);
}

// ---------------------------------------------------------------------------
// Minimal valid order body helper
// ---------------------------------------------------------------------------

function validBody(overrides: Partial<UpsertOrderInput> = {}): string {
  const base: UpsertOrderInput = {
    organization_id: "org-1",
    source: "sync",
    order: {
      marketplace: "mercado_livre",
      marketplace_order_id: "ML-TEST-001",
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
      items: [],
      shipping: null,
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function post(body: string, extra?: Record<string, string>): Request {
  return new Request("http://localhost/orders-upsert", {
    method: "POST",
    headers: { "content-type": "application/json", ...extra },
    body,
  });
}

// ---------------------------------------------------------------------------
// Test cases 4–6: HTTP 400 input validation
// Note: We use raw JSON strings to test invalid/incomplete payloads that
// TypeScript's type system would otherwise reject at compile time.
// ---------------------------------------------------------------------------

Deno.test("HTTP handler: missing organization_id returns 400", async () => {
  const body = `{"source":"sync","order":{"marketplace":"mercado_livre","marketplace_order_id":"ML-001"}}`;
  const res = await handler(post(body));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(typeof json.error, "string");
});

Deno.test("HTTP handler: missing order.marketplace_order_id returns 400", async () => {
  const body = `{"organization_id":"org-1","source":"sync","order":{"marketplace":"mercado_livre"}}`;
  const res = await handler(post(body));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(typeof json.error, "string");
});

Deno.test("HTTP handler: invalid source value returns 400", async () => {
  const body = `{"organization_id":"org-1","source":"cron_job","order":{"marketplace":"mercado_livre","marketplace_order_id":"ML-001"}}`;
  const res = await handler(post(body));
  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(typeof json.error, "string");
});

// ---------------------------------------------------------------------------
// Test case 7: DB failure returns HTTP 422 with success: false
// ---------------------------------------------------------------------------

Deno.test("HTTP handler: DB failure returns 422 with success: false", async () => {
  const res = await handler(post(validBody(), { "x-test-fail": "1" }));
  assertEquals(res.status, 422);
  const json = await res.json();
  assertEquals(json.success, false);
  assertEquals(json.order_id, null);
  assertEquals(typeof json.error, "string");
});
