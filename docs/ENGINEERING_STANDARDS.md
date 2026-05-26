# Engineering Standards — Novura

> **This document is mandatory reading before implementing any feature in Cycles 1, 2, or 3.**
> Each cycle document references this file. Rules here override any implicit habits or defaults an AI agent or developer might bring from elsewhere.

---

## The Rule Above All Others

> **Every function does ONE thing. Every file has ONE responsibility.**
>
> If you cannot describe what a function does in one sentence without using the word "and", split it into two functions.

This is not a style preference. It is an architectural constraint. The Cycle 0 implementation produced functions exceeding 200 lines because this rule was not enforced. That code is harder to test, harder to debug, and harder to extend. Do not repeat that pattern.

---

## 1. Hard Size Limits

These limits are non-negotiable. If you find yourself hitting them, it means you have not decomposed the problem correctly.

| Unit | Limit | What to do when exceeded |
|---|---|---|
| Function body | **50 lines** | Extract sub-operations into named helper functions |
| File (service, hook, util) | **150 lines** | Split into multiple files by responsibility |
| Page component | **200 lines** | Extract container + presentational subcomponents |
| Edge function handler | **80 lines** | Extract helpers at the bottom of the file |
| Function parameters | **4** | Group related params into a typed object |

**Blank lines and comments count toward the limit.** A 60-line function with 20 lines of comments is still a 60-line function.

```typescript
// ❌ BAD — 120-line function doing 4 things
async function syncOrders(orgId: string) {
  // Step 1: fetch token (20 lines)
  const token = await supabase.from('marketplace_integrations')...
  // Step 2: call ML API (30 lines)
  const mlOrders = await fetch(...)...
  // Step 3: transform data (30 lines)
  const rows = mlOrders.map(o => { ... })
  // Step 4: upsert to DB (20 lines)
  await supabase.from('orders').upsert(rows)...
}

// ✅ GOOD — each step is its own 20-line function
async function syncOrders(orgId: string) {
  const token = await fetchMLToken(orgId)
  const mlOrders = await fetchMLOrdersLast90Days(token)
  const rows = mlOrders.map(normalizeMLOrder)
  await upsertOrders(rows, orgId)
}
```

---

## 2. SOLID Principles

### S — Single Responsibility Principle
Every module, class, or function has exactly one reason to change.

```typescript
// ❌ BAD — service function doing transformation + DB write + cache invalidation
export async function saveProductCost(orgId: string, productId: string, cost: number) {
  if (cost <= 0) throw new Error('...')                   // validation
  const row = { organization_id: orgId, product_id: productId, unit_cost: cost }
  await supabase.from('product_costs').upsert(row)        // DB write
  await supabase.from('order_items')                      // side effect
    .update({ unit_cost: cost })
    .eq('product_id', productId)
  queryClient.invalidateQueries({ queryKey: ['orders'] }) // cache — wrong layer!
}

// ✅ GOOD — each function has one job; cache invalidation stays in the hook layer
export function validateProductCost(cost: number): void {
  if (cost <= 0) throw new Error('O custo deve ser maior que R$0,00')
}

export async function upsertProductCost(orgId: string, productId: string, cost: number) {
  return supabase.from('product_costs')
    .upsert({ organization_id: orgId, product_id: productId, unit_cost: cost })
}

export async function backfillOrderItemCosts(productId: string, cost: number) {
  return supabase.from('order_items')
    .update({ unit_cost: cost })
    .eq('product_id', productId)
}
// Hook calls all three + invalidateQueries in onSuccess
```

### O — Open/Closed Principle
Functions should be open for extension (via parameters) and closed for modification.

```typescript
// ❌ BAD — adding a new marketplace means editing this function
async function fetchOrders(orgId: string, marketplace: string) {
  if (marketplace === 'mercado_livre') {
    return supabase.from('orders').eq('marketplace', 'mercado_livre')...
  } else if (marketplace === 'shopee') {
    // now you're inside the function modifying it
  }
}

// ✅ GOOD — accepts a filter object; adding shopee = adding a call site, not editing the function
type OrderFilter = {
  marketplace?: 'mercado_livre' | 'shopee'
  status?: string
  since?: Date
}

export async function fetchOrders(orgId: string, filter: OrderFilter = {}) {
  let query = supabase.from('orders').eq('organization_id', orgId)
  if (filter.marketplace) query = query.eq('marketplace', filter.marketplace)
  if (filter.status)      query = query.eq('status', filter.status)
  if (filter.since)       query = query.gte('created_at', filter.since.toISOString())
  return query.select('*')
}
```

### I — Interface Segregation Principle
Functions should receive only the data they need. Do not pass entire objects when only two fields are used.

```typescript
// ❌ BAD — computeMargin receives a 40-field Order just to use 2 fields
function computeMargin(order: Order, items: OrderItem[]): number {
  const totalCost = items.reduce((s, i) => s + i.unit_cost * i.quantity, 0)
  return order.net_amount - totalCost
}

// ✅ GOOD — receives only what it needs; easier to test
type MarginInput = {
  netAmount: number
  totalCost: number
}

export function computeMargin({ netAmount, totalCost }: MarginInput): number {
  return netAmount - totalCost
}

export function computeMarginPct({ netAmount, totalCost }: MarginInput): number {
  if (netAmount === 0) return 0
  return ((netAmount - totalCost) / netAmount) * 100
}
```

### D — Dependency Inversion Principle
High-level modules should not depend on low-level modules. Pass dependencies as parameters when testing is a concern.

```typescript
// ❌ BAD — service imports supabase directly (hard to test)
import { supabase } from '@/integrations/supabase/client'
export async function fetchOrders(orgId: string) {
  return supabase.from('orders').eq('organization_id', orgId).select('*')
}

// ✅ ACCEPTABLE for this codebase (the supabase singleton is fine for production)
// BUT if you need to test the function in isolation, accept it as a parameter:
export async function fetchOrders(
  orgId: string,
  db = supabase  // default to the real client; tests pass a mock
) {
  return db.from('orders').eq('organization_id', orgId).select('*')
}
```

---

## 3. DRY — Don't Repeat Yourself

Any logic that appears in two or more places must be extracted.

### Shared Utilities to Create Once

```typescript
// src/utils/formatting.ts — ONE place for all formatting helpers
export const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

export const formatPercent = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals).replace('.', ',')}%`

export const formatDate = (date: string | Date): string =>
  new Intl.DateTimeFormat('pt-BR').format(new Date(date))
```

```typescript
// src/utils/date-ranges.ts — ONE place for date range helpers
export const last90DaysISO = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString()
}

export const currentYearStartISO = (): string =>
  new Date(new Date().getFullYear(), 0, 1).toISOString()
```

### Identifying Duplication Before Writing Code

Before writing any query or transformation, search the codebase for similar patterns:
- Is there already a `fetch*` function in `services/` that does 80% of what you need? Extend it.
- Is there already a `format*` helper in `utils/`? Use it.
- Is the same `.from('orders').eq('organization_id', orgId)` base query repeated 5 times? Extract it.

```typescript
// src/services/query-builders.ts — reusable base query builders
export const ordersBase = (orgId: string) =>
  supabase
    .from('orders')
    .eq('organization_id', orgId)
    .neq('status', 'cancelled')

// Usage:
const { data } = await ordersBase(orgId)
  .gte('created_at', last90DaysISO())
  .select('gross_amount, marketplace_fee, shipping_cost')
```

---

## 4. Object-Oriented Design — When to Use Classes

### Use a Class When:
- The service has multiple methods that **share the same dependencies** (supabase client, organizationId)
- The object maintains **meaningful state** between method calls
- You want to **group related operations** under a coherent interface

### Use Plain Functions When:
- The operation is **pure** (input → output, no side effects)
- There is **no shared state** between calls
- The function is a **one-off utility** (formatting, date math, etc.)

### Class Example — Service Layer

```typescript
// src/services/diagnostico.service.ts
export class DiagnosticoService {
  constructor(
    private readonly organizationId: string,
    private readonly db = supabase
  ) {}

  async fetchMoneyLeaks() {
    const { data, error } = await this.db
      .from('orders')
      .select('gross_amount, marketplace_fee, shipping_cost, net_amount')
      .eq('organization_id', this.organizationId)
      .eq('marketplace', 'mercado_livre')
      .neq('status', 'cancelled')
      .gte('created_at', last90DaysISO())

    if (error) throw error
    return this.aggregateMoneyLeaks(data ?? [])
  }

  // Private helper — 10 lines, one job
  private aggregateMoneyLeaks(rows: MoneyLeakRow[]) {
    return rows.reduce(
      (acc, o) => ({
        totalGross:    acc.totalGross    + (o.gross_amount    ?? 0),
        totalFee:      acc.totalFee      + (o.marketplace_fee ?? 0),
        totalShipping: acc.totalShipping + (o.shipping_cost   ?? 0),
        totalNet:      acc.totalNet      + (o.net_amount       ?? 0),
      }),
      { totalGross: 0, totalFee: 0, totalShipping: 0, totalNet: 0 }
    )
  }

  async fetchSimpleNacionalUsage() { ... }  // another method, same class

  async fetchProductFeeRanking() { ... }
}

// Instantiation in the hook:
const service = new DiagnosticoService(organizationId)
```

### Why NOT a Class — Pure Utility

```typescript
// src/utils/nfe-defaults.ts — NO class needed, these are pure functions
export function computeNfeDefaults(
  order: Order,
  items: OrderItem[],
  shipping: OrderShipping,
  company: Company
): NfePayload {
  const cfop = selectCfop(company.state_uf, order.buyer_state)
  const nfeItems = items.map(buildNfeItem)
  return { cfop, items: nfeItems, recipient: buildRecipient(order, shipping), ... }
}

function selectCfop(sellerUF: string, buyerUF: string): string {
  return sellerUF === buyerUF ? '5.102' : '6.102'
}

function buildNfeItem(item: OrderItem): NfeItem { ... }
function buildRecipient(order: Order, shipping: OrderShipping): NfeRecipient { ... }
```

---

## 5. Design Patterns Used in This Codebase

### Repository Pattern (Service Layer)

The service layer IS the repository. It is the only place that talks to Supabase. This pattern ensures:
- Components never know about Supabase
- Queries are testable in isolation
- The query logic can be changed without touching components

```
pages/ components/ (UI only)
  ↓ calls
hooks/use*.ts (TanStack Query wrappers)
  ↓ calls
services/*.service.ts (repository — ONLY place with Supabase calls)
  ↓ calls
supabase client
```

**Rule:** If you see `supabase.from(...)` in a component or hook body (not a service), it is a bug.

---

### Strategy Pattern (Algorithm Selection)

Use when you need to select between multiple algorithms at runtime. Extract each algorithm as a named function. The selector function returns the right strategy — it does not execute it.

```typescript
// src/utils/alert-priority.ts
type AlertType = 'stock_out_imminent' | 'payment_held' | 'dead_stock_high' | 'ads_negative_roi'

const ALERT_PRIORITY: AlertType[] = [
  'stock_out_imminent',
  'payment_held',
  'dead_stock_high',
  'ads_negative_roi',
]

// Strategy: each alert evaluator is a named function
const alertEvaluators: Record<AlertType, (data: AlertData) => Alert | null> = {
  stock_out_imminent:  evaluateStockOut,
  payment_held:        evaluatePaymentHeld,
  dead_stock_high:     evaluateDeadStock,
  ads_negative_roi:    evaluateAdsROI,
}

// Selector: picks the top alert by priority
export function getTopAlert(data: AlertData): Alert | null {
  for (const type of ALERT_PRIORITY) {
    const alert = alertEvaluators[type](data)
    if (alert) return alert
  }
  return null
}
```

---

### Factory Pattern (Data Builders)

Use when you need to construct complex objects from multiple inputs. The factory function is always pure (no side effects, no DB calls).

```typescript
// src/utils/nfe-defaults.ts
// Factory: takes raw data → returns typed payload
export function buildNfePayload(
  order: Order,
  items: OrderItem[],
  shipping: OrderShipping,
  company: Company
): NfePayload {
  return {
    cfop:      selectCfop(company.state_uf, order.buyer_state),
    recipient: buildRecipient(order, shipping),
    items:     items.map(buildNfeItem),
    totals:    buildTotals(items),
    emitter:   buildEmitter(company),
  }
}

// Each sub-builder is also a pure function (< 20 lines each)
function buildRecipient(order: Order, shipping: OrderShipping): NfeRecipient { ... }
function buildNfeItem(item: OrderItem): NfeItem { ... }
function buildTotals(items: OrderItem[]): NfeTotals { ... }
function buildEmitter(company: Company): NfeEmitter { ... }
```

---

### Adapter Pattern (External API Normalization)

When consuming external APIs (ML, Shopee, Mercado Pago), always normalize the response into your internal types at the boundary. Never let external API shapes leak into your components.

```typescript
// src/services/mercado-pago.service.ts

// Raw MP API shape (external — can change without warning)
type MPBalanceRaw = {
  available_balance: number
  total_amount: number
  // ... many other fields
}

// Internal shape (stable — our contract with the UI)
export type MPBalance = {
  available: number
  held: number
  releasing7d: number
  releasing14d: number
  releasing30d: number
  snapshotAt: Date
}

// Adapter: converts raw → internal at the API boundary
function adaptMPBalance(raw: MPBalanceRaw, releases: MPReleasesRaw): MPBalance {
  return {
    available:    raw.available_balance,
    held:         raw.total_amount - raw.available_balance,
    releasing7d:  sumReleasesUpTo(releases, 7),
    releasing14d: sumReleasesUpTo(releases, 14),
    releasing30d: sumReleasesUpTo(releases, 30),
    snapshotAt:   new Date(),
  }
}
```

---

### Chain of Responsibility (Multi-step Validation)

Use when a request must pass through multiple independent validation steps, any of which can short-circuit.

```typescript
// src/utils/nfe-validation.ts
type ValidationResult = { valid: true } | { valid: false; message: string }

type Validator = (order: Order, company: Company) => ValidationResult

const nfeValidators: Validator[] = [
  validateBuyerDocument,
  validateBuyerState,
  validateCompanyFiscalData,
  validateOrderNotCancelled,
  validateNoExistingInvoice,
]

export function validateNfeEmission(order: Order, company: Company): ValidationResult {
  for (const validate of nfeValidators) {
    const result = validate(order, company)
    if (!result.valid) return result
  }
  return { valid: true }
}

// Each validator is a small, testable function (< 15 lines):
function validateBuyerDocument(order: Order): ValidationResult {
  if (!order.buyer_document) {
    return { valid: false, message: 'CPF/CNPJ do comprador ausente — não é possível emitir NF-e' }
  }
  return { valid: true }
}
```

---

## 6. Edge Functions — Specific Rules

Edge functions have special constraints because they run on Deno and must handle HTTP directly.

### Structure Every Edge Function the Same Way

```typescript
// supabase/functions/my-function/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// === Types ===
type RequestBody = { organizationId: string; ... }
type ResponseBody = { success: boolean; ... }

// === Main Handler (< 40 lines) ===
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return methodNotAllowed()

  const body = await parseBody<RequestBody>(req)
  if (!body) return badRequest('Missing or invalid request body')

  const supabase = createServiceClient()

  try {
    const result = await processRequest(supabase, body)
    return jsonResponse(result)
  } catch (error) {
    return errorResponse(error)
  }
})

// === Business Logic (extracted, each < 30 lines) ===
async function processRequest(db: SupabaseClient, body: RequestBody): Promise<ResponseBody> {
  const step1 = await doStep1(db, body.organizationId)
  const step2 = await doStep2(db, step1)
  return { success: true, ... }
}

async function doStep1(db: SupabaseClient, orgId: string) { ... }
async function doStep2(db: SupabaseClient, input: Step1Result) { ... }

// === Response Helpers (reuse these, don't inline them) ===
const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const errorResponse = (error: unknown) => {
  console.error('[my-function] Error:', error)
  const message = error instanceof Error ? error.message : 'Internal server error'
  return jsonResponse({ error: message }, 500)
}
```

### Edge Function Rules
- Never `catch(e) {}` — always log the error and return a structured error response
- Never call external APIs without timeout handling
- Never store secrets in code — use `Deno.env.get('VARIABLE_NAME')`
- Always validate the request body before processing
- Use UPSERT everywhere, INSERT nowhere (idempotency)

---

## 7. Anti-Patterns — Explicitly Forbidden

These patterns appear in legacy code and must not be repeated.

### ❌ God Functions (> 50 lines doing multiple things)
```typescript
// This is what we are NOT building:
async function handleOrdersSync(orgId: string) {
  // 30 lines: fetch token
  // 40 lines: call ML API with pagination
  // 50 lines: transform each order
  // 30 lines: upsert to DB
  // 20 lines: send webhook notification
  // Total: 170 lines — refusal to split
}
```

### ❌ Supabase Calls in Components
```typescript
// ❌ NEVER do this in a React component:
function OrdersPage() {
  const [orders, setOrders] = useState([])
  useEffect(() => {
    supabase.from('orders').select('*').then(({ data }) => setOrders(data))
  }, [])
}
```

### ❌ Magic Strings
```typescript
// ❌ BAD
if (order.status === 'paid') { ... }
if (order.marketplace === 'mercado_livre') { ... }

// ✅ GOOD
const ORDER_STATUS = { PAID: 'paid', CANCELLED: 'cancelled', PENDING: 'pending' } as const
const MARKETPLACE = { ML: 'mercado_livre', SHOPEE: 'shopee' } as const

if (order.status === ORDER_STATUS.PAID) { ... }
```

### ❌ Silent Error Swallowing
```typescript
// ❌ NEVER
try {
  await someOperation()
} catch (e) {} // silently fails — the user never knows

// ✅ ALWAYS
try {
  await someOperation()
} catch (e) {
  console.error('[context] Operation failed:', e)
  throw e // or return a structured error
}
```

### ❌ Fetching Data in useState + useEffect
```typescript
// ❌ NEVER — this is what TanStack Query replaces
const [data, setData] = useState(null)
const [loading, setLoading] = useState(false)
useEffect(() => {
  setLoading(true)
  fetchSomething().then(setData).finally(() => setLoading(false))
}, [])

// ✅ ALWAYS — TanStack Query
const { data, isLoading, error } = useQuery({
  queryKey: ['something', id],
  queryFn: () => fetchSomething(id),
  staleTime: 5 * 60 * 1000,
})
```

### ❌ any Types
```typescript
// ❌ BAD
function parseOrder(row: any) { ... }
const result: any = await fetchData()

// ✅ GOOD — define interfaces or use unknown + type guards
interface OrderRow {
  id: string
  gross_amount: number
  // ...
}
function parseOrder(row: OrderRow) { ... }
```

---

## 8. Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Service files | `<module>.service.ts` | `diagnostico.service.ts` |
| Service classes | `<Module>Service` | `DiagnosticoService` |
| Hook files | `use<Module>.ts` | `useDiagnostico.ts` |
| Hook functions | `use<Module>` | `useDiagnostico()` |
| Type files | `<module>.ts` in `types/` | `types/diagnostico.ts` |
| Interfaces | `<Name>` (no `I` prefix) | `MoneyLeaks`, `NfePayload` |
| Constants | `SCREAMING_SNAKE_CASE` | `ALERT_PRIORITY`, `ORDER_STATUS` |
| Pure util functions | verb + noun | `computeMargin()`, `buildNfePayload()`, `selectCfop()` |
| Query keys | co-located with service | `export const diagnosticoKeys = { ... }` |

---

## 9. Query Key Conventions

Always co-locate query keys with the service, not in the hook.

```typescript
// src/services/diagnostico.service.ts
export const diagnosticoKeys = {
  all:          ['diagnostico'] as const,
  moneyLeaks:   (orgId: string) => ['diagnostico', 'money-leaks', orgId] as const,
  productRank:  (orgId: string) => ['diagnostico', 'product-fee-ranking', orgId] as const,
  simplesLimit: (orgId: string) => ['diagnostico', 'simples-nacional', orgId] as const,
}

// Usage in hook:
useQuery({
  queryKey: diagnosticoKeys.moneyLeaks(organizationId),
  ...
})

// Usage in invalidation:
queryClient.invalidateQueries({ queryKey: diagnosticoKeys.all })
```

---

## Summary Checklist Before Submitting Any Code

Before opening a PR or declaring a task done, verify:

- [ ] No function body exceeds 50 lines
- [ ] No file (excluding pages) exceeds 150 lines
- [ ] No `supabase.from(...)` calls outside of `services/` files
- [ ] No `useState` + `useEffect` for server data (use TanStack Query)
- [ ] No `any` types (use proper interfaces or `unknown`)
- [ ] No silent `catch(e) {}` blocks
- [ ] No magic strings (use typed constants)
- [ ] Every new utility is in `src/utils/` or `src/services/` — not inlined in a component
- [ ] Query keys are co-located with the service, typed with `as const`
- [ ] External API shapes are adapted at the boundary (not leaked into components)
