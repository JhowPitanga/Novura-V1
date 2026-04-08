---
name: ""
overview: ""
todos: []
isProject: false
---

# Cycle 0 — Remaining Work Plan

**Audit date:** 2026-03-02
**Status:** Infrastructure built, not yet wired or deployed
**Full spec:** `docs/CYCLE_0_ORDERS_PLATFORM.md`

> **For every agent executing a task in this plan:** The `_shared/` layer follows hexagonal architecture (ports & adapters) with DDD and SOLID principles. Before touching any file, ask: "Is this infrastructure (adapter), domain logic (service/normalizer), or contract (port/type)?" Infrastructure → `adapters/`, business rules → `domain/` services, contracts → `ports/`. Never put a Supabase query inside a domain service. Never put business logic in an adapter or edge function entrypoint. Keep files under 150 lines. One class, one responsibility.

---

## Audit: What Was Built Correctly

### Layer 1 — Database Schema ✅

All 7 migrations applied in `supabase/migrations/20260301_`:

- `orders` — UNIQUE `(organization_id, marketplace, marketplace_order_id)` + RLS
- `order_items` — FK to orders + RLS
- `order_shipping` — UNIQUE per `order_id` + RLS
- `order_status_history` — append-only + RLS
- `order_labels` — UNIQUE `(order_id, label_type)` + RLS
- `invoices` — UNIQUE `idempotency_key` (prevents double emission) + RLS
- `marketplace_integrations` UNIQUE constraint fix: `(organizations_id, marketplace_name)`

### Layer 2 — Shared DDD Infrastructure ✅

- **Domain types:** `_shared/domain/orders/orders-types.ts` — `NormalizedOrder`, `UpsertOrderInput`, `UpsertOrderResult`
- **Domain types:** `_shared/domain/ml/` — ML API response, notification, fetch types
- **Domain types:** `_shared/domain/shopee/` — Shopee order API, escrow, push, address types
- **Ports (5):** `orders-upsert-port`, `ml-order-fetch-port`, `marketplace-integrations-port`, `marketplace-orders-raw-port`, `app-credentials-port`
- **Adapters (10 files):** `infra/` (supabase-client, http-utils, object-utils, token-utils), `integrations/` (marketplace-integrations-adapter, app-credentials-adapter), `tokens/` (ml-token, shopee-token), `sync-context/` (ml-sync-context, shopee-sync-context, ml-order-sync-processor), `orders-raw/` (marketplace-orders-raw), `shopee/` (shopee-fetch-orders), `ml/` (ml-order-api-adapter, ml-fetch-orders), `user-management/`
- **Normalizers:** `MlOrderNormalizeService`, `ShopeeOrderNormalizeService`, `buildShipping()` factory
- **Tests:** 15+ unit tests across adapters and normalizers

### Layer 3 — New Edge Functions ✅ Built, ❌ Not Deployed

- `orders-upsert/` — implements `OrdersUpsertPort`; writes all 4 tables atomically
- `orders-sync-ml/` — clean ML sync using `MlOrderSyncProcessor` + `OrdersUpsertAdapter`
- `orders-sync-shopee/` — fetch list → batch detail → escrow → normalize → upsert
- `orders-webhook/` — **must be redesigned** (see Phase 1 below before deploying)
- `supabase/config.toml` has `verify_jwt = false` for `orders-webhook` and `orders-sync-shopee`

---

## What Is Broken or Missing

| Problem                                      | Location                          | Impact                                                    |
| -------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `orders-webhook` does too much synchronously | `orders-webhook/index.ts`         | Marketplace timeout risk; no retry on failure             |
| No pgmq queue or worker exists               | —                                 | Webhook has nowhere to enqueue                            |
| Vercel ML forwarder calls wrong function     | `api/mercado-livre-webhook.ts:23` | ML events → `mercado-livre-sync-all`, not orders pipeline |
| Vercel Shopee forwarder calls wrong function | `api/shopee-webhook.ts:37`        | Shopee events → `shopee-sync-all`, not orders pipeline    |
| New functions never deployed                 | Supabase                          | No production benefit from all the backend work           |
| Frontend reads old tables                    | `src/services/orders.service.ts`  | Orders page shows data from 87-column flat view           |
| `invoices.updated_at` has no trigger         | DB                                | Column exists, never auto-updated on UPDATE               |

---

## Execution Order

```
Phase 1 — Queue Infrastructure (new files, no existing code touched yet)
  1A. Migration: create pgmq queue + pg_cron schedule
  1B. Domain type: OrderSyncQueueMessage
  1C. Port: OrdersQueuePort
  1D. Adapter: SupabaseOrdersQueueAdapter

Phase 2 — Rewrite orders-webhook + Write orders-queue-worker
  2A. Rewrite orders-webhook (thin receiver — enqueue only)
  2B. Write orders-queue-worker (consumer — all processing logic)
  2C. Update supabase/config.toml

Phase 3 — Deploy
  3A. Deploy 5 edge functions

Phase 4 — Fix Vercel Routing (2 files, ~10 lines)
  4A. api/mercado-livre-webhook.ts
  4B. api/shopee-webhook.ts

Phase 5 — Frontend Migration (~2 days)
  5A. src/types/orders.ts
  5B. src/services/orders.service.ts
  5C. src/hooks/useOrderFiltering.ts
  5D. src/pages/Orders.tsx + subcomponents

Phase 6 — Cleanup
  6A. Migration: invoices updated_at trigger
  6B. Deprecation comments on old functions
```

---

## Phase 1 — Queue Infrastructure

### Why a queue?

`orders-webhook` currently does everything synchronously while the marketplace waits:

```
ML/Shopee → webhook → lookup token → call marketplace API → normalize → write DB → return 200
```

If any step takes >5s or fails, the marketplace retries. Webhooks must return 200 in under 1 second.

**Correct architecture:**

```
ML/Shopee → orders-webhook (thin) → 200 OK (immediate)
                    ↓
             pgmq orders_sync queue
                    ↓
             pg_cron (every 30s) → orders-queue-worker → fetch token
                                                        → fetch order from API
                                                        → normalize
                                                        → upsert to orders table
                                                        → archive message
```

Failed messages stay in the queue — when the visibility timeout (VT) expires, they become visible again and are automatically retried. Archived messages stay in `pgmq.a_orders_sync` for observability.

---

### Task 1A — Create migration for pgmq queue

**New file:** `supabase/migrations/20260301_000008_create_orders_sync_queue.sql`

```sql
-- Enable extensions (pgmq requires Postgres 15.6.1.143 or later; pg_cron and pg_net already enabled)
CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create durable (logged) queue for order sync events
SELECT pgmq.create('orders_sync');

-- Schedule the worker every 30 seconds
-- pg_cron calls the orders-queue-worker edge function via pg_net HTTP POST
SELECT cron.schedule(
  'orders-queue-worker',
  '30 seconds',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/orders-queue-worker',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    );
  $$
);
```

**DDD note:** The queue is pure infrastructure. The cron schedule is also infrastructure — it triggers the Application Service (worker) on a schedule. Neither contains business logic.

**If `app.supabase_url` / `app.service_role_key` settings are not configured** on the project, set them first:

```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://<your-project-ref>.supabase.co';
ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';
```

---

### Task 1B — Domain type: OrderSyncQueueMessage

**New file:** `supabase/functions/_shared/domain/orders/order-queue-message.types.ts`

This file defines **Domain Events** — what happened at the external boundary, expressed in your domain language. Contains only what the worker needs to fetch the full order. Does NOT contain raw marketplace payload (that would couple your domain to external schemas).

```ts
/**
 * Domain Events: minimal order notification captured at the webhook boundary.
 * Contains only what orders-queue-worker needs to fetch + upsert the full order.
 * MUST NOT contain raw marketplace payload — keep domain decoupled from external schemas.
 */

/** ML sent a notification that an order was created or updated. */
export interface MlOrderQueueMessage {
  marketplace: "mercado_livre";
  marketplace_order_id: string; // extracted from notification.resource URL
  meli_user_id: string; // from notification.user_id — used to look up integration
}

/** Shopee sent a push that an order was created or updated. */
export interface ShopeeOrderQueueMessage {
  marketplace: "shopee";
  order_sn: string;
  shop_id: number;
}

export type OrderSyncQueueMessage =
  | MlOrderQueueMessage
  | ShopeeOrderQueueMessage;

/** pgmq message envelope — returned by pgmq_public.read() */
export interface QueueEnvelope {
  msg_id: bigint;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: OrderSyncQueueMessage;
}

export function isMlOrderQueueMessage(
  m: OrderSyncQueueMessage,
): m is MlOrderQueueMessage {
  return m.marketplace === "mercado_livre";
}

export function isShopeeOrderQueueMessage(
  m: OrderSyncQueueMessage,
): m is ShopeeOrderQueueMessage {
  return m.marketplace === "shopee";
}
```

---

### Task 1C — Port: OrdersQueuePort

**New file:** `supabase/functions/_shared/ports/orders-queue-port.ts`

```ts
/**
 * Port for enqueueing and consuming OrderSyncQueueMessage domain events.
 * Adapter: SupabaseOrdersQueueAdapter (adapters/orders-queue/orders-queue-adapter.ts).
 */

import type {
  OrderSyncQueueMessage,
  QueueEnvelope,
} from "../domain/orders/order-queue-message.types.ts";

export interface OrdersQueuePort {
  /** Enqueue a domain event. Returns the pgmq msg_id. */
  enqueue(message: OrderSyncQueueMessage): Promise<bigint>;

  /** Read up to `size` messages, locking them for `visibilityTimeoutSec` seconds. */
  readBatch(
    size: number,
    visibilityTimeoutSec: number,
  ): Promise<QueueEnvelope[]>;

  /**
   * Archive a successfully processed message.
   * Archived messages move to pgmq.a_orders_sync for observability — not deleted.
   */
  archive(msgId: bigint): Promise<void>;
}
```

---

### Task 1D — Adapter: SupabaseOrdersQueueAdapter

**New file:** `supabase/functions/_shared/adapters/orders-queue/orders-queue-adapter.ts`

This is the **only** file that knows about `pgmq_public`. If Supabase changes their queue API, you change this file only.

```ts
/**
 * Persistence adapter for pgmq via Supabase's pgmq_public schema.
 * Implements OrdersQueuePort.
 * pgmq_public is the Data API-safe wrapper over pgmq (see Supabase Queues docs).
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { OrdersQueuePort } from "../../ports/orders-queue-port.ts";
import type {
  OrderSyncQueueMessage,
  QueueEnvelope,
} from "../../domain/orders/order-queue-message.types.ts";

const QUEUE_NAME = "orders_sync";

export class SupabaseOrdersQueueAdapter implements OrdersQueuePort {
  constructor(private readonly admin: SupabaseClient) {}

  async enqueue(message: OrderSyncQueueMessage): Promise<bigint> {
    const { data, error } = await this.admin
      .schema("pgmq_public")
      .rpc("send", { queue_name: QUEUE_NAME, message });
    if (error)
      throw new Error(`[orders-queue] enqueue failed: ${error.message}`);
    return BigInt(data as number);
  }

  async readBatch(
    size: number,
    visibilityTimeoutSec: number,
  ): Promise<QueueEnvelope[]> {
    const { data, error } = await this.admin.schema("pgmq_public").rpc("read", {
      queue_name: QUEUE_NAME,
      sleep_seconds: visibilityTimeoutSec,
      n: size,
    });
    if (error)
      throw new Error(`[orders-queue] readBatch failed: ${error.message}`);
    return (data as QueueEnvelope[]) ?? [];
  }

  async archive(msgId: bigint): Promise<void> {
    const { error } = await this.admin
      .schema("pgmq_public")
      .rpc("archive", { queue_name: QUEUE_NAME, msg_id: Number(msgId) });
    if (error) {
      // Log but do not throw — archive failure must not re-queue an already-processed order
      console.error(
        `[orders-queue] archive failed for msg ${msgId}: ${error.message}`,
      );
    }
  }
}
```

**DDD note:** This adapter is the Persistence Adapter in hexagonal architecture. Zero business logic. Zero knowledge of order domain rules. Only knows how to talk to pgmq.

---

## Phase 2 — Rewrite orders-webhook + Write orders-queue-worker

### Task 2A — Rewrite `orders-webhook/index.ts`

**File:** `supabase/functions/orders-webhook/index.ts`

**Single responsibility:** validate signature → extract minimal domain event → enqueue → return 200 immediately.

Remove everything that was doing: token lookup, marketplace API calls, normalization, DB writes. That all moves to the worker.

The function goes from ~237 lines to ~80 lines.

```ts
/**
 * Cycle 0: Unified ML/Shopee webhook receiver. Anti-Corruption Layer at the external boundary.
 * Responsibility: validate signature → extract minimal OrderSyncQueueMessage → enqueue → return 200.
 * No marketplace API calls. No token lookup. No normalization. No DB writes except the queue.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  jsonResponse,
  handleOptions,
} from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getField, getStr } from "../_shared/adapters/infra/object-utils.ts";
import { hmacSha256Hex } from "../_shared/adapters/infra/token-utils.ts";
import {
  isMlOrderNotificationPayload,
  extractOrderIdFromMlResource,
} from "../_shared/domain/ml/ml-order-notification.types.ts";
import {
  isShopeeOrderPushPayload,
  getShopeePushOrderSn,
  getShopeePushShopId,
} from "../_shared/domain/shopee/shopee-order-push.types.ts";
import { SupabaseOrdersQueueAdapter } from "../_shared/adapters/orders-queue/orders-queue-adapter.ts";
import type { OrderSyncQueueMessage } from "../_shared/domain/orders/order-queue-message.types.ts";

const ML_TOPICS = new Set(["orders_v2", "orders"]);

async function validateShopeeSignature(
  bodyText: string,
  key: string | undefined,
  sig: string | null,
): Promise<boolean> {
  if (!key || !sig) return true; // no key = dev mode, accept all
  const computed = await hmacSha256Hex(key, bodyText);
  return sig === computed || sig.toLowerCase() === computed.toLowerCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKeyB64)
    return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  const bodyText = await req.text();
  let body: Record<string, unknown>;
  try {
    body = (JSON.parse(bodyText || "{}") ?? {}) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const admin = createAdminClient();
  const queue = new SupabaseOrdersQueueAdapter(admin);

  // --- Route: Mercado Livre ---
  const topic = getStr(body, ["topic"]);
  const isML =
    req.headers.get("x-source") === "mercado_livre" ||
    (topic != null &&
      ML_TOPICS.has(topic) &&
      getStr(body, ["resource"]) != null &&
      getField(body, "user_id") != null);

  if (isML) {
    if (!isMlOrderNotificationPayload(body)) {
      return jsonResponse(
        { ok: false, error: "Invalid ML payload structure" },
        400,
      );
    }
    const orderId = extractOrderIdFromMlResource(body.resource);
    if (!orderId)
      return jsonResponse(
        { ok: false, error: "Cannot extract order_id from resource" },
        400,
      );

    const event: OrderSyncQueueMessage = {
      marketplace: "mercado_livre",
      marketplace_order_id: orderId,
      meli_user_id: String(body.user_id),
    };
    await queue.enqueue(event);
    return jsonResponse({ ok: true, queued: true }, 200);
  }

  // --- Route: Shopee ---
  const hasShopId =
    getField(body, "shop_id") != null ||
    getStr(body, ["data", "shop_id"]) != null;
  const hasOrderSn =
    getStr(body, ["order_sn"]) != null ||
    getStr(body, ["ordersn"]) != null ||
    getField(body, "code") != null;

  if (hasShopId && hasOrderSn) {
    const liveKey = Deno.env.get("SHOPEE_LIVE_PUSH_PARTNER_KEY");
    const providedSig =
      req.headers.get("x-shopee-signature") ??
      req.headers.get("x-shopee-sign") ??
      null;
    if (
      liveKey &&
      providedSig &&
      !(await validateShopeeSignature(bodyText, liveKey, providedSig))
    ) {
      return jsonResponse({ error: "Invalid Shopee signature" }, 401);
    }
    if (!isShopeeOrderPushPayload(body)) {
      return jsonResponse(
        { ok: false, error: "Invalid Shopee payload structure" },
        400,
      );
    }
    const orderSn = getShopeePushOrderSn(body);
    const shopId = getShopeePushShopId(body);
    if (!orderSn || shopId == null) {
      return jsonResponse(
        { ok: false, error: "Missing order_sn or shop_id" },
        400,
      );
    }

    const event: OrderSyncQueueMessage = {
      marketplace: "shopee",
      order_sn: orderSn,
      shop_id: shopId,
    };
    await queue.enqueue(event);
    return jsonResponse({ ok: true, queued: true }, 200);
  }

  return jsonResponse({ error: "Unknown webhook payload" }, 400);
});
```

---

### Task 2B — Write `orders-queue-worker/index.ts`

**New file:** `supabase/functions/orders-queue-worker/index.ts`

**Responsibility:** Application Service. Reads a batch from the queue; for each message, orchestrates existing domain services and adapters to produce the final `orders` table row. Zero new business logic — only coordination.

Every adapter it calls already exists in `_shared/`:

- `MlOrderApiAdapter` — fetch ML order
- `ShopeeFetchOrdersAdapter` — fetch Shopee order
- `getMlAccessToken` + `forceRefreshMlToken` — ML token management
- `getShopeeAccessToken` — Shopee token management
- `MlOrderNormalizeService` + `ShopeeOrderNormalizeService` — normalization
- `OrdersUpsertAdapter` — persistence
- `SupabaseMarketplaceIntegrationsAdapter` — integration lookup
- `SupabaseAppCredentialsAdapter` — app credentials

```ts
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
import { OrdersUpsertAdapter } from "../orders-upsert/orders-upsert-adapter.ts";
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
  if (!integration)
    throw new Error(
      `Integration not found for meli_user_id=${msg.meli_user_id}`,
    );

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
    if (refreshed)
      fetchResult = await mlFetcher.fetchFullOrder(
        refreshed,
        msg.marketplace_order_id,
      );
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
  if (!result.success) throw new Error(`Upsert failed: ${result.error}`);

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
  if (!integration)
    throw new Error(`Integration not found for shop_id=${msg.shop_id}`);

  const tokenResult = await getShopeeAccessToken(
    integrations,
    appCredentials,
    integration.id,
    encKeyB64,
  );
  const appRow = await appCredentials.getByName(SHOPEE_MARKETPLACE_NAME);
  if (!appRow) throw new Error("Shopee app credentials not found");

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
  if (!orderDetail)
    throw new Error(`Shopee order fetch returned null for ${msg.order_sn}`);

  const order = shopeeNormalizer.normalize(orderDetail);
  const result = await upsertAdapter.upsert(admin, {
    organization_id: tokenResult.organizationId,
    order,
    source: "webhook",
  });
  if (!result.success) throw new Error(`Upsert failed: ${result.error}`);

  await queue.archive(envelope.msg_id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST")
    return jsonResponse({ error: "Method not allowed" }, 405);

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKeyB64)
    return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

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
```

**DDD note:** `processML` and `processShopee` are private Application Service methods. Each one is a transaction boundary: it either completes (archive) or fails (leave in queue for retry). No partial state.

---

### Task 2C — Update `supabase/config.toml`

Add the worker entry. The worker is called by pg_cron with a service-role Bearer token, so `verify_jwt = false`:

```toml
[functions.orders-queue-worker]
verify_jwt = false
```

---

## Phase 3 — Deploy

```bash
supabase functions deploy orders-upsert
supabase functions deploy orders-sync-ml
supabase functions deploy orders-sync-shopee
supabase functions deploy orders-webhook        # now the thin version from Task 2A
supabase functions deploy orders-queue-worker
```

Also apply the new migration:

```bash
supabase db push
```

---

## Phase 4 — Fix Vercel Webhook Routing

### Task 4A — `api/mercado-livre-webhook.ts`

**Change** line 23: `mercado-livre-sync-all` → `orders-webhook`
**Add** header `'x-source': 'mercado_livre'` so `orders-webhook` routes to the ML branch.

```ts
// BEFORE (line 23)
const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-all`, {
  headers: {
    'content-type': 'application/json',
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    ...(xMeliSignature ? { 'x-meli-signature': xMeliSignature } : {}),
    ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
  },
  ...
});

// AFTER
const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/orders-webhook`, {
  headers: {
    'content-type': 'application/json',
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'x-source': 'mercado_livre',           // triggers ML branch in orders-webhook
    ...(xMeliSignature ? { 'x-meli-signature': xMeliSignature } : {}),
    ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
  },
  ...
});
```

### Task 4B — `api/shopee-webhook.ts`

**Change** line 37: `shopee-sync-all` → `orders-webhook`
**Remove** `authorization` and `x-internal-call` headers (orders-webhook has `verify_jwt = false`).

```ts
// BEFORE (line 37)
const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-all`, {
  headers: {
    'content-type': 'application/json',
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,  // remove
    'x-internal-call': '1',                                  // remove
    ...(xShopeeSignature ? { 'x-shopee-signature': xShopeeSignature } : {}),
    ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
  },
  ...
});

// AFTER
const forwardResp = await fetch(`${SUPABASE_URL}/functions/v1/orders-webhook`, {
  headers: {
    'content-type': 'application/json',
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    ...(xShopeeSignature ? { 'x-shopee-signature': xShopeeSignature } : {}),
    ...(xRequestId ? { 'x-request-id': xRequestId } : {}),
  },
  ...
});
```

**DDD note:** These Vercel files are pure infrastructure adapters — HTTP proxies only. Zero business logic. Zero payload transformation beyond header forwarding.

---

## Phase 5 — Frontend Migration

**Goal:** The Orders page reads from `marketplace_orders_presented_new` (old 87-column view). Migrate to `orders` + `order_items` + `order_shipping`. All existing UX must be preserved.

**Sequencing is mandatory:** 5A → 5B → 5C → 5D. Each layer depends on the one below. TypeScript errors from 5A will guide 5C and 5D.

### Task 5A — `src/types/orders.ts` (Domain Model)

Replace the old flat presented_new field mapping with one that matches the new normalized tables. The `Order` type is a Value Object — it represents what the UI understands, not what the DB stores.

Key field mapping:

| Old (presented_new)                     | New (orders + joins)        | Notes                           |
| --------------------------------------- | --------------------------- | ------------------------------- |
| `status_interno`                        | `status`                    | Internal seller workflow status |
| `status` (raw ML/Shopee)                | `marketplace_status`        | Marketplace canonical status    |
| `total_amount`                          | `gross_amount`              | Pre-shipping gross              |
| `first_item_title`                      | `items[0]?.title`           | From joined `order_items`       |
| `first_item_image_url`                  | `items[0]?.image_url`       | From joined `order_items`       |
| `destination.receiver_address.state.id` | `shipping?.state_uf`        | From joined `order_shipping`    |
| `destination.receiver_address.zip_code` | `shipping?.zip_code`        | From joined `order_shipping`    |
| `shipping_type`                         | `shipping?.logistic_type`   | From joined `order_shipping`    |
| `tracking_number`                       | `shipping?.tracking_number` | From joined `order_shipping`    |

Add nested types for items and shipping that mirror `NormalizedOrderItem` and `NormalizedOrderShipping` from `_shared/domain/orders/orders-types.ts`.

### Task 5B — `src/services/orders.service.ts` (Persistence Adapter)

Update each function one at a time:

`**ORDERS_SELECT_FIELDS` (line ~257) — replace flat field list with nested Supabase select:

```ts
const ORDERS_SELECT_FIELDS = `
  id, organization_id, marketplace, marketplace_order_id, pack_id,
  status, marketplace_status, payment_status,
  gross_amount, marketplace_fee, shipping_cost, shipping_subsidy, net_amount,
  buyer_name, buyer_document, buyer_email, buyer_phone, buyer_state,
  created_at, shipped_at, delivered_at, canceled_at, last_synced_at,
  order_items (
    id, marketplace_item_id, sku, title, quantity, unit_price,
    unit_cost, variation_name, image_url, product_id
  ),
  order_shipping (
    shipment_id, logistic_type, tracking_number, carrier,
    status, substatus, street_name, street_number, complement,
    neighborhood, city, state_uf, zip_code, sla_expected_date,
    sla_status, estimated_delivery
  )
`;
```

`**parseOrderRow(row)` (called by fetchAllOrders + real-time) — rewrite to map the nested structure. Keep it pure (no side effects):

```ts
const firstItem = Array.isArray(row.order_items) ? row.order_items[0] : null;
const shipping = Array.isArray(row.order_shipping)
  ? row.order_shipping[0]
  : null;
// then map all fields to the Order type from 5A
```

`**fetchAllOrders(orgId)**` — change `.from("marketplace_orders_presented_new")` to `.from("orders")`.

`**updateOrdersInternalStatus(orderIds, status)` (line 211) — change:

```ts
// OLD
.from("marketplace_orders_presented_new").update({ status_interno: status })
// NEW
.from("orders").update({ status: status })
```

`**fetchOrderByInternalId(orderId)` (line 239) — change `.from("marketplace_orders_presented_new")` to `.from("orders")`. Fields `marketplace_order_id` and `marketplace` exist identically on the new table.

`**syncMercadoLivreOrders()` (line 25) — change URL from `mercado-livre-sync-orders` to `orders-sync-ml`. Update body shape to match `SyncMLInput` in `_shared/adapters/sync-context/ml-sync-context.ts`:

```ts
// OLD
body: JSON.stringify({
  organizationId,
  ...(orderIds ? { order_ids: orderIds } : {}),
});
// function: mercado-livre-sync-orders

// NEW
body: JSON.stringify({ organization_id: organizationId });
// function: orders-sync-ml
// (orders-sync-ml does incremental sync via max(last_synced_at) internally)
```

`**syncShopeeOrders()` (line 51) — change URL from `shopee-sync-orders` to `orders-sync-shopee`. Check `SyncShopeeInput` in `_shared/adapters/sync-context/shopee-sync-context.ts` for the exact input shape.

`**fetchNfeStatusRows()` (line 217) — keep as-is. Still reads from `notas_fiscais`. NFe migration is Cycle 3 scope.

**DDD note:** `orders.service.ts` is the Persistence Adapter — the only file that calls `.from(...)`. `parseOrderRow()` is a Data Mapper — pure function, no side effects. `ORDERS_SELECT_FIELDS` is a Query Object — named constant, reusable.

### Task 5C — `src/hooks/useOrderFiltering.ts` (Domain Filter Service)

After 5A changes the `Order` type, TypeScript will mark all broken field references. Fix them:

- `p.status_interno` → `p.status`
- `p.status` (used as marketplace status) → `p.marketplace_status`
- `p.first_item_title` → `p.items?.[0]?.title`
- Any address field from old flat schema → `p.shipping?.city`, `p.shipping?.state_uf`

The `marketplace` field for marketplace filter is unchanged (same name on the new table).

**DDD note:** This hook is a Domain Service applied to the `Order` type. It must receive typed `Order[]` — never raw DB rows. Rely on TypeScript errors to find every reference that needs updating.

### Task 5D — Orders.tsx + subcomponents (Presentation Layer)

**Files:**

- `src/pages/Orders.tsx` — `createOrderColumns`, real-time subscription `parseOrderRow` call
- `src/components/orders/OrderGeneralInfo.tsx` — buyer info, shipping address
- `src/components/orders/OrderItemsList.tsx` — was using `first_item_` fields
- `src/components/orders/OrderFinancials.tsx` — `net_amount`, `marketplace_fee`, `shipping_cost`
- `src/components/orders/LinkOrderModal.tsx` — `marketplace_order_id`, `marketplace`

Run `npm run build` after 5A — every TypeScript error is a field that needs updating. Work top-down through the component tree.

Common changes:

- `order.first_item_title` → `order.items?.[0]?.title ?? '—'`
- `order.first_item_image_url` → `order.items?.[0]?.image_url`
- `order.status_interno` → `order.status`
- `order.destination?.receiver_address?.zip_code` → `order.shipping?.zip_code`
- `order.tracking_number` → `order.shipping?.tracking_number`

**DDD note:** Components are Presentation Layer only. Verify that zero `.from()` or `supabase.` calls exist inside component files. If found, move them to the service layer.

---

## Phase 6 — Cleanup

### Task 6A — `invoices` updated_at trigger

**New file:** `supabase/migrations/20260301_000009_invoices_updated_at_trigger.sql`

The `invoices` table has `updated_at timestamptz NOT NULL DEFAULT now()` but no trigger to auto-update it on UPDATE:

```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');
```

Also verify `order_shipping.updated_at` has a trigger — it has the column but check `pg_trigger` for an existing `set_updated_at` on that table.

### Task 6B — Deprecate old functions

After Phase 4 (Vercel updated) and Phase 5 (frontend updated), add deprecation headers to old functions. **Do NOT delete yet** — wait for 1 week of production validation.

Add to line 1 of each:

- `supabase/functions/mercado-livre-webhook-orders/index.ts` — `/** @deprecated Replaced by orders-webhook + orders-queue-worker (Cycle 0). Remove after production validation. */`
- `supabase/functions/shopee-webhook-orders/index.ts` — same note
- `supabase/functions/shopee-sync-orders/index.ts` — `/** @deprecated Replaced by orders-sync-shopee (Cycle 0). */`
- `mercado-livre-sync-orders` already has the DEPRECATED comment ✅

---

## What Is NOT in Cycle 0 Scope

| Item                                                                             | Cycle                                 |
| -------------------------------------------------------------------------------- | ------------------------------------- |
| Migrate `focus-nfe-emit` / `focus-nfe-cancel` to `invoices` table                | Cycle 3                               |
| Delete `trg_mipl_refresh_presented` (dead no-op DB trigger)                      | Cycle 1 teardown                      |
| Replace `process_marketplace_order_presented_new` trigger (25KB Shopee pipeline) | After frontend verified on new tables |
| `order_labels` table population (fetching labels from ML/Shopee)                 | Cycle 1                               |
| `useNfeStatus.ts` migration from `notas_fiscais` to `invoices`                   | Cycle 3                               |
| Server-side pagination for `orders` table                                        | Cycle 1                               |

---

## Impact Summary

| Metric                       | Before                          | After                                      |
| ---------------------------- | ------------------------------- | ------------------------------------------ |
| Webhook acknowledgement time | 2–8s                            | <100ms                                     |
| Marketplace timeout risk     | High                            | None                                       |
| Failed order retry           | Only if marketplace retries     | Automatic (VT expiry)                      |
| Observability                | Logs only                       | Archived messages in `pgmq.a_orders_sync`  |
| Processing isolation         | One failure blocks response     | Per-message try/catch in worker            |
| Test surface                 | Must mock HTTP in webhook tests | Worker testable independently from webhook |
