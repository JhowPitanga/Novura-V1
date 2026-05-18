# Cycle 0 — "Plataforma de Pedidos"
**Status:** Pre-launch prerequisite | **Appetite:** 6 weeks | **Team:** 1 backend + 1 fullstack engineer

---

## Purpose of This Document

This document is the complete specification for an AI agent or engineer implementing Cycle 0. It is self-contained. Do not invent requirements not listed here. Do not build features from other cycles. When in doubt about scope, refer to the **Rabbit Holes & No-Gos** section.

---

## Why This Cycle Exists

The current Novura codebase has an orders system that grew organically without a deliberate data model. Every feature in Cycles 1–3 (margin analysis, Diagnóstico, NFe emission, stock intelligence) reads from or writes to orders data. If that foundation is broken, every feature built on top of it will show wrong numbers or be fragile.

**Specific problems found in the existing schema:**

1. **87-column flat table** — `marketplace_orders_presented_new` mixes order identity, buyer info, shipping address, shipment tracking, payment details, item data (first item only, not all SKUs), billing info, label binary data (PDFs and ZPL files stored inline), and NFe status in one table. Impossible to query efficiently.

2. **Items are in 3 places** — `marketplace_orders_presented_new.first_item_*` columns, a separate `marketplace_order_items` table (partially used), and the `items` JSONB blob — with no single source of truth.

3. **No idempotency guarantee** — sync functions can create duplicate orders on retry. No UNIQUE constraint on `(organization_id, marketplace, marketplace_order_id)`.

4. **NFe double-emission risk** — `notas_fiscais` has no idempotency key. The same order can be invoiced twice if an edge function is called twice (legal and financial risk).

5. **No status history** — only current order status stored. Trend analytics, fulfillment time, cancellation patterns are impossible.

6. **Business logic in the frontend** — row parsing, fee calculation, and status resolution happen in React components instead of services/database.

7. **Binary data inline** — label PDFs and ZPL files stored as base64 in the flat table, bloating every order list query.

**This cycle is invisible to end users but is the prerequisite for every feature in Cycles 1–3.**

---

## OAuth2 Security Model

This section defines the correct OAuth2 + PKCE pattern for Mercado Livre. **Do not deviate from this.** The existing code had a critical flaw (PKCE verifier in state — see below). This is the corrected model.

### The PKCE Problem (What Was Wrong)

The old `mercado-livre-start-auth` embedded `pkce_verifier` inside the base64-encoded `state` parameter:

```
state = btoa({ csrf, organizationId, ..., pkce_verifier: "<SECRET>" })
```

The `state` parameter travels through: server response → browser → ML authorization URL → browser callback URL (visible in address bar, server logs, browser history, CDN logs). An attacker who intercepts the callback URL gets both `code` AND `code_verifier` simultaneously — rendering PKCE's protection completely void.

### The Correct Flow (Already Fixed in Codebase)

```
1. Frontend calls mercado-livre-start-auth edge function
2. Edge function:
   - Generates code_verifier (random 64-char string)
   - Generates code_challenge = SHA-256(code_verifier), base64url-encoded
   - Generates csrf = randomUUID()
   - Builds state = btoa({ csrf, organizationId, storeName, ... })  ← no verifier
   - Returns { authorization_url, state, code_verifier }           ← verifier separate

3. Frontend (startMercadoLivreAuth helper):
   - Stores code_verifier in sessionStorage['ml_pkce_verifier']
   - Parses state, stores csrf in sessionStorage['ml_oauth_csrf']
   - Redirects browser to authorization_url

4. ML authorization page → seller approves → ML redirects to callback URL:
   /oauth/mercado-livre/callback?code=XXX&state=YYY

5. MercadoLivreCallback.tsx:
   - Reads code_verifier from sessionStorage['ml_pkce_verifier']
   - Reads expected_csrf from sessionStorage['ml_oauth_csrf']
   - Parses state, extracts state.csrf
   - Validates: state.csrf === expected_csrf (throws if mismatch — CSRF check)
   - Calls mercado-livre-callback edge function with { code, state, code_verifier }
   - Clears sessionStorage['ml_pkce_verifier'] and ['ml_oauth_csrf']

6. mercado-livre-callback edge function:
   - Reads code_verifier from request body (not from state)
   - Exchanges code + code_verifier for tokens via ML oauth/token endpoint
   - Encrypts tokens with AES-GCM (TOKENS_ENCRYPTION_KEY)
   - UPSERTs into marketplace_integrations (on conflict: organizations_id + marketplace_name)
```

### Key Rules for Any Agent Working on OAuth

- **NEVER put the PKCE verifier in `state`** — state is a URL parameter and is public
- **NEVER store tokens in localStorage or sessionStorage** — only the single-use verifier lives there briefly, then is deleted
- **ALWAYS validate CSRF** — compare `state.csrf` with `sessionStorage['ml_oauth_csrf']` before calling the callback edge function
- **ALWAYS use UPSERT** — INSERT on `marketplace_integrations` will fail on reconnect; use UPSERT with `onConflict: 'organizations_id,marketplace_name'`
- **The verifier is single-use** — clear from sessionStorage immediately after the callback completes (success or failure)
- **Tokens are always encrypted** — AES-GCM via `aesGcmEncryptToString` in `_shared/adapters/token-utils.ts`. The format is `enc:gcm:{iv_b64}:{ciphertext_b64}`. Never store plaintext tokens in the DB.

### Files Involved (Do Not Reinvent)

| File | Role |
|---|---|
| `supabase/functions/mercado-livre-start-auth/index.ts` | Generates PKCE pair + state, returns verifier separately |
| `supabase/functions/mercado-livre-callback/index.ts` | Receives verifier from body, exchanges code, UPSERTs tokens |
| `supabase/functions/mercado-livre-refresh/index.ts` | Decrypts refresh token, gets new pair, re-encrypts, updates row |
| `src/WebhooksAPI/marketplace/mercado-livre/index.ts` | `startMercadoLivreAuth()` — stores verifier + csrf in sessionStorage |
| `src/pages/MercadoLivreCallback.tsx` | Validates CSRF, retrieves verifier, calls callback edge function |
| `supabase/functions/_shared/adapters/token-utils.ts` | AES-GCM encrypt/decrypt helpers — use these, don't write new ones |

### Shopee OAuth Note
Shopee does not use authorization code flow + PKCE. It uses HMAC-SHA256 request signing with a partner key. The `shopee-start-auth` function generates an HMAC signature for the authorization URL. No sessionStorage storage needed — there is no verifier concept. See `shopee-start-auth/index.ts` for the existing pattern.

---

## What Already Exists (Do NOT Delete These)

### Edge Functions to Preserve (reference, not rebuild)
- `mercado-livre-start-auth` — ML OAuth2 initiation (keep as-is)
- `mercado-livre-callback` — ML OAuth2 callback + token storage (keep as-is)
- `mercado-livre-refresh` — Auto-refresh ML tokens (keep as-is)
- `shopee-start-auth` — Shopee OAuth2 initiation (keep as-is)
- `shopee-callback` — Shopee OAuth2 callback + token storage (keep as-is)
- `shopee-refresh` — Auto-refresh Shopee tokens (keep as-is)
- `focus-nfe-emit` — NFe emission via Focus API (keep as-is, but `emit-invoice` wraps it)
- `focus-nfe-cancel` — NFe cancellation (keep as-is)
- `focus-nfe-sync` — NFe status sync (keep as-is)
- `focus-webhook` — Focus NFe webhook handler (keep as-is)
- `_shared` — Shared utilities (keep and reference)

### Database Tables to Preserve
- `marketplace_orders_raw` — Raw archive of ML/Shopee API responses. This is the source of truth for re-sync. **Never delete this.** Never query it for display — it's an audit table.
- `organizations` — Multi-tenant root table. All new tables will FK to this.
- `products` — Existing product catalog. `order_items.product_id` will FK here.
- `companies` — Company/fiscal data for NFe. `invoices.company_id` FKs here.

### Tables to Keep Alive During Transition (read-only)
- `marketplace_orders_presented_new` — Keep alive until all frontend queries migrate to new tables. Then drop.
- `notas_fiscais` — Keep alive until `invoices` table is live and all NFe queries migrate. Then drop.

### Tables to Eventually Drop (NOT in this cycle — plan only)
- `marketplace_orders_presented_new`
- `notas_fiscais`
- `marketplace_order_items` (partially — evaluate if it can merge with new `order_items`)

---

## The Data Model to Build

Create these 6 tables via Supabase SQL migrations. Each migration file must be named `YYYYMMDD_HHMMSS_description.sql` and placed in `supabase/migrations/`.

### Table 1: `orders`

```sql
CREATE TABLE orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  marketplace           text NOT NULL CHECK (marketplace IN ('mercado_livre', 'shopee')),
  marketplace_order_id  text NOT NULL,
  pack_id               text,                        -- ML: multiple orders in one shipment
  status                text NOT NULL DEFAULT 'unknown',  -- marketplace canonical status
  internal_status       text,                        -- seller workflow: printed | picked | linked | dispatched
  payment_status        text,                        -- pending | released | held | disputed
  gross_amount          numeric(18,2),               -- total before any deductions
  marketplace_fee       numeric(18,2),               -- ML/Shopee commission
  shipping_cost         numeric(18,2),               -- shipping charged to seller
  shipping_subsidy      numeric(18,2) DEFAULT 0,     -- ML subsidy (reduces shipping cost)
  net_amount            numeric(18,2),               -- pre-calculated: gross - fee - shipping + subsidy
  buyer_name            text,
  buyer_document        text,                        -- CPF/CNPJ (needed for NFe emission)
  buyer_email           text,
  buyer_phone           text,
  buyer_state           text,                        -- two-letter UF, for geographic analytics
  created_at            timestamptz,                 -- when the order was placed on the marketplace
  shipped_at            timestamptz,
  delivered_at          timestamptz,
  canceled_at           timestamptz,
  last_synced_at        timestamptz DEFAULT now(),
  raw_snapshot          jsonb,                        -- lightweight snapshot of last API response (optional, for debugging)

  CONSTRAINT orders_marketplace_unique UNIQUE (organization_id, marketplace, marketplace_order_id)
);

-- Indexes
CREATE INDEX orders_org_id_idx ON orders (organization_id);
CREATE INDEX orders_marketplace_idx ON orders (marketplace);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX orders_org_created_idx ON orders (organization_id, created_at DESC);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON orders
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
```

**Critical design decisions:**
- `UNIQUE (organization_id, marketplace, marketplace_order_id)` — this constraint is the idempotency guarantee. Running sync twice produces the same result. No application-level deduplication needed.
- `net_amount` is pre-calculated at sync time, not at query time — Diagnóstico reads this column directly with no runtime aggregation.
- `marketplace` is a plain text column with CHECK constraint — do NOT use an enum type. Enums in PostgreSQL require migrations to add values; text + CHECK is easier to extend.
- `internal_status` is separate from `status` — the marketplace status is what ML/Shopee says; internal status is what the seller's workflow says. These must never be conflated.
- `buyer_state` stores only the UF (e.g., 'SP', 'RJ') — normalize before storing. Geographic analytics need clean UF codes.
- `raw_snapshot` is optional and can be null — do NOT require it. It's for debugging only.

---

### Table 2: `order_items`

```sql
CREATE TABLE order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id            uuid REFERENCES products(id) ON DELETE SET NULL,  -- nullable: linked later
  marketplace_item_id   text,                        -- ML item_id or Shopee item_id
  sku                   text,
  title                 text NOT NULL,
  quantity              integer NOT NULL DEFAULT 1,
  unit_price            numeric(18,2) NOT NULL,
  unit_cost             numeric(18,2),               -- filled when product is linked to internal catalog
  variation_name        text,                        -- e.g., "Cor: Azul / Tamanho: M"
  image_url             text
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);
CREATE INDEX order_items_sku_idx ON order_items (sku);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_items
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
```

**Critical design decisions:**
- `product_id` is nullable — orders import first, product linking happens later in the seller workflow. Never block order import because products aren't linked.
- `unit_cost` is nullable — populated only when the seller inputs product cost (Cycle 1). Show "margem parcial" when null.
- One row per SKU per order. If an order has 3 different SKUs, create 3 rows. If one SKU has quantity 2, create 1 row with quantity=2.
- `title` must not be null — always store what the marketplace returned, even if the seller's internal product is different.

---

### Table 3: `order_shipping`

```sql
CREATE TABLE order_shipping (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id           text,                        -- marketplace shipment identifier
  logistic_type         text,                        -- FULFILLMENT | SELF_SERVICE | ME2 (ML-specific)
  tracking_number       text,
  carrier               text,
  status                text,
  substatus             text,
  street_name           text,
  street_number         text,
  complement            text,
  neighborhood          text,
  city                  text,
  state_uf              text,
  zip_code              text,
  country               text DEFAULT 'BR',
  sla_expected_date     timestamptz,
  sla_status            text,
  estimated_delivery    timestamptz,
  updated_at            timestamptz DEFAULT now(),

  CONSTRAINT order_shipping_order_unique UNIQUE (order_id)
);

CREATE INDEX order_shipping_order_id_idx ON order_shipping (order_id);
CREATE INDEX order_shipping_tracking_idx ON order_shipping (tracking_number);

ALTER TABLE order_shipping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_shipping
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
```

**Critical design decisions:**
- `UNIQUE (order_id)` — one shipping record per order. Use UPSERT on conflict.
- `logistic_type` is ML-specific terminology. For Shopee, map to the nearest equivalent or store 'SHOPEE_STANDARD', 'SHOPEE_PICKUP', etc. Never hardcode ML values in shared code.
- The delivery address (street_name, etc.) is the buyer's delivery address — NOT the seller's address. This is needed for NFe emission (NF-e requires buyer delivery address).
- `updated_at` — update this every time shipping status changes.

---

### Table 4: `order_status_history`

```sql
CREATE TABLE order_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status text,                                  -- null for first status entry
  to_status   text NOT NULL,
  changed_at  timestamptz NOT NULL DEFAULT now(),
  source      text NOT NULL CHECK (source IN ('webhook', 'sync', 'user', 'system'))
);

CREATE INDEX order_status_history_order_id_idx ON order_status_history (order_id);
CREATE INDEX order_status_history_changed_at_idx ON order_status_history (changed_at DESC);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_status_history
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
```

**Critical design decisions:**
- **Append-only. Never update a row in this table.** If you find yourself writing UPDATE on this table, you're doing it wrong.
- `from_status` is null for the first entry — this is valid. Every subsequent entry should copy the previous `to_status` as its `from_status`.
- Idempotency challenge: if a webhook fires twice with the same status, you will write two rows with the same `from_status → to_status`. This is acceptable — it's an audit log, not a state machine. Duplicate transitions don't cause harm.
- `source` indicates what triggered the change: 'webhook' (real-time ML/Shopee push), 'sync' (periodic batch sync), 'user' (seller action in Novura), 'system' (internal job).

---

### Table 5: `order_labels`

```sql
CREATE TABLE order_labels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label_type      text NOT NULL CHECK (label_type IN ('pdf', 'zpl2')),
  content_base64  text NOT NULL,
  content_type    text NOT NULL,   -- e.g., 'application/pdf' | 'application/zpl'
  size_bytes      integer,
  fetched_at      timestamptz DEFAULT now(),

  CONSTRAINT order_labels_order_type_unique UNIQUE (order_id, label_type)
);

CREATE INDEX order_labels_order_id_idx ON order_labels (order_id);

ALTER TABLE order_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON order_labels
  USING (
    order_id IN (
      SELECT id FROM orders WHERE organization_id = (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );
```

**Critical design decisions:**
- Labels are separated from orders so that order list queries NEVER load binary content. A query on `orders` or `order_items` should never touch `order_labels`.
- Fetch labels lazily — only when the seller explicitly requests printing. Do NOT fetch labels during order sync.
- `UNIQUE (order_id, label_type)` — one PDF and one ZPL2 per order. UPSERT on conflict.

---

### Table 6: `invoices` (replaces `notas_fiscais`)

```sql
CREATE TABLE invoices (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id                        uuid REFERENCES orders(id) ON DELETE SET NULL,
  company_id                      uuid NOT NULL REFERENCES companies(id),
  idempotency_key                 text NOT NULL,     -- format: '{organization_id}:{order_id}:{emission_environment}'
  focus_id                        text,              -- Focus NFe internal ID
  nfe_number                      integer,
  nfe_key                         text,              -- 44-digit NF-e key
  serie                           text,
  status                          text NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'queued', 'processing', 'authorized', 'rejected', 'canceled', 'error')),
  emission_environment            text NOT NULL DEFAULT 'homologacao'
                                    CHECK (emission_environment IN ('producao', 'homologacao')),
  xml_url                         text,
  pdf_url                         text,
  marketplace                     text,
  marketplace_order_id            text,
  marketplace_submission_status   text,
  marketplace_submission_at       timestamptz,
  total_value                     numeric(18,2),
  payload_sent                    jsonb,             -- full payload sent to Focus NFe (audit trail)
  error_message                   text,
  error_code                      text,
  retry_count                     integer NOT NULL DEFAULT 0,
  emitted_at                      timestamptz,
  authorized_at                   timestamptz,
  canceled_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX invoices_org_id_idx ON invoices (organization_id);
CREATE INDEX invoices_order_id_idx ON invoices (order_id);
CREATE INDEX invoices_status_idx ON invoices (status);
CREATE INDEX invoices_idempotency_idx ON invoices (idempotency_key);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON invoices
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
```

**Critical design decisions:**
- `UNIQUE (idempotency_key)` — this makes double-emission physically impossible at the database level. No application logic needed.
- `idempotency_key` format: `'{organization_id}:{order_id}:{emission_environment}'`. This means the same order can have a homologacao invoice AND a producao invoice (different keys), but can never have two producao invoices.
- **Hard rule for the `emit-invoice` edge function:** Always create the `invoices` row with `status = 'queued'` BEFORE calling the Focus API. If the DB insert fails due to idempotency_key conflict, return the existing invoice. Never call Focus API without a DB record existing first.
- `retry_count` — increment this on each retry. Set a max retry limit (e.g., 5) in the edge function. After 5 retries, set `status = 'error'` and stop retrying.
- `payload_sent` — always store the full Focus API payload for audit. If a seller disputes an invoice, you need to know exactly what was sent.
- Preserve the advisory lock pattern from `20251231_create_fn_reservar_e_numerar_notas.sql` for NFe number sequencing — this is a good pattern and must not be replaced.

---

## Migration Strategy

### The Principle: Re-sync, Don't Transform

Do not write transformation SQL to migrate data from `marketplace_orders_presented_new` to the new tables. The 87-column mixed table has inconsistent data, partially-computed values, and JSONB blobs that would require complex parsing. Instead:

1. Create the new tables alongside existing ones (no data yet) — **Week 1-2**
2. Rewrite sync edge functions to write to the new schema — **Week 2-3**
3. Re-sync the last 90 days from ML and Shopee APIs into the new tables — **Week 3-4**
4. Migrate the frontend progressively: each query that used `marketplace_orders_presented_new` gets rewritten to use new tables — **Week 4-5**
5. Keep `marketplace_orders_presented_new` and `notas_fiscais` alive (read-only) until all queries migrate — **Week 5-6**
6. Drop old tables once no queries reference them — **Week 6**

### Migration File Naming
Follow the existing pattern: `supabase/migrations/YYYYMMDD_HHMMSS_description.sql`

Create separate migration files, one per concern:
- `20260301_000000_create_orders_table.sql`
- `20260301_000001_create_order_items_table.sql`
- `20260301_000002_create_order_shipping_table.sql`
- `20260301_000003_create_order_status_history_table.sql`
- `20260301_000004_create_order_labels_table.sql`
- `20260301_000005_create_invoices_table.sql`

Do NOT put all tables in one migration file — it makes rollbacks impossible and diffs unreadable.

---

## Edge Functions to Build

### Architecture Rule: Marketplace-Agnostic

Every sync and upsert function treats `marketplace` as a parameter, not a hardcoded value. The same `orders-upsert` edge function handles an ML order and a Shopee order — the `marketplace` column value is the only difference.

---

### Function 1: `orders-normalize-ml`
**Location:** `supabase/functions/orders-normalize-ml/index.ts`
**Responsibility:** Given a raw ML order API response object, return a normalized payload in the canonical format.

```typescript
// Input: raw ML API order object
// Output: NormalizedOrder (canonical format, see type below)

interface NormalizedOrder {
  marketplace: 'mercado_livre'
  marketplace_order_id: string
  pack_id: string | null
  status: string
  payment_status: string | null
  gross_amount: number
  marketplace_fee: number
  shipping_cost: number
  shipping_subsidy: number
  net_amount: number
  buyer_name: string | null
  buyer_document: string | null
  buyer_email: string | null
  buyer_phone: string | null
  buyer_state: string | null
  created_at: string    // ISO8601
  shipped_at: string | null
  delivered_at: string | null
  canceled_at: string | null
  items: NormalizedOrderItem[]
  shipping: NormalizedOrderShipping | null
}

interface NormalizedOrderItem {
  marketplace_item_id: string
  sku: string | null
  title: string
  quantity: number
  unit_price: number
  variation_name: string | null
  image_url: string | null
}

interface NormalizedOrderShipping {
  shipment_id: string | null
  logistic_type: string | null
  tracking_number: string | null
  carrier: string | null
  status: string | null
  substatus: string | null
  street_name: string | null
  street_number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state_uf: string | null
  zip_code: string | null
  sla_expected_date: string | null
  sla_status: string | null
  estimated_delivery: string | null
}
```

**ML-specific mapping notes:**
- `gross_amount` = `order_items[*].unit_price * quantity` sum (NOT `total_amount` — ML's `total_amount` can include buyer-paid shipping which inflates the number)
- `marketplace_fee` = from `payments[*].fee_details` where `type = 'ml_fee'` (seller commission)
- `shipping_cost` = from `shipping.base_cost` (what the seller pays for shipping)
- `shipping_subsidy` = from `shipping.cost` vs `shipping.base_cost` delta (ML sometimes subsidizes shipping)
- `net_amount` = `gross_amount - marketplace_fee - shipping_cost + shipping_subsidy` — compute this, do NOT use ML's `net_amount` field which may include things we don't expect
- `buyer_document` = `buyer.billing_info.doc_number` (may be null for buyers who haven't filled it)
- `buyer_state` = `shipping.receiver_address.state.id` → extract 2-letter UF (e.g., 'BR-SP' → 'SP')
- `status` mapping: ML uses 'payment_required' | 'payment_in_process' | 'paid' | 'partially_refunded' | 'pending_cancel' | 'cancelled' | 'invalid' — store as-is, do NOT remap to internal statuses
- Items: ML order may have `order_items` array. Each element has `item.id`, `item.title`, `item.variation_id`, `quantity`, `unit_price`, `sale_fee`

**Edge cases:**
- Some ML orders have empty `order_items` array — return 0 items, do not throw
- `buyer_document` may be masked or null for privacy reasons — store null, do not error
- ML `payments` array can have multiple payments (installments) — sum fee_details across all payments
- Packs: if `pack_id` is present, multiple order_ids share one shipment. Each order is still its own row in `orders` — the `pack_id` is a grouping key only.

---

### Function 2: `orders-normalize-shopee`
**Location:** `supabase/functions/orders-normalize-shopee/index.ts`
**Responsibility:** Given a raw Shopee order API response, return the same `NormalizedOrder` format.

**Shopee-specific mapping notes:**
- `marketplace` = 'shopee'
- `marketplace_order_id` = `order_sn`
- `pack_id` = null (Shopee doesn't have packs)
- `gross_amount` = `total_amount` (Shopee's total_amount is reliable)
- `marketplace_fee` = `commission_fee`
- `shipping_cost` = `shipping_fee` (seller's portion)
- `shipping_subsidy` = `buyer_transaction_fee` difference (if applicable, may be 0)
- `net_amount` = compute same formula as ML
- `buyer_state` = `recipient_address.state` — normalize to 2-letter UF if needed
- `status` = `order_status`: 'UNPAID' | 'READY_TO_SHIP' | 'PROCESSED' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED' | 'INVOICE_PENDING' — store as-is
- Items: `item_list` array with `item_id`, `item_name`, `model_name`, `item_sku`, `model_quantity_purchased`, `model_original_price`

**Edge cases:**
- Shopee may return `null` for `commission_fee` on some order types — treat as 0
- `recipient_address.state` returns full state name (e.g., "São Paulo") — map to UF code
- Shopee item images are not in the order response — leave `image_url` null (fetch separately if needed)

---

### Function 3: `orders-upsert`
**Location:** `supabase/functions/orders-upsert/index.ts`
**Responsibility:** Receive a `NormalizedOrder`, write to `orders` + `order_items` + `order_shipping` using UPSERT. **This is the only function that writes to these tables.** All sync functions call this function.

```typescript
// Input
interface UpsertOrderInput {
  organization_id: string
  order: NormalizedOrder
}

// Output
interface UpsertOrderResult {
  success: boolean
  order_id: string
  created: boolean   // true = new record, false = updated existing
  error?: string
}
```

**Implementation requirements:**
```typescript
// 1. UPSERT orders
const orderResult = await supabase
  .from('orders')
  .upsert({
    organization_id,
    marketplace: order.marketplace,
    marketplace_order_id: order.marketplace_order_id,
    // ... all fields
  }, { onConflict: 'organization_id,marketplace,marketplace_order_id' })
  .select('id, status')
  .single()

// 2. If status changed, write to order_status_history (append only)
if (previousStatus !== order.status) {
  await supabase.from('order_status_history').insert({
    order_id: orderResult.id,
    from_status: previousStatus,
    to_status: order.status,
    source: 'sync',  // or 'webhook' depending on caller
  })
}

// 3. UPSERT order_items — delete existing + insert new
// Delete then insert is safer than UPSERT on items because
// the item set could have changed (partial refund removes an item)
await supabase.from('order_items').delete().eq('order_id', orderResult.id)
await supabase.from('order_items').insert(order.items.map(item => ({
  order_id: orderResult.id,
  ...item
})))

// 4. UPSERT order_shipping (if shipping data present)
if (order.shipping) {
  await supabase
    .from('order_shipping')
    .upsert({ order_id: orderResult.id, ...order.shipping }, { onConflict: 'order_id' })
}
```

**Critical edge cases:**
- If step 1 (orders upsert) fails, return error immediately. Do NOT proceed to items.
- If step 3 (items delete+insert) fails, log the error but do NOT rollback the order upsert. The order existing with wrong items is better than the order not existing.
- Wrap the entire function in try/catch. Return `{ success: false, error: 'message', order_id: null }` on any unhandled error.
- The `source` parameter ('webhook' vs 'sync') must be passed by the caller, not hardcoded.

---

### Function 4: `orders-sync-ml`
**Location:** `supabase/functions/orders-sync-ml/index.ts`
**Responsibility:** Orchestrate a date-range sync for one ML integration. Calls `orders-normalize-ml` + `orders-upsert` for each order.

```typescript
// Input (via HTTP body)
interface SyncMLInput {
  organization_id: string
  integration_id: string    // FK to marketplace_integrations
  date_from?: string        // ISO8601, defaults to 90 days ago
  date_to?: string          // ISO8601, defaults to now
}

// Output
interface SyncMLResult {
  success: boolean
  synced: number
  failed: number
  errors: Array<{ order_id: string, error: string }>
  duration_ms: number
}
```

**ML Orders Search API (sync must use this):**

- **Endpoint:** `GET https://api.mercadolibre.com/orders/search`
- **Required:** Search does nothing without filters. Always pass `seller` (seller ID from integration) and at least one filter.
- **Date filters (for date-range sync):**
  - `order.date_last_updated.from`, `order.date_last_updated.to` (ISO8601) — recommended for incremental sync.
  - Or `order.date_created.from`, `order.date_created.to` for creation window.
  - Note: API uses date up to the hour; minutes/seconds/milliseconds are discarded.
- **Sort:** `sort=date_desc` (sellers are ordered by `date_closed`; default is `date_asc`).
- **Pagination:** `offset`, `limit` (e.g. 50 per page). Response has `paging: { total, offset, limit }`; loop until `offset >= paging.total` or `results` is empty.
- **Response:** `results` is an array of order **summaries** (each has `id`, `date_created`, `last_updated`, `status`, `order_items`, etc.). For full details (buyer, shipping, etc.) the sync must call `GET https://api.mercadolibre.com/orders/:id` for each `id` before normalizing.
- **Retention:** Orders are kept for up to 12 months. As seller, cancelled orders are filtered out by the API.

**Implementation requirements:**
- Use `/orders/search?seller={seller_id}&order.date_last_updated.from={date_from}&order.date_last_updated.to={date_to}&sort=date_desc&offset=0&limit=50` (or `order.date_created.from`/`to`). Paginate with `offset` and `limit`; add 100ms delay between pages.
- For each `id` in `results`, fetch full order via `GET /orders/:id`, then call `orders-normalize-ml` and `orders-upsert`. Do NOT batch them into one DB call — process order by order with error isolation.
- On ML API failure: log the error, continue with remaining pages. Report in `errors` array.
- Respect ML token expiry — call `mercado-livre-refresh` before starting if token is within 30 minutes of expiry.

**Edge cases:**
- ML may return 400 if `date_from` is older than their API allows. Handle with a fallback.
- Some orders return 403 from ML API (cancelled, confidential). Skip these, log, continue.
- Large sellers (1000+ orders): the function may hit Deno's 60-second edge function timeout. Implement chunked sync: process 200 orders at a time, return partial results, let caller invoke again.

---

### Function 5: `orders-sync-shopee`
**Location:** `supabase/functions/orders-sync-shopee/index.ts`
**Same pattern as `orders-sync-ml`** but for Shopee API. Uses `orders-normalize-shopee` + `orders-upsert`.

**Shopee-specific notes:**
- Shopee uses a different auth pattern (HMAC signature, not Bearer token). Keep existing auth logic from `shopee-sync-orders`.
- Shopee pagination uses `cursor` not `offset`. Handle accordingly.
- Shopee requires `shop_id` in every request. Extract from integration record.

---

### Function 6: `orders-webhook`
**Location:** `supabase/functions/orders-webhook/index.ts`
**Responsibility:** Unified webhook handler for both ML and Shopee order updates.

#### How ML notifications work (Mercado Livre)

Each topic/entity can have notifications tied to specific events and actions. Notifications are sent when those activities occur on Mercado Livre, so the integrator can react to relevant changes. The integrator can subscribe to specific events within a topic via the filters offered by the API.

**Orders topic (recommended):**
- **`orders_v2`** — You receive notifications on creation and updates of your confirmed sales.

**Notification payload (example):** The webhook body does **not** contain the full order; it only identifies the resource. Example:

```json
{
  "resource": "/orders/2195160686",
  "user_id": 468424240,
  "topic": "orders_v2",
  "application_id": 5503910054141466,
  "attempts": 1,
  "sent": "2019-10-30T16:19:20.129Z",
  "received": "2019-10-30T16:19:20.106Z"
}
```

**Required follow-up:** With `resource` you must perform a **GET** to fetch the full order:

```bash
curl -X GET -H 'Authorization: Bearer $ACCESS_TOKEN' https://api.mercadolibre.com/orders/$ORDER_ID
```

The handler must parse `resource` (e.g. `/orders/2195160686` → order ID `2195160686`), call the ML Orders API with the seller's token, then normalize and upsert.

---

```typescript
// ML webhook detection
const isML = req.headers.get('x-source') === 'mercado_livre'
             || body.topic === 'orders_v2'

// Shopee webhook detection
const isShopee = body.shop_id !== undefined && body.code !== undefined
```

**Implementation requirements:**
1. Validate webhook signature first — invalid signatures return `401` immediately, nothing processed
2. Detect marketplace from headers/payload
3. Fetch the full order from the marketplace API (webhook only contains the order ID, not the full payload)
4. Call `orders-normalize-{marketplace}` then `orders-upsert` with `source: 'webhook'`
5. Return `200` immediately after DB write — no chained operations, no side effects

**Critical:** Do NOT call any other edge functions from within the webhook handler (no NFe, no inventory, no notifications). The webhook must complete in under 2 seconds or ML will retry it. Side effects belong in separate triggers or async jobs.

---

### Function 7: `emit-invoice`
**Location:** `supabase/functions/emit-invoice/index.ts`
**Responsibility:** Emit NFe via Focus API, with idempotency guaranteed at the DB level. Replaces ad-hoc NFe emission code scattered in the old system.

**Implementation requirements:**

```typescript
// Step 1: Check if already authorized
const existing = await supabase
  .from('invoices')
  .select('*')
  .eq('idempotency_key', idempotencyKey)
  .single()

if (existing?.status === 'authorized') {
  return { success: true, invoice: existing, alreadyExisted: true }
}

// Step 2: Create/update invoices row BEFORE calling Focus
const invoice = await supabase
  .from('invoices')
  .upsert({
    idempotency_key: idempotencyKey,
    status: 'queued',
    organization_id,
    order_id,
    company_id,
    payload_sent: payload,
    // ...
  }, { onConflict: 'idempotency_key' })
  .select()
  .single()

// Step 3: Call Focus API
try {
  const focusResult = await callFocusNfeEmit(payload)
  await supabase.from('invoices').update({
    status: 'processing',
    focus_id: focusResult.ref,
  }).eq('id', invoice.id)
} catch (err) {
  await supabase.from('invoices').update({
    status: 'error',
    error_message: err.message,
    retry_count: invoice.retry_count + 1,
  }).eq('id', invoice.id)

  if (invoice.retry_count >= 5) {
    throw new Error('Max retries exceeded')
  }
  // Return error, let caller retry
}
```

**Hard rules:**
- NEVER call the Focus API without an `invoices` record existing first
- NEVER emit if `status = 'authorized'` already exists for this `idempotency_key`
- The `idempotency_key` format must be: `${organization_id}:${order_id}:${emission_environment}`
- `retry_count` max = 5. After 5 failures, set `status = 'error'` and stop.

---

## Code Best Practices for This Codebase

### TypeScript
- The project uses lenient TypeScript settings (`noImplicitAny: false`, `strictNullChecks: false`). Do NOT enable strict mode in this cycle — Cycle 0 is backend only. However, all new edge functions should have explicit return types on exported functions.
- Use `unknown` for external API responses, then narrow with explicit type guards before accessing properties.

### Supabase Client in Edge Functions
- Use the Supabase Admin client (with service role key) for edge functions — NOT the anon key. This bypasses RLS, which is correct for server-side operations.
- Pattern from `_shared/`:
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
```

### Error Handling
- Every `try/catch` must log the error with context: `console.error('orders-upsert: failed to upsert order', { order_id, error: err.message })`
- Return structured errors: `{ success: false, error: 'short_code', message: 'human readable', context: { order_id } }`
- Never return stack traces to the caller — log them server-side, return only the message

### UPSERT Pattern
```typescript
// Always specify onConflict explicitly
const { data, error } = await supabase
  .from('orders')
  .upsert(payload, {
    onConflict: 'organization_id,marketplace,marketplace_order_id',
    ignoreDuplicates: false  // we want to update, not ignore
  })
  .select()
  .single()
```

### Environment Variables
Edge functions use these env vars (already configured in Supabase):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ML_CLIENT_ID`, `ML_CLIENT_SECRET` (Mercado Livre)
- `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` (Shopee)
- `FOCUS_NFE_TOKEN` (Focus NFe)

Do NOT hardcode any credentials. Use `Deno.env.get()` with a non-null assertion and handle undefined at startup.

### Deployment
Deploy each function individually:
```bash
supabase functions deploy orders-normalize-ml
supabase functions deploy orders-normalize-shopee
supabase functions deploy orders-upsert
supabase functions deploy orders-sync-ml
supabase functions deploy orders-sync-shopee
supabase functions deploy orders-webhook
supabase functions deploy emit-invoice
```

---

## Trigger Migration (Part of Cycle 0 Scope)

Cycle 0 includes dropping the DB triggers that are being replaced by the new edge functions. Full trigger documentation and migration plan: `docs/DATABASE_TRIGGERS.md` and `docs/TRIGGER_MIGRATION_PLAN.md`.

### Triggers to DROP in this cycle (high priority)

These triggers fire on `marketplace_orders_raw` and `marketplace_orders_presented_new` — tables that Cycle 0 is replacing. They must be dropped as part of the migration, not left running against the old tables while the new pipeline is active.

| Trigger | Table | Why drop |
|---|---|---|
| `on_marketplace_orders_raw_change_new` | `marketplace_orders_raw` | Replaced by `orders-normalize-shopee` + `orders-upsert` edge functions |
| `trg_presented_new_items_refresh_insert` | `marketplace_orders_presented_new` | Deleted with the presented_new table |
| `trg_presented_new_linked_products_refresh` | `marketplace_orders_presented_new` | Deleted with the presented_new table |
| `trg_marketplace_orders_presented_new_stock_flow` | `marketplace_orders_presented_new` | Replaced by `update-order-status` edge function |
| `trg_marketplace_orders_presented_new_inventory_on_cancel` | `marketplace_orders_presented_new` | Replaced by inventory job queue |
| `trg_mipl_refresh_presented` | `marketplace_item_product_links` | Dead code — no-op function body. Drop immediately. |

**Drop only after** the new edge functions (`orders-upsert`, `orders-sync-ml`, `orders-sync-shopee`) are deployed and verified. Never drop while the old pipeline is still in use.

```sql
-- Run only after new pipeline is live and verified:
DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change_new ON public.marketplace_orders_raw;
DROP TRIGGER IF EXISTS trg_presented_new_items_refresh_insert ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_presented_new_linked_products_refresh ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_stock_flow ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_mipl_refresh_presented ON public.marketplace_item_product_links;

DROP FUNCTION IF EXISTS public.process_marketplace_order_presented_new();
DROP FUNCTION IF EXISTS public.refresh_presented_order(uuid);
DROP FUNCTION IF EXISTS public.trg_presented_new_items_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_linked_products_refresh();
DROP FUNCTION IF EXISTS public.trg_presented_new_stock_flow();
DROP FUNCTION IF EXISTS public.trg_presented_new_inventory_on_cancel();
```

### Missing UNIQUE constraint — fix in this cycle

The `marketplace_integrations` table is missing a `UNIQUE (organizations_id, marketplace_name)` constraint. The `mercado-livre-callback` edge function uses `onConflict: 'organizations_id,marketplace_name'` — without this constraint, the UPSERT fails at runtime and reconnecting a marketplace creates duplicate rows.

Add this migration as part of Cycle 0:

```sql
-- supabase/migrations/20260301_000006_fix_marketplace_integrations_unique.sql
ALTER TABLE public.marketplace_integrations
  ADD CONSTRAINT uq_marketplace_integrations_org_marketplace
  UNIQUE (organizations_id, marketplace_name);
```

### Webhook activation rule

The ML/Shopee webhook must be registered **immediately** when the seller completes OAuth — regardless of subscription status. Free users receive webhooks and see orders in real-time (read-only). Paid features (NFe emission, label printing) are gated at the action level, not at the data ingestion level.

**Do NOT** delay webhook registration until after subscription. A free user who sees orders arriving in real-time is far more likely to convert than one who sees stale data.

---

## What NOT to Build in This Cycle

### Rabbit Holes
- **Shopee UI** — The data layer supports Shopee from day one, but NO Shopee-specific frontend features are built in Cycle 0. Cycle 0 = backend only.
- **Advanced fee types** — Commission, shipping cost, and shipping subsidy are enough for Cycle 0. Do not try to extract ADS fees, insurance fees, or installment fees — they come from different API endpoints and are out of scope.
- **Event-driven architecture** — No events table, no message queue, no pub/sub. Simple function calls are enough. Revisit at Series A.
- **Historical data migration** — If migrating existing data requires manual SQL transformation of JSONB blobs, do a clean re-sync instead. Never spend more than 2 hours on a migration script.
- **Order lifecycle UI** — No new frontend pages. The orders list that exists continues to work from `marketplace_orders_presented_new` until the frontend migration in Week 4-5.
- **Webhooks from Vercel** — Do not refactor `api/mercado-livre-webhook.ts` or `api/shopee-webhook.ts` in this cycle. They're Vercel forwarders. Leave them as-is and point them to `orders-webhook` when ready.

### No-Gos
- New user-facing features of any kind
- Multi-warehouse inventory logic
- Performance optimizations beyond the basic indexes defined above
- Shopee-specific frontend features
- Changing the RLS policy pattern — follow exactly what existing tables use
- Modifying existing working functions (start-auth, callback, refresh, focus-nfe-emit) unless a bug is discovered

---

## Definition of Done

Cycle 0 is complete when ALL seven conditions are true:

1. **ML sync idempotency** — Running `orders-sync-ml` twice with the same date range produces the exact same row count in `orders`. No duplicates.

2. **Shopee sync idempotency** — Running `orders-sync-shopee` twice with the same date range produces the exact same row count in `orders`. No duplicates. Both ML and Shopee orders are in the same `orders` table distinguished by `marketplace` column.

3. **net_amount accuracy** — For a random sample of 20 orders, `net_amount` in the `orders` table matches what the seller actually received (tolerance: ±R$0,01). Verify by cross-referencing with Mercado Pago release statements.

4. **NFe double-emission impossible** — Calling `emit-invoice` twice for the same order_id + emission_environment returns the existing invoice on the second call without calling the Focus API again. Verify by checking that Focus API was called exactly once (check `invoices.retry_count` = 0 and `invoices.focus_id` present).

5. **Status history complete** — Every time an order status changes (from 'paid' to 'shipped', etc.), a new row appears in `order_status_history`. History is never deleted or updated.

6. **Items correctly split** — An ML order with 3 different SKUs creates exactly 3 rows in `order_items` for that `order_id`.

7. **Diagnóstico query reads pre-calculated data** — The Diagnóstico query (Cycle 1) can compute "total fees in 90 days" with a simple `SUM(marketplace_fee)` and `SUM(shipping_cost)` on the `orders` table. No runtime aggregation of JSONB or calculation.

---

## Dependencies for Next Cycles

Cycle 1 depends on Cycle 0 delivering:
- `orders` table populated with last 90 days of ML data
- `order_items` with all SKUs properly split
- `net_amount` pre-calculated and accurate
- `orders-sync-ml` callable from the onboarding flow (after ML OAuth)

---

## Frontend Premise (Read Before Any Frontend Work)

**Most of the UI already exists.** Cycle 0 is backend-only. When Cycle 1 begins wiring the frontend to new tables, the rule is:

> The task is to **rewire the data source**, not redesign the UI. Change `services/` and `hooks/` — not JSX, Tailwind classes, or component structure.

Existing screens for orders, order details (with margin breakdown), and listings are visually approved. Do not change their appearance unless a bug is found.

Full context: `docs/PRD_USER_FLOW_ONBOARDING.md` → "Premissa Fundamental" section.
