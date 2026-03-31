import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import type { MarketplaceSignals } from "../../../domain/orders/MarketplaceSignals.ts";
import { createProductLinkState } from "../../../domain/orders/ProductLinkState.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";

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

const engine = new OrderStatusEngine();

const buildSignals = (
  overrides: Partial<MarketplaceSignals> = {},
): MarketplaceSignals => ({
  organizationId: "org-1",
  marketplaceOrderId: "order-1",
  marketplace: "mercado_livre",
  marketplaceStatus: "paid",
  shipmentStatus: "pending",
  shipmentSubstatus: undefined,
  isFulfillment: false,
  isCancelled: false,
  isRefunded: false,
  isReturned: false,
  isPrintedLabel: false,
  hasInvoice: false,
  isPickupDone: false,
  ...overrides,
});

runTest("golden: cancelled + unlinked items = CANCELLED", () => {
  const result = engine.calculate(
    buildSignals({ isCancelled: true }),
    createProductLinkState(2),
  );
  assertEquals(result, OrderStatus.CANCELLED);
});

runTest("critical precedence: cancelled beats unlinked when both match", () => {
  const result = engine.calculate(
    buildSignals({ isCancelled: true, shipmentSubstatus: "invoice_pending" }),
    createProductLinkState(3),
  );
  assertEquals(result, OrderStatus.CANCELLED);
});

runTest("golden: regular order + unlinked items = UNLINKED", () => {
  const result = engine.calculate(buildSignals(), createProductLinkState(1));
  assertEquals(result, OrderStatus.UNLINKED);
});

runTest("golden: fulfillment + unlinked items = SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({ isFulfillment: true, marketplace: "shopee" }),
    createProductLinkState(4),
  );
  assertEquals(result, OrderStatus.SHIPPED);
});