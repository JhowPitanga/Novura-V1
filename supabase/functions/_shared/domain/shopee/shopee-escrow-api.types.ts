/**
 * Shopee get_escrow_detail API response.
 * Different endpoint from get_order_detail; financial breakdown lives inside response.order_income.
 *
 * API body: { response: { request_id?, error?, message?, order_sn?, buyer_user_name?, return_order_sn_list?, order_income? } }.
 * We return response (that object) from fetchEscrowDetail; order_income holds all escrow fields (commission_fee, service_fee, etc.).
 */

/** Item in order_income.items[]. */
export interface ShopeeEscrowOrderIncomeItem {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  original_price?: number;
  original_price_pri?: number;
  selling_price?: number;
  discounted_price?: number;
  seller_discount?: number;
  shopee_discount?: number;
  discount_from_coin?: number;
  discount_from_voucher_shopee?: number;
  discount_from_voucher_seller?: number;
  activity_type?: string;
  activity_id?: number;
  is_main_item?: boolean;
  quantity_purchased?: number;
  is_b2c_shop_item?: boolean;
  ams_commission_fee?: number;
  is_kit?: boolean;
  kit_items?: unknown;
  promotion_list?: Array<{ promotion_type?: string; promotion_id?: number }>;
}

/** One order-level adjustment. */
export interface ShopeeEscrowOrderAdjustment {
  amount?: number;
  date?: number;
  currency?: string;
  adjustment_reason?: string;
}

/** order_income object: escrow amounts, fees, items breakdown. */
export interface ShopeeEscrowOrderIncome {
  escrow_amount?: number;
  buyer_total_amount?: number;
  order_original_price?: number;
  original_price?: number;
  order_discounted_price?: number;
  order_selling_price?: number;
  order_seller_discount?: number;
  seller_discount?: number;
  shopee_discount?: number;
  voucher_from_seller?: number;
  voucher_from_shopee?: number;
  coins?: number;
  buyer_paid_shipping_fee?: number;
  buyer_transaction_fee?: number;
  cross_border_tax?: number;
  payment_promotion?: number;
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  seller_lost_compensation?: number;
  seller_coin_cash_back?: number;
  escrow_tax?: number;
  estimated_shipping_fee?: number;
  final_shipping_fee?: number;
  actual_shipping_fee?: number;
  shipping_fee_sst?: number;
  order_chargeable_weight?: number;
  shopee_shipping_rebate?: number;
  shipping_fee_discount_from_3pl?: number;
  seller_shipping_discount?: number;
  seller_voucher_code?: string[];
  drc_adjustable_refund?: number;
  cost_of_goods_sold?: number;
  original_cost_of_goods_sold?: number;
  original_shopee_discount?: number;
  seller_return_refund?: number;
  items?: ShopeeEscrowOrderIncomeItem[];
  escrow_amount_pri?: number;
  buyer_total_amount_pri?: number;
  original_price_pri?: number;
  seller_return_refund_pri?: number;
  commission_fee_pri?: number;
  service_fee_pri?: number;
  drc_adjustable_refund_pri?: number;
  pri_currency?: string;
  aff_currency?: string;
  exchange_rate?: number;
  reverse_shipping_fee?: number;
  reverse_shipping_fee_sst?: number;
  final_product_protection?: number;
  credit_card_promotion?: number;
  credit_card_transaction_fee?: number;
  final_product_vat_tax?: number;
  final_shipping_vat_tax?: number;
  campaign_fee?: number;
  sip_subsidy?: number;
  sip_subsidy_pri?: number;
  rsf_seller_protection_fee_claim_amount?: number;
  shipping_seller_protection_fee_amount?: number;
  final_escrow_product_gst?: number;
  final_escrow_shipping_gst?: number;
  delivery_seller_protection_fee_premium_amount?: number;
  order_adjustment?: ShopeeEscrowOrderAdjustment[];
  total_adjustment_amount?: number;
  escrow_amount_after_adjustment?: number;
  order_ams_commission_fee?: number;
  buyer_payment_method?: string;
  instalment_plan?: string;
  sales_tax_on_lvg?: number;
  final_return_to_seller_shipping_fee?: number;
  withholding_tax?: number;
  overseas_return_service_fee?: number;
  vat_on_imported_goods?: number;
  tenure_info_list?: { payment_channel_name?: string; instalment_plan?: string };
  withholding_vat_tax?: number;
  withholding_pit_tax?: number;
  tax_registration_code?: string;
  seller_order_processing_fee?: number;
  buyer_paid_packaging_fee?: number;
  trade_in_bonus_by_seller?: number;
  fbs_fee?: number;
  net_commission_fee?: number;
  net_service_fee?: number;
  net_commission_fee_info_list?: Array<{ rule_id?: number; fee_amount?: number; rule_display_name?: string }>;
  net_service_fee_info_list?: Array<{ rule_id?: number; fee_amount?: number; rule_display_name?: string; category?: string }>;
  seller_product_rebate?: { amount?: number; commission_fee_offset?: number; service_fee_offset?: number };
  pix_discount?: number;
  prorated_pix_discount_offset_return_items?: number;
  ads_escrow_top_up_fee_or_technical_support_fee?: number;
  buyer_payment_info?: {
    buyer_payment_method?: string;
    buyer_service_fee?: number;
    buyer_tax_amount?: number;
    buyer_total_amount?: number;
    credit_card_promotion?: number;
    icms_tax_amount?: number;
    import_tax_amount?: number;
    initial_buyer_txn_fee?: number;
    insurance_premium?: number;
    iof_tax_amount?: number;
    is_paid_by_credit_card?: boolean;
    merchant_subtotal?: number;
    seller_voucher?: number;
    shipping_fee?: number;
    shipping_fee_sst_amount?: number;
    shopee_voucher?: number;
    shopee_coins_redeemed?: number;
    buyer_paid_packaging_fee?: number;
    trade_in_bonus?: number;
    bulky_handling_fee?: number;
    discount_pix?: number;
  };
  prorated_coins_value_offset_return_items?: number;
  prorated_shopee_voucher_offset_return_items?: number;
  prorated_seller_voucher_offset_return_items?: number;
  prorated_payment_channel_promo_bank_offset_return_items?: number;
  prorated_payment_channel_promo_shopee_offset_return_items?: number;
  fsf_seller_protection_fee_claim_amount?: number;
}

/** get_escrow_detail response object (API response.response). We return this from fetchEscrowDetail. */
export interface ShopeeEscrowDetailPayload {
  request_id?: string;
  error?: string;
  message?: string;
  order_sn?: string;
  buyer_user_name?: string;
  return_order_sn_list?: string[];
  order_income?: ShopeeEscrowOrderIncome;
}
