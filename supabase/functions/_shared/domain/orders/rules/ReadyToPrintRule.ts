import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/**
 * Rule for orders ready to print shipping labels.
 * ML: pending/buffered or ready_to_ship/ready_to_print.
 * Shopee & others: matches common ready/processed logistics statuses.
 */
export class ReadyToPrintRule implements OrderStatusRule {
  readonly name = "ReadyToPrintRule";
  readonly status = OrderStatus.READY_TO_PRINT;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.isFulfillment) return false;
    if (signals.marketplace === 'mercado_livre') {
      const isBuffered = signals.shipmentStatus === 'pending'
        && signals.shipmentSubstatus === 'buffered';
      const isReadyToPrint = signals.shipmentStatus === 'ready_to_ship'
        && signals.shipmentSubstatus === 'ready_to_print';
      return isBuffered || isReadyToPrint;
    }
    const readyStatuses = ['ready_to_ship', 'processed', 'logistics_ready', 'logistics_request_created'];
    return readyStatuses.includes(signals.shipmentStatus?.toLowerCase() ?? '')
      || readyStatuses.includes(signals.marketplaceStatus?.toLowerCase() ?? '');
  }
}
