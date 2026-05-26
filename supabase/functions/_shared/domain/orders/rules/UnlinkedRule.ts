import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/**
 * Blocking rule for non-fulfillment orders with unlinked items.
 * Fulfillment orders must not be blocked by product-link state.
 */
export class UnlinkedRule implements OrderStatusRule {
  readonly name = "UnlinkedRule";
  readonly status = OrderStatus.UNLINKED;

  appliesTo(signals: MarketplaceSignals, linkState: ProductLinkState): boolean {
    return !signals.isFulfillment && linkState.unlinkedCount > 0;
  }
}