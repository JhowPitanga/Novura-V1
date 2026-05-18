import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { UnlinkedRule } from "../UnlinkedRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { createProductLinkState } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new UnlinkedRule();
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

Deno.test("UnlinkedRule does not apply for fulfillment even with unlinked items", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isFulfillment: true }, createProductLinkState(3)), false);
});

Deno.test("UnlinkedRule applies for non-fulfillment with unlinked items", () => {
  assertEquals(rule.appliesTo(baseSignals, createProductLinkState(2)), true);
});

Deno.test("UnlinkedRule does not apply when all items are linked", () => {
  assertEquals(rule.appliesTo(baseSignals, createProductLinkState(0)), false);
  assertEquals(rule.status, OrderStatus.UNLINKED);
});