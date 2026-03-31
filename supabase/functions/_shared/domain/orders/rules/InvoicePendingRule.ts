import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/**
 * Rule for invoice pending states.
 * Shopee orders without invoice are treated as INVOICE_PENDING.
 * Fulfillment orders are explicitly excluded.
 */
export class InvoicePendingRule implements OrderStatusRule {
  readonly name = "InvoicePendingRule";
  readonly status = OrderStatus.INVOICE_PENDING;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.isFulfillment) {
      return false;
    }
    const isInvoicePending = signals.shipmentSubstatus?.toLowerCase() === "invoice_pending";
    const shopeeWithoutInvoice = signals.marketplace === "shopee" && !signals.hasInvoice;
    return isInvoicePending || shopeeWithoutInvoice;
  }
}