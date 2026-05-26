import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CancelledRule } from "../CancelledRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new CancelledRule();
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

Deno.test("CancelledRule applies when cancelled", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isCancelled: true }, FULLY_LINKED), true);
});

Deno.test("CancelledRule applies when refunded", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isRefunded: true }, FULLY_LINKED), true);
});

Deno.test("CancelledRule does not apply for active order", () => {
  assertEquals(rule.appliesTo(baseSignals, FULLY_LINKED), false);
  assertEquals(rule.status, OrderStatus.CANCELLED);
});