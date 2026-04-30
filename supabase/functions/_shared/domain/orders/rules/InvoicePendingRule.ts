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
    if (signals.isFulfillment) return false;
    if (signals.marketplace === 'mercado_livre') {
      return signals.shipmentStatus === 'ready_to_ship'
        && signals.shipmentSubstatus === 'invoice_pending';
    }
    if (signals.marketplace === 'shopee') {
      const readyStatuses = ['ready_to_ship', 'logistics_ready', 'logistics_request_created'];
      return readyStatuses.includes(signals.shipmentStatus?.toLowerCase() ?? '')
        && !signals.hasInvoice;
    }
    return false;
  }
}