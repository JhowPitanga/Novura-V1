import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/** Applies when label has already been printed. */
export class AwaitingPickupRule implements OrderStatusRule {
  readonly name = "AwaitingPickupRule";
  readonly status = OrderStatus.AWAITING_PICKUP;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isPrintedLabel;
  }
}