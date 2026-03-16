/**
 * Cycle 0: Sync ML orders. Uses /orders/search (date range, paginated), then GET /orders/:id per order;
 * normalize → upsert → optional marketplace_orders_raw. See CYCLE_0 doc for Search API.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { MlOrderApiAdapter } from "../_shared/adapters/ml/ml-order-api-adapter.ts";
import { fetchOrderIds } from "../_shared/adapters/ml/ml-fetch-orders.ts";
import { SupabaseMarketplaceOrdersRawAdapter } from "../_shared/adapters/orders-raw/marketplace-orders-raw.ts";
import {
  resolveMLSyncContext,
  type SyncMLInput,
} from "../_shared/adapters/sync-context/ml-sync-context.ts";
import { MlOrderSyncProcessor } from "../_shared/adapters/sync-context/ml-order-sync-processor.ts";
import { MlOrderNormalizeService } from "../_shared/orders-normalize/index.ts";
import { OrdersUpsertAdapter } from "../orders-upsert/orders-upsert-adapter.ts";

const mlNormalizer = new MlOrderNormalizeService();

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const start = Date.now();
  const errors: Array<{ order_id: string; error: string }> = [];
  let synced = 0;
  let failed = 0;

  try {
    const body = (await req.json()) as SyncMLInput;
    const resolved = await resolveMLSyncContext(body);
    if ("err" in resolved) return resolved.err;
    const ctx = resolved.ctx;

    const orderIds = await fetchOrderIds(ctx.accessToken, ctx.sellerId, ctx.dateFrom, ctx.dateTo);
    const processor = new MlOrderSyncProcessor(
      {
        admin: ctx.admin,
        accessToken: ctx.accessToken,
        orgId: ctx.orgId,
        integrationId: ctx.integrationId,
        nowIso: ctx.nowIso,
      },
      new MlOrderApiAdapter(),
      new OrdersUpsertAdapter(),
      new SupabaseMarketplaceOrdersRawAdapter(ctx.admin),
      mlNormalizer,
    );
    for (const orderId of orderIds) {
      try {
        const out = await processor.processOneOrder(orderId);
        if (out.ok) synced++;
        else {
          failed++;
          errors.push({ order_id: orderId, error: out.error ?? "Unknown" });
        }
      } catch (e) {
        failed++;
        errors.push({ order_id: orderId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return jsonResponse(
      { success: true, synced, failed, errors, duration_ms: Date.now() - start },
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
