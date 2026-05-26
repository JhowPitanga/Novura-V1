import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

/**
 * Applies when the order is waiting for carrier pickup.
 * - Fulfillment orders never need pickup (handled by FulfillmentRule upstream).
 * - Mercado Livre: label must be printed AND shipment is ready_to_ship.
 * - Shopee: label is printed OR marketplace reports retry_ship status.
 */
export class AwaitingPickupRule implements OrderStatusRule {
  readonly name = "AwaitingPickupRule";
  readonly status = OrderStatus.AWAITING_PICKUP;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.isFulfillment) return false;

    if (signals.marketplace === "mercado_livre") {
      return signals.isPrintedLabel && signals.shipmentStatus === "ready_to_ship";
    }

    if (signals.marketplace === "shopee") {
      const isRetryShip = signals.marketplaceStatus?.toLowerCase() === "retry_ship";
      return signals.isPrintedLabel || isRetryShip;
    }

    return false;
  }
}
