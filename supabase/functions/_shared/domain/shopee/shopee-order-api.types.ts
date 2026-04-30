/**
 * Shopee get_order_detail API response types.
 * Aligned with API response: response.order_list[] (all fields returned by default or via response_optional_fields).
 * Shared so any function consuming Shopee order API can use these types.
 */

export interface ShopeeOrderDetailApiResponse {
  request_id?: string;
  error?: string;
  message?: string;
  response?: {
    order_list?: ShopeeOrderDetailItem[];
  };
}

/** Recipient address; may be masked by region. */
export interface ShopeeRecipientAddress {
  name?: string;
  phone?: string;
  town?: string;
  district?: string;
  city?: string;
  state?: string;
  region?: string;
  zipcode?: string;
  full_address?: string;
  /** Only available for logistics_channel_id 90026. */
  geolocation?: { latitude?: number; longitude?: number };
}

/** Item-level promotion. */
export interface ShopeeItemPromotion {
  promotion_type?: string;
  promotion_id?: number | string;
}

/** One item in order_detail response.order_list[].item_list[]. */
export interface ShopeeOrderItemDetail {
  item_id?: number | string;
  item_name?: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_original_price?: number;
  model_discounted_price?: number;
  wholesale?: boolean;
  weight?: number;
  add_on_deal?: boolean;
  main_item?: boolean;
  add_on_deal_id?: number;
  promotion_type?: string;
  promotion_id?: number;
  order_item_id?: number;
  promotion_group_id?: number;
  image_info?: { image_url?: string };
  product_location_id?: string | string[];
  is_prescription_item?: boolean;
  is_b2c_owned_item?: boolean;
  consultation_id?: string;
  promotion_list?: ShopeeItemPromotion[];
  hot_listing_item?: boolean;
}

/** Package under an order (package_list[]). */
export interface ShopeePackageItem {
  package_number?: string;
  package_id?: string;
  logistics_status?: string;
  logistics_channel_id?: number;
  shipping_carrier?: string;
  allow_self_design_awb?: boolean;
  sorting_group?: string;
  virtual_contact_number?: string;
  package_query_number?: string;
  parcel_chargeable_weight?: number;
  parcel_chargeable_weight_gram?: number;
  group_shipment_id?: number | null;
  item_list?: Array<{
    item_id?: number;
    model_id?: number;
    model_quantity?: number;
    order_item_id?: number;
    product_location_id?: string;
    promotion_group_id?: number;
  }>;
}

/** Invoice data of the order. */
export interface ShopeeInvoiceData {
  number?: string;
  series_number?: string;
  access_key?: string;
  issue_date?: number;
  total_value?: number;
  products_total_value?: number;
  tax_code?: string;
  invoice_status?: string;
}

/** [BR] Payment info per NT 2025.001. */
export interface ShopeePaymentInfoItem {
  payment_method?: string;
  payment_processor_register?: string;
  card_brand?: string;
  transaction_id?: string;
  payment_amount?: number;
}

/** One order in get_order_detail response.response.order_list[]. */
export interface ShopeeOrderDetailItem {
  order_sn?: string;
  ordersn?: string;
  region?: string;
  currency?: string;
  cod?: boolean;
  total_amount?: number;
  pending_terms?: string[];
  pending_description?: string[];
  order_status?: string;
  status?: string;
  shipping_carrier?: string;
  payment_method?: string;
  estimated_shipping_fee?: number;
  actual_shipping_fee?: number;
  message_to_seller?: string;
  create_time?: number;
  update_time?: number;
  days_to_ship?: number;
  ship_by_date?: number;
  buyer_user_id?: number;
  buyer_username?: string;
  recipient_address?: ShopeeRecipientAddress | null;
  actual_shipping_fee_confirmed?: boolean;
  goods_to_declare?: boolean;
  note?: string;
  note_update_time?: number;
  item_list?: ShopeeOrderItemDetail[];
  pay_time?: number;
  dropshipper?: string | null;
  dropshipper_phone?: string | null;
  split_up?: boolean;
  buyer_cancel_reason?: string;
  cancel_by?: string;
  cancel_reason?: string;
  buyer_cpf_id?: string | null;
  fulfillment_flag?: string;
  pickup_done_time?: number;
  package_list?: ShopeePackageItem[];
  invoice_data?: ShopeeInvoiceData | null;
  reverse_shipping_fee?: number;
  order_chargeable_weight_gram?: number;
  prescription_images?: string[];
  prescription_check_status?: number;
  pharmacist_name?: string;
  prescription_approval_time?: number;
  prescription_rejection_time?: number;
  /** [BR] Earliest estimated delivery date. */
  edt_from?: number;
  /** [BR] Latest estimated delivery time. */
  edt_to?: number;
  booking_sn?: string;
  advance_package?: boolean;
  return_request_due_date?: number;
  /** [BR] Payment info per NT 2025.001. */
  payment_info?: ShopeePaymentInfoItem[];
  checkout_shipping_carrier?: string;
  is_buyer_shop_collection?: boolean;
  buyer_proof_of_collection?: string[];
  hot_listing_order?: boolean;
  warning?: string[];
}

export function isShopeeOrderDetailItem(x: unknown): x is ShopeeOrderDetailItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const sn = o.order_sn ?? o.ordersn;
  return typeof sn === "string" || typeof sn === "number";
}
