import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ReturnedRule } from "../ReturnedRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new ReturnedRule();
const baseSignals: MarketplaceSignals = {
  organizationId: "org-1",
  marketplaceOrderId: "o-1",
  marketplace: "shopee",
  marketplaceStatus: "ready_to_ship",
  isFulfillment: false,
  isCancelled: false,
  isRefunded: false,
  isReturned: false,
  isPrintedLabel: false,
  hasInvoice: false,
};

Deno.test("ReturnedRule applies when isReturned is true", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isReturned: true }, FULLY_LINKED), true);
});

Deno.test("ReturnedRule does not apply when isReturned is false", () => {
  assertEquals(rule.appliesTo(baseSignals, FULLY_LINKED), false);
  assertEquals(rule.status, OrderStatus.RETURNED);
});