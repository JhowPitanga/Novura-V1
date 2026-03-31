/**
 * Shopee order normalizer service: raw Shopee order detail → NormalizedOrder.
 * All parse + normalize logic in one service (no separate parse-shopee / normalize-shopee files).
 */

import { buildShipping, brUfFromState, epochSecToIso } from "../domain/orders/order-normalize-utils.ts";
import type {
  NormalizedOrder,
  NormalizedOrderItem,
  NormalizedOrderShipping,
} from "../domain/orders/orders-types.ts";
import type {
  ShopeeOrderDetailItem,
  ShopeeOrderItemDetail,
  ShopeePackageItem,
  ShopeeRecipientAddress,
} from "../domain/shopee/shopee-order-api.types.ts";
import type { ShopeeEscrowDetailPayload } from "../domain/shopee/shopee-escrow-api.types.ts";
import { getField } from "../adapters/infra/object-utils.ts";

/** Callers may pass the payload (from fetchEscrowDetail) or the raw API body { response }. */
function resolveEscrowPayload(
  escrowDetail: ShopeeEscrowDetailPayload | { response?: ShopeeEscrowDetailPayload } | null | undefined,
): ShopeeEscrowDetailPayload | null {
  if (!escrowDetail || typeof escrowDetail !== "object") return null;
  const withResponse = escrowDetail as Record<string, unknown>;
  const payload = (withResponse.response ?? withResponse.data ?? escrowDetail) as ShopeeEscrowDetailPayload | undefined;
  return payload ?? null;
}

export type { ShopeeOrderDetailItem, ShopeeOrderDetailApiResponse } from "../domain/shopee/shopee-order-api.types.ts";
export { isShopeeOrderDetailItem } from "../domain/shopee/shopee-order-api.types.ts";

export class ShopeeOrderNormalizeService {
  normalize(
    rawOrder: ShopeeOrderDetailItem,
    escrowDetail?: ShopeeEscrowDetailPayload | { response?: ShopeeEscrowDetailPayload } | null,
  ): NormalizedOrder {
    const { items, grossAmount } = this.parseItems(rawOrder);
    const marketplaceFee = this.parseMarketplaceFeeFromEscrow(resolveEscrowPayload(escrowDetail));
    const actualShippingFee = rawOrder.actual_shipping_fee ?? 0;
    const estimatedShippingFee = rawOrder.estimated_shipping_fee ?? 0;
    const shippingCost = Number(actualShippingFee) || Number(estimatedShippingFee) || 0;
    const shippingSubsidy = 0;
    const netAmount = grossAmount - marketplaceFee - shippingCost + shippingSubsidy;

    const buyer = this.parseBuyer(rawOrder);
    const dates = this.parseDates(rawOrder);
    const shipping = this.parseShipping(rawOrder);

    const marketplaceOrderId = String(rawOrder.order_sn ?? rawOrder.ordersn ?? "");
    const packId =
      marketplaceOrderId && /^\d+$/.test(marketplaceOrderId) ? marketplaceOrderId : null;
    const marketplaceStatus = rawOrder.order_status ?? rawOrder.status ?? "unknown";
    const paymentStatus = rawOrder.pay_time == null ? null : "paid";
    const statusLower = marketplaceStatus.toLowerCase();
    const shipmentStatus = rawOrder.package_list?.[0]?.logistics_status ?? rawOrder.order_status ?? null;
    const shipmentSubstatus = undefined;
    const isFulfillment = rawOrder.fulfillment_flag === true;
    const isCancelled = statusLower === "cancelled" || statusLower === "in_cancel";
    const isRefunded = false;
    const isReturned = statusLower === "to_return";
    const hasInvoice = false;
    const isPickupDone = statusLower === "pickup_done";

    return {
      marketplace: "shopee",
      marketplace_order_id: marketplaceOrderId,
      pack_id: packId,
      status: null,
      marketplace_status: marketplaceStatus,
      payment_status: paymentStatus,
      gross_amount: grossAmount,
      marketplace_fee: marketplaceFee,
      shipping_cost: shippingCost,
      shipping_subsidy: shippingSubsidy,
      net_amount: netAmount,
      buyer_name: buyer.buyer_name,
      buyer_document: null,
      buyer_email: null,
      buyer_phone: buyer.buyer_phone,
      buyer_state: buyer.buyer_state,
      created_at: dates.created_at,
      shipped_at: dates.shipped_at,
      delivered_at: dates.delivered_at,
      canceled_at: dates.canceled_at,
      shipmentStatus: shipmentStatus ?? undefined,
      shipmentSubstatus,
      isFulfillment,
      isCancelled,
      isRefunded,
      isReturned,
      hasInvoice,
      isPickupDone,
      items,
      shipping,
    };
  }

  private parseOneItem(oi: ShopeeOrderItemDetail): NormalizedOrderItem {
    const qty = oi.model_quantity_purchased ?? 1;
    const unitPrice = oi.model_discounted_price ?? oi.model_original_price ?? 0;
    const itemId = oi.item_id == null ? "" : String(oi.item_id);
    return {
      marketplace_item_id: itemId,
      sku: oi.model_sku ?? oi.item_sku ?? null,
      title: oi.item_name ?? oi.model_name ?? "Item",
      quantity: Number(qty) || 1,
      unit_price: Number(unitPrice) || 0,
      variation_name: oi.model_name ?? null,
      image_url: oi.image_info?.image_url ?? null,
    };
  }

  private parseItems(o: ShopeeOrderDetailItem): {
    items: NormalizedOrderItem[];
    grossAmount: number;
  } {
    const orderItems = o.item_list ?? [];
    const items = orderItems.map((oi) => this.parseOneItem(oi));
    const totalFromApi = o.total_amount ?? 0;
    const grossAmount =
      totalFromApi > 0 ? totalFromApi : items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    return { items, grossAmount };
  }

  private parseMarketplaceFeeFromEscrow(payload: ShopeeEscrowDetailPayload | null): number {
    if (!payload?.order_income) return 0;
    const income = payload.order_income;
    const commission = Number(income.commission_fee ?? 0);
    const service = Number(income.service_fee ?? 0);
    return commission + service;
  }

  private addrFromRecipient(
    addr: ShopeeRecipientAddress | null | undefined,
  ): {
    street_name: string | null;
    neighborhood: string | null;
    city: string | null;
    state_uf: string | null;
    zip_code: string | null;
  } {
    if (!addr)
      return {
        street_name: null,
        neighborhood: null,
        city: null,
        state_uf: null,
        zip_code: null,
      };
    return {
      street_name: addr.full_address ?? null,
      neighborhood: addr.district ?? addr.town ?? null,
      city: addr.city ?? null,
      state_uf: brUfFromState(addr.state ?? addr.region ?? null),
      zip_code: addr.zipcode ?? null,
    };
  }

  private parseShipping(o: ShopeeOrderDetailItem): NormalizedOrderShipping | null {
    const recipientAddr = o.recipient_address;
    if (!recipientAddr) return null;

    const packageList = o.package_list ?? [];
    const firstPkg: ShopeePackageItem | undefined = packageList[0];
    const { street_name, neighborhood, city, state_uf, zip_code } =
      this.addrFromRecipient(recipientAddr);
    const trackingNo = firstPkg
      ? getField(firstPkg, "tracking_no") ?? getField(firstPkg, "tracking_number")
      : null;

    return buildShipping({
      shipment_id: firstPkg ? firstPkg.package_id ?? firstPkg.package_number ?? null : null,
      tracking_number: typeof trackingNo === "string" ? trackingNo : null,
      carrier: firstPkg?.shipping_carrier ?? null,
      status: firstPkg?.logistics_status ?? null,
      street_name,
      neighborhood,
      city,
      state_uf,
      zip_code,
    });
  }

  private parseBuyer(o: ShopeeOrderDetailItem): {
    buyer_name: string | null;
    buyer_phone: string | null;
    buyer_state: string | null;
  } {
    const recipientAddr = o.recipient_address;
    const stateName = recipientAddr ? recipientAddr.region ?? recipientAddr.state ?? null : null;
    return {
      buyer_name: o.buyer_username ?? null,
      buyer_phone: recipientAddr?.phone ?? null,
      buyer_state: brUfFromState(stateName),
    };
  }

  private parseDates(o: ShopeeOrderDetailItem): {
    created_at: string;
    shipped_at: string | null;
    delivered_at: string | null;
    canceled_at: string | null;
  } {
    const createTime = o.create_time ?? null;
    const updateTime = o.update_time ?? null;
    const created_at = epochSecToIso(createTime) ?? new Date().toISOString();
    const marketplaceStatus = (o.order_status ?? o.status ?? "").toLowerCase();
    const canceled_at =
      marketplaceStatus === "cancelled" ? epochSecToIso(updateTime) ?? created_at : null;
    return {
      created_at,
      shipped_at: null,
      delivered_at: null,
      canceled_at,
    };
  }
}

