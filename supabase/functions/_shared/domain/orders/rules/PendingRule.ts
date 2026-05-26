import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/** Final fallback rule: always returns PENDING. */
export class PendingRule implements OrderStatusRule {
  readonly name = "PendingRule";
  readonly status = OrderStatus.PENDING;

  appliesTo(_signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return true;
  }
}