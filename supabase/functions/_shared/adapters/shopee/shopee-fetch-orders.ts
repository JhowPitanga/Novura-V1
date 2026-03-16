/**
 * Fetch Shopee order list (cursor-paginated), order detail (batch 50), and escrow per order.
 * Shared by orders-sync-shopee and any other function that needs to call Shopee order/escrow APIs.
 * Use a single instance (e.g. at module level) where needed.
 */

import { hmacSha256Hex } from "../infra/token-utils.ts";
import type { ShopeeEscrowDetailPayload } from "../../domain/shopee/shopee-escrow-api.types.ts";
import type { ShopeeOrderDetailItem } from "../../domain/shopee/shopee-order-api.types.ts";

const LIST_PATH = "/api/v2/order/get_order_list";
const DETAIL_PATH = "/api/v2/order/get_order_detail";
const ESCROW_PATH = "/api/v2/payment/get_escrow_detail";
const SHOPEE_HOST = "https://openplatform.shopee.com.br";

const DETAIL_PAGE_SIZE = 50;
const LIST_PAGE_SIZE = 100;
const DELAY_MS = 150;

/** Full optional fields for get_order_detail (webhook: fetch max info, no limiting). */
export const SHOPEE_DETAIL_FULL_OPTIONAL_FIELDS =
  "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,goods_to_declare,note,note_update_time,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,shipping_carrier,payment_method,total_amount,invoice_data,order_chargeable_weight_gram,return_request_due_date,edt,payment_info,order_status,create_time,update_time";

export interface ShopeeFetchParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: number;
  timeFrom: number;
  timeTo: number;
  timeRangeField?: string;
}

export interface ShopeeDetailParams {
  partnerId: string;
  partnerKey: string;
  accessToken: string;
  shopId: number;
}

function signBase(
  partnerId: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: number,
): string {
  return `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
}

export class ShopeeFetchOrdersAdapter {
  /**
   * Fetch order_sn list via get_order_list. Search by time range + pagination. No order_status filter.
   */
  async fetchOrderSnList(
    params: ShopeeFetchParams,
    onRefresh?: () => Promise<boolean>,
  ): Promise<string[]> {
    const { partnerId, partnerKey, accessToken, shopId, timeFrom, timeTo } = params;
    const timeRangeField = params.timeRangeField ?? "create_time";
    const orderSns: string[] = [];
    let cursor: string | null = null;

    const doPage = async (
      cur: string | null,
      allowRefresh: boolean,
    ): Promise<{ sns: string[]; next: string | null; more: boolean } | null> => {
      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = signBase(partnerId, LIST_PATH, timestamp, accessToken, shopId);
      const sign = await hmacSha256Hex(partnerKey, baseString);
      const query = new URLSearchParams({
        partner_id: partnerId,
        timestamp: String(timestamp),
        access_token: accessToken,
        shop_id: String(shopId),
        sign,
        time_range_field: timeRangeField,
        time_from: String(timeFrom),
        time_to: String(timeTo),
        page_size: String(LIST_PAGE_SIZE),
      });
      if (cur) query.set("cursor", cur);

      try {
        const url = `${SHOPEE_HOST}${LIST_PATH}?${query.toString()}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: { "content-type": "application/json" },
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          if ((resp.status === 401 || resp.status === 403) && allowRefresh && onRefresh) {
            const ok = await onRefresh();
            if (ok) return doPage(cur, false);
          }
          const apiMsg = json?.message ?? json?.error ?? resp.statusText;
          throw new Error(`Shopee get_order_list HTTP ${resp.status}: ${apiMsg}`);
        }
        const res = json?.response ?? {};
        const list = Array.isArray(res.order_list) ? res.order_list : [];
        const sns = list
          .map((o: Record<string, unknown>) => String(o?.order_sn ?? ""))
          .filter(Boolean);
        const next =
          res.next_cursor != null && res.next_cursor !== "" ? String(res.next_cursor) : null;
        const more = Boolean(res.more);
        return { sns, next, more };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Shopee get_order_list failed: ${msg}`);
      }
    };

    for (let page = 0; page < 200; page++) {
      const result = await doPage(cursor, true);
      if (!result) break;
      orderSns.push(...result.sns);
      if (!result.more || !result.next) break;
      cursor = result.next;
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
    return orderSns;
  }

  /**
   * Fetch full order detail for up to 50 order_sn in one request.
   */
  async fetchOrderDetailBatch(
    orderSnList: string[],
    params: ShopeeDetailParams,
    onRefresh?: () => Promise<boolean>,
  ): Promise<ShopeeOrderDetailItem[] | null> {
    return this.fetchOrderDetailBatchWithOptionalFields(
      orderSnList,
      params,
      "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,item_list,pay_time,total_amount,order_status,create_time,update_time,package_list,invoice_data",
      onRefresh,
    );
  }

  /**
   * Fetch one order by order_sn with full optional fields (for webhook: max info).
   */
  async fetchOneOrderDetail(
    orderSn: string,
    params: ShopeeDetailParams,
    onRefresh?: () => Promise<boolean>,
  ): Promise<ShopeeOrderDetailItem | null> {
    const list = await this.fetchOrderDetailBatchWithOptionalFields(
      [orderSn],
      params,
      SHOPEE_DETAIL_FULL_OPTIONAL_FIELDS,
      onRefresh,
    );
    return list && list.length > 0 ? list[0] : null;
  }

  private async fetchOrderDetailBatchWithOptionalFields(
    orderSnList: string[],
    params: ShopeeDetailParams,
    responseOptionalFields: string,
    onRefresh?: () => Promise<boolean>,
  ): Promise<ShopeeOrderDetailItem[] | null> {
    if (orderSnList.length === 0) return [];
    if (orderSnList.length > DETAIL_PAGE_SIZE) {
      throw new Error("fetchOrderDetailBatch supports max 50 order_sn per call");
    }
    const { partnerId, partnerKey, accessToken, shopId } = params;
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = signBase(partnerId, DETAIL_PATH, timestamp, accessToken, shopId);
    const sign = await hmacSha256Hex(partnerKey, baseString);
    const orderSnListParam = orderSnList.join(",");

    const tryFetch = async (
      allowRefresh: boolean,
    ): Promise<ShopeeOrderDetailItem[] | null> => {
      try {
        const u = `${SHOPEE_HOST}${DETAIL_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopId))}&sign=${sign}&order_sn_list=${encodeURIComponent(orderSnListParam)}&request_order_status_pending=true&response_optional_fields=${encodeURIComponent(responseOptionalFields)}`;
        const resp = await fetch(u, {
          method: "GET",
          headers: { "content-type": "application/json" },
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          if ((resp.status === 401 || resp.status === 403) && allowRefresh && onRefresh) {
            const ok = await onRefresh();
            if (ok) return tryFetch(false);
          }
          const apiMsg = json?.message ?? json?.error ?? resp.statusText;
          throw new Error(`Shopee get_order_detail HTTP ${resp.status}: ${apiMsg}`);
        }
        const list = Array.isArray(json?.response?.order_list) ? json.response.order_list : [];
        return list as ShopeeOrderDetailItem[];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Shopee get_order_detail failed: ${msg}`);
      }
    };
    return tryFetch(true);
  }

  /**
   * Fetch escrow detail for one order_sn (for marketplace_fee / commission_fee in normalize).
   */
  async fetchEscrowDetail(
    orderSn: string,
    params: ShopeeDetailParams,
    onRefresh?: () => Promise<boolean>,
  ): Promise<ShopeeEscrowDetailPayload | null> {
    const { partnerId, partnerKey, accessToken, shopId } = params;
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = signBase(partnerId, ESCROW_PATH, timestamp, accessToken, shopId);
    const sign = await hmacSha256Hex(partnerKey, baseString);

    const tryOnce = async (
      allowRefresh: boolean,
    ): Promise<ShopeeEscrowDetailPayload | null> => {
      try {
        const url = `${SHOPEE_HOST}${ESCROW_PATH}?partner_id=${encodeURIComponent(partnerId)}&timestamp=${timestamp}&access_token=${encodeURIComponent(accessToken)}&shop_id=${encodeURIComponent(String(shopId))}&sign=${sign}&order_sn=${encodeURIComponent(orderSn)}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: { "content-type": "application/json" },
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          if ((resp.status === 401 || resp.status === 403) && allowRefresh && onRefresh) {
            const ok = await onRefresh();
            if (ok) return tryOnce(false);
          }
          const apiMsg = json?.message ?? json?.error ?? resp.statusText;
          throw new Error(`Shopee get_escrow_detail HTTP ${resp.status}: ${apiMsg}`);
        }
        return (json?.response ?? null) as ShopeeEscrowDetailPayload | null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Shopee get_escrow_detail failed: ${msg}`);
      }
    };
    return tryOnce(true);
  }
}
