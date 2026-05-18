import { AwaitingPickupRule } from "../AwaitingPickupRule.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed. Expected: ${String(expected)}. Actual: ${String(actual)}`);
  }
}

function runTest(name: string, fn: () => void): void {
  const denoApi = globalThis as unknown as {
    Deno?: { test?: (testName: string, testFn: () => void) => void };
  };
  const testFn = denoApi.Deno?.test;
  if (!testFn) {
    throw new Error("Deno.test is not available in this runtime.");
  }
  testFn(name, fn);
}

const rule = new AwaitingPickupRule();
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

runTest("AwaitingPickupRule applies when label is printed", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isPrintedLabel: true }, FULLY_LINKED), true);
});

runTest("AwaitingPickupRule does not apply when label is not printed", () => {
  assertEquals(rule.appliesTo(baseSignals, FULLY_LINKED), false);
  assertEquals(rule.status, OrderStatus.AWAITING_PICKUP);
});