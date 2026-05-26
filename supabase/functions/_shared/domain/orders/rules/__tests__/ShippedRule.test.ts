import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ShippedRule } from "../ShippedRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new ShippedRule();
const baseSignals: MarketplaceSignals = {
  organizationId: "org-1",
  marketplaceOrderId: "o-1",
  marketplace: "mercado_livre",
  marketplaceStatus: "paid",
  isFulfillment: false,
  isCancelled: false,
  isRefunded: false,
  isReturned: false,
  isPrintedLabel: false,
  hasInvoice: false,
};

Deno.test("ShippedRule applies for shipped status", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentStatus: "shipped" }, FULLY_LINKED), true);
});

Deno.test("ShippedRule applies for delivered status", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentStatus: "delivered" }, FULLY_LINKED), true);
});

Deno.test("ShippedRule applies for in_transit status", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentStatus: "in_transit" }, FULLY_LINKED), true);
});

Deno.test("ShippedRule applies for fulfillment", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isFulfillment: true }, FULLY_LINKED), true);
  assertEquals(rule.status, OrderStatus.SHIPPED);
});