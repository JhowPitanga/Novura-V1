import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import type { MarketplaceSignals } from "../../../domain/orders/MarketplaceSignals.ts";
import { createProductLinkState, FULLY_LINKED } from "../../../domain/orders/ProductLinkState.ts";
import { OrderStatus } from "../../../domain/orders/OrderStatus.ts";

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

// 1. Cancelled overrides unlinked
Deno.test("cancelled overrides unlinked", () => {
  const result = engine.calculate(
    buildSignals({ isCancelled: true }),
    createProductLinkState(2),
  );
  assertEquals(result, OrderStatus.CANCELLED);
});

// 2. Refunded → CANCELLED
Deno.test("refunded → CANCELLED", () => {
  const result = engine.calculate(
    buildSignals({ isRefunded: true }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.CANCELLED);
});

// 3. Returned → RETURNED
Deno.test("returned → RETURNED", () => {
  const result = engine.calculate(
    buildSignals({ isReturned: true }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.RETURNED);
});

// 4. Fulfillment ignores unlinked → SHIPPED
Deno.test("fulfillment ignores unlinked → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({ isFulfillment: true, marketplace: "shopee" }),
    createProductLinkState(4),
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 5. Unlinked blocks READY_TO_PRINT
Deno.test("unlinked blocks READY_TO_PRINT", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "ready_to_print",
    }),
    createProductLinkState(1),
  );
  assertEquals(result, OrderStatus.UNLINKED);
});

// 6. ML ready_to_ship + invoice_pending → INVOICE_PENDING
Deno.test("ML ready_to_ship + invoice_pending → INVOICE_PENDING", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "invoice_pending",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});

// 7. ML pending/buffered → READY_TO_PRINT
Deno.test("ML pending/buffered → READY_TO_PRINT", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "pending",
      shipmentSubstatus: "buffered",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.READY_TO_PRINT);
});

// 8. ML ready_to_ship/ready_to_print → READY_TO_PRINT
Deno.test("ML ready_to_ship/ready_to_print → READY_TO_PRINT", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "ready_to_print",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.READY_TO_PRINT);
});

// 9. ML isPrintedLabel + ready_to_ship → AWAITING_PICKUP
Deno.test("ML isPrintedLabel + ready_to_ship → AWAITING_PICKUP", () => {
  const result = engine.calculate(
    buildSignals({
      isPrintedLabel: true,
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "ready_to_print",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

// 10. ML shipped → SHIPPED
Deno.test("ML shipped → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({ shipmentStatus: "shipped" }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 11. ML in_transit → SHIPPED
Deno.test("ML in_transit → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({ shipmentStatus: "in_transit" }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 12. ML delivered → SHIPPED
Deno.test("ML delivered → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({ shipmentStatus: "delivered" }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 13. Shopee ready_to_ship without NF → INVOICE_PENDING
Deno.test("Shopee ready_to_ship without NF → INVOICE_PENDING", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "READY_TO_SHIP",
      shipmentStatus: "ready_to_ship",
      hasInvoice: false,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});

// 14. Shopee retry_ship → AWAITING_PICKUP
Deno.test("Shopee retry_ship → AWAITING_PICKUP", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "RETRY_SHIP",
      shipmentStatus: "retry_ship",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

// 15. Shopee shipped → SHIPPED
Deno.test("Shopee shipped → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "SHIPPED",
      shipmentStatus: "shipped",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 16. Shopee completed → SHIPPED
Deno.test("Shopee completed → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "COMPLETED",
      shipmentStatus: "completed",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 17. Shopee isPickupDone → SHIPPED
Deno.test("Shopee isPickupDone → SHIPPED", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "IN_TRANSIT",
      shipmentStatus: "in_transit",
      isPickupDone: true,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// 18. Unknown → PENDING
Deno.test("unknown signals → PENDING", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "some_unknown_status",
      marketplaceStatus: "unknown",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.PENDING);
});

// N2 AwaitingPickupRule Shopee scenarios
Deno.test("N2: Shopee isPrintedLabel=true → AWAITING_PICKUP (not INVOICE_PENDING)", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "READY_TO_SHIP",
      shipmentStatus: "ready_to_ship",
      isPrintedLabel: true,
      hasInvoice: true,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

Deno.test("N2: Shopee retry_ship without isPrintedLabel → AWAITING_PICKUP", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "RETRY_SHIP",
      shipmentStatus: "retry_ship",
      isPrintedLabel: false,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

Deno.test("N2: Shopee fulfillment + isPrintedLabel → SHIPPED (not AWAITING_PICKUP)", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "SHIPPED",
      shipmentStatus: "shipped",
      isFulfillment: true,
      isPrintedLabel: true,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

Deno.test("N2: Shopee ready_to_ship without isPrintedLabel and without retry_ship → INVOICE_PENDING", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "READY_TO_SHIP",
      shipmentStatus: "ready_to_ship",
      isPrintedLabel: false,
      hasInvoice: false,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});

// N1 priority scenarios: verify new rule order
// N1-1. ML shipped wins over AwaitingPickup even when isPrintedLabel=true
Deno.test("N1: ML shipped with isPrintedLabel=true → SHIPPED (ShippedRule before AwaitingPickupRule)", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "shipped",
      isPrintedLabel: true,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// N1-2. ML shipped wins over InvoicePending even when hasInvoice=false
Deno.test("N1: ML shipped with no invoice → SHIPPED (ShippedRule before InvoicePendingRule)", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "shipped",
      hasInvoice: false,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

// N1-3. ML isPrintedLabel + ready_to_ship → AWAITING_PICKUP (not READY_TO_PRINT)
Deno.test("N1: ML isPrintedLabel=true + ready_to_ship → AWAITING_PICKUP", () => {
  const result = engine.calculate(
    buildSignals({
      isPrintedLabel: true,
      shipmentStatus: "ready_to_ship",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

// N1-4. ML invoice_pending → INVOICE_PENDING (not READY_TO_PRINT)
Deno.test("N1: ML invoice_pending subStatus → INVOICE_PENDING (not READY_TO_PRINT)", () => {
  const result = engine.calculate(
    buildSignals({
      shipmentStatus: "ready_to_ship",
      shipmentSubstatus: "invoice_pending",
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});

// N1-5. Shopee ready_to_ship without invoice → INVOICE_PENDING (not READY_TO_PRINT)
Deno.test("N1: Shopee ready_to_ship without invoice → INVOICE_PENDING (not READY_TO_PRINT)", () => {
  const result = engine.calculate(
    buildSignals({
      marketplace: "shopee",
      marketplaceStatus: "READY_TO_SHIP",
      shipmentStatus: "ready_to_ship",
      hasInvoice: false,
    }),
    FULLY_LINKED,
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});
