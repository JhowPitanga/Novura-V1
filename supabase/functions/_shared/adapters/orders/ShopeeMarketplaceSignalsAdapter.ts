import type { MarketplaceSignals } from "../../domain/orders/MarketplaceSignals.ts";

export interface ShopeeOrderRaw {
  readonly organizationId: string;
  readonly marketplaceOrderId: string;
  readonly orderStatus: string;
  readonly logisticsStatus?: string;
  readonly logisticsSubstatus?: string;
  readonly isFulfillmentReady?: boolean;
  readonly hasInvoice?: boolean;
  readonly isPickupDone?: boolean;
}

/** Pure translator from Shopee raw payload to MarketplaceSignals. */
export function buildShopeeSignals(raw: ShopeeOrderRaw): MarketplaceSignals {
  const status = raw.orderStatus.toLowerCase();
  const logisticsStatus = raw.logisticsStatus?.toLowerCase() ?? status;
  const logisticsSubstatus = raw.logisticsSubstatus?.toLowerCase();
  return {
    organizationId: raw.organizationId,
    marketplaceOrderId: raw.marketplaceOrderId,
    marketplace: "shopee",
    marketplaceStatus: status,
    shipmentStatus: logisticsStatus,
    shipmentSubstatus: logisticsSubstatus,
    isFulfillment: raw.isFulfillmentReady ?? false,
    isCancelled: status === "cancelled" || status === "in_cancel",
    isRefunded: false,
    isReturned: status === "to_return",
    isPrintedLabel: status === "retry_ship",
    hasInvoice: raw.hasInvoice ?? false,
    isPickupDone: raw.isPickupDone ?? false,
  };
}
