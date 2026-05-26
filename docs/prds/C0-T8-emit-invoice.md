# PRD — C0-T8: Edge Function `emit-invoice`

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🔴 Not Started
**Depends on:** [C0-T3 — `orders-upsert`](./C0-T3-orders-upsert-function.md) (the `invoices` table must exist)
**Blocks:** [C0-T9 — Frontend Migration](./C0-T9-frontend-migration.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Every time a seller ships a product sold on Mercado Livre, Brazilian law requires them
to issue an NFe (Nota Fiscal Eletrônica) — a digital tax invoice. If this step fails
halfway through (server crash, network error), it could trigger the process again and
generate two identical invoices for the same sale. That is illegal and creates serious
tax and financial headaches.

This function solves that problem permanently. Before calling the government's invoice
system, it creates a record in our database with a unique "ticket number" (the idempotency
key). If someone calls this function twice for the same order, the second call finds the
existing ticket and returns the existing invoice — without touching the government system
again.

Think of it like a post office ticket machine: you can press the button twice, but you
only get one ticket number per order. The government's invoice system is only called once.

This function replaces the ad-hoc NFe emission scattered across the old system and makes
double-emission **physically impossible at the database level**.

---

## 2. Current State & Progress

**No `emit-invoice` edge function exists yet.**

The existing NFe system uses `focus-nfe-emit`, `focus-webhook`, and `emit-queue-consume`,
which remain in production and must NOT be touched during Cycle 0. This is a new function
built on top of the new `invoices` table.

**Files that already exist and must be used:**
- `supabase/migrations/20260301_000005_create_invoices_table.sql` — `invoices` table ✅
- `supabase/functions/focus-nfe-emit/index.ts` — existing Focus API caller (call this, don't rewrite)
- `supabase/functions/_shared/domain/focus/focus-tributacao.ts` — tax classification utilities
- `supabase/functions/_shared/domain/focus/focus-status.ts` — NFe status mappings
- `supabase/functions/_shared/domain/focus/focus-url.ts` — Focus API URL builder

**What needs to be built:**
- `supabase/functions/emit-invoice/index.ts` — the new HTTP handler
- `supabase/functions/_shared/adapters/invoices/invoices-adapter.ts` — DB operations for `invoices`
- `supabase/functions/_shared/ports/invoices-port.ts` — the interface

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

### 🚨 STOP FIRST — Verify Prerequisites

```bash
# Confirm the invoices table migration exists
ls supabase/migrations/*invoices* 2>/dev/null || echo "MISSING invoices migration"

# Confirm focus-nfe-emit exists (you will call this, not rewrite it)
ls supabase/functions/focus-nfe-emit/index.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"

# Confirm the _shared invoices adapter doesn't already exist
ls supabase/functions/_shared/adapters/invoices/ 2>/dev/null && echo "EXISTS" || echo "MISSING"
```

If `_shared/adapters/invoices/` already exists: read the files before building anything.
You may only need to write the `emit-invoice/index.ts` handler.

---

- [ ] Confirm C0-T3 is complete (the `invoices` table must exist).
- [ ] Read `supabase/migrations/20260301_000005_create_invoices_table.sql` in full.
      Record: column names, the idempotency key format, the status CHECK constraint values.
- [ ] Read `supabase/functions/focus-nfe-emit/index.ts` in full.
      Record: what input does it expect? What does it return? Do not reinvent — call this function.
- [ ] Read `docs/CYCLE_0_ORDERS_PLATFORM.md` section "Function 7: emit-invoice" (~lines 741–800).
      This contains the exact algorithm. Follow it precisely.
- [ ] Read `supabase/functions/_shared/domain/focus/focus-tributacao.ts` and `focus-status.ts`.
      Record: what utilities are available for CFOP calculation and status mapping?
- [ ] Check if `_shared/ports/invoices-port.ts` exists. If it does, read it.
- [ ] Check if `_shared/adapters/invoices/` exists. If it does, read it.
- [ ] Update Section 2 with actual findings before writing anything.

---

## 4. Architecture Context

```
Frontend / Other edge function
  │  POST /functions/v1/emit-invoice
  ▼
emit-invoice/index.ts          ← BUILD THIS (HTTP handler, < 50 lines)
  │
  ├── InvoicesAdapter.findByIdempotencyKey()   ← check if already emitted
  ├── InvoicesAdapter.createQueued()           ← create invoices row BEFORE calling Focus
  ├── focus-nfe-emit (existing function call)  ← call the existing Focus caller
  └── InvoicesAdapter.updateStatus()          ← save Focus response

_shared/
├── ports/invoices-port.ts       ← BUILD THIS (interface)
└── adapters/invoices/
    └── invoices-adapter.ts      ← BUILD THIS (DB operations)
```

### The Idempotency Key

```typescript
// Format: "{organization_id}:{order_id}:{emission_environment}"
// Example: "550e8400-e29b-41d4-a716-446655440000:7c9e6679-7425-40de-944b-e07fc1f90ae7:producao"

function buildIdempotencyKey(
  organizationId: string,
  orderId: string,
  emissionEnvironment: 'producao' | 'homologacao'
): string {
  return `${organizationId}:${orderId}:${emissionEnvironment}`
}
```

**Why this format:** The same order can have a `homologacao` (test) invoice AND a `producao`
(real) invoice — they have different keys. But you can NEVER have two `producao` invoices
for the same order. The UNIQUE constraint on `invoices.idempotency_key` enforces this at
the database level.

### Algorithm (from CYCLE_0 doc)

```
Step 1: Build idempotency_key from {org_id}:{order_id}:{environment}

Step 2: Check if invoices row already exists with this key
  → If exists AND status = 'authorized': return it immediately. Do NOT call Focus.
  → If exists AND status = 'processing': return it. Do NOT call Focus (it's in-flight).
  → If exists AND status = 'error' AND retry_count >= 5: return error, stop.
  → If exists AND status = 'error' AND retry_count < 5: continue to Step 3 (retry).
  → If does NOT exist: continue to Step 3 (first attempt).

Step 3: UPSERT invoices row with status = 'queued'
  (onConflict: idempotency_key → update payload_sent, updated_at only)
  NEVER call Focus before this step succeeds.

Step 4: Call focus-nfe-emit via HTTP (internal Supabase function-to-function call)
  DO NOT import it — call it via fetch() to the internal function URL.
  The URL pattern: Deno.env.get('SUPABASE_URL') + '/functions/v1/focus-nfe-emit'
  Use service role key as Authorization: Bearer token.
  → On success (HTTP 200 with { ok: true, ref }):
      UPDATE invoices SET status = 'processing', focus_id = result.ref
  → On HTTP error or { ok: false }:
      UPDATE invoices SET status = 'error', error_message = ...,
      retry_count = retry_count + 1
  → On error AND retry_count was already 4 (now 5): SET status = 'error' (final)

Step 5: Return response
  → { success: true, invoice_id, status, focus_id }
  → or { success: false, error, invoice_id }
```

**Critical rule:** The `invoices` row must exist in the DB **before** Focus is called.
If the DB insert fails (e.g., DB is down), return an error immediately and never call Focus.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER call Focus NFe API before creating the `invoices` DB row** | If Focus succeeds but the DB write fails, we have an emitted NFe with no record in Novura. Impossible to audit. |
| **NEVER call Focus NFe if status is already 'authorized'** | This is the double-emission prevention. The UNIQUE constraint backs it up, but defense in depth is better. |
| **NEVER delete from `invoices`** | Invoices are a permanent legal audit trail. There is no valid reason to delete an invoice record. |
| **NEVER store the Focus API token in code** | Use `Deno.env.get('FOCUS_NFE_TOKEN')` only. |
| **NEVER set `retry_count` > 5** | After 5 failures, the invoice is permanently in 'error' status. The seller must manually review and retry after fixing the underlying problem. |
| **Max retries is 5** | Hardcode this. Never make it configurable — edge cases of configurable limits always end badly. |

---

## 6. What to Build

### Section A: The `InvoicesPort` Interface

**File:** `supabase/functions/_shared/ports/invoices-port.ts`

```typescript
import type { SupabaseClient } from '../adapters/infra/supabase-client.ts'

export interface InvoiceRow {
  id: string
  organization_id: string
  order_id: string | null
  company_id: string
  idempotency_key: string
  focus_id: string | null
  status: 'pending' | 'queued' | 'processing' | 'authorized' | 'rejected' | 'canceled' | 'error'
  emission_environment: 'producao' | 'homologacao'
  retry_count: number
  error_message: string | null
  payload_sent: FocusNfePayload | null  // typed — import FocusNfePayload from its definition file
}

export interface CreateInvoiceInput {
  organization_id: string
  order_id: string | null
  company_id: string
  idempotency_key: string
  emission_environment: 'producao' | 'homologacao'
  marketplace: string | null
  marketplace_order_id: string | null
  total_value: number | null
  payload_sent: FocusNfePayload   // typed — import from the Focus payload types file
}

export interface InvoicesPort {
  findByIdempotencyKey(admin: SupabaseClient, key: string): Promise<InvoiceRow | null>
  createQueued(admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow>
  markProcessing(admin: SupabaseClient, id: string, focusId: string): Promise<void>
  markError(admin: SupabaseClient, id: string, message: string, retryCount: number): Promise<void>
  markAuthorized(admin: SupabaseClient, id: string, nfeKey: string, nfeNumber: number): Promise<void>
}
```

**Constraints:** Port file contains only interfaces and types. No logic, no DB calls.

#### Definition of Done — Section A
- [ ] File exists at `_shared/ports/invoices-port.ts`
- [ ] All 5 methods declared with explicit TypeScript types
- [ ] No implementation code in the port file
- [ ] Zero `any` types

---

### Section B: The `InvoicesAdapter` Class

**File:** `supabase/functions/_shared/adapters/invoices/invoices-adapter.ts`

```typescript
export class InvoicesAdapter implements InvoicesPort {
  async findByIdempotencyKey(admin: SupabaseClient, key: string): Promise<InvoiceRow | null>
  async createQueued(admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow>
  async markProcessing(admin: SupabaseClient, id: string, focusId: string): Promise<void>
  async markError(admin: SupabaseClient, id: string, message: string, retryCount: number): Promise<void>
  async markAuthorized(admin: SupabaseClient, id: string, nfeKey: string, nfeNumber: number): Promise<void>
}
```

Implementation notes:
- `createQueued` uses UPSERT with `onConflict: 'idempotency_key'` to handle concurrent calls safely
- `markProcessing`, `markError`, `markAuthorized` use `UPDATE ... WHERE id = ...`
- Each method is under 30 lines
- Log all errors with `console.error('[invoices-adapter] operation failed', context)` before rethrowing

Also create **`_shared/adapters/invoices/index.ts`**:
```typescript
export { InvoicesAdapter } from './invoices-adapter.ts'
```

#### Definition of Done — Section B
- [ ] `_shared/adapters/invoices/invoices-adapter.ts` exists
- [ ] `_shared/adapters/invoices/index.ts` barrel export exists
- [ ] Class declares `implements InvoicesPort`
- [ ] All 5 methods implemented
- [ ] Each method under 30 lines
- [ ] `deno check` passes on the file
- [ ] Zero `any` types

---

### Section C: The `emit-invoice` Edge Function

**File:** `supabase/functions/emit-invoice/index.ts`

```typescript
// NFe payload shape expected by the Focus API (read focus-nfe-emit/index.ts to confirm all fields)
// Add or adjust fields after reading that function — do NOT guess the shape.
interface FocusNfePayload {
  natureza_operacao: string       // e.g. "Venda de mercadoria"
  data_emissao: string            // ISO8601 date
  tipo_documento: number          // 1 = NF-e
  finalidade_emissao: number      // 1 = Normal
  local_destino: number           // 1 = intrastate, 2 = interstate
  cfop: string                    // e.g. "5.102" or "6.102"
  emitente: FocusEmitente         // company data — define after reading focus-nfe-emit
  destinatario: FocusDestinatario // buyer data — define after reading focus-nfe-emit
  items: FocusNfeItem[]           // line items — define after reading focus-nfe-emit
  // ... additional fields documented in focus-nfe-emit/index.ts
}

// Input
interface EmitInvoiceInput {
  organization_id: string
  order_id: string
  company_id: string
  emission_environment: 'producao' | 'homologacao'
  payload: FocusNfePayload        // typed — read focus-nfe-emit/index.ts to complete the interface
  marketplace?: string
  marketplace_order_id?: string
  total_value?: number
}
// ⚠️ Complete FocusNfePayload, FocusEmitente, FocusDestinatario, FocusNfeItem interfaces
// by reading supabase/functions/focus-nfe-emit/index.ts before implementing. Do not use `any`.

// Output (HTTP 200 always — even on business error — to prevent retry loops)
interface EmitInvoiceResult {
  success: boolean
  invoice_id: string | null
  status: string         // current status of the invoice
  focus_id: string | null
  error?: string
}
```

The handler must:
1. Validate required fields (return HTTP 400 if missing)
2. Build the idempotency key
3. Delegate to `processEmission(admin, input, invoicesAdapter)` — a private function
4. Return the result as JSON

The `processEmission` function implements the 5-step algorithm from Section 4.
It must be under 50 lines. Extract `handleFocusSuccess()` and `handleFocusError()` as helpers.

#### Definition of Done — Section C
- [ ] `emit-invoice/index.ts` exists and compiles
- [ ] HTTP handler is under 50 lines
- [ ] `processEmission()` is under 50 lines
- [ ] 5-step algorithm implemented correctly
- [ ] `FOCUS_NFE_TOKEN` read from env — never hardcoded
- [ ] Function returns HTTP 200 even on business errors (NFe emission failure is business-level, not HTTP-level)
- [ ] Test file exists at `emit-invoice/index.test.ts` with these cases:
  - [ ] First emission → creates `invoices` row, calls Focus, returns `status: 'processing'`
  - [ ] Second emission (same order, same env) → returns existing invoice without calling Focus
  - [ ] Emission when already 'authorized' → returns immediately, Focus NOT called
  - [ ] Focus API fails → returns error, `retry_count` incremented
  - [ ] Focus API fails 5 times → returns error, status stays 'error'
  - [ ] Missing required fields → HTTP 400
- [ ] All tests pass

---

## 7. Integration Checklist

- [ ] Import `InvoicesAdapter` from `_shared/adapters/invoices/index.ts` in `emit-invoice/index.ts`
- [ ] Confirm `focus-nfe-emit` function exists and its input/output shapes are documented
- [ ] Confirm `invoices` table exists and the UNIQUE constraint on `idempotency_key` is in place
      (prerequisite from C0-T1)
- [ ] `deno check supabase/functions/emit-invoice/index.ts` passes with zero errors

---

## 8. Definition of Done — Full Task

- [ ] All Section A, B, C DoD items checked
- [ ] All Integration Checklist items checked
- [ ] No function body exceeds 50 lines
- [ ] No file exceeds 150 lines
- [ ] Zero `any` types in all new files
- [ ] Function deployed: `supabase functions deploy emit-invoice`
- [ ] Manual smoke test:
  - [ ] Call `emit-invoice` for a test order → returns `{ success: true, status: 'processing' }`
  - [ ] Call again for same order → returns same invoice, Focus NOT called again (check `retry_count` = 0)
  - [ ] Query `SELECT * FROM invoices WHERE order_id = '<id>'` → exactly 1 row

---

## 9. What NOT to Build

- **Do NOT refactor `focus-nfe-emit`.** Call it as-is. If it needs changes, that's a separate task.
- **Do NOT auto-emit NFe when an order is synced.** NFe emission is a seller-triggered action.
- **Do NOT handle NFe cancellation here.** Cancellation is a separate flow (`focus-nfe-cancel`).
- **Do NOT handle status webhooks from Focus here.** Focus sends status updates to `focus-webhook` — that function already exists and handles them.
- **Do NOT build a UI for this.** Cycle 0 is backend only. The existing UI calls this function when the seller presses "Emitir NF-e".
