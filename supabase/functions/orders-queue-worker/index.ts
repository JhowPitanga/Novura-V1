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
import { isFetchFullOrderError } from "../_shared/domain/ml/ml-order-api-fetch.ts";
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

async function processML(
  envelope: QueueEnvelope,
  encKeyB64: string,
  queue: SupabaseOrdersQueueAdapter,
  admin: AdminClient,
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
    throw new Error(
      `ML order fetch failed: ${fetchResult.reason} status=${fetchResult.status ?? "?"}`,
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

  await queue.archive(envelope.msg_id);
}

async function processShopee(
  envelope: QueueEnvelope,
  encKeyB64: string,
  queue: SupabaseOrdersQueueAdapter,
  admin: AdminClient,
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
        await processML(envelope, encKeyB64, queue, admin);
      } else if (isShopeeOrderQueueMessage(msg)) {
        await processShopee(envelope, encKeyB64, queue, admin);
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

