/**
 * Unit tests for orders-normalize Shopee. Run with: deno test -A normalize-shopee.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ShopeeOrderNormalizeService } from "./shopee-order-normalize-service.ts";

Deno.test("normalizeOrderShopee: minimal order with one item", () => {
  const raw = {
    order_sn: "240115ABC123",
    order_status: "READY_TO_SHIP",
    create_time: 1705312800,
    update_time: 1705316400,
    item_list: [
      {
        item_id: "100001",
        item_name: "Produto Shopee",
        model_quantity_purchased: 3,
        model_discounted_price: 25.5,
        model_sku: "SKU-SHOP",
      },
    ],
    total_amount: 76.5,
    recipient_address: {
      city: "São Paulo",
      region: "São Paulo",
      zipcode: "01310100",
      full_address: "Av Paulista 1000",
    },
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw);
  assertEquals(out.marketplace, "shopee");
  assertEquals(out.marketplace_order_id, "240115ABC123");
  assertEquals(out.marketplace_status, "READY_TO_SHIP");
  assertEquals(out.items.length, 1);
  assertEquals(out.items[0].title, "Produto Shopee");
  assertEquals(out.items[0].quantity, 3);
  assertEquals(out.items[0].unit_price, 25.5);
  assertEquals(out.items[0].marketplace_item_id, "100001");
  assertExists(out.created_at);
  assertEquals(out.buyer_state, "SP");
  assertExists(out.shipping);
  assertEquals(out.shipping!.city, "São Paulo");
});

Deno.test("normalizeOrderShopee: gross_amount from total_amount", () => {
  const raw = {
    order_sn: "999",
    order_status: "COMPLETED",
    create_time: 1705312800,
    item_list: [{ item_id: "1", item_name: "X", model_quantity_purchased: 1, model_discounted_price: 50 }],
    total_amount: 55,
    recipient_address: null,
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw);
  assertEquals(out.gross_amount, 55);
});

Deno.test("normalizeOrderShopee: marketplace_fee from escrow", () => {
  const raw = {
    order_sn: "888",
    order_status: "PAID",
    create_time: 1705312800,
    item_list: [{ item_id: "1", item_name: "Y", model_quantity_purchased: 1, model_discounted_price: 100 }],
    recipient_address: null,
  };
  const escrow = {
    response: {
      order_income: {
        commission_fee: 10,
        service_fee: 2,
      },
    },
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw, escrow);
  assertEquals(out.marketplace_fee, 12);
  assertEquals(out.gross_amount, 100);
});

Deno.test("normalizeOrderShopee: shipping from recipient_address and package", () => {
  const raw = {
    order_sn: "777",
    order_status: "SHIPPED",
    create_time: 1705312800,
    item_list: [],
    recipient_address: {
      city: "Curitiba",
      region: "Paraná",
      zipcode: "80010000",
      full_address: "Rua XV 100",
      phone: "41999999999",
    },
    package_list: [
      {
        package_number: "PKG123",
        tracking_no: "TRACK456",
        logistics_status: "SHIPPED",
        shipping_carrier: "Correios",
      },
    ],
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw);
  assertEquals(out.buyer_state, "PR");
  assertEquals(out.buyer_phone, "41999999999");
  assertExists(out.shipping);
  assertEquals(out.shipping!.tracking_number, "TRACK456");
  assertEquals(out.shipping!.carrier, "Correios");
  assertEquals(out.shipping!.status, "SHIPPED");
  assertEquals(out.shipping!.state_uf, "PR");
});

Deno.test("normalizeOrderShopee: cancelled has canceled_at", () => {
  const raw = {
    order_sn: "666",
    order_status: "CANCELLED",
    create_time: 1705312800,
    update_time: 1705400000,
    item_list: [],
    recipient_address: null,
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw);
  assertEquals(out.marketplace_status, "CANCELLED");
  assertExists(out.canceled_at);
});

Deno.test("normalizeOrderShopee: empty item_list", () => {
  const raw = {
    order_sn: "555",
    order_status: "UNPAID",
    create_time: 1705312800,
    item_list: [],
    total_amount: 0,
    recipient_address: null,
  };
  const out = new ShopeeOrderNormalizeService().normalize(raw);
  assertEquals(out.items.length, 0);
  assertEquals(out.gross_amount, 0);
});
