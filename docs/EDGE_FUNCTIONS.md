# Supabase Edge Functions — Reference

> 63 Deno/TypeScript functions deployed under `supabase/functions/`. Shared infrastructure is in `_shared/` (not documented here). All functions use AES-GCM encryption for marketplace tokens, correlation IDs for tracing, and return HTTP 200 even on business errors (to prevent webhook retries from upstream services).

## Architecture Layers

| Layer | Functions | Status |
|---|---|---|
| **Cycle 0 — New Order Platform** | `orders-webhook`, `orders-sync-ml`, `orders-sync-shopee`, `orders-upsert` | ✅ NEWEST — canonical architecture going forward |
| **Legacy Order Pipeline** | `mercado-livre-webhook-orders`, `shopee-webhook-orders`, `*-process-presented`, `*-sync-orders` | ⚠️ Being replaced by Cycle 0 |
| **Item & Catalog Sync** | `mercado-livre-sync-items`, `shopee-sync-items`, ML catalog wrappers | Active |
| **OAuth & Auth** | `*-start-auth`, `*-callback`, `*-refresh` | Active |
| **NFe / Invoice** | `focus-*`, `*-submit-xml`, `emit-queue-consume` | Active |
| **User Management** | `auth-on-signup`, `create-user`, `manage-users`, etc. | Active |

---

## Table of Contents

1. [User & Organization Management](#1-user--organization-management)
2. [Company & Onboarding](#2-company--onboarding)
3. [Mercado Livre — OAuth](#3-mercado-livre--oauth)
4. [Shopee — OAuth](#4-shopee--oauth)
5. [Mercado Livre — Item Sync](#5-mercado-livre--item-sync)
6. [Mercado Livre — Quality & Metrics](#6-mercado-livre--quality--metrics)
7. [Mercado Livre — Publish & Edit](#7-mercado-livre--publish--edit)
8. [Mercado Livre — Catalog Support (Read-Only)](#8-mercado-livre--catalog-support-read-only)
9. [Mercado Livre — Order Pipeline (Legacy)](#9-mercado-livre--order-pipeline-legacy)
10. [Shopee — Item Sync](#10-shopee--item-sync)
11. [Shopee — Category & Attributes](#11-shopee--category--attributes)
12. [Shopee — Order Pipeline (Legacy)](#12-shopee--order-pipeline-legacy)
13. [Shopee — Logistics](#13-shopee--logistics)
14. [Unified Orders — Cycle 0 ✅ NEWEST](#14-unified-orders--cycle-0--newest)
15. [NFe / Invoice (Focus NFeS)](#15-nfe--invoice-focus-nfes)
16. [Inventory & Product Linking](#16-inventory--product-linking)
17. [Retry Infrastructure](#17-retry-infrastructure)
18. [Similar Functions Cross-Reference](#18-similar-functions-cross-reference)
19. [Consolidation Opportunities](#19-consolidation-opportunities)

---

## 1. User & Organization Management

### `auth-on-signup`
**Method:** POST
**Trigger:** Supabase Auth webhook or manual call post-signup.

Initializes a new user record and profile immediately after account creation. Creates a row in `users` and `user_profiles` (with defaults: timezone `US/Eastern`, language `en`, theme `light`). Optionally calls the `rpc_bootstrap_user_org` RPC to create the user's first organization. Handles both token-based and direct webhook-payload flows.

**DB Tables:** `users`, `user_profiles`
**External APIs:** None

---

### `create-user`
**Method:** POST
**Trigger:** Called by admin flows or invitation acceptance.

Full user creation pipeline. Creates the auth account via Supabase Auth Admin API, inserts `users` + `user_profiles`, then creates `organization_members` and `user_organization_settings` records with either full or limited module permissions (built from the `system_modules` + `module_actions` tables). Exports `createCompleteUser()` as a helper reused by other functions. Default timezone: `America/Sao_Paulo`.

**DB Tables:** `users`, `user_profiles`, `organization_members`, `user_organization_settings`, `system_modules`, `module_actions`
**External APIs:** Supabase Auth Admin API

---

### `admin-create-member`
**Method:** POST
**Trigger:** Admin user management panel.

Admin-only variant of user creation. Looks up existing users via Auth Admin API pagination to handle email conflicts, creates a fresh account if not found, then sets up organization membership with restricted module permissions (default modules: `desempenho`, `pedidos`). Uses `buildLimitedPermissions()` to narrow the permission scope below what `create-user` grants.

**DB Tables:** `organizations`, `organization_members`, `user_profiles`, `user_organization_settings`
**External APIs:** Supabase Auth Admin API

**Similar to:** `create-user` (same pipeline, narrower permissions)

---

### `manage-users`
**Method:** POST / GET / PUT / DELETE
**Trigger:** User management UI (listing, inviting, updating, removing members).

Multi-action hub for all team management operations, dispatched by an `action` field in the request body or query params:
- `list` — paginates Auth Admin API to list org members
- `invite` — creates `user_invitations`, sends invite email
- `update` — updates permissions, roles, module access
- `remove` — deletes membership and optionally auth account
- `toggle-module` — enables/disables system modules per user
- `reset-password` — sends password reset email

Permission checks use RPC fallback for granular role validation.

**DB Tables:** `organization_members`, `user_profiles`, `users`, `system_modules`, `module_actions`, `user_invitations`, `user_organization_settings`
**External APIs:** Supabase Auth Admin API

---

### `process-invitation`
**Method:** POST
**Trigger:** Invitation acceptance link clicked by invitee.

Handles two flows for invitation acceptance:
1. **Modern** — uses `invitation_id` + active session (magic link flow).
2. **Legacy** — uses `token` + `password` fields.

Validates email match, creates `organization_members` row, persists `organization_id` in user metadata, and marks the invitation as accepted (`pendente → ativo`).

**DB Tables:** `user_invitations`, `organization_members`, `users`
**External APIs:** Supabase Auth

---

## 2. Company & Onboarding

### `cnpj-lookup`
**Method:** POST
**Trigger:** CNPJ input field on onboarding forms.

Server-side CNPJ lookup to bypass browser CORS restrictions. Queries `ReceitaWS` (token-authenticated) with fallback to the public `publica.cnpj.ws` API. Returns company name, CNPJ, state registration (IE), address, and taxation regime (Simples Nacional / MEI / Lucro Presumido). No database reads or writes — pure API passthrough.

**DB Tables:** None
**External APIs:** ReceitaWS, publica.cnpj.ws

---

### `upload-company-certificate`
**Method:** POST
**Trigger:** Certificate upload in company settings.

Stores PFX certificate metadata (validity dates, filename) after client-side encryption. Validates file size (<7 MB base64), verifies organization membership via RPC, then UPSERTs the company record. The certificate file itself is handled client-side; this function only persists metadata.

**DB Tables:** `companies`, `organization_members` (via RPC)
**External APIs:** None

---

### `focus-company-create`
**Method:** POST
**Trigger:** First-time NFe setup in company settings.

Creates the company record in Focus NFeS by posting company data to the Focus API. Stores the returned access token(s) for `homologacao` and `producao` environments, linking them to the Novura `companies` row. This is the bootstrap step that enables NFe emission.

**DB Tables:** `companies`
**External APIs:** Focus NFeS

---

## 3. Mercado Livre — OAuth

### `mercado-livre-start-auth`
**Method:** POST
**Trigger:** "Conectar Mercado Livre" button.

Initiates ML OAuth2 with PKCE (S256). Generates a `code_verifier`, computes the `code_challenge`, builds the authorization URL, embeds a CSRF token in the state payload (base64-encoded JSON). Returns the authorization URL **and** the verifier separately — the verifier must be stored in `sessionStorage` (not the URL) to prevent XSS exfiltration.

**DB Tables:** `apps` (client_id / auth_url lookup)
**External APIs:** Mercado Livre OAuth2 (URL construction only)

**Similar to:** `shopee-start-auth`

---

### `mercado-livre-callback`
**Method:** POST
**Trigger:** OAuth2 redirect from Mercado Livre.

Validates CSRF from state payload, exchanges the authorization code for tokens using the PKCE verifier (read from request **body**, not URL params — per security fix). UPSERTs `marketplace_integrations` with AES-GCM encrypted access/refresh tokens, `meli_user_id`, and seller link. The UPSERT conflict key is `(organizations_id, marketplace_name)`.

**DB Tables:** `marketplace_integrations`, `apps`
**External APIs:** Mercado Livre OAuth2

**Similar to:** `shopee-callback`

---

### `mercado-livre-refresh`
**Method:** POST / GET
**Trigger:** Token expiry detection, or cron job.

Refreshes ML OAuth tokens. Supports single-integration refresh (via `Authorization` header, body, or query param) or bulk refresh for all integrations. Uses direct REST calls (no Supabase SDK) to handle large environments efficiently. Decrypts current refresh token, calls `/oauth/token`, re-encrypts and persists the new pair. Failed refreshes are logged; integration is skipped rather than erroring the batch.

**DB Tables:** `marketplace_integrations`, `apps`
**External APIs:** Mercado Livre OAuth

**Similar to:** `shopee-refresh`

---

## 4. Shopee — OAuth

### `shopee-start-auth`
**Method:** POST
**Trigger:** "Conectar Shopee" button.

Initiates Shopee OAuth2 flow. Generates PKCE verifier, computes S256 challenge, builds authorization URL. Returns URL and verifier separately (same security pattern as `mercado-livre-start-auth`). State payload base64-encoded.

**DB Tables:** `apps`
**External APIs:** Shopee OAuth2 (URL construction only)

**Similar to:** `mercado-livre-start-auth`

---

### `shopee-callback`
**Method:** POST
**Trigger:** OAuth2 redirect from Shopee.

Exchanges the authorization code for tokens using HMAC-SHA256 V2 signature. Resolves the `shop_id`, performs an initial token refresh to validate the connection, then UPSERTs `marketplace_integrations` with encrypted tokens.

**DB Tables:** `marketplace_integrations`, `apps`
**External APIs:** Shopee Open Platform OAuth

**Similar to:** `mercado-livre-callback`

---

### `shopee-refresh`
**Method:** POST
**Trigger:** Token expiry or cron job.

Dual-mode token refresh for Shopee:
- **Cron mode** — refreshes all integrations whose tokens expire within 10 minutes.
- **Single mode** — refreshes one specific integration.

Uses HMAC-SHA256 V2 signature (`partnerId|path|timestamp`). Calls `/api/v2/auth/access_token`. Re-encrypts and persists new tokens. Skips integrations whose refresh fails rather than erroring the batch.

**DB Tables:** `marketplace_integrations`, `apps`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-refresh`

---

## 5. Mercado Livre — Item Sync

### `mercado-livre-sync-items`
**Method:** POST / GET
**Trigger:** Manual sync or scheduled job.

Full item catalogue sync. Paginates `/users/{seller_id}/items/search`, then fetches details in 20-item multiget batches (`/items?ids=...`). Derives variation SKU by priority: `attribute_combinations → attributes → item level`. Validates user membership via JWT decode + RPC permission check. Applies a 1-hour TTL to skip recently-synced items. Retries with token refresh on 403.

**DB Tables:** `marketplace_items`, `marketplace_integrations`, `apps`, `companies`
**External APIs:** Mercado Livre API

**Similar to:** `shopee-sync-items`

---

### `mercado-livre-webhook-items`
**Method:** POST
**Trigger:** ML webhook notification (`topic: "items"`).

Receives real-time item update notifications from Mercado Livre. Validates notification structure, resolves the integration by `meli_user_id`, decrypts the access token (refreshes on 401/403), fetches the full item from `/items/{id}`, and UPSERTs `marketplace_items`. After the upsert, **concurrently invokes** 6 downstream functions in parallel:
- `mercado-livre-sync-descriptions`
- `mercado-livre-update-quality`
- `mercado-livre-update-reviews`
- `mercado-livre-update-metrics`
- `mercado-livre-sync-stock-distribution`
- `mercado-livre-sync-prices`

Always returns HTTP 200 to prevent ML webhook retries.

**DB Tables:** `marketplace_items`, `marketplace_integrations`, `apps`
**External APIs:** Mercado Livre API

---

### `mercado-livre-sync-descriptions`
**Method:** POST
**Trigger:** Post-item-sync enrichment (from `mercado-livre-webhook-items` or orchestrator).

Fetches plain-text and HTML descriptions for ML items via `/items/{id}/description`. Applies a 72-hour TTL using two fallback sources: `marketplace_item_descriptions.updated_at` first, then `marketplace_items.last_description_update`. Runs 3 workers concurrently with 500ms inter-batch sleep. Re-queues to `ml_retry_queue` on 429/503. Dual-writes to both `marketplace_items` (inline columns) and the normalized `marketplace_item_descriptions` table.

**DB Tables:** `marketplace_items`, `marketplace_item_descriptions`, `ml_retry_queue`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

### `mercado-livre-sync-prices`
**Method:** POST
**Trigger:** Post-item-sync enrichment (from orchestrator).

Fetches item pricing data: sale price, listing prices (fee breakdowns by category/listing_type/price), and quantity pricing tiers. Applies a 12-hour TTL. Stores normalized pricing in `marketplace_item_prices` and raw data in `marketplace_items_raw`. Caches listing-fee lookups by `site|category|type|price` to avoid redundant API calls. 3-worker concurrency limit.

**DB Tables:** `marketplace_item_prices`, `marketplace_items_raw`, `marketplace_items_unified`, `marketplace_integrations`, `apps`
**External APIs:** Mercado Livre API

---

### `mercado-livre-sync-stock-distribution`
**Method:** POST / GET
**Trigger:** Post-item-sync enrichment (from `mercado-livre-webhook-items` or orchestrator).

Maps ML stock distribution across warehouse locations (seller warehouse, fulfillment center, selling address). For each item:
1. Fetches `/items/{id}` to find `user_product_id`(s).
2. Fetches `/user-products/{id}/stock` for each variation.
3. Aggregates stock quantities by location type.
4. Fetches `/items/{id}/shipping` for `logistic_type` (fulfillment / self_service / xd_drop_off / drop_off).
5. Also fetches `/users/{seller_id}/shipping_preferences` to get global seller shipping capabilities (Flex / Envios / Correios / Full).

Rebuilds `marketplace_stock_distribution` rows (delete + insert, not upsert) and updates `marketplace_items.stock_distribution`, `.shipping_types`, `.last_stock_update`. Applies a 6-hour TTL.

**DB Tables:** `marketplace_stock_distribution`, `marketplace_items`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

## 6. Mercado Livre — Quality & Metrics

### `mercado-livre-update-quality`
**Method:** POST
**Trigger:** Post-item-sync enrichment (from orchestrator or webhook-items).

Fetches item quality scores via `/item/{id}/performance` with fallback to `/user-product/{id}/performance`. Normalizes the `level_wording` string (Profissional/Satisfatório/Básica) into a 0–100 score. Applies a 24-hour TTL. Dual-writes to `marketplace_metrics` (new, normalized) and `marketplace_items` (legacy columns). 3-worker concurrency with exponential backoff on 429. Re-queues failed items to `ml_retry_queue`.

**DB Tables:** `marketplace_metrics`, `marketplace_items`, `marketplace_integrations`, `apps`, `ml_retry_queue`
**External APIs:** Mercado Livre API

**Similar to:** `mercado-livre-update-reviews`, `mercado-livre-update-metrics`

---

### `mercado-livre-update-reviews`
**Method:** POST
**Trigger:** Post-item-sync enrichment (from orchestrator or webhook-items).

Fetches item reviews and ratings via `/reviews/item/{id}`. Stores `rating_average` and `reviews_count` in `marketplace_metrics`. Applies a 24-hour TTL. Same concurrency/backoff/retry pattern as `mercado-livre-update-quality`. Handles two token-validation code paths (AES import fallback).

**DB Tables:** `marketplace_metrics`, `marketplace_items`, `marketplace_integrations`, `ml_retry_queue`
**External APIs:** Mercado Livre API

**Similar to:** `mercado-livre-update-quality`, `mercado-livre-update-metrics`

---

### `mercado-livre-update-metrics`
**Method:** POST
**Trigger:** Post-item-sync enrichment (from orchestrator or webhook-items).

Fetches item performance data (quality score from `/item/{id}/performance` or `/user-product/{id}/performance`) **plus** visit counts from `/visits/items?ids={id}`. Applies split TTLs: 12 hours for quality, 6 hours for visits. Processes items that need either metric refreshed (OR logic). Upserts both `listing_quality` / `quality_level` / `visits_total` / `visits_data` to `marketplace_metrics`, and back-fills quality into `marketplace_items` for legacy support. Supports `organizationId: '*'` to process all orgs. 3-worker concurrency with 1-second inter-batch sleep.

**DB Tables:** `marketplace_metrics`, `marketplace_items`, `marketplace_integrations`
**External APIs:** Mercado Livre API

**Similar to:** `mercado-livre-update-quality`, `mercado-livre-update-reviews`

> **Note:** `mercado-livre-update-metrics` is a superset of `mercado-livre-update-quality` — it fetches the same quality data plus visit counts. The two functions exist separately because they were built at different times and are invoked independently from the retry worker.

---

## 7. Mercado Livre — Publish & Edit

### `mercado-livre-publish-item`
**Method:** POST
**Trigger:** "Publicar no Mercado Livre" action.

Creates a new ML listing. Assembles the full item payload (title, category, price, attributes, variations, pictures, shipping configuration) and POSTs to `/items`. Maps internal product data to ML's attribute schema. Stores the created listing in `marketplace_items` and links it to `linked_products`.

**DB Tables:** `marketplace_items`, `linked_products`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

### `mercado-livre-update-item-fields`
**Method:** POST
**Trigger:** "Atualizar anúncio" action for specific fields.

Updates one or more fields on an existing ML listing via `PUT /items/{id}`. Supports batch or single-item mode. Assembles the update payload (title, description, price, variations) from the request body. Updates `marketplace_items` in the database after a successful API call.

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

### `mercado-livre-update-item-status`
**Method:** POST
**Trigger:** Status toggle (activate/pause/close) in listings UI.

Single-item status update. Calls `PUT /items/{id}` with `{ "status": "active" | "paused" | "closed" }`. Updates `marketplace_items.status` after the API call. Token decryption handles the `enc:gcm:` prefix format.

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

## 8. Mercado Livre — Catalog Support (Read-Only)

These functions are thin wrappers that call ML catalog/metadata APIs and return results directly to the frontend, enabling dynamic listing configuration. They perform **no database writes** (except token resolution reads).

### `mercado-livre-categories-predict`
**Method:** POST

Predicts the best ML category for a product title. Calls `/sites/{siteId}/category_predictor/predict`. Falls back to `/sites/{siteId}/domain_discovery/search` (two variants: authorized and public) if the primary endpoint fails. Returns a predictions array and domain_discovery results.

**External APIs:** Mercado Livre API
**Similar to:** `shopee-categories-predict`

---

### `mercado-livre-categories-attributes`
**Method:** POST

Fetches the list of attributes for a specific ML category via `/categories/{categoryId}/attributes`. Returns the full array without filtering.

**External APIs:** Mercado Livre API

---

### `mercado-livre-categories-sale-terms`
**Method:** POST

Fetches mandatory sale terms for an ML category via `/categories/{categoryId}/sale_terms`. Returns terms such as warranty type and warranty time.

**External APIs:** Mercado Livre API

---

### `mercado-livre-attributes-conditional`
**Method:** POST

POSTs an attribute array to `/categories/{categoryId}/attributes/conditional` to identify which attributes become required or conditionally required based on selected values. Extracts `required_ids` from the response. Refreshes token on 401/403.

**External APIs:** Mercado Livre API

---

### `mercado-livre-technical-specs-input`
**Method:** POST

Fetches the technical specifications input schema for a category via `/categories/{categoryId}/technical_specs/input`. Returns the raw spec structure for rendering technical spec fields in the listing form.

**External APIs:** Mercado Livre API

---

### `mercado-livre-available-listing-types`
**Method:** POST

Lists available listing types (classic vs. premium) for the seller in a specific category via `/users/{meli_user_id}/available_listing_types?category_id={categoryId}`.

**External APIs:** Mercado Livre API

---

### `mercado-livre-listing-prices`
**Method:** POST

Fetches the pricing/fee structure for a listing at a specific price point via `/sites/{siteId}/listing_prices?price={price}&category_id={categoryId}`. Used to display ML commission estimates before publishing.

**External APIs:** Mercado Livre API

---

### `mercado-livre-shipping-methods`
**Method:** POST

Lists available shipping methods for the ML site via `/sites/{siteId}/shipping_methods`. Returns carrier/type options for shipping configuration.

**External APIs:** Mercado Livre API

---

## 9. Mercado Livre — Order Pipeline (Legacy)

> These functions form the **legacy** ML order processing pipeline, which will be replaced by the Cycle 0 functions (`orders-sync-ml`, `orders-webhook`) as part of the platform migration.

### `mercado-livre-sync-orders`
**Method:** POST
**Trigger:** Manual sync or periodic cron.

Fetches ML orders from `/orders/search` with date and status filtering. For each order found, calls the `orders-upsert` function (Cycle 0 API) for normalization and storage. Maintains sync state via `last_synced_at` on `marketplace_integrations`.

**DB Tables:** `orders`, `marketplace_integrations`
**External APIs:** Mercado Livre API

---

### `mercado-livre-sync-all`
**Method:** POST
**Trigger:** ML webhook gateway (receives all ML notification topics).

Webhook topic router for Mercado Livre notifications. Validates payload structure, logs a correlation ID, and asynchronously (via `setTimeout`) routes to downstream handlers based on `topic`:
- `items` → `mercado-livre-webhook-items`
- `orders` / `orders_v2` → `mercado-livre-webhook-orders`
- `shipments` → converts `shipment_id` to `order_id`, routes to order handler
- `stock_locations` → `mercado-livre-sync-stock-distribution`

Returns HTTP 200 immediately (fire-and-forget pattern). This function is called by the Vercel webhook forwarder (`api/mercado-livre-webhook.ts`).

**DB Tables:** `marketplace_integrations` (shipment-to-order conversion only)
**External APIs:** None (routing only)

---

### `mercado-livre-orchestrate-sync`
**Method:** POST
**Trigger:** Cron job or manual full-sync trigger.

Master orchestrator that chains the full ML item enrichment pipeline. Invokes 6 sub-functions sequentially and in parallel phases:
1. `mercado-livre-sync-items` (sequential, must finish first)
2. Parallel phase A: `mercado-livre-sync-descriptions` + `mercado-livre-update-quality`
3. Parallel phase B: `mercado-livre-update-reviews` + `mercado-livre-update-metrics`
4. Parallel phase C: `mercado-livre-sync-prices` + `mercado-livre-sync-stock-distribution`

Detects transient errors (429 / 503 / rate-limit patterns) and conditionally re-queues jobs to `ml_retry_queue` with exponential backoff. Tracks a request correlation ID across all invocations.

**DB Tables:** `ml_retry_queue`
**External APIs:** Downstream ML edge functions (via `functions.invoke`)

---

### `mercado-livre-webhook-orders`
**Method:** POST
**Trigger:** ML webhook (`topic: "orders_v2"` or `"orders"`).

Receives real-time order notifications. Full pipeline:
1. Validates structure (`resource`, `user_id`, `topic`).
2. Resolves integration by `meli_user_id`, decrypts token (refreshes on 401/403).
3. Fetches full order from `/orders/{id}` and all shipment IDs.
4. For each shipment: fetches `/shipments/{id}` (details), `/shipments/{id}/sla`, `/shipments/{id}/billing_info`.
5. Fetches shipping labels (PDF + ZPL2) via `/shipment_labels`.
6. UPSERTs to `marketplace_orders_raw` via the `upsert_marketplace_order_raw` RPC.
7. Updates the raw row with labels + billing_info.
8. Invokes `mercado-livre-process-presented` with the `raw_id`.

Always returns HTTP 200. Very large function (~500 lines). Token refresh logic is duplicated per sub-fetch (shipment details, SLA, labels, billing).

**DB Tables:** `marketplace_integrations`, `marketplace_orders_raw`, `apps`
**External APIs:** Mercado Livre API (orders, shipments, labels, billing)

---

### `mercado-livre-process-presented`
**Method:** POST / GET
**Trigger:** Invoked by `mercado-livre-webhook-orders` after raw upsert.

Reads a row from `marketplace_orders_raw` (by `raw_id` or `marketplace_order_id`) and normalizes it into `marketplace_orders_presented_new`. Business logic includes:

**Status derivation** (`status_interno` — Portuguese labels):
| ML Status / Substatus | `status_interno` |
|---|---|
| `cancelled` or `refunded` | `Cancelado` |
| `not_delivered` + `returned_to_warehouse` | `Devolução` |
| Fulfillment (`logistic_type = fulfillment`) | `Enviado` |
| `ready_to_ship` + `invoice_pending` | `Emissao NF` |
| `ready_to_ship` + `ready_to_print` | `Impressao` |
| `ready_to_ship` + label printed | `Aguardando Coleta` |
| `shipped`, `in_transit`, etc. | `Enviado` |
| Has unlinked items | `A vincular` |
| Default | `Pendente` |

**Product linking:** Resolves product links via `marketplace_item_product_links` (permanent) and ephemeral links from the raw row. Counts `unlinked_items_count`.

**Inventory reservation:** If permanent links exist, calls `fn_order_reserva_stock_linked` RPC to reserve stock.

**DB Tables:** `marketplace_orders_raw`, `marketplace_orders_presented_new`, `marketplace_order_items`, `marketplace_item_product_links`, `products`, inventory RPCs
**External APIs:** None

**Similar to:** `shopee-process-presented` (identical pattern, different field mappings)

---

## 10. Shopee — Item Sync

### `shopee-sync-items`
**Method:** POST
**Trigger:** Manual sync or scheduled job.

Fetches Shopee shop items with pagination, fetches variation/attribute details, and stores in `marketplace_items`. Handles token refresh on 401. Shopee's API structure differs significantly from ML (shop_id-scoped, HMAC-signed requests).

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-sync-items`

---

### `shopee-sync-all`
**Method:** POST
**Trigger:** Shopee webhook gateway.

Shopee webhook topic router (analogous to `mercado-livre-sync-all`). Routes item updates to `shopee-webhook-items` and order notifications to `shopee-webhook-orders`. Uses async fire-and-forget pattern, returns 200 immediately.

**DB Tables:** None
**External APIs:** None (routing only)

**Similar to:** `mercado-livre-sync-all`

---

### `shopee-webhook-items`
**Method:** POST
**Trigger:** Shopee item push notification.

Processes Shopee item update events (list, deactivate, reactivate). Updates `marketplace_items` status based on the push notification topic.

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** None (uses payload from Shopee push)

---

### `shopee-product-add-item`
**Method:** POST
**Trigger:** "Publicar na Shopee" action.

Creates a new Shopee listing from internal product data. Maps attributes, pricing, and variations to Shopee's API schema. Stores the created listing in `marketplace_items`.

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-publish-item`

---

### `shopee-update-stock`
**Method:** POST
**Trigger:** Stock update event or manual sync.

Pushes inventory quantity changes to Shopee via `/product/stock/update`. Calculates the stock delta and calls the API. Updates `marketplace_items` with the new quantity after a successful API response.

**DB Tables:** `marketplace_items`, `marketplace_integrations`
**External APIs:** Shopee Open Platform

---

## 11. Shopee — Category & Attributes

### `shopee-categories-predict`
**Method:** POST

Predicts the Shopee category for a product title using Shopee's category suggestion API. Returns a list of category suggestions for use in the listing creation form.

**DB Tables:** `marketplace_integrations`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-categories-predict`

---

### `shopee-product-attributes`
**Method:** POST

Fetches attributes for a Shopee category. Returns the attribute list for rendering the listing configuration form. Metadata-only — no database writes.

**DB Tables:** `marketplace_integrations`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-categories-attributes`

---

## 12. Shopee — Order Pipeline (Legacy)

### `shopee-sync-orders`
**Method:** POST
**Trigger:** Manual sync or cron job.

Fetches Shopee orders using cursor-based `get_order_list` pagination, then batches 50 order SNs at a time into `get_order_detail`. Normalizes via `ShopeeOrderNormalizeService` and calls `upsertOrder()` directly. Does not write to `marketplace_orders_raw` (unlike ML pipeline).

**DB Tables:** `orders`, `marketplace_integrations`
**External APIs:** Shopee Open Platform

**Similar to:** `orders-sync-shopee` (Cycle 0 version), `mercado-livre-sync-orders`

---

### `shopee-webhook-orders`
**Method:** POST
**Trigger:** Shopee order push notification.

Receives Shopee order status change notifications. Validates HMAC-SHA256 signature (Base64 and Hex variants). Detects the `order_sn` from multiple possible payload paths. Fetches full order detail from Shopee API, UPSERTs to `marketplace_orders_raw`, then invokes `shopee-process-presented`. Handles various Shopee push formats (order_detail, order_list_item, notification keys).

**DB Tables:** `marketplace_orders_raw`, `marketplace_integrations`, `apps`
**External APIs:** Shopee Open Platform

**Similar to:** `mercado-livre-webhook-orders`

---

### `shopee-process-presented`
**Method:** POST
**Trigger:** Invoked by `shopee-webhook-orders` after raw upsert.

Shopee equivalent of `mercado-livre-process-presented`. Reads from `marketplace_orders_raw`, normalizes to `marketplace_orders_presented_new`. Skips `unpaid` orders. Derives `status_interno`:

| Shopee Status | `status_interno` |
|---|---|
| `cancelled` / `in_cancel` | `Cancelado` |
| `to_return` | `Devolução` |
| `ready_to_ship` + unlinked items | `A vincular` |
| `ready_to_ship` + invoice_pending / no invoice number | `Emissao NF` |
| `ready_to_ship` / `processed` / logistics_ready | `Impressao` |
| `retry_ship` | `Aguardando Coleta` |
| `shipped` / `completed` / pickup_done_time set | `Enviado` |
| Default | `Pendente` |

Resolves product links (permanent + ephemeral), re-applies ephemeral links to `marketplace_order_items`, aggregates unlinked status. At the end invokes `inventory-jobs-worker` for stock operations. Parses Brazilian address from multiple fallback fields.

**DB Tables:** `marketplace_orders_raw`, `marketplace_orders_presented_new`, `marketplace_order_items`, `marketplace_item_product_links`, `products`, `notas_fiscais`
**External APIs:** None

**Similar to:** `mercado-livre-process-presented`

---

## 13. Shopee — Logistics

### `shopee-arrange-shipment`
**Method:** POST
**Trigger:** "Solicitar coleta" action on orders page.

Arranges shipment for a Shopee order by calling `/logistics/arrange_shipment` with carrier selection parameters. The API assigns a carrier and generates a shipping label. Persists tracking number and shipment details to `order_shipping`.

**DB Tables:** `order_shipping`, `marketplace_integrations`
**External APIs:** Shopee Open Platform

---

## 14. Unified Orders — Cycle 0 ✅ NEWEST

> **These are the newest functions in the codebase** — the canonical architecture going forward. They replace the legacy `marketplace_orders_presented_new` pipeline and all DB triggers with a clean, marketplace-agnostic normalized schema.
>
> **Key design principles:**
> - No direct Supabase calls inside handler logic — all DB/token access via `_shared/adapters` ports
> - `upsertOrder()` is a shared TypeScript module imported directly (not an HTTP call), so `orders-sync-ml` and `orders-sync-shopee` have zero inter-function HTTP overhead
> - `orders-webhook` is the single unified entry point for all real-time marketplace order events
> - Status history is append-only (`order_status_history`); shipping labels are separate (`order_labels`); no 87-column blobs
>
> **Relationship to legacy:** `orders-sync-ml` / `orders-sync-shopee` write to the new `orders` table. The legacy `mercado-livre-sync-orders` / `shopee-sync-orders` also write there (via `orders-upsert` HTTP call) but still carry legacy coupling. Eventually the legacy order webhooks and `*-process-presented` functions will be fully replaced.

### `orders-upsert` ✅
**Method:** POST
**Trigger:** HTTP — called by legacy `mercado-livre-sync-orders` / `shopee-sync-orders`. NOT called by `orders-sync-ml` or `orders-sync-shopee` (they import the logic directly).

Thin HTTP wrapper around the `upsertOrder()` domain service in `./upsert-order.ts`, backed by `OrdersUpsertAdapter`. Accepts `UpsertOrderInput`:
```ts
{
  organization_id: string;
  order: NormalizedOrder;  // marketplace-agnostic domain type
  source: "webhook" | "sync";
}
```
`OrdersUpsertAdapter` performs:
1. SELECT existing order to capture previous status (for change detection).
2. UPSERT `orders` on conflict `(organization_id, marketplace, marketplace_order_id)`.
3. If status changed → INSERT `order_status_history` (append-only).
4. DELETE + re-INSERT `order_items` (full replace).
5. UPSERT `order_shipping` on conflict `order_id`.

Returns `{ success, order_id, created }`.

**DB Tables:** `orders`, `order_items`, `order_shipping`, `order_status_history`
**External APIs:** None

---

### `orders-sync-ml` ✅
**Method:** POST
**Trigger:** Cron job or manual trigger (replaces legacy `mercado-livre-sync-orders` for Cycle 0 data model).

Full ML order sync pipeline built entirely on `_shared` adapters — no raw HTTP calls in the handler:
1. `resolveMLSyncContext()` — resolves org, decrypts ML token, validates membership.
2. `fetchOrderIds()` — paginates `/orders/search` (date range from `body.date_from` / `body.date_to`).
3. For each order ID: `MlOrderSyncProcessor.processOneOrder()` which:
   - Fetches full order via `MlOrderApiAdapter` (`/orders/{id}`)
   - Normalizes via `MlOrderNormalizeService`
   - Persists via `OrdersUpsertAdapter` (direct import — **no HTTP call**)
   - Optionally archives raw payload via `SupabaseMarketplaceOrdersRawAdapter`
4. Returns `{ synced, failed, errors[], duration_ms }`.

**DB Tables:** `orders`, `order_items`, `order_shipping`, `order_status_history`, `marketplace_orders_raw`, `marketplace_integrations`
**External APIs:** Mercado Livre API (`/orders/search`, `/orders/{id}`)

**Similar to:** `orders-sync-shopee`

---

### `orders-sync-shopee` ✅
**Method:** POST
**Trigger:** Cron job or manual trigger (replaces legacy `shopee-sync-orders` for Cycle 0 data model).

Full Shopee order sync pipeline. `resolveShopeeSyncContext()` validates org and decrypts token, then:
1. `ShopeeFetchOrdersAdapter.fetchOrderSnList()` — cursor-paginated `get_order_list` (up to 90 days back).
2. Batches of 50 SNs → `fetchOrderDetailBatch()` (`get_order_detail`).
3. Per order: optional `fetchEscrowDetail()` for financial data (commission, service fee).
4. `ShopeeOrderNormalizeService.normalize()` → `upsertOrder()` (direct import — **no HTTP call**).
5. Token refresh handled inline via `getShopeeAccessToken()` on 401.

Unlike `orders-sync-ml`, does **not** archive to `marketplace_orders_raw`.

Returns `{ synced, failed, errors[], duration_ms }`.

**DB Tables:** `orders`, `order_items`, `order_shipping`, `order_status_history`, `marketplace_integrations`
**External APIs:** Shopee Open Platform (`get_order_list`, `get_order_detail`, `get_escrow_detail`)

**Similar to:** `orders-sync-ml`

---

### `orders-webhook` ✅
**Method:** POST
**Trigger:** Real-time push from Mercado Livre or Shopee (single unified endpoint for both).

The most architecturally complete function in the codebase. Detects marketplace from payload:
- **ML:** `x-source: mercado_livre` header **or** topic ∈ `["orders_v2", "orders"]` + `resource` + `user_id`
- **Shopee:** `shop_id` + (`order_sn` / `ordersn` / `code`) present

Shopee path validates HMAC-SHA256 signature against `SHOPEE_LIVE_PUSH_PARTNER_KEY` before processing.

Both paths follow the same port-based flow with **zero direct Supabase calls**:
```
SupabaseMarketplaceIntegrationsAdapter (find integration)
  → getMlAccessToken / getShopeeAccessToken (decrypt + refresh if needed)
  → MlOrderApiAdapter / ShopeeFetchOrdersAdapter (fetch full order from marketplace)
  → MlOrderNormalizeService / ShopeeOrderNormalizeService (normalize to domain type)
  → upsertOrder() (direct import)
```

Contrast with the legacy `mercado-livre-webhook-orders` (500 lines, direct SQL, fetches 6 sub-resources, calls a second function) — `orders-webhook` achieves the same in ~237 lines via clean abstractions.

**DB Tables:** `orders`, `order_items`, `order_shipping`, `order_status_history` (all via `upsertOrder`), `marketplace_integrations`
**External APIs:** Mercado Livre API (`/orders/{id}`), Shopee Open Platform (`get_order_detail`)

---

## 15. NFe / Invoice (Focus NFeS)

### `focus-nfe-emit`
**Method:** POST
**Trigger:** "Emitir NF" action on orders page, or via `emit-queue-consume`.

Emits an NFe via Focus NFeS. Resolves the Focus access token by `company_id` and environment (`homologacao` / `producao`). POSTs to `/v2/nfe` with the full nota fiscal data. Uses an idempotency key (`org_id-company_id-order_id`) to prevent double emission. Updates `notas_fiscais` with returned `status`, `auth_code`, `serie`, `numero`. Handles Focus-specific error codes.

**DB Tables:** `notas_fiscais`, `companies`
**External APIs:** Focus NFeS

---

### `focus-nfe-cancel`
**Method:** POST
**Trigger:** "Cancelar NF" action.

Cancels or denies an emitted NFe via Focus. POSTs to `/v2/{tipo}/{referencia}/cancel` with a cancellation reason code. Updates `notas_fiscais.status` to `cancelled`. Enforces the state machine: only emitted invoices can be cancelled.

**DB Tables:** `notas_fiscais`
**External APIs:** Focus NFeS

---

### `focus-nfe-sync`
**Method:** POST
**Trigger:** Periodic cron or manual sync.

Syncs NFe statuses from Focus for a company. Fetches the list of emitted NFes from Focus, then bulk-updates `notas_fiscais` with current `status`, `auth_code`, `serie`, `numero`. Scoped by company and environment.

**DB Tables:** `notas_fiscais`, `companies`
**External APIs:** Focus NFeS

---

### `focus-webhook`
**Method:** POST
**Trigger:** Focus NFeS status change webhook.

Receives Focus NFeS webhook notifications (emitted, cancelled, rejected). Validates HMAC signature. Processes asynchronously via `setTimeout` to return 200 immediately. Updates `notas_fiscais.status` and reference fields based on the notification payload.

**DB Tables:** `notas_fiscais`
**External APIs:** None (incoming webhook)

---

### `focus-resend-hook`
**Method:** POST
**Trigger:** Manual "reenviar webhook" action.

Forces Focus NFeS to re-send a webhook notification for a specific NFe reference. Resolves the company token and environment, constructs the correct Focus API endpoint based on document type (`nfe`, `nfse`, `cte`, `mde`, `nfsen`, `nfcom`), and POSTs to `/v2/{tipo}/{referencia}/hook`. Extracts `company_id` from the `referencia` string using a marker pattern (`-company-`).

**DB Tables:** `companies`
**External APIs:** Focus NFeS

---

### `download-nfe-xml`
**Method:** POST
**Trigger:** "Baixar XML" action on orders page.

Retrieves NFe XML from Focus NFeS (via `xml_url` + Basic auth) or falls back to a provided `xml_base64` value. Returns the XML as a base64 string with filename for client-side download. Resolves Focus token by company ID and environment. Gracefully handles errors without hard 500 failures.

**DB Tables:** `companies`
**External APIs:** Focus NFeS (XML download endpoint)

---

### `emit-queue-consume`
**Method:** POST
**Trigger:** Cron job (queue consumer).

Processes two PGMQ queues:
- `q_emit_focus` — NFe emission jobs: batches by org/company/environment, calls `focus-nfe-emit`.
- `q_submit_xml` — XML submission jobs: calls `mercado-livre-submit-xml` or `shopee-submit-xml` based on marketplace.

Implements retry with exponential backoff, moving failed jobs to a DLQ after max attempts. Reads via RPCs `q_emit_focus_read` / `q_submit_xml_read` and deletes on success.

**DB Tables:** `notas_fiscais`, PGMQ queue tables (via RPCs)
**External APIs:** Downstream edge functions (via `functions.invoke`)

---

### `mercado-livre-submit-xml`
**Method:** POST
**Trigger:** XML submission action for ML orders, or via `emit-queue-consume`.

Fetches the NFe XML via `download-nfe-xml` (using Focus token + Basic auth), then submits it to Mercado Livre's invoice endpoint for the associated order. Updates `notas_fiscais.marketplace_submission_status` to `'sent'` on success.

**DB Tables:** `notas_fiscais`, `marketplace_integrations`
**External APIs:** Mercado Livre API, Focus NFeS (XML download)

**Similar to:** `shopee-submit-xml`

---

### `shopee-submit-xml`
**Method:** POST
**Trigger:** XML submission action for Shopee orders, or via `emit-queue-consume`.

Submits invoice (NFe XML or PDF) to Shopee for an order. Pre-checks token expiry and refreshes if <5 minutes remain. Resolves the XML/PDF from base64 or URL (via Focus NFeS). Uploads to Shopee's `/api/v2/order/upload_invoice_doc` with HMAC V2 signature. Enforces a 1 MB file size limit. Maps file type: `4 = XML`, `1 = PDF`. Updates `notas_fiscais.marketplace_submission_status`.

**DB Tables:** `notas_fiscais`, `marketplace_integrations`, `apps`, `companies`
**External APIs:** Shopee Open Platform, Focus NFeS

**Similar to:** `mercado-livre-submit-xml`

---

## 16. Inventory & Product Linking

### `linked_products_item`
**Method:** POST
**Trigger:** Product linking modal in orders page.

Associates internal products with marketplace listings via SKU or variation ID matching. Creates/updates rows in `linked_products` linking `products.id` to `marketplace_items`. Used to track CMV (custo da mercadoria vendida) per listing, enabling margin calculation on orders. Central hub for the product-to-listing linkage.

**DB Tables:** `linked_products`, `marketplace_items`, `products`
**External APIs:** None

---

### `inventory-jobs-worker`
**Method:** POST
**Trigger:** Invoked by `shopee-process-presented`; also supports direct invocation.

Processes `inventory_jobs` queue entries for stock flow operations triggered by order status transitions:
- `reserve` — reserves stock when an order is created
- `consume` — deducts stock when order ships
- `refund` — returns stock on cancellation/return

Operations are idempotent via unique constraints in `inventory_transactions`. Prevents double-refund scenarios by checking existing transactions before writing.

**DB Tables:** `inventory_jobs`, `inventory_transactions`, `inventory_locations`
**External APIs:** None

---

## 17. Retry Infrastructure

### `mercado-livre-retry-worker`
**Method:** POST
**Trigger:** Periodic cron job.

Scans `ml_retry_queue` for jobs whose `next_retry_at <= now()`. For each due job, routes by `job_type`:
- `reviews` → invokes `mercado-livre-update-reviews`
- `metrics` → invokes `mercado-livre-update-metrics`
- `descriptions` → invokes `mercado-livre-sync-descriptions`
- `quality` → invokes `mercado-livre-update-quality`

On failure, increments `attempts`, calculates next retry with exponential backoff (base 30s, capped at `30s * 2^4 = 480s`). After `max_attempts` exceeded, moves to `ml_dead_letter_queue`.

**DB Tables:** `ml_retry_queue`, `ml_dead_letter_queue`
**External APIs:** Downstream ML edge functions (via `functions.invoke`)

---

## 18. Similar Functions Cross-Reference

| Dimension | Mercado Livre | Shopee |
|---|---|---|
| OAuth start | `mercado-livre-start-auth` | `shopee-start-auth` |
| OAuth callback | `mercado-livre-callback` | `shopee-callback` |
| Token refresh | `mercado-livre-refresh` | `shopee-refresh` |
| Item sync (full) | `mercado-livre-sync-items` | `shopee-sync-items` |
| Item webhook | `mercado-livre-webhook-items` | `shopee-webhook-items` |
| Publish listing | `mercado-livre-publish-item` | `shopee-product-add-item` |
| Update stock | `mercado-livre-sync-stock-distribution` | `shopee-update-stock` |
| Category predict | `mercado-livre-categories-predict` | `shopee-categories-predict` |
| Category attributes | `mercado-livre-categories-attributes` | `shopee-product-attributes` |
| Order webhook | `mercado-livre-webhook-orders` | `shopee-webhook-orders` |
| Process presented | `mercado-livre-process-presented` | `shopee-process-presented` |
| Order sync (legacy) | `mercado-livre-sync-orders` | `shopee-sync-orders` |
| Order sync (Cycle 0) | `orders-sync-ml` | `orders-sync-shopee` |
| XML submission | `mercado-livre-submit-xml` | `shopee-submit-xml` |

### Quality/Metrics Family (ML-only)

All three share the same pattern: concurrency-limited workers, TTL-based skipping, exponential backoff on 429, re-queue to `ml_retry_queue`, token refresh on 401/403.

| Function | API Endpoint | TTL | What it stores |
|---|---|---|---|
| `mercado-livre-update-quality` | `/item/{id}/performance` (+ `/user-product/{id}/performance`) | 24h | quality score (0–100) + level |
| `mercado-livre-update-reviews` | `/reviews/item/{id}` | 24h | rating_average + reviews_count |
| `mercado-livre-update-metrics` | `/item/{id}/performance` + `/visits/items?ids={id}` | 12h quality, 6h visits | quality score + visit count |

> `mercado-livre-update-metrics` is a superset of `mercado-livre-update-quality` but runs on a shorter TTL for visits. Both functions exist independently because they were built at different times and serve different callers (orchestrator vs. retry worker).

### Process-Presented Family

`mercado-livre-process-presented` and `shopee-process-presented` are structurally identical:
1. Read from `marketplace_orders_raw`
2. Derive `status_interno` from marketplace-specific status fields
3. UPSERT `marketplace_orders_presented_new`
4. Delete + re-insert `marketplace_order_items`
5. Resolve product links (permanent + ephemeral)
6. Aggregate `has_unlinked_items`
7. Trigger inventory operations

The key differences are the status mapping logic (ML uses `shipment_status`/`substatus`, Shopee uses `order_status`/`logistics_status`) and address field paths.

### OAuth Pattern (All Marketplaces)

All OAuth functions follow the same security pattern:
1. **Start**: Generate PKCE verifier + S256 challenge + CSRF state → return URL + verifier separately
2. **Callback**: Validate CSRF from state → exchange code + verifier → encrypt tokens with AES-GCM → UPSERT integration
3. **Refresh**: Decrypt refresh token → call `/oauth/token` → encrypt new tokens → update integration

Token storage: AES-GCM encrypted in `marketplace_integrations.access_token` / `refresh_token`. Encryption key from `TOKENS_ENCRYPTION_KEY` env var.

---

## 19. Consolidation Opportunities

> Analysis of which separate edge functions could be collapsed into a single HTTP request to an external API, eliminating inter-function overhead (cold starts, auth re-establishment, duplicate token decryption).

---

### 🔴 HIGH IMPACT — Same external API call duplicated

#### `mercado-livre-update-quality` ↔ `mercado-livre-update-metrics`

**Problem:** Both functions call `/item/{id}/performance` (with the same `/user-product/{id}/performance` fallback). Every time the orchestrator runs phases B and C, the performance endpoint is hit twice per item — once for quality, once for metrics. `update-metrics` is already a functional superset (it fetches performance + visits), but `update-quality` still exists separately with a longer TTL (24h vs 12h).

**Solution:** Delete `mercado-livre-update-quality`. Configure `mercado-livre-update-metrics` to accept an optional `quality_only` flag for the retry worker use-case. Reduces external API calls by 50% for the performance endpoint per orchestrator run.

**Functions affected:** `mercado-livre-update-quality`, `mercado-livre-update-metrics`, `mercado-livre-retry-worker`, `mercado-livre-orchestrate-sync`, `mercado-livre-webhook-items`

---

### 🔴 HIGH IMPACT — Webhook handler triggers a second function that immediately re-reads what the first just wrote

#### `mercado-livre-webhook-orders` → `mercado-livre-process-presented`

**Problem:** `mercado-livre-webhook-orders` UPSERTs the raw order to `marketplace_orders_raw`, then immediately invokes `mercado-livre-process-presented` which reads that same row back from DB to normalize it. This is a write → read round-trip to the database purely as a serialization boundary between two functions. The raw row is in memory moments before the insert.

**Solution:** Inline the normalization logic from `mercado-livre-process-presented` into `mercado-livre-webhook-orders`. Pass the raw payload in memory rather than writing and re-reading. The status machine logic, product-link resolution, and item insertion can all run in the same function body without losing the `marketplace_orders_raw` archive (still write that, just don't read it back).

**Functions affected:** `mercado-livre-webhook-orders`, `mercado-livre-process-presented`

#### `shopee-webhook-orders` → `shopee-process-presented`

Same pattern. Same fix.

**Functions affected:** `shopee-webhook-orders`, `shopee-process-presented`

---

### 🟡 MEDIUM IMPACT — One webhook fan-out to 6 separate functions

#### `mercado-livre-webhook-items` → 6 downstream functions

**Problem:** After upserting the item, `mercado-livre-webhook-items` fires 6 `functions.invoke()` calls in parallel (`sync-descriptions`, `update-quality`, `update-reviews`, `update-metrics`, `sync-stock-distribution`, `sync-prices`). Each call incurs its own cold start, TLS handshake, auth header, and token decryption. All 6 already receive just `{ organizationId, itemIds: [id] }` — a single item.

**Solution:** Import the 6 worker modules directly (they are already TypeScript modules in `_shared` or peer directories). Run them as `Promise.allSettled([...])` calls inside the same Deno isolate. The token only needs to be decrypted once and passed to all workers.

**Caveat:** Some functions (e.g., `mercado-livre-sync-stock-distribution`) have their own concurrency limiters and TTL checks — these would need to be extracted into importable service classes rather than staying as standalone HTTP handlers.

**Functions affected:** `mercado-livre-webhook-items`, `mercado-livre-sync-descriptions`, `mercado-livre-update-quality`, `mercado-livre-update-reviews`, `mercado-livre-update-metrics`, `mercado-livre-sync-stock-distribution`, `mercado-livre-sync-prices`

---

### 🟡 MEDIUM IMPACT — Retry worker invokes functions instead of importing modules

#### `mercado-livre-retry-worker` → 4 downstream functions

**Problem:** The retry worker resolves job type and then calls `functions.invoke('mercado-livre-update-reviews', ...)` etc. Each retry job = 1 cold start + 1 token decryption even if the same token was decrypted 3 seconds ago for a different job in the same batch.

**Solution:** Extract the core per-item logic from each worker into importable service classes (e.g., `MlReviewsService`, `MlMetricsService`). The retry worker imports and calls them directly after resolving the token once per org. This is already the pattern used by `orders-sync-ml` with `MlOrderSyncProcessor`.

**Functions affected:** `mercado-livre-retry-worker`, `mercado-livre-update-reviews`, `mercado-livre-update-metrics`, `mercado-livre-sync-descriptions`, `mercado-livre-update-quality`

---

### 🟡 MEDIUM IMPACT — 8 thin catalog passthrough functions (ML)

#### ML Catalog read-only wrappers

**Problem:** `mercado-livre-categories-predict`, `mercado-livre-categories-attributes`, `mercado-livre-categories-sale-terms`, `mercado-livre-attributes-conditional`, `mercado-livre-technical-specs-input`, `mercado-livre-available-listing-types`, `mercado-livre-listing-prices`, `mercado-livre-shipping-methods` are all 40–80 line functions that: decrypt token → call one ML API endpoint → return JSON. They exist as 8 separate deployments with 8 separate cold starts.

**Solution:** Consolidate into a single `mercado-livre-catalog` function with an `action` field routing:
```json
{ "action": "predict_category", "organizationId": "...", "title": "..." }
{ "action": "category_attributes", "organizationId": "...", "categoryId": "..." }
```
Token decryption runs once. Supabase client is created once. Reduces 7 deployments, 7 cold starts, and 7 auth setups to 1 when the listing creation UI calls multiple catalog endpoints sequentially.

**Functions affected:** All 8 ML catalog functions listed above.

**Note:** Shopee equivalents (`shopee-categories-predict`, `shopee-product-attributes`) could follow the same pattern as `shopee-catalog`.

---

### 🟡 MEDIUM IMPACT — NFe emit + XML submit are almost always called together

#### `focus-nfe-emit` → `download-nfe-xml` → `mercado-livre-submit-xml` / `shopee-submit-xml`

**Problem:** The full NFe flow is: emit NFe at Focus → wait for authorization → download XML → submit to marketplace. `emit-queue-consume` already orchestrates this sequence but does so by invoking three separate edge functions serially, each with its own cold start and token resolution.

**Solution:** A single `nfe-emit-and-submit` function that:
1. Calls Focus `/v2/nfe` (emit)
2. Polls or waits for the authorization response (Focus returns synchronously in homolog)
3. Downloads the XML using the same Focus token already in memory
4. Submits to the marketplace using the marketplace token already resolved

`emit-queue-consume` would call this consolidated function once per job instead of three times.

**Caveat:** In production, NFe emission can be asynchronous (Focus queues it). The polling step may still require a separate webhook callback (`focus-webhook`). For synchronous homolog use cases, the consolidation is clean.

**Functions affected:** `emit-queue-consume`, `focus-nfe-emit`, `download-nfe-xml`, `mercado-livre-submit-xml`, `shopee-submit-xml`

---

### 🟢 LOW IMPACT — Already well-designed, no consolidation needed

| Function | Reason |
|---|---|
| `orders-webhook` | Already handles both ML and Shopee; clean port/adapter design; zero duplication |
| `orders-sync-ml` / `orders-sync-shopee` | Import `upsertOrder` directly — no inter-function HTTP overhead |
| `mercado-livre-start-auth` / `shopee-start-auth` | Necessarily separate (different OAuth endpoints; two-step browser redirect flow) |
| `mercado-livre-callback` / `shopee-callback` | Same — OAuth redirect, cannot be combined |
| `mercado-livre-refresh` / `shopee-refresh` | Different signature schemes (bearer vs HMAC) — parallel but not mergeable |
| `focus-nfe-sync` / `focus-nfe-cancel` | Different triggers (cron vs user action); combining would add no value |
| `inventory-jobs-worker` | Already a single-function queue consumer with clear scope |
| `auth-on-signup` / `create-user` / `manage-users` | Auth-domain functions are small and correctly scoped |

---

### Summary Table

| Priority | Opportunity | Functions → Merged into | External API calls saved per event |
|---|---|---|---|
| 🔴 | Merge `update-quality` into `update-metrics` | 1 function | 1 per item per orchestrator run |
| 🔴 | Inline `process-presented` into `webhook-orders` (ML) | 1 function | 1 DB write-read round-trip |
| 🔴 | Inline `process-presented` into `webhook-orders` (Shopee) | 1 function | 1 DB write-read round-trip |
| 🟡 | Inline 6 enrichment workers into `webhook-items` | 1 function | 6 cold starts per item webhook |
| 🟡 | Import modules in retry worker instead of `functions.invoke` | 1 function | N cold starts per retry batch |
| 🟡 | Merge 8 ML catalog wrappers into `ml-catalog` | 1 function | 7 cold starts per listing session |
| 🟡 | Merge NFe emit+download+submit into `nfe-emit-and-submit` | 1 function | 2 cold starts per NFe job |
