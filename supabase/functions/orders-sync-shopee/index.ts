/**
 * Cycle 0: Sync Shopee orders. Uses get_order_list (cursor) then get_order_detail (batch 50);
 * optional escrow per order; normalize → upsert. No raw, no process-presented, no labels.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import {
  resolveShopeeSyncContext,
  type SyncShopeeInput,
  type ShopeeSyncContext,
} from "../_shared/adapters/sync-context/shopee-sync-context.ts";
import {
  ShopeeFetchOrdersAdapter,
  type ShopeeFetchParams,
} from "../_shared/adapters/shopee/index.ts";
import {
  isShopeeOrderDetailItem,
  ShopeeOrderNormalizeService,
} from "../_shared/orders-normalize/index.ts";
import { upsertOrder } from "../_shared/adapters/orders-upsert/index.ts";
import { getShopeeAccessToken } from "../_shared/adapters/tokens/shopee-token.ts";

const shopeeNormalizer = new ShopeeOrderNormalizeService();
const shopeeFetchOrders = new ShopeeFetchOrdersAdapter();
const NINETY_DAYS_SEC = 90 * 24 * 60 * 60;
const BATCH_SIZE = 50;

interface SyncShopeeResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ order_id: string; error: string }>;
  duration_ms: number;
}

function buildFetchParams(ctx: ShopeeSyncContext): ShopeeFetchParams {
  return {
    partnerId: ctx.partnerId,
    partnerKey: ctx.partnerKey,
    accessToken: ctx.accessToken,
    shopId: ctx.shopId,
    timeFrom: 0,
    timeTo: Math.floor(Date.now() / 1000),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const start = Date.now();
  const errors: Array<{ order_id: string; error: string }> = [];
  let synced = 0;
  let failed = 0;

  try {
    const body = (await req.json()) as SyncShopeeInput;
    const resolved = await resolveShopeeSyncContext(body);
    if ("err" in resolved) return resolved.err;
    const ctx = resolved.ctx;

    const nowSec = Math.floor(Date.now() / 1000);
    const timeTo = body?.time_to ?? nowSec;
    const timeFrom = body?.time_from ?? nowSec - NINETY_DAYS_SEC;

    const fetchParams = buildFetchParams(ctx);
    fetchParams.timeFrom = timeFrom;
    fetchParams.timeTo = timeTo;

    const onRefresh = async (): Promise<boolean> => {
      try {
        const t = await getShopeeAccessToken(
          ctx.integrationsPort,
          ctx.appCredentialsPort,
          ctx.integrationId,
          ctx.encKeyB64,
        );
        ctx.accessToken = t.accessToken;
        return true;
      } catch (_) {
        return false;
      }
    };

    const orderSns = await shopeeFetchOrders.fetchOrderSnList(fetchParams, onRefresh);
    if (orderSns.length === 0) {
      return jsonResponse(
        { success: true, synced: 0, failed: 0, errors: [], duration_ms: Date.now() - start },
        200,
      );
    }

    for (let i = 0; i < orderSns.length; i += BATCH_SIZE) {
      const batch = orderSns.slice(i, i + BATCH_SIZE);
      const detailParams = {
        partnerId: ctx.partnerId,
        partnerKey: ctx.partnerKey,
        accessToken: ctx.accessToken,
        shopId: ctx.shopId,
      };
      const orderList = await shopeeFetchOrders.fetchOrderDetailBatch(batch, detailParams, onRefresh);
      if (!orderList || orderList.length === 0) {
        for (const sn of batch) {
          failed++;
          errors.push({ order_id: sn, error: "No detail response" });
        }
        continue;
      }

      for (const rawOrder of orderList) {
        if (!isShopeeOrderDetailItem(rawOrder)) continue;
        const orderSn = String(rawOrder.order_sn ?? rawOrder.ordersn ?? "");
        if (!orderSn) continue;
        try {
          const escrow = await shopeeFetchOrders.fetchEscrowDetail(orderSn, detailParams, onRefresh).catch(() => null);
          const order = shopeeNormalizer.normalize(rawOrder, escrow ?? undefined);
          const result = await upsertOrder(ctx.admin, {
            organization_id: ctx.orgId,
            order,
            source: "sync",
          });
          if (result.success) synced++;
          else {
            failed++;
            errors.push({ order_id: orderSn, error: result.error ?? "Upsert failed" });
          }
        } catch (e) {
          failed++;
          errors.push({
            order_id: orderSn,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return jsonResponse(
      {
        success: true,
        synced,
        failed,
        errors,
        duration_ms: Date.now() - start,
      } satisfies SyncShopeeResult,
      200,
    );
  } catch (e) {
    return jsonResponse(
      {
        success: false,
        synced,
        failed,
        errors,
        duration_ms: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
});
