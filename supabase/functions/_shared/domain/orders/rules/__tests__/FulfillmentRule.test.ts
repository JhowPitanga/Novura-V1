import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FulfillmentRule } from "../FulfillmentRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { createProductLinkState } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new FulfillmentRule();
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

Deno.test("FulfillmentRule applies for fulfillment orders", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isFulfillment: true }, createProductLinkState(5)), true);
});

Deno.test("FulfillmentRule does not apply for regular orders", () => {
  assertEquals(rule.appliesTo(baseSignals, createProductLinkState(0)), false);
  assertEquals(rule.status, OrderStatus.SHIPPED);
});