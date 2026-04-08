import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PendingRule } from "../PendingRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { createProductLinkState } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new PendingRule();

const signals: MarketplaceSignals = {
  organizationId: "org-1",
  marketplaceOrderId: "o-1",
  marketplace: "mercado_livre",
  marketplaceStatus: "unknown",
  isFulfillment: false,
  isCancelled: false,
  isRefunded: false,
  isReturned: false,
  isPrintedLabel: false,
  hasInvoice: false,
};

Deno.test("PendingRule always applies", () => {
  assertEquals(rule.appliesTo(signals, createProductLinkState(99)), true);
  assertEquals(rule.status, OrderStatus.PENDING);
});