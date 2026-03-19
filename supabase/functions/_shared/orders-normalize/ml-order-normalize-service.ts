/**
 * ML order normalizer service: raw ML Order API response → NormalizedOrder.
 * All parse + normalize logic in one service (no separate parse-ml / normalize-ml files).
 */

import { buildShipping, stateIdToUf } from "../domain/orders/order-normalize-utils.ts";
import type { NormalizedOrder, NormalizedOrderItem, NormalizedOrderShipping } from "../domain/orders/orders-types.ts";
import type {
  MlOrderItem,
  MlOrderPayment,
  MlOrderResponse,
  MlReceiverAddress,
} from "../domain/ml/ml-order-api.types.ts";

export { isMlOrderResponse } from "../domain/ml/ml-order-api.types.ts";
export type { MlOrderResponse } from "../domain/ml/ml-order-api.types.ts";

const FEE_TYPE_ML = "ml_fee";

export class MlOrderNormalizeService {
  normalize(raw: MlOrderResponse): NormalizedOrder {
    const { items, grossAmount } = this.parseItems(raw);
    const marketplaceFee = this.parseMarketplaceFee(raw);
    const { shippingCost, shippingSubsidy } = this.parseShippingCost(raw);
    const netAmount = grossAmount - marketplaceFee - shippingCost + shippingSubsidy;
    const buyer = this.parseBuyer(raw);
    const dates = this.parseDates(raw);
    const shipping = this.parseShipping(raw);

    const marketplaceOrderId = String(raw.id);
    const packId =
      raw.pack_id != null && /^\d+$/.test(String(raw.pack_id)) ? String(raw.pack_id) : null;
    const marketplaceStatus = raw.status ?? "unknown";
    const paymentStatus = raw.payments?.[0]?.status ?? null;

    return {
      marketplace: "mercado_livre",
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
      buyer_document: buyer.buyer_document,
      buyer_email: buyer.buyer_email,
      buyer_phone: null,
      buyer_state: buyer.buyer_state,
      created_at: dates.created_at,
      shipped_at: dates.shipped_at,
      delivered_at: dates.delivered_at,
      canceled_at: dates.canceled_at,
      items,
      shipping,
    };
  }

  private parseOneItem(oi: MlOrderItem): NormalizedOrderItem {
    const qty = oi.requested_quantity?.value ?? oi.quantity ?? 1;
    const unitPrice = oi.unit_price ?? 0;
    const item = oi.item;
    const itemId = item?.id ?? "";
    const title = item?.title ?? "Item";
    const sku = item?.seller_sku ?? null;
    const variationName = this.formatVariationName(item?.variation_attributes);
    return {
      marketplace_item_id: String(itemId),
      sku: sku ?? null,
      title,
      quantity: Number(qty) || 1,
      unit_price: Number(unitPrice) || 0,
      variation_name: variationName,
      image_url: null,
    };
  }

  private formatVariationName(
    variationAttrs: MlOrderItem["item"]["variation_attributes"],
  ): string | null {
    if (!variationAttrs?.length) return null;
    const parts = variationAttrs
      .map((va) => (va.name && va.value_name ? `${va.name}: ${va.value_name}` : ""))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : null;
  }

  private parseItems(o: MlOrderResponse): { items: NormalizedOrderItem[]; grossAmount: number } {
    const orderItems = o.order_items ?? [];
    const items = orderItems.map((oi) => this.parseOneItem(oi));
    const grossAmount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    return { items, grossAmount };
  }

  private parseMarketplaceFee(o: MlOrderResponse): number {
    const payments: MlOrderPayment[] = o.payments ?? [];
    let fee = 0;
    for (const p of payments) {
      const details = p.fee_details ?? [];
      for (const fd of details) {
        if (fd.type === FEE_TYPE_ML) fee += fd.amount;
      }
    }
    return fee;
  }

  private parseShippingCost(o: MlOrderResponse): {
    shippingCost: number;
    shippingSubsidy: number;
  } {
    const shipping = o.shipping;
    if (!shipping) return { shippingCost: 0, shippingSubsidy: 0 };
    const baseCost = shipping.base_cost ?? 0;
    const costFromApi = shipping.cost ?? 0;
    const subsidy = baseCost > 0 && costFromApi < baseCost ? baseCost - costFromApi : 0;
    return { shippingCost: baseCost, shippingSubsidy: subsidy };
  }

  private parseBuyer(o: MlOrderResponse): {
    buyer_name: string | null;
    buyer_document: string | null;
    buyer_email: string | null;
    buyer_state: string | null;
  } {
    const buyer = o.buyer;
    const receiverStateId = o.shipping?.receiver_address?.state?.id ?? null;
    const buyerState = stateIdToUf(receiverStateId);
    if (!buyer) {
      return { buyer_name: null, buyer_document: null, buyer_email: null, buyer_state: buyerState };
    }
    const doc = buyer.billing_info?.doc_number ?? null;
    const firstName = buyer.first_name ?? null;
    const lastName = buyer.last_name ?? null;
    const buyerName =
      buyer.nickname ??
      (firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ") : null) ??
      null;
    return {
      buyer_name: buyerName,
      buyer_document: doc,
      buyer_email: buyer.email ?? null,
      buyer_state: buyerState,
    };
  }

  private parseDates(o: MlOrderResponse): {
    created_at: string;
    shipped_at: string | null;
    delivered_at: string | null;
    canceled_at: string | null;
  } {
    const created_at = o.date_created ?? new Date().toISOString();
    const lastUpdated = o.last_updated ?? o.date_last_updated ?? null;
    const statusFromApi = (o.status ?? "").toLowerCase();
    const canceled_at = statusFromApi === "cancelled" ? (lastUpdated ?? created_at) : null;
    return {
      created_at,
      shipped_at: o.date_shipped ?? null,
      delivered_at: o.date_delivered ?? null,
      canceled_at,
    };
  }

  private resolveCity(city: MlReceiverAddress["city"]): string | null {
    if (city == null) return null;
    if (typeof city === "object" && "name" in city) return city.name ?? null;
    if (typeof city === "string") return city;
    return null;
  }

  private parseShipping(o: MlOrderResponse): NormalizedOrderShipping | null {
    const shipping = o.shipping;
    const receiverAddr = shipping?.receiver_address;
    if (!receiverAddr) return null;
    const neighborhood =
      receiverAddr.neighborhood && typeof receiverAddr.neighborhood === "object"
        ? receiverAddr.neighborhood.name ?? receiverAddr.neighborhood.id ?? null
        : null;
    const city = this.resolveCity(receiverAddr.city);
    const shipmentId = shipping?.id == null ? null : String(shipping.id);
    return buildShipping({
      shipment_id: shipmentId,
      logistic_type: shipping?.logistic_type ?? null,
      status: shipping?.status ?? null,
      substatus: shipping?.substatus ?? null,
      street_name: receiverAddr.street_name ?? null,
      street_number: receiverAddr.street_number ?? null,
      complement: receiverAddr.comment ?? null,
      neighborhood,
      city,
      state_uf: stateIdToUf(receiverAddr.state?.id ?? null),
      zip_code: receiverAddr.zip_code ?? null,
    });
  }
}

