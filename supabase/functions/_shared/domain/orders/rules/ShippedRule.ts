import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

const ML_SHIPPED_STATUSES = new Set([
  'shipped', 'dropped_off', 'in_transit', 'handed_to_carrier',
  'on_route', 'out_for_delivery', 'delivery_in_progress',
  'collected', 'delivered',
]);

const SHOPEE_SHIPPED_STATUSES = new Set([
  'shipped', 'to_confirm_receive', 'completed',
]);

/**
 * Shipped rule for dispatched logistics states.
 * Uses marketplace-specific status sets for ML and Shopee.
 */
export class ShippedRule implements OrderStatusRule {
  readonly name = "ShippedRule";
  readonly status = OrderStatus.SHIPPED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.marketplace === 'mercado_livre') {
      return ML_SHIPPED_STATUSES.has(signals.shipmentStatus?.toLowerCase() ?? '');
    }
    const status = signals.marketplaceStatus?.toLowerCase() ?? '';
    return SHOPEE_SHIPPED_STATUSES.has(status) || (signals.isPickupDone ?? false);
  }
}
