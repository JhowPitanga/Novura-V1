import type { MarketplaceSignals } from "./MarketplaceSignals.ts";
import type { ProductLinkState } from "./ProductLinkState.ts";
import type { OrderStatus } from "./OrderStatus.ts";

/**
 * Contract for a single status rule in the Chain of Responsibility.
 *
 * OrderStatusEngine walks rules in priority order. The first rule whose
 * `appliesTo` returns true wins and defines the order status.
 *
 * How to add a rule:
 * 1. Implement this interface in `rules/<Name>Rule.ts`
 * 2. Add unit tests for all branches
 * 3. Register the rule in OrderStatusEngine at the correct priority slot
 */
export interface OrderStatusRule {
  /**
   * Human-readable rule name for logs and debugging (e.g. 'CancelledRule').
   */
  readonly name: string;

  /**
   * Pure predicate: true when this rule should fire for the given inputs.
   * Must not perform I/O or mutate external state.
   */
  appliesTo(signals: MarketplaceSignals, linkState: ProductLinkState): boolean;

  /**
   * Status returned when `appliesTo` is true. Only read after a successful match.
   */
  readonly status: OrderStatus;
}
