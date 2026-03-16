/**
 * ML order sync: business logic for "process one order" (fetch → normalize → upsert order + raw).
 * Receives adapters (implementing ports) so the Edge Function wires infra, not functions.
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { MlOrderFetchPort } from "../../ports/ml-order-fetch-port.ts";
import type { OrdersUpsertPort } from "../../ports/orders-upsert-port.ts";
import type { MarketplaceOrdersRawPort } from "../../ports/marketplace-orders-raw-port.ts";
import type { MlOrderNormalizeService } from "../../orders-normalize/index.ts";
import { isFetchFullOrderError } from "../../domain/ml/ml-order-api-fetch.ts";

const ML_MARKETPLACE_NAME = "Mercado Livre";

export interface MlOrderSyncContext {
  admin: SupabaseClient;
  accessToken: string;
  orgId: string;
  integrationId: string;
  nowIso: string;
}

export type ProcessOneOrderResult = { ok: boolean; error?: string };

/**
 * Orchestrates one ML order: fetch full order → validate → normalize → upsert orders/items/shipping/status_history → upsert raw.
 * Adapters are injected as separate constructor params (Java-style).
 */
export class MlOrderSyncProcessor {
  constructor(
    private readonly ctx: MlOrderSyncContext,
    private readonly fetchOrderAdapter: MlOrderFetchPort,
    private readonly upsertOrderAdapter: OrdersUpsertPort,
    private readonly rawOrdersAdapter: MarketplaceOrdersRawPort,
    private readonly mlNormalizer: MlOrderNormalizeService,
  ) {}

  async processOneOrder(orderId: string): Promise<ProcessOneOrderResult> {
    const fetchResult = await this.fetchOrderAdapter.fetchFullOrder(this.ctx.accessToken, orderId);
    if (isFetchFullOrderError(fetchResult)) {
      if (fetchResult.reason === "http" && fetchResult.status === 403) {
        return { ok: false, error: "403 (cancelled/confidential)" };
      }
      return { ok: false, error: "Invalid or empty order response" };
    }
    const order = this.mlNormalizer.normalize(fetchResult.order);
    const result = await this.upsertOrderAdapter.upsert(this.ctx.admin, {
      organization_id: this.ctx.orgId,
      order,
      source: "sync",
    });
    if (!result.success) return { ok: false, error: result.error ?? "Upsert failed" };
    await this.rawOrdersAdapter.upsert({
      organizationId: this.ctx.orgId,
      marketplaceName: ML_MARKETPLACE_NAME,
      marketplaceOrderId: orderId,
      integrationId: this.ctx.integrationId,
      data: fetchResult.order,
      lastSyncedAt: this.ctx.nowIso,
      updatedAt: this.ctx.nowIso,
    });
    return { ok: true };
  }
}
