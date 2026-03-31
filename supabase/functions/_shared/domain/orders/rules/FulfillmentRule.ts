import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/** Orders fulfilled by marketplace logistics go directly to SHIPPED. */
export class FulfillmentRule implements OrderStatusRule {
  readonly name = "FulfillmentRule";
  readonly status = OrderStatus.SHIPPED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isFulfillment;
  }
}
