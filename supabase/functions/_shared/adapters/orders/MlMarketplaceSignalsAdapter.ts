import type { MarketplaceSignals } from "../../domain/orders/MarketplaceSignals.ts";

export interface MlOrderRaw {
  readonly organizationId: string;
  readonly marketplaceOrderId: string;
  readonly status: string;
  readonly paymentStatus?: string;
  readonly shipping?: { readonly status?: string; readonly substatus?: string; readonly logistic_type?: string };
  readonly hasInvoice?: boolean;
  readonly isPrintedLabel?: boolean;
}

/** Pure translator from Mercado Livre raw payload to MarketplaceSignals. */
export function buildMlSignals(raw: MlOrderRaw): MarketplaceSignals {
  const status = raw.status.toLowerCase();
  const paymentStatus = raw.paymentStatus?.toLowerCase() ?? "";
  const shippingStatus = raw.shipping?.status?.toLowerCase();
  const shippingSubstatus = raw.shipping?.substatus?.toLowerCase();
  const logisticType = raw.shipping?.logistic_type?.toLowerCase();
  return {
    organizationId: raw.organizationId,
    marketplaceOrderId: raw.marketplaceOrderId,
    marketplace: "mercado_livre",
    marketplaceStatus: status,
    shipmentStatus: shippingStatus,
    shipmentSubstatus: shippingSubstatus,
    isFulfillment: logisticType === "fulfillment",
    isCancelled: status === "cancelled" || status === "pending_cancel",
    isRefunded: paymentStatus === "refunded",
    isReturned: status === "returned_to_warehouse",
    isPrintedLabel: raw.isPrintedLabel ?? false,
    hasInvoice: raw.hasInvoice ?? false,
  };
}
