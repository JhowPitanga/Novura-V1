# PRD — C0-T2: `_shared` Layer — OrdersUpsertService

**Cycle:** 0 — Plataforma de Pedidos
**Status:** 🔴 Not Started ← *Agent: verify this before proceeding*
**Depends on:** [C0-T1 — Database Migrations](./C0-T1-database-migrations.md) (tables must exist)
**Blocks:** [C0-T3 — orders-upsert Edge Function](./C0-T3-orders-upsert-function.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Right now, every new order coming in from Mercado Livre or Shopee needs to be saved
into the new database structure we built in Cycle 0 (the `orders`, `order_items`,
`order_shipping` tables). The question is: who does that saving, and how do we make
sure it's done correctly every time — even if the internet cuts out and the same order
arrives twice?

This task builds the **central saving engine** that all sync functions will use.
Think of it like a warehouse receiving dock: no matter which truck (ML or Shopee) drops
off a package, it always goes through the same dock with the same checklist.
That dock is `OrdersUpsertService`.

**Why this matters for the product:**
- If we save the same order twice, sellers see duplicated orders. That destroys trust instantly.
- If an order fails mid-save (server crash, DB timeout), we could end up with an order that
  exists but has no items. This task makes sure that never happens.
- All future features (margin analysis, stock deduction, NFe emission) read from these tables.
  If the data saved here is wrong, every feature built on top shows wrong numbers.

**When this task is done, an order arriving from Mercado Livre or Shopee can be saved
to the database without duplicates, without partial saves, and with a full history of
every status change — no matter how many times the save function is called.**

---

## 2. Current State & Progress

> ⚠️ **Agent: This section may be out of date. You MUST update it after the code review.**

What we expect to find:
- `supabase/functions/_shared/ports/orders-upsert-port.ts` — **exists** (the contract is defined)
- `supabase/functions/_shared/adapters/orders-upsert/` — **may NOT exist** (the implementation is the gap)
- `supabase/functions/orders-upsert/orders-upsert-adapter.ts` — **may exist** (old implementation in the wrong place)

The gap: the `OrdersUpsertPort` interface was defined but the canonical `_shared` adapter
that implements it was never built. Logic may exist in the `orders-upsert` edge function
folder, but it belongs in `_shared` so that it can be reused and tested in isolation.

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

**Do not write a single line of code until you have done all of the following.**
Update the checkboxes as you complete each step.

### 3.1 — Read the Interface Contract

- [ ] Read `supabase/functions/_shared/ports/orders-upsert-port.ts` in full.
      Record: what method signatures are declared? What types does it expect?
- [ ] Read `supabase/functions/_shared/domain/orders/orders-types.ts` in full.
      Record: what does `NormalizedOrder`, `UpsertOrderInput`, `UpsertOrderResult` look like?
- [ ] Read `supabase/functions/_shared/adapters/infra/supabase-client.ts`.
      Record: how are admin Supabase clients created? Use the same pattern — do not invent a new one.

### 3.2 — Find What Already Exists

- [ ] Check if `supabase/functions/_shared/adapters/orders-upsert/` exists.
      If it does, read every file inside it. Note what is implemented and what is missing.
- [ ] Read `supabase/functions/orders-upsert/orders-upsert-adapter.ts` (if it exists).
      Note: this file may contain the implementation we need to MOVE to `_shared`, not rewrite.
- [ ] Read `supabase/functions/orders-upsert/index.ts`.
      Note: what does the edge function currently do? Does it call a shared adapter or inline the logic?
- [ ] Read `supabase/functions/orders-upsert/upsert-order.ts` (if it exists).
      Note: is this the core logic? Can it be promoted to `_shared`?

### 3.3 — Check the Database

- [ ] Verify the 6 migration files exist in `supabase/migrations/`:
      `20260301_000000_create_orders_table.sql` through `20260301_000005_create_invoices_table.sql`.
      If any are missing, STOP — C0-T1 must be completed first.

### 3.4 — Read Engineering Standards

- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1 (Size Limits), 2 (SOLID), 4 (OOP), 6 (Edge Function Rules).
- [ ] Read `docs/CYCLE_0_ORDERS_PLATFORM.md` section "Function 3: orders-upsert" (lines ~557–622).
      This contains the exact algorithm required — do not deviate from it.

### 3.5 — Update the Status

After completing the review, update section 2 above with what you actually found.
If the implementation already exists and is correct, mark this task 🟢 Done and stop.
Do not rewrite working code.

---

## 4. Architecture Context

> **For the AI agent implementing this task.**

### Where This Lives in the Hexagonal Architecture

```
_shared/
├── ports/
│   └── orders-upsert-port.ts        ← The interface (READ THIS FIRST)
│
├── adapters/
│   └── orders-upsert/               ← BUILD THIS (if it doesn't exist)
│       ├── orders-upsert-adapter.ts ← The class that implements the port
│       └── index.ts                 ← Barrel export
│
└── domain/
    └── orders/
        └── orders-types.ts          ← NormalizedOrder, UpsertOrderInput, UpsertOrderResult
```

### The Pattern to Follow

Every adapter in `_shared` follows the same structure:

1. **A class** that accepts its dependencies (the Supabase admin client) via the constructor.
2. **The class implements an interface (Port)**. The `implements` keyword must appear.
3. **One method per Port method**. No extra methods on the class.
4. **No business logic in the adapter** — only data transformation and DB calls.
5. **Each method is under 50 lines**. Extract helpers if needed.

Look at `supabase/functions/_shared/adapters/orders-raw/marketplace-orders-raw.ts`
as the reference implementation. It shows exactly how to structure an adapter class.

### The Algorithm for `upsert()`

The `upsert()` method must implement the following steps **in order**:

```
Step 1 → UPSERT into `orders` table
          conflict key: (organization_id, marketplace, marketplace_order_id)
          Returns the internal orders.id and the previous status.

Step 2 → If the status changed since last sync,
          INSERT one row into `order_status_history` (append-only, never update).
          from_status = previous status from DB
          to_status   = new status from NormalizedOrder
          source      = value passed in UpsertOrderInput (e.g. 'webhook' or 'sync')

Step 3 → DELETE existing order_items for this order_id,
          then INSERT new items from NormalizedOrder.items.
          (Delete+insert is safer than UPSERT here because item sets can shrink —
          a partial refund removes one item from the order.)

Step 4 → If NormalizedOrder.shipping is not null,
          UPSERT into order_shipping.
          conflict key: (order_id)

Return → UpsertOrderResult { success: true, order_id, created }
```

**Error handling rules:**
- If Step 1 fails → return `{ success: false, error: message }`. Do NOT proceed.
- If Step 2 fails → log the error, continue to Step 3. Status history is important but non-blocking.
- If Step 3 fails → log the error, return `{ success: false, error: message }`.
  An order with no items is an inconsistent state.
- If Step 4 fails → log the error, continue and return success.
  Shipping data is important but its absence doesn't make the order invalid.
- Wrap ALL steps in try/catch. Never let an unhandled exception propagate out of the method.

---

## 5. Safety Rules

> These rules apply to everyone — human or AI agent.

| Rule | Why |
|---|---|
| **NEVER run `DELETE FROM orders`** | This would delete production order data. There is no undo. |
| **NEVER run `DROP TABLE`** | Never in any edge function or migration. |
| **NEVER modify existing migration files** | Migrations are append-only. Add new files, never edit old ones. |
| **NEVER call the Focus NFe API in this service** | NFe is a separate concern handled by `invoices` edge functions. |
| **NEVER store plaintext marketplace tokens** | Tokens must always be encrypted via `_shared/adapters/infra/token-utils.ts`. |
| **NEVER use `any` TypeScript types** | Use the types from `_shared/domain/orders/orders-types.ts`. |
| **NEVER use INSERT on `orders` or `order_items`** | Always use UPSERT. INSERT on retry = duplicate row. |

The one exception to the "no delete" rule: Step 3 of the upsert algorithm deletes
`order_items` before reinserting them. This is intentional and safe because:
(a) it only deletes by `order_id` (one order's items), never the whole table,
(b) the rows are immediately re-inserted in the same operation.

---

## 6. What to Build

### Section A: The Adapter File

**What this is (plain language):** The concrete implementation of the saving engine.
This is the class that knows HOW to talk to the database. It translates a `NormalizedOrder`
(our internal format) into actual database rows.

**File to create:** `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts`

#### Specification

```typescript
// The class MUST:
// 1. Be named OrdersUpsertAdapter
// 2. Implement the OrdersUpsertPort interface
// 3. Accept the Supabase admin client in the constructor
// 4. Have a single public method: upsert(input: UpsertOrderInput): Promise<UpsertOrderResult>
// 5. Follow the 4-step algorithm described in section 4

export class OrdersUpsertAdapter implements OrdersUpsertPort {
  constructor(private readonly admin: SupabaseClient) {}

  async upsert(input: UpsertOrderInput): Promise<UpsertOrderResult> {
    // Delegates to private helper methods
    // Each helper is < 30 lines
    // See algorithm in section 4
  }
}
```

**Constraints:**
- The `upsert()` method itself must be under 50 lines. Extract private helpers.
- Suggested private helpers: `upsertOrderRow()`, `appendStatusHistory()`, `replaceOrderItems()`, `upsertShipping()`
- Each private helper must have a single job (one DB operation) and be under 30 lines.
- No magic strings — use typed constants for `source` values:
  ```typescript
  const ORDER_SOURCE = { WEBHOOK: 'webhook', SYNC: 'sync', USER: 'user', SYSTEM: 'system' } as const
  ```

#### Definition of Done — Section A

- [ ] File exists at `_shared/adapters/orders-upsert/orders-upsert-adapter.ts`
- [ ] Class is named `OrdersUpsertAdapter` and declares `implements OrdersUpsertPort`
- [ ] Constructor accepts Supabase admin client as a typed dependency (not imported globally)
- [ ] Public `upsert()` method is under 50 lines
- [ ] All private helpers are under 30 lines each
- [ ] Step 1 (orders UPSERT) uses `onConflict: 'organization_id,marketplace,marketplace_order_id'`
- [ ] Step 2 (status history) uses INSERT, never UPSERT or UPDATE
- [ ] Step 3 (items) uses DELETE + INSERT (not UPSERT)
- [ ] Step 4 (shipping) uses UPSERT with `onConflict: 'order_id'`
- [ ] Each step has isolated try/catch following the error-handling rules in section 4
- [ ] No `any` types anywhere in the file
- [ ] No magic strings — all string literals are extracted to typed constants

---

### Section B: The Test File

**What this is (plain language):** A set of automated checks that verify the saving engine
works correctly without needing a real database. If a future code change breaks the saving
logic, these tests will catch it immediately before it reaches production.

**File to create:** `supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.test.ts`

> **Note:** Tests for edge functions use Deno's built-in test runner (`Deno.test`), not Vitest.
> The existing test at `orders-upsert/upsert-order.test.ts` (if present) shows the pattern to follow.

#### Test Cases Required

**Happy path — new order:**
- Calling `upsert()` with a valid `UpsertOrderInput` where the order does not exist yet
  returns `{ success: true, created: true, order_id: <uuid> }`
- The mock DB receives the correct UPSERT call on the `orders` table
- The mock DB receives the correct INSERT call on `order_status_history` with `from_status: null`
- The mock DB receives the correct INSERT calls on `order_items`
- If shipping is present, the mock DB receives the correct UPSERT on `order_shipping`

**Happy path — existing order, status changed:**
- Calling `upsert()` for an order that already exists with a new status
  triggers an INSERT into `order_status_history` with the old and new status values
- `created` in the result is `false`

**Happy path — existing order, same status:**
- No new row is inserted into `order_status_history`

**Edge case — order with no items:**
- `NormalizedOrder.items = []`
- The DELETE on `order_items` runs (idempotent), no INSERT runs
- Result is `{ success: true }`

**Edge case — order with no shipping:**
- `NormalizedOrder.shipping = null`
- No call to `order_shipping` is made
- Result is `{ success: true }`

**Error case — orders UPSERT fails:**
- Mock DB throws on the `orders` table call
- Result is `{ success: false, error: 'message' }`
- No calls to `order_items` or `order_shipping` are made

**Error case — items DELETE fails:**
- Mock DB throws on the `order_items` DELETE
- Result is `{ success: false, error: 'message' }` (order row exists but items failed)

#### Definition of Done — Section B

- [ ] Test file exists at `_shared/adapters/orders-upsert/orders-upsert-adapter.test.ts`
- [ ] All 7 test cases listed above are present and passing
- [ ] Tests use a mock/fake Supabase client — no real DB calls
- [ ] All tests pass with `deno test` (or equivalent)

---

### Section C: The Barrel Export

**What this is:** A single entry point file that other code uses to import from this adapter.
This is a Deno/TypeScript convention that avoids brittle deep import paths.

**File to create:** `supabase/functions/_shared/adapters/orders-upsert/index.ts`

```typescript
// supabase/functions/_shared/adapters/orders-upsert/index.ts
export { OrdersUpsertAdapter } from './orders-upsert-adapter.ts'
```

#### Definition of Done — Section C

- [ ] File exists at `_shared/adapters/orders-upsert/index.ts`
- [ ] Exports `OrdersUpsertAdapter` and nothing else
- [ ] Importing from `../_shared/adapters/orders-upsert/index.ts` works in Deno

---

### Section D: Wire into the Port File (if needed)

**What this is:** The port file (`orders-upsert-port.ts`) defines the interface contract.
If it already references or exports the adapter, no change is needed here.
If it doesn't, add the export.

**Action:**

Check `_shared/ports/orders-upsert-port.ts`. It should only contain the interface:
```typescript
export interface OrdersUpsertPort {
  upsert(input: UpsertOrderInput): Promise<UpsertOrderResult>
}
```

If it contains any implementation code or DB calls — move that code to the adapter (Section A).
Ports must contain ONLY interface definitions. No logic.

#### Definition of Done — Section D

- [ ] `orders-upsert-port.ts` contains only the `OrdersUpsertPort` interface and type imports
- [ ] No implementation code in the port file
- [ ] If code was moved, the old location is cleaned up

---

## 7. Integration Checklist

These checks verify that this service connects correctly with the rest of the system.
Run these after completing Sections A–D.

- [ ] Import `OrdersUpsertAdapter` from `_shared/adapters/orders-upsert/index.ts` in
      `supabase/functions/orders-upsert/index.ts` — confirm it compiles without errors
- [ ] Confirm `orders-upsert/orders-upsert-adapter.ts` (if it existed before this task)
      is now either deleted or replaced with an import from `_shared`
      (avoid having two implementations of the same thing — DRY principle)
- [ ] Confirm that no edge function outside `orders-upsert/` imports directly from
      `orders-upsert/upsert-order.ts` — all imports must go through `_shared`
- [ ] Run `deno check supabase/functions/_shared/adapters/orders-upsert/orders-upsert-adapter.ts`
      — zero type errors

---

## 8. Definition of Done — Full Task

This task is complete when ALL of the following are true:

- [ ] All Section A DoD items are checked
- [ ] All Section B DoD items are checked (tests pass)
- [ ] All Section C DoD items are checked
- [ ] All Section D DoD items are checked
- [ ] All Integration Checklist items are checked
- [ ] No function body in the new files exceeds 50 lines
- [ ] No file exceeds 150 lines
- [ ] Zero `any` types in all new or modified files
- [ ] Zero silent `catch(e) {}` blocks — all catches log and either continue or throw
- [ ] The `_shared/adapters/orders-upsert/` folder exists with the 3 files above
- [ ] A human (non-technical) can describe what `OrdersUpsertAdapter.upsert()` does after
      reading only the plain-language comments in the file (add JSDoc comments if needed)

---

## 9. What NOT to Build

> **Rabbit holes — do not enter these.**

- **Do NOT build the `orders-upsert` edge function here.** That is C0-T3. This task only
  builds the `_shared` layer piece that the edge function will use.
- **Do NOT modify the `invoices` table logic here.** NFe/invoice emission is a completely
  separate concern. This service only writes to `orders`, `order_items`, `order_shipping`,
  and `order_status_history`.
- **Do NOT add margin calculation here.** `unit_cost` on `order_items` is populated later
  when the seller links products (Cycle 1). Set it to `null` here — do not try to compute it.
- **Do NOT build an order-fetching adapter here.** This service is write-only. Reads are
  handled by separate query services in Cycle 1.
- **Do NOT add real-time subscription logic here.** Real-time is handled at the frontend layer.
- **Do NOT touch `marketplace_orders_presented_new`** (the old table). This task only
  writes to the new tables. The old table remains read-only for now.
