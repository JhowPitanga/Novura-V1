/**
 * Canonical order types for Cycle 0. Used by _shared/orders-normalize (ML/Shopee) and orders-upsert.
 * status = internal (seller workflow). marketplace_status = marketplace canonical status.
 */

export type MarketplaceType = "mercado_livre" | "shopee";

export interface NormalizedOrderItem {
  marketplace_item_id: string;
  sku: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  variation_name: string | null;
  image_url: string | null;
}

export interface NormalizedOrderShipping {
  shipment_id: string | null;
  logistic_type: string | null;
  tracking_number: string | null;
  carrier: string | null;
  status: string | null;
  substatus: string | null;
  street_name: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state_uf: string | null;
  zip_code: string | null;
  sla_expected_date: string | null;
  sla_status: string | null;
  estimated_delivery: string | null;
}

export interface NormalizedOrder {
  marketplace: MarketplaceType;
  marketplace_order_id: string;
  pack_id: string | null;
  /** Internal seller workflow status (e.g. printed | picked | linked | dispatched). */
  status: string | null;
  /** Marketplace canonical status (ML/Shopee as-is). */
  marketplace_status: string;
  payment_status: string | null;
  gross_amount: number;
  marketplace_fee: number;
  shipping_cost: number;
  shipping_subsidy: number;
  net_amount: number;
  buyer_name: string | null;
  buyer_document: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_state: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  shipmentStatus?: string;
  shipmentSubstatus?: string;
  isFulfillment: boolean;
  isCancelled: boolean;
  isRefunded: boolean;
  isReturned: boolean;
  hasInvoice: boolean;
  isPickupDone?: boolean;
  items: NormalizedOrderItem[];
  shipping: NormalizedOrderShipping | null;
}

/** Row shape for orders table insert/upsert (Cycle 0 schema). */
export interface OrderInsertRow {
  organization_id: string;
  marketplace: string;
  marketplace_order_id: string;
  pack_id: string | null;
  status: string | null;
  marketplace_status: string;
  payment_status: string | null;
  gross_amount: number;
  marketplace_fee: number;
  shipping_cost: number;
  shipping_subsidy: number;
  net_amount: number;
  buyer_name: string | null;
  buyer_document: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  buyer_state: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
  canceled_at: string | null;
  shipment_status?: string | null;
  shipment_substatus?: string | null;
  is_fulfillment?: boolean;
  is_cancelled?: boolean;
  is_refunded?: boolean;
  is_returned?: boolean;
  has_invoice?: boolean;
  is_pickup_done?: boolean;
  last_synced_at: string;
  internal_status?: string;
  has_unlinked_items?: boolean;
}

/** Row shape for order_items table insert (Cycle 0 schema). */
export interface OrderItemInsertRow {
  order_id: string;
  marketplace_item_id: string;
  sku: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  variation_name: string | null;
  image_url: string | null;
}

/** Row shape for order_shipping table insert/upsert (Cycle 0 schema). */
export interface OrderShippingInsertRow {
  order_id: string;
  shipment_id: string | null;
  logistic_type: string | null;
  tracking_number: string | null;
  carrier: string | null;
  status: string | null;
  substatus: string | null;
  street_name: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state_uf: string | null;
  zip_code: string | null;
  country: string;
  sla_expected_date: string | null;
  sla_status: string | null;
  estimated_delivery: string | null;
  updated_at: string;
}

export interface UpsertOrderInput {
  organization_id: string;
  order: NormalizedOrder;
  source: "webhook" | "sync";
}

export interface UpsertOrderResult {
  success: boolean;
  order_id: string | null;
  created: boolean;
  error?: string;
}
