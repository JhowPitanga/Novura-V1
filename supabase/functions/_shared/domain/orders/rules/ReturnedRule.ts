import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/** Returns RETURNED when marketplace marks the order as returned. */
export class ReturnedRule implements OrderStatusRule {
  readonly name = "ReturnedRule";
  readonly status = OrderStatus.RETURNED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isReturned;
  }
}