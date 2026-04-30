/**
 * Normalized marketplace signals used to calculate the internal order status.
 *
 * This is the primary input to the OrderStatusEngine. It must be built by
 * marketplace-specific adapters (MlMarketplaceSignalsAdapter,
 * ShopeeMarketplaceSignalsAdapter).
 *
 * Design rationale: each marketplace uses different terminology — ML uses
 * `shipment_status = 'shipped'`, Shopee uses `order_status = 'SHIPPED'`.
 * This interface creates a neutral language that both adapters can produce
 * and that the engine can interpret without knowing which marketplace it is.
 *
 * IMPORTANT: This object contains ONLY the fields needed to determine the status.
 * Buyer data, monetary values, and address details belong to other types.
 */
export interface MarketplaceSignals {
  /** Internal Novura organization ID */
  organizationId: string;

  /** Order ID in the marketplace (e.g. "12345678" in ML, "250330ABCD" in Shopee) */
  marketplaceOrderId: string;

  /** Marketplace name (normalized to lowercase) */
  marketplace: 'mercado_livre' | 'shopee';

  /** Raw order status from the marketplace */
  marketplaceStatus: string;

  /** Shipment / logistics status (when available) */
  shipmentStatus?: string;

  /** Shipment sub-status — additional detail beyond shipmentStatus */
  shipmentSubstatus?: string;

  /**
   * True if the order is a fulfillment order (ML Full, Shopee Full).
   * Fulfillment orders skip intermediate statuses and go directly to SHIPPED.
   */
  isFulfillment: boolean;

  /** True if the order is cancelled (from any source of truth) */
  isCancelled: boolean;

  /** True if the payment was refunded */
  isRefunded: boolean;

  /** True if the order was returned by the buyer */
  isReturned: boolean;

  /** True if the shipping label has been marked as printed */
  isPrintedLabel: boolean;

  /** True if the NF-e has been issued (has an invoice number) */
  hasInvoice: boolean;

  /** Pickup/collection status (Shopee-specific) */
  isPickupDone?: boolean;
}
