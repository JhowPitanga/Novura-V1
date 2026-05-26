import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMlSignals } from "../../MlMarketplaceSignalsAdapter.ts";
import { buildShopeeSignals } from "../../ShopeeMarketplaceSignalsAdapter.ts";

Deno.test("buildMlSignals maps paid + ready_to_print", () => {
  const signals = buildMlSignals({
    organizationId: "org-1",
    marketplaceOrderId: "ml-1",
    status: "paid",
    shipping: { status: "ready_to_ship", substatus: "ready_to_print", logistic_type: "cross_docking" },
    hasInvoice: true,
  });
  assertEquals(signals.marketplace, "mercado_livre");
  assertEquals(signals.marketplaceStatus, "paid");
  assertEquals(signals.shipmentStatus, "ready_to_ship");
  assertEquals(signals.shipmentSubstatus, "ready_to_print");
  assertEquals(signals.isFulfillment, false);
  assertEquals(signals.hasInvoice, true);
});

Deno.test("buildMlSignals maps fulfillment and refunded", () => {
  const signals = buildMlSignals({
    organizationId: "org-1",
    marketplaceOrderId: "ml-2",
    status: "paid",
    paymentStatus: "refunded",
    shipping: { logistic_type: "fulfillment" },
  });
  assertEquals(signals.isFulfillment, true);
  assertEquals(signals.isRefunded, true);
});

Deno.test("buildShopeeSignals maps ready_to_ship with invoice", () => {
  const signals = buildShopeeSignals({
    organizationId: "org-1",
    marketplaceOrderId: "sp-1",
    orderStatus: "READY_TO_SHIP",
    logisticsStatus: "LOGISTICS_READY",
    hasInvoice: true,
  });
  assertEquals(signals.marketplace, "shopee");
  assertEquals(signals.marketplaceStatus, "ready_to_ship");
  assertEquals(signals.shipmentStatus, "logistics_ready");
  assertEquals(signals.hasInvoice, true);
  assertEquals(signals.isCancelled, false);
});

Deno.test("buildShopeeSignals maps retry_ship as printed label", () => {
  const signals = buildShopeeSignals({
    organizationId: "org-1",
    marketplaceOrderId: "sp-2",
    orderStatus: "retry_ship",
    isPickupDone: true,
  });
  assertEquals(signals.isPrintedLabel, true);
  assertEquals(signals.isPickupDone, true);
});
