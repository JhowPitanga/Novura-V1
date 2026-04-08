import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/** Highest-priority rule: cancelled or refunded orders are CANCELLED. */
export class CancelledRule implements OrderStatusRule {
  readonly name = "CancelledRule";
  readonly status = OrderStatus.CANCELLED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isCancelled || signals.isRefunded;
  }
}