import type { MarketplaceSignals } from "../../domain/orders/MarketplaceSignals.ts";
import type { ProductLinkState } from "../../domain/orders/ProductLinkState.ts";
import type { OrderStatusRule } from "../../domain/orders/OrderStatusRule.ts";
import { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import { CancelledRule } from "../../domain/orders/rules/CancelledRule.ts";
import { ReturnedRule } from "../../domain/orders/rules/ReturnedRule.ts";
import { FulfillmentRule } from "../../domain/orders/rules/FulfillmentRule.ts";
import { UnlinkedRule } from "../../domain/orders/rules/UnlinkedRule.ts";
import { ShippedRule } from "../../domain/orders/rules/ShippedRule.ts";
import { AwaitingPickupRule } from "../../domain/orders/rules/AwaitingPickupRule.ts";
import { ReadyToPrintRule } from "../../domain/orders/rules/ReadyToPrintRule.ts";
import { InvoicePendingRule } from "../../domain/orders/rules/InvoicePendingRule.ts";
import { PendingRule } from "../../domain/orders/rules/PendingRule.ts";

/**
 * Pure status engine that evaluates rules in priority order.
 * First matching rule wins (Chain of Responsibility).
 */
export class OrderStatusEngine {
  private readonly rules: ReadonlyArray<OrderStatusRule>;

  constructor(rules?: ReadonlyArray<OrderStatusRule>) {
    this.rules = rules ?? OrderStatusEngine.defaultRules();
  }

  calculate(signals: MarketplaceSignals, linkState: ProductLinkState): OrderStatus {
    for (const rule of this.rules) {
      if (rule.appliesTo(signals, linkState)) {
        return rule.status;
      }
    }
    return OrderStatus.PENDING;
  }

  private static defaultRules(): ReadonlyArray<OrderStatusRule> {
    return [
      new CancelledRule(),
      new ReturnedRule(),
      new FulfillmentRule(),
      new UnlinkedRule(),
      new ShippedRule(),
      new AwaitingPickupRule(),
      new InvoicePendingRule(),
      new ReadyToPrintRule(),
      new PendingRule(),
    ];
  }
}