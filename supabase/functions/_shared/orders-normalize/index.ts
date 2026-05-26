/**
 * Order normalizer services: ML and Shopee API responses → NormalizedOrder.
 * Used by orders-sync-ml, orders-sync-shopee, orders-webhook. Not an Edge Function.
 */

export {
  MlOrderNormalizeService,
  isMlOrderResponse,
  type MlOrderResponse,
} from "./ml-order-normalize-service.ts";
export {
  ShopeeOrderNormalizeService,
  isShopeeOrderDetailItem,
  type ShopeeOrderDetailItem,
  type ShopeeOrderDetailApiResponse,
} from "./shopee-order-normalize-service.ts";
