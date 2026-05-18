import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { InvoicePendingRule } from "../InvoicePendingRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

const rule = new InvoicePendingRule();
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

Deno.test("InvoicePendingRule applies for invoice_pending substatus", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, shipmentSubstatus: "invoice_pending" }, FULLY_LINKED), true);
});

Deno.test("InvoicePendingRule: Shopee without invoice applies", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, marketplace: "shopee", hasInvoice: false }, FULLY_LINKED), true);
});

Deno.test("InvoicePendingRule: Shopee with invoice does not apply", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, marketplace: "shopee", hasInvoice: true }, FULLY_LINKED), false);
});

Deno.test("InvoicePendingRule excludes fulfillment", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isFulfillment: true, shipmentSubstatus: "invoice_pending" }, FULLY_LINKED), false);
  assertEquals(rule.status, OrderStatus.INVOICE_PENDING);
});