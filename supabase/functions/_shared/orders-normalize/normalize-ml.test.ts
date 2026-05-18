/**
 * Unit tests for orders-normalize ML. Run with: deno test -A normalize-ml.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MlOrderNormalizeService } from "./ml-order-normalize-service.ts";
import type { MlOrderResponse } from "./ml-order-normalize-service.ts";

Deno.test("normalizeOrderMl: minimal order with one item", () => {
  const raw = {
    id: 123456789,
    status: "paid",
    date_created: "2024-01-15T10:00:00.000-03:00",
    last_updated: "2024-01-15T11:00:00.000-03:00",
    order_items: [
      {
        quantity: 2,
        unit_price: 49.9,
        item: { id: "MLB123", title: "Produto Teste", seller_sku: "SKU-01" },
      },
    ],
    payments: [],
    shipping: null,
    buyer: null,
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.marketplace, "mercado_livre");
  assertEquals(out.marketplace_order_id, "123456789");
  assertEquals(out.marketplace_status, "paid");
  assertEquals(out.gross_amount, 2 * 49.9);
  assertEquals(out.items.length, 1);
  assertEquals(out.items[0].title, "Produto Teste");
  assertEquals(out.items[0].quantity, 2);
  assertEquals(out.items[0].unit_price, 49.9);
  assertEquals(out.items[0].marketplace_item_id, "MLB123");
  assertExists(out.created_at);
});

Deno.test("normalizeOrderMl: marketplace_fee from ml_fee", () => {
  const raw = {
    id: 999,
    status: "paid",
    date_created: "2024-01-01T00:00:00Z",
    order_items: [{ quantity: 1, unit_price: 100, item: { id: "i1", title: "T" } }],
    payments: [
      {
        fee_details: [
          { type: "ml_fee", amount: 15.5 },
          { type: "other", amount: 1 },
        ],
      },
    ],
    shipping: null,
    buyer: null,
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.gross_amount, 100);
  assertEquals(out.marketplace_fee, 15.5);
});

Deno.test("normalizeOrderMl: shipping and receiver_address state", () => {
  const raw = {
    id: 888,
    status: "shipped",
    date_created: "2024-02-01T00:00:00Z",
    order_items: [],
    payments: [],
    shipping: {
      base_cost: 20,
      cost: 15,
      receiver_address: {
        state: { id: "BR-SP" },
        city: { name: "Sao Paulo" },
        zip_code: "01310-100",
        street_name: "Av Paulista",
        street_number: "1000",
      },
    },
    buyer: null,
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.marketplace_status, "shipped");
  assertEquals(out.shipping_cost, 20);
  assertEquals(out.shipping_subsidy, 5);
  assertEquals(out.buyer_state, "SP");
  assertExists(out.shipping);
  assertEquals(out.shipping!.state_uf, "SP");
  assertEquals(out.shipping!.city, "Sao Paulo");
  assertEquals(out.shipping!.zip_code, "01310-100");
});

Deno.test("normalizeOrderMl: empty order_items", () => {
  const raw = {
    id: 777,
    status: "pending",
    date_created: "2024-01-01T00:00:00Z",
    order_items: [],
    payments: [],
    shipping: null,
    buyer: null,
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.items.length, 0);
  assertEquals(out.gross_amount, 0);
  assertEquals(out.marketplace_status, "pending");
});

Deno.test("normalizeOrderMl: cancelled order has canceled_at", () => {
  const raw = {
    id: 666,
    status: "cancelled",
    date_created: "2024-01-01T00:00:00Z",
    last_updated: "2024-01-02T00:00:00Z",
    order_items: [],
    payments: [],
    shipping: null,
    buyer: null,
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.marketplace_status, "cancelled");
  assertExists(out.canceled_at);
});

Deno.test("normalizeOrderMl: buyer name and document", () => {
  const raw = {
    id: 555,
    status: "paid",
    date_created: "2024-01-01T00:00:00Z",
    order_items: [],
    payments: [],
    shipping: null,
    buyer: {
      first_name: "Joao",
      last_name: "Silva",
      billing_info: { doc_number: "12345678900" },
    },
  };
  const out = new MlOrderNormalizeService().normalize(raw as unknown as MlOrderResponse);
  assertEquals(out.buyer_name, "Joao Silva");
  assertEquals(out.buyer_document, "12345678900");
});
