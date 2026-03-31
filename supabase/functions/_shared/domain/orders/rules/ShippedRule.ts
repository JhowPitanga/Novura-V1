import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

const SHIPPED_STATES = new Set(["shipped", "delivered", "in_transit"]);

/**
 * Shipped rule for dispatched logistics states.
 * Fulfillment orders are treated as SHIPPED by design.
 */
export class ShippedRule implements OrderStatusRule {
  readonly name = "ShippedRule";
  readonly status = OrderStatus.SHIPPED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    const shipmentStatus = signals.shipmentStatus?.toLowerCase() ?? "";
    return SHIPPED_STATES.has(shipmentStatus) || signals.isFulfillment;
  }
}