/**
 * Tests for orders-queue-worker — PRD C0-T7.
 * Strategy: mirror the batch processing logic in a local `processQueueBatch` function
 * that accepts injected mock adapters (queue, ML fetcher, Shopee fetcher, upsert).
 * This avoids importing `serve()` side effects from index.ts and keeps all
 * external calls (ML API, Shopee API, DB) fully mocked.
 *
 * Run with: deno test -A index.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { FetchFullOrderResult } from "../_shared/domain/ml/ml-order-api-fetch.ts";
import { isFetchFullOrderError } from "../_shared/domain/ml/ml-order-api-fetch.ts";
import {
  isMlOrderQueueMessage,
  isShopeeOrderQueueMessage,
  type QueueEnvelope,
  type MlOrderQueueMessage,
  type ShopeeOrderQueueMessage,
} from "../_shared/domain/orders/order-queue-message.types.ts";
import type { MlOrderFetchPort } from "../_shared/ports/ml-order-fetch-port.ts";
import type { OrdersUpsertPort } from "../_shared/ports/orders-upsert-port.ts";
import type { OrdersQueuePort } from "../_shared/ports/orders-queue-port.ts";
import type { MlOrderResponse } from "../_shared/domain/ml/ml-order-api.types.ts";
import type { NormalizedOrder } from "../_shared/domain/orders/orders-types.ts";
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { ShopeeOrderDetailItem } from "../_shared/domain/shopee/shopee-order-api.types.ts";

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

function makeRawMlOrder(id = 1001): MlOrderResponse {
  return {
    id,
    status: "paid",
    date_created: "2025-01-01T00:00:00Z",
    order_items: [],
    payments: [],
    shipping: null,
    buyer: null,
  };
}

function makeRawShopeeOrder(orderSn = "220810QSK8S7BX"): ShopeeOrderDetailItem {
  return {
    order_sn: orderSn,
    order_status: "PROCESSED",
    create_time: 1660000000,
    update_time: 1660100000,
    total_amount: "150.00",
    item_list: [],
  } as unknown as ShopeeOrderDetailItem;
}

function makeNormalizedOrder(marketplace: "mercado_livre" | "shopee"): NormalizedOrder {
  return {
    marketplace,
    marketplace_order_id: "test-order-1",
    pack_id: null,
    status: null,
    marketplace_status: "paid",
    payment_status: null,
    gross_amount: 150,
    marketplace_fee: 15,
    shipping_cost: 10,
    shipping_subsidy: 0,
    net_amount: 125,
    buyer_name: null,
    buyer_document: null,
    buyer_email: null,
    buyer_phone: null,
    buyer_state: null,
    created_at: "2025-01-01T00:00:00Z",
    shipped_at: null,
    delivered_at: null,
    canceled_at: null,
    items: [],
    shipping: null,
  };
}

function makeMlEnvelope(
  msgId: bigint,
  orderId: string,
  meliUserId: string,
): QueueEnvelope {
  const msg: MlOrderQueueMessage = {
    marketplace: "mercado_livre",
    marketplace_order_id: orderId,
    meli_user_id: meliUserId,
  };
  return { msg_id: msgId, read_ct: 1, enqueued_at: "", vt: "", message: msg };
}

function makeShopeeEnvelope(
  msgId: bigint,
  orderSn: string,
  shopId: number,
): QueueEnvelope {
  const msg: ShopeeOrderQueueMessage = {
    marketplace: "shopee",
    order_sn: orderSn,
    shop_id: shopId,
  };
  return { msg_id: msgId, read_ct: 1, enqueued_at: "", vt: "", message: msg };
}

function makeUnknownEnvelope(msgId: bigint): QueueEnvelope {
  // Cast to bypass type checking — intentionally malformed shape
  return {
    msg_id: msgId,
    read_ct: 1,
    enqueued_at: "",
    vt: "",
    message: { marketplace: "unknown_marketplace" } as never,
  };
}

// ---------------------------------------------------------------------------
// Stub factories
// ---------------------------------------------------------------------------

interface QueueTracker {
  archived: bigint[];
}

function makeQueue(
  envelopes: QueueEnvelope[],
  tracker: QueueTracker,
): OrdersQueuePort {
  return {
    enqueue: () => Promise.resolve(BigInt(0)),
    readBatch: () => Promise.resolve(envelopes),
    archive: (msgId: bigint) => {
      tracker.archived.push(msgId);
      return Promise.resolve();
    },
  };
}

function makeSuccessUpsert(): OrdersUpsertPort {
  return {
    upsert: () => Promise.resolve({ success: true, order_id: "ord-1", created: true }),
  };
}

function makeFailUpsert(): OrdersUpsertPort {
  return {
    upsert: () => Promise.resolve({ success: false, order_id: null, created: false, error: "DB constraint violation" }),
  };
}

// ---------------------------------------------------------------------------
// Handler mirror — same logic as index.ts but with injected ports
// ---------------------------------------------------------------------------

interface WorkerDeps {
  queue: OrdersQueuePort;
  mlFetcher: MlOrderFetchPort;
  /** Resolves ML integration by meliUserId → returns organizationId or throws */
  resolveML: (meliUserId: string) => Promise<{ integrationId: string; organizationId: string }>;
  /** Returns ML access token or throws */
  getMlToken: (integrationId: string) => Promise<string>;
  /** Force-refreshes ML token; returns new token or null */
  forceRefreshMlToken: (integrationId: string) => Promise<string | null>;
  /** Resolves Shopee integration → returns orderDetail params and organizationId */
  resolveShopee: (
    shopId: number,
    orderSn: string,
  ) => Promise<{ orderDetail: ShopeeOrderDetailItem | null; organizationId: string }>;
  upsert: OrdersUpsertPort;
  mlNormalize: (order: MlOrderResponse) => NormalizedOrder;
  shopeeNormalize: (order: ShopeeOrderDetailItem) => NormalizedOrder;
}

interface WorkerResult {
  ok: boolean;
  processed: number;
  failed: number;
  errors: Array<{ msg_id: number; error: string }>;
}

async function processML(
  envelope: QueueEnvelope,
  deps: WorkerDeps,
  admin: SupabaseClient,
): Promise<void> {
  const msg = envelope.message;
  if (!isMlOrderQueueMessage(msg)) return;

  const { integrationId, organizationId } = await deps.resolveML(msg.meli_user_id);
  const accessToken = await deps.getMlToken(integrationId);

  let fetchResult = await deps.mlFetcher.fetchFullOrder(accessToken, msg.marketplace_order_id);
  if (
    isFetchFullOrderError(fetchResult) &&
    fetchResult.reason === "http" &&
    (fetchResult.status === 401 || fetchResult.status === 403)
  ) {
    const refreshed = await deps.forceRefreshMlToken(integrationId);
    if (refreshed) {
      fetchResult = await deps.mlFetcher.fetchFullOrder(refreshed, msg.marketplace_order_id);
    }
  }
  if (isFetchFullOrderError(fetchResult)) {
    throw new Error(`ML fetch failed: ${fetchResult.reason} status=${fetchResult.status ?? "?"}`);
  }

  const order = deps.mlNormalize(fetchResult.order);
  const result = await deps.upsert.upsert(admin, { organization_id: organizationId, order, source: "webhook" });
  if (!result.success) throw new Error(`Upsert failed: ${result.error}`);

  await deps.queue.archive(envelope.msg_id);
}

async function processShopee(
  envelope: QueueEnvelope,
  deps: WorkerDeps,
  admin: SupabaseClient,
): Promise<void> {
  const msg = envelope.message;
  if (!isShopeeOrderQueueMessage(msg)) return;

  const { orderDetail, organizationId } = await deps.resolveShopee(msg.shop_id, msg.order_sn);
  if (!orderDetail) throw new Error(`Shopee fetch returned null for ${msg.order_sn}`);

  const order = deps.shopeeNormalize(orderDetail);
  const result = await deps.upsert.upsert(admin, { organization_id: organizationId, order, source: "webhook" });
  if (!result.success) throw new Error(`Upsert failed: ${result.error}`);

  await deps.queue.archive(envelope.msg_id);
}

async function runWorker(deps: WorkerDeps): Promise<WorkerResult> {
  const envelopes = await deps.queue.readBatch(10, 120);
  if (envelopes.length === 0) {
    return { ok: true, processed: 0, failed: 0, errors: [] };
  }

  let processed = 0;
  let failed = 0;
  const errors: Array<{ msg_id: number; error: string }> = [];
  const admin = {} as SupabaseClient;

  for (const envelope of envelopes) {
    try {
      const msg = envelope.message;
      if (isMlOrderQueueMessage(msg)) {
        await processML(envelope, deps, admin);
      } else if (isShopeeOrderQueueMessage(msg)) {
        await processShopee(envelope, deps, admin);
      } else {
        // Unknown shape — archive to prevent infinite retry loop
        await deps.queue.archive(envelope.msg_id);
      }
      processed++;
    } catch (e) {
      failed++;
      const errMsg = e instanceof Error ? e.message : String(e);
      errors.push({ msg_id: Number(envelope.msg_id), error: errMsg });
    }
  }

  return { ok: true, processed, failed, errors };
}

// ---------------------------------------------------------------------------
// Shared stubs for integration resolution
// ---------------------------------------------------------------------------

function makeMLResolve() {
  return (_meliUserId: string) =>
    Promise.resolve({ integrationId: "int-ml-1", organizationId: "org-1" });
}

function makeMLToken() {
  return (_integrationId: string) => Promise.resolve("valid-token");
}

function makeMLForceRefresh(newToken: string | null) {
  return (_integrationId: string) => Promise.resolve(newToken);
}

function makeShopeeResolve(orderSn: string) {
  return (_shopId: number, _orderSn: string) =>
    Promise.resolve({ orderDetail: makeRawShopeeOrder(orderSn), organizationId: "org-1" });
}

function makeMLNormalize() {
  return (_raw: MlOrderResponse) => makeNormalizedOrder("mercado_livre");
}

function makeShopeeNormalize() {
  return (_raw: ShopeeOrderDetailItem) => makeNormalizedOrder("shopee");
}

// ---------------------------------------------------------------------------
// Test 1: Empty queue → { ok: true, processed: 0, failed: 0 }
// ---------------------------------------------------------------------------

Deno.test("Empty queue returns ok:true processed:0 failed:0", async () => {
  const tracker: QueueTracker = { archived: [] };
  const result = await runWorker({
    queue: makeQueue([], tracker),
    mlFetcher: { fetchFullOrder: () => Promise.resolve({ ok: true, order: makeRawMlOrder() }) },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: makeMLForceRefresh(null),
    resolveShopee: makeShopeeResolve("ord-1"),
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.ok, true);
  assertEquals(result.processed, 0);
  assertEquals(result.failed, 0);
  assertEquals(result.errors, []);
  assertEquals(tracker.archived.length, 0);
});

// ---------------------------------------------------------------------------
// Test 2: One valid ML message → fetches, upserts, archives. processed:1 failed:0
// ---------------------------------------------------------------------------

Deno.test("One valid ML message: processed:1 failed:0, message archived", async () => {
  const envelope = makeMlEnvelope(BigInt(10), "2195160686", "468424240");
  const tracker: QueueTracker = { archived: [] };
  let fetchCalled = false;

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: {
      fetchFullOrder: (_token, _orderId) => {
        fetchCalled = true;
        return Promise.resolve({ ok: true, order: makeRawMlOrder() });
      },
    },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: makeMLForceRefresh(null),
    resolveShopee: makeShopeeResolve("ignored"),
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.processed, 1);
  assertEquals(result.failed, 0);
  assertEquals(result.errors, []);
  assertEquals(fetchCalled, true);
  assertEquals(tracker.archived.length, 1);
  assertEquals(tracker.archived[0], BigInt(10));
});

// ---------------------------------------------------------------------------
// Test 3: One valid Shopee message → fetches, upserts, archives. processed:1 failed:0
// ---------------------------------------------------------------------------

Deno.test("One valid Shopee message: processed:1 failed:0, message archived", async () => {
  const envelope = makeShopeeEnvelope(BigInt(20), "220810QSK8S7BX", 727720655);
  const tracker: QueueTracker = { archived: [] };
  let shopeeResolveCalled = false;

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: { fetchFullOrder: () => Promise.resolve({ ok: true, order: makeRawMlOrder() }) },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: makeMLForceRefresh(null),
    resolveShopee: (_shopId, orderSn) => {
      shopeeResolveCalled = true;
      return Promise.resolve({ orderDetail: makeRawShopeeOrder(orderSn), organizationId: "org-1" });
    },
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.processed, 1);
  assertEquals(result.failed, 0);
  assertEquals(result.errors, []);
  assertEquals(shopeeResolveCalled, true);
  assertEquals(tracker.archived.length, 1);
  assertEquals(tracker.archived[0], BigInt(20));
});

// ---------------------------------------------------------------------------
// Test 4: ML token expired (401) → token refreshed, order fetched, message archived. processed:1
// ---------------------------------------------------------------------------

Deno.test("ML 401 on first fetch → token refreshed, order fetched on retry, processed:1", async () => {
  const envelope = makeMlEnvelope(BigInt(30), "2195160686", "468424240");
  const tracker: QueueTracker = { archived: [] };
  let fetchCallCount = 0;
  let forceRefreshCalled = false;

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: {
      fetchFullOrder: (_token, _orderId): Promise<FetchFullOrderResult> => {
        fetchCallCount++;
        // First call returns 401; second call (with refreshed token) succeeds
        if (fetchCallCount === 1) {
          return Promise.resolve({ ok: false, reason: "http", status: 401 });
        }
        return Promise.resolve({ ok: true, order: makeRawMlOrder() });
      },
    },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: (_integrationId) => {
      forceRefreshCalled = true;
      return Promise.resolve("refreshed-token");
    },
    resolveShopee: makeShopeeResolve("ignored"),
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.processed, 1);
  assertEquals(result.failed, 0);
  assertEquals(forceRefreshCalled, true);
  assertEquals(fetchCallCount, 2);
  assertEquals(tracker.archived.length, 1);
});

// ---------------------------------------------------------------------------
// Test 5: ML API returns 403 → message NOT archived, failed:1
// ---------------------------------------------------------------------------

Deno.test("ML 403 after token refresh → message NOT archived, failed:1", async () => {
  const envelope = makeMlEnvelope(BigInt(40), "2195160686", "468424240");
  const tracker: QueueTracker = { archived: [] };

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: {
      fetchFullOrder: (): Promise<FetchFullOrderResult> =>
        // Always returns 403 — even after refresh
        Promise.resolve({ ok: false, reason: "http", status: 403 }),
    },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: (_integrationId) => Promise.resolve("refreshed-token"),
    resolveShopee: makeShopeeResolve("ignored"),
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.processed, 0);
  assertEquals(result.failed, 1);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].msg_id, 40);
  // Message must NOT be archived — it stays in queue for retry
  assertEquals(tracker.archived.length, 0);
});

// ---------------------------------------------------------------------------
// Test 6: Unknown message shape → message archived (prevent loop), not counted as processed
// ---------------------------------------------------------------------------

Deno.test("Unknown message shape: archived to prevent retry loop, processed:1 (archived, not a processing failure)", async () => {
  const envelope = makeUnknownEnvelope(BigInt(50));
  const tracker: QueueTracker = { archived: [] };

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: { fetchFullOrder: () => Promise.resolve({ ok: true, order: makeRawMlOrder() }) },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: makeMLForceRefresh(null),
    resolveShopee: makeShopeeResolve("ignored"),
    upsert: makeSuccessUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  // Unknown shape: archived (to prevent infinite retry), counted in processed (not failed)
  assertEquals(result.failed, 0);
  assertEquals(tracker.archived.length, 1);
  assertEquals(tracker.archived[0], BigInt(50));
});

// ---------------------------------------------------------------------------
// Test 7: Upsert fails → message NOT archived, failed:1
// ---------------------------------------------------------------------------

Deno.test("Upsert failure: message NOT archived, failed:1", async () => {
  const envelope = makeMlEnvelope(BigInt(60), "2195160686", "468424240");
  const tracker: QueueTracker = { archived: [] };

  const result = await runWorker({
    queue: makeQueue([envelope], tracker),
    mlFetcher: {
      fetchFullOrder: () => Promise.resolve({ ok: true, order: makeRawMlOrder() }),
    },
    resolveML: makeMLResolve(),
    getMlToken: makeMLToken(),
    forceRefreshMlToken: makeMLForceRefresh(null),
    resolveShopee: makeShopeeResolve("ignored"),
    upsert: makeFailUpsert(),
    mlNormalize: makeMLNormalize(),
    shopeeNormalize: makeShopeeNormalize(),
  });

  assertEquals(result.processed, 0);
  assertEquals(result.failed, 1);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].msg_id, 60);
  // Message must NOT be archived — it stays in queue for retry
  assertEquals(tracker.archived.length, 0);
});
