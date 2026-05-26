import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ReadyToPrintRule } from "../ReadyToPrintRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new ReadyToPrintRule();
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

Deno.test("ReadyToPrintRule applies for ready_to_print substatus", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentSubstatus: "ready_to_print" }, FULLY_LINKED), true);
});

Deno.test("ReadyToPrintRule applies for buffered and pending substatus", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentSubstatus: "buffered" }, FULLY_LINKED), true);
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentSubstatus: "pending" }, FULLY_LINKED), true);
});

Deno.test("ReadyToPrintRule applies for Shopee order with invoice", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, marketplace: "shopee", hasInvoice: true }, FULLY_LINKED), true);
  assertEquals(rule.status, OrderStatus.READY_TO_PRINT);
});