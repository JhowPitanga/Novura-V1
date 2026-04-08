import type { OrderStatusRule } from "../OrderStatusRule.ts";
import type { MarketplaceSignals } from "../MarketplaceSignals.ts";
import type { ProductLinkState } from "../ProductLinkState.ts";
import { OrderStatus } from "../OrderStatus.ts";

const READY_SUBSTATUSES = new Set(["ready_to_print", "pending", "buffered"]);

/**
 * Rule for orders ready to print shipping labels.
 * Also maps Shopee orders with invoice already issued.
 */
export class ReadyToPrintRule implements OrderStatusRule {
  readonly name = "ReadyToPrintRule";
  readonly status = OrderStatus.READY_TO_PRINT;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    const substatus = signals.shipmentSubstatus?.toLowerCase() ?? "";
    const shopeeWithInvoice = signals.marketplace === "shopee" && signals.hasInvoice;
    return READY_SUBSTATUSES.has(substatus) || shopeeWithInvoice;
  }
}