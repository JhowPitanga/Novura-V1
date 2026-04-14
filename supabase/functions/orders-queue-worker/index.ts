/**
 * Cycle 0: orders-queue-worker. Application Service triggered by pg_cron (every 30s).
 * Reads up to BATCH_SIZE OrderSyncQueueMessage events, processes each:
 *   resolve integration → get/refresh token → fetch full order → normalize → upsert → archive.
 * On error: logs, leaves message in queue (auto-retried after VT expires).
 * No new business logic — orchestrates _shared/ adapters and domain services only.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  jsonResponse,
  handleOptions,
} from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseOrdersQueueAdapter } from "../_shared/adapters/orders-queue/orders-queue-adapter.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import {
  getMlAccessToken,
  forceRefreshMlToken,
} from "../_shared/adapters/tokens/ml-token.ts";
import { getShopeeAccessToken } from "../_shared/adapters/tokens/shopee-token.ts";
import { MlOrderApiAdapter } from "../_shared/adapters/ml/ml-order-api-adapter.ts";
import { ShopeeFetchOrdersAdapter } from "../_shared/adapters/shopee/shopee-fetch-orders.ts";
import {
  MlOrderNormalizeService,
  ShopeeOrderNormalizeService,
} from "../_shared/orders-normalize/index.ts";
import { OrdersUpsertAdapter } from "../_shared/adapters/orders-upsert/index.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/supabase-order-repository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/supabase-inventory-adapter.ts";
import { SupabaseWarehouseResolver } from "../_shared/adapters/warehouse/SupabaseWarehouseResolver.ts";
import { isFetchFullOrderError } from "../_shared/domain/ml/ml-order-api-fetch.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { ResolveOrderWarehouseUseCase } from "../_shared/application/orders/ResolveOrderWarehouseUseCase.ts";
import {
  isMlOrderQueueMessage,
  isShopeeOrderQueueMessage,
  type QueueEnvelope,
} from "../_shared/domain/orders/order-queue-message.types.ts";

const BATCH_SIZE = 10;
const VISIBILITY_TIMEOUT_SEC = 120; // message invisible to other workers for 120s; retry if not archived
const ML_MARKETPLACE_NAME = "Mercado Livre";
const SHOPEE_MARKETPLACE_NAME = "Shopee";

// Module-level singletons — safe for Deno edge function lifecycle
const mlFetcher = new MlOrderApiAdapter();
const shopeeFetcher = new ShopeeFetchOrdersAdapter();
const mlNormalizer = new MlOrderNormalizeService();
const shopeeNormalizer = new ShopeeOrderNormalizeService();
const upsertAdapter = new OrdersUpsertAdapter();

type AdminClient = ReturnType<typeof createAdminClient>;

function buildStatusUseCases(admin: AdminClient): { recalculate: RecalculateOrderStatusUseCase } {
  const orderRepo = new SupabaseOrderRepository(admin);
  const inventory = new SupabaseInventoryAdapter(admin);
  const stockEffects = new HandleStockSideEffectsUseCase(inventory);
  const recalculate = new RecalculateOrderStatusUseCase(
    orderRepo,
    new OrderStatusEngine(),
    stockEffects,
  );
  return { recalculate };
}

async function persistRecalculateFailure(params: {
  admin: AdminClient;
  orderId: string;
  errorMessage: string;
}): Promise<void> {
  const baseRow = {
    order_id: params.orderId,
    from_status: null,
    to_status: "system_error",
    source: "system_error",
  };
  const withDescription = { ...baseRow, description: params.errorMessage };
  const attemptWithDescription = await params.admin
    .from("order_status_history")
    .insert(withDescription as never);
  if (!attemptWithDescription.error) return;
  const fallback = await params.admin.from("order_status_history").insert(baseRow as never);
  if (fallback.error) {
    console.error("[orders-queue-worker] failed to persist recalculate error", {
      orderId: params.orderId,
      error: fallback.error.message,
    });
  }
}

/**
 * Resolves the correct warehouse for an order and persists storage_id +
 * integration_id on the orders row.
 * Must be called after the order upsert so the orderId is known.
 * Non-fatal: failures are logged but do not block order processing.
 */
async function resolveAndPersistWarehouse(params: {
  admin: AdminClient;
  orderId: string;
  integrationId: string;
  isFulfillment: boolean;
}): Promise<void> {
  try {
    const resolver = new SupabaseWarehouseResolver(params.admin);
    const useCase = new ResolveOrderWarehouseUseCase(resolver);
    const storageId = await useCase.execute({
      integrationId: params.integrationId,
      isFulfillment: params.isFulfillment,
    });

    // Always persist integration_id; only set storage_id when resolved.
    const updatePayload: Record<string, unknown> = { integration_id: params.integrationId };
    if (storageId) updatePayload.storage_id = storageId;

    const { error } = await (params.admin as unknown as {
      from: (t: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("orders")
      .update(updatePayload)
      .eq("id", params.orderId);

    if (error) {
      console.warn("[orders-queue-worker] failed to persist warehouse fields", {
        orderId: params.orderId,
        error: error.message,
      });
    }
  } catch (e) {
    console.warn("[orders-queue-worker] warehouse resolution error", {
      orderId: params.orderId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function recalculateAfterUpsert(params: {
  admin: AdminClient;
  orderId: string;
  recalculate: RecalculateOrderStatusUseCase;
}): Promise<void> {
  try {
    await params.recalculate.execute(params.orderId, "sync");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[orders-queue-worker] recalculate failed", {
      orderId: params.orderId,
      error: errorMessage,
    });
    await persistRecalculateFailure({
      admin: params.admin,
      orderId: params.orderId,
      errorMessage,
    });
  }
}

async function processML(
  envelope: QueueEnvelope,
  encKeyB64: string,
  queue: SupabaseOrdersQueueAdapter,
  admin: AdminClient,
  recalculate: RecalculateOrderStatusUseCase,
): Promise<void> {
  const msg = envelope.message;
  if (!isMlOrderQueueMessage(msg)) return;

  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  const integration = await integrations.getIntegrationByMeliUserId(
    msg.meli_user_id,
    ML_MARKETPLACE_NAME,
  );
  if (!integration) {
    throw new Error(
      `Integration not found for meli_user_id=${msg.meli_user_id}`,
    );
  }

  let accessToken: string;
  try {
    accessToken = (
      await getMlAccessToken(
        integrations,
        appCredentials,
        integration.id,
        encKeyB64,
      )
    ).accessToken;
  } catch (e) {
    throw new Error(
      `Token error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let fetchResult = await mlFetcher.fetchFullOrder(
    accessToken,
    msg.marketplace_order_id,
  );
  if (
    isFetchFullOrderError(fetchResult) &&
    fetchResult.reason === "http" &&
    (fetchResult.status === 401 || fetchResult.status === 403)
  ) {
    const refreshed = await forceRefreshMlToken(
      integrations,
      appCredentials,
      integration.id,
      encKeyB64,
    );
    if (refreshed) {
      fetchResult = await mlFetcher.fetchFullOrder(
        refreshed,
        msg.marketplace_order_id,
      );
    }
  }
  if (isFetchFullOrderError(fetchResult)) {
    const errorStatus = "status" in fetchResult ? fetchResult.status : "?";
    throw new Error(
      `ML order fetch failed: ${fetchResult.reason} status=${errorStatus}`,
    );
  }

  const order = mlNormalizer.normalize(fetchResult.order);
  const result = await upsertAdapter.upsert(admin, {
    organization_id: String(integration.organizations_id),
    order,
    source: "webhook",
  });
  if (!result.success) {
    throw new Error(`Upsert failed: ${result.error}`);
  }
  if (result.order_id) {
    await resolveAndPersistWarehouse({
      admin,
      orderId: result.order_id,
      integrationId: integration.id,
      isFulfillment: order.isFulfillment ?? false,
    });
    await recalculateAfterUpsert({
      admin,
      orderId: result.order_id,
      recalculate,
    });
  }

  await queue.archive(envelope.msg_id);
}

async function processShopee(
  envelope: QueueEnvelope,
  encKeyB64: string,
  queue: SupabaseOrdersQueueAdapter,
  admin: AdminClient,
  recalculate: RecalculateOrderStatusUseCase,
): Promise<void> {
  const msg = envelope.message;
  if (!isShopeeOrderQueueMessage(msg)) return;

  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  const integration = await integrations.getIntegrationByShopId(
    msg.shop_id,
    SHOPEE_MARKETPLACE_NAME,
  );
  if (!integration) {
    throw new Error(`Integration not found for shop_id=${msg.shop_id}`);
  }

  const tokenResult = await getShopeeAccessToken(
    integrations,
    appCredentials,
    integration.id,
    encKeyB64,
  );
  const appRow = await appCredentials.getByName(SHOPEE_MARKETPLACE_NAME);
  if (!appRow) {
    throw new Error("Shopee app credentials not found");
  }

  const detailParams = {
    partnerId: appRow.client_id,
    partnerKey: appRow.client_secret,
    accessToken: tokenResult.accessToken,
    shopId: tokenResult.shopId,
  };
  const orderDetail = await shopeeFetcher.fetchOneOrderDetail(
    msg.order_sn,
    detailParams,
  );
  if (!orderDetail) {
    throw new Error(`Shopee order fetch returned null for ${msg.order_sn}`);
  }

  const order = shopeeNormalizer.normalize(orderDetail);
  const result = await upsertAdapter.upsert(admin, {
    organization_id: tokenResult.organizationId,
    order,
    source: "webhook",
  });
  if (!result.success) {
    throw new Error(`Upsert failed: ${result.error}`);
  }
  if (result.order_id) {
    await resolveAndPersistWarehouse({
      admin,
      orderId: result.order_id,
      integrationId: integration.id,
      isFulfillment: order.isFulfillment ?? false,
    });
    await recalculateAfterUpsert({
      admin,
      orderId: result.order_id,
      recalculate,
    });
  }

  await queue.archive(envelope.msg_id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKeyB64) {
    return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
  }

  const admin = createAdminClient();
  const queue = new SupabaseOrdersQueueAdapter(admin);
  const statusUseCases = buildStatusUseCases(admin);
  const envelopes = await queue.readBatch(BATCH_SIZE, VISIBILITY_TIMEOUT_SEC);

  if (envelopes.length === 0) {
    return jsonResponse({ ok: true, processed: 0, failed: 0, errors: [] }, 200);
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ msg_id: number; error: string }> = [];

  for (const envelope of envelopes) {
    try {
      const msg = envelope.message;
      if (isMlOrderQueueMessage(msg)) {
        await processML(envelope, encKeyB64, queue, admin, statusUseCases.recalculate);
      } else if (isShopeeOrderQueueMessage(msg)) {
        await processShopee(envelope, encKeyB64, queue, admin, statusUseCases.recalculate);
      } else {
        // Unknown message shape — archive to prevent infinite retry loop
        console.warn(
          "[orders-queue-worker] unknown message shape, archiving",
          envelope.msg_id,
        );
        await queue.archive(envelope.msg_id);
      }
      processed++;
    } catch (e) {
      failed++;
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push({ msg_id: Number(envelope.msg_id), error: errMsg });
      console.error("[orders-queue-worker] processing failed", {
        msg_id: envelope.msg_id,
        error: errMsg,
      });
      // Message is NOT archived — VT will expire and it will be retried automatically.
    }
  }

  return jsonResponse({ ok: true, processed, failed, errors }, 200);
});

