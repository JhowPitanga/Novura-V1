/**
 * ML Order API response types (GET /orders/:id).
 * Source: Mercado Livre API — Gerenciamento de vendas / Orders.
 * Shared so any function consuming ML order API can use these types.
 */

export type MlOrderStatus =
  | "confirmed"
  | "payment_required"
  | "payment_in_process"
  | "partially_paid"
  | "paid"
  | "partially_refunded"
  | "pending_cancel"
  | "cancelled"
  | "invalid";

export interface MlVariationAttribute {
  id?: string;
  name: string;
  value_id?: string;
  value_name: string;
}

export interface MlOrderItemPublication {
  id: string;
  title: string;
  seller_sku?: string | null;
  variation_attributes?: MlVariationAttribute[];
  pictures?: Array<{ secure_url?: string; url?: string }>;
  picture_url?: string;
}

export interface MlOrderItem {
  item: MlOrderItemPublication;
  quantity: number;
  requested_quantity?: { value: number; measure: string };
  unit_price: number;
  gross_price?: number;
  sale_fee?: number;
}

export interface MlPaymentFeeDetail {
  type: string;
  amount: number;
}

export interface MlOrderPayment {
  id: number;
  status: string;
  fee_details?: MlPaymentFeeDetail[];
}

export interface MlReceiverAddress {
  state?: { id: string };
  city?: { name: string } | string;
  zip_code?: string;
  street_name?: string;
  street_number?: string;
  comment?: string;
  neighborhood?: { id?: string; name?: string };
}

export interface MlOrderShipping {
  id: number;
  base_cost?: number;
  cost?: number;
  logistic_type?: string;
  status?: string;
  substatus?: string;
  receiver_address?: MlReceiverAddress;
}

export interface MlBuyerBillingInfo {
  doc_number: string;
}

export interface MlOrderBuyer {
  id: number;
  nickname?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  billing_info?: MlBuyerBillingInfo;
}

export interface MlOrderResponse {
  id: number;
  date_created: string;
  date_closed?: string | null;
  last_updated?: string;
  date_last_updated?: string;
  date_shipped?: string | null;
  date_delivered?: string | null;
  status: MlOrderStatus;
  status_detail?: string | null;
  pack_id?: number | null;
  order_items: MlOrderItem[];
  payments: MlOrderPayment[];
  shipping: MlOrderShipping | null;
  buyer: MlOrderBuyer | null;
  total_amount?: number;
  currency_id?: string;
  tags?: string[];
}

export function isMlOrderResponse(x: unknown): x is MlOrderResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "number" &&
    Array.isArray(o.order_items) &&
    (o.status === undefined || typeof o.status === "string")
  );
}
