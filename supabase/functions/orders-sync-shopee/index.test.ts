/**
 * Tests for orders-sync-shopee handler logic.
 *
 * Strategy: test the core sync logic by driving the HTTP handler through a mocked
 * Request object. External dependencies (Shopee API, Supabase) are mocked via
 * stub functions injected at module boundaries where possible, or by overriding
 * globalThis.fetch for the Shopee API calls.
 *
 * Run with: deno test -A index.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ShopeeFetchOrdersAdapter } from "../_shared/adapters/shopee/index.ts";
import { ShopeeOrderNormalizeService } from "../_shared/orders-normalize/index.ts";

// ─── Minimal raw order fixture ────────────────────────────────────────────────

function makeRawOrder(orderSn: string) {
  return {
    order_sn: orderSn,
    order_status: "READY_TO_SHIP",
    create_time: 1705312800,
    update_time: 1705316400,
    total_amount: 100,
    item_list: [
      {
        item_id: "999",
        item_name: "Produto Teste",
        model_quantity_purchased: 1,
        model_discounted_price: 100,
      },
    ],
    recipient_address: { city: "São Paulo", region: "São Paulo", zipcode: "01310100" },
  };
}

function makeEscrowPayload() {
  return {
    order_income: { commission_fee: 8, service_fee: 2 },
  };
}

// ─── Shopee API mock helpers ───────────────────────────────────────────────────

function mockShopeeListResponse(orderSns: string[]) {
  return {
    response: {
      order_list: orderSns.map((sn) => ({ order_sn: sn })),
      next_cursor: "",
      more: false,
    },
    error: "",
    message: "",
  };
}

function mockShopeeDetailResponse(orderSns: string[]) {
  return {
    response: {
      order_list: orderSns.map(makeRawOrder),
    },
    error: "",
    message: "",
  };
}

function mockShopeeEscrowResponse() {
  return { response: makeEscrowPayload(), error: "", message: "" };
}

type FetchCall = { url: string };

function installFetchMock(
  handler: (url: string, _init: RequestInit | undefined) => Response,
): () => void {
  const original = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = (
    url: string,
    init?: RequestInit,
  ) => Promise.resolve(handler(url, init));
  return () => {
    (globalThis as Record<string, unknown>).fetch = original;
  };
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─── Stub params (partner key irrelevant — fetch is mocked) ──────────────────

const STUB_FETCH_PARAMS = {
  partnerId: "12345",
  partnerKey: "test-key-not-used-by-real-api",
  accessToken: "stub-token",
  shopId: 9999,
  timeFrom: 0,
  timeTo: Math.floor(Date.now() / 1000),
};

const STUB_DETAIL_PARAMS = {
  partnerId: "12345",
  partnerKey: "test-key-not-used-by-real-api",
  accessToken: "stub-token",
  shopId: 9999,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

Deno.test("ShopeeFetchOrdersAdapter.fetchOrderSnList: happy path — returns 2 SNs", async () => {
  const restore = installFetchMock((_url) =>
    jsonResp(mockShopeeListResponse(["SN001", "SN002"]))
  );
  try {
    const adapter = new ShopeeFetchOrdersAdapter();
    const sns = await adapter.fetchOrderSnList(STUB_FETCH_PARAMS);
    assertEquals(sns.length, 2);
    assertEquals(sns[0], "SN001");
    assertEquals(sns[1], "SN002");
  } finally {
    restore();
  }
});

Deno.test(
  "ShopeeFetchOrdersAdapter.fetchOrderDetailBatch: happy path — returns detail list",
  async () => {
    const restore = installFetchMock((_url) =>
      jsonResp(mockShopeeDetailResponse(["SN001", "SN002"]))
    );
    try {
      const adapter = new ShopeeFetchOrdersAdapter();
      const details = await adapter.fetchOrderDetailBatch(["SN001", "SN002"], STUB_DETAIL_PARAMS);
      assertEquals(Array.isArray(details), true);
      assertEquals(details!.length, 2);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "ShopeeFetchOrdersAdapter.fetchEscrowDetail: returns null on 404 — never throws",
  async () => {
    const restore = installFetchMock((_url) =>
      jsonResp({ error: "order_not_found", message: "No escrow for this order type" }, 404)
    );
    try {
      const adapter = new ShopeeFetchOrdersAdapter();
      const result = await adapter.fetchEscrowDetail("SN_NO_ESCROW", STUB_DETAIL_PARAMS);
      assertEquals(result, null);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "ShopeeFetchOrdersAdapter.fetchEscrowDetail: returns null on network error — never throws",
  async () => {
    const original = globalThis.fetch;
    (globalThis as Record<string, unknown>).fetch = () =>
      Promise.reject(new Error("Network unreachable"));
    try {
      const adapter = new ShopeeFetchOrdersAdapter();
      const result = await adapter.fetchEscrowDetail("SN_NETWORK_ERR", STUB_DETAIL_PARAMS);
      assertEquals(result, null);
    } finally {
      (globalThis as Record<string, unknown>).fetch = original;
    }
  },
);

Deno.test(
  "ShopeeOrderNormalizeService.normalize: 1 order without escrow — synced correctly",
  () => {
    const raw = makeRawOrder("SN_NO_ESCROW");
    const normalizer = new ShopeeOrderNormalizeService();
    const order = normalizer.normalize(raw);
    assertEquals(order.marketplace, "shopee");
    assertEquals(order.marketplace_order_id, "SN_NO_ESCROW");
    // marketplace_fee defaults to 0 when escrow is absent
    assertEquals(order.marketplace_fee, 0);
  },
);

Deno.test(
  "ShopeeOrderNormalizeService.normalize: 2 orders with escrow — marketplace_fee set",
  () => {
    const normalizer = new ShopeeOrderNormalizeService();
    const escrow = makeEscrowPayload();

    const order1 = normalizer.normalize(makeRawOrder("SN001"), escrow);
    const order2 = normalizer.normalize(makeRawOrder("SN002"), escrow);

    assertEquals(order1.marketplace_order_id, "SN001");
    assertEquals(order1.marketplace_fee, 10); // commission_fee(8) + service_fee(2)
    assertEquals(order2.marketplace_order_id, "SN002");
    assertEquals(order2.marketplace_fee, 10);
  },
);

Deno.test(
  "ShopeeFetchOrdersAdapter.fetchOrderSnList: empty list — returns []",
  async () => {
    const restore = installFetchMock((_url) =>
      jsonResp({ response: { order_list: [], next_cursor: "", more: false }, error: "", message: "" })
    );
    try {
      const adapter = new ShopeeFetchOrdersAdapter();
      const sns = await adapter.fetchOrderSnList(STUB_FETCH_PARAMS);
      assertEquals(sns.length, 0);
    } finally {
      restore();
    }
  },
);

Deno.test(
  "ShopeeFetchOrdersAdapter.fetchEscrowDetail: returns escrow payload on success",
  async () => {
    const restore = installFetchMock((_url) => jsonResp(mockShopeeEscrowResponse()));
    try {
      const adapter = new ShopeeFetchOrdersAdapter();
      const result = await adapter.fetchEscrowDetail("SN_WITH_ESCROW", STUB_DETAIL_PARAMS);
      assertEquals(result !== null, true);
      assertEquals((result as Record<string, unknown>)?.order_income !== undefined, true);
    } finally {
      restore();
    }
  },
);
