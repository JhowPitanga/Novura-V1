# Novura — Conventions

> **Forward-looking document.** Describes how new code should be written. For how the codebase looks *today*, see [ARCHITECTURE.md](./ARCHITECTURE.md). For the migration path from today to these conventions, see [MIGRATION/](./MIGRATION/). For hard size limits and cycle-specific rules, see [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) — that document takes precedence on size limits.

---

## Table of Contents

1. [Guiding Principles](#1-guiding-principles)
2. [TypeScript](#2-typescript)
3. [React 19](#3-react-19)
4. [Feature Folder Structure](#4-feature-folder-structure)
5. [Components](#5-components)
6. [Data Fetching](#6-data-fetching)
7. [State Management](#7-state-management)
8. [Supabase](#8-supabase)
9. [Naming and Language](#9-naming-and-language)
10. [Linting and Formatting](#10-linting-and-formatting)
11. [Design Patterns](#11-design-patterns)
12. [Accessibility](#12-accessibility)
13. [Git and PR Conventions](#13-git-and-pr-conventions)

---

## 1. Guiding Principles

These principles inform every rule in this document. When in doubt, apply the principle directly.

### SOLID in React

| Principle | OOP meaning | React translation |
|---|---|---|
| **S** — Single Responsibility | A class has one reason to change | A component renders one concern; a hook manages one slice of state/behavior; a service handles one external system |
| **O** — Open/Closed | Open for extension, closed for modification | Extend components via `children` / render slots / compound components; do not add `if (variant === 'x')` branches inside existing components |
| **L** — Liskov Substitution | Subtypes can replace base types | A more specific component must accept all props the general one does; use discriminated unions so TypeScript enforces substitutability |
| **I** — Interface Segregation | Clients should not depend on interfaces they don't use | Props must be proportional to what the component renders; if two consumers need different subsets, split the component; use discriminated unions for variants |
| **D** — Dependency Inversion | Depend on abstractions, not concretions | Components depend on hooks/context, not on Supabase directly; hooks depend on service functions, not on `supabase` client directly |

**The most common violation in this codebase:** ISP — components receiving 30+ props because they aggregate every possible variant. Fix: discriminated union props or split components.

### DRY — Rule of Three

Do not abstract before the **third** repetition. Two uses of similar code is a coincidence. Three uses is a pattern worth naming.

Premature abstraction creates wrong abstractions harder to delete than the duplication itself.

### KISS — Prefer Simple

The simplest solution that correctly solves the problem is correct. Avoid clever code. Prefer explicit over implicit. A longer but obvious function is better than a short but surprising one.

### YAGNI — Build What Is Needed Now

Do not add parameters, hooks, tables, or components for "potential future use". The future is uncertain; the complexity is certain.

---

## 2. TypeScript

### Strict mode — current minimum

`tsconfig.json` must have at minimum:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

`strict: true` enables: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, `useUnknownInCatchVariables`, `alwaysStrict`.

### Strict mode — target flags

New code should be compatible with these flags. They will be enabled progressively via PRDs in `MIGRATION/`:

| Flag | Why it matters |
|---|---|
| `noUncheckedIndexedAccess` | `array[0]` returns `T \| undefined`, forcing null-check. Catches 40 % of real runtime crashes missed by `strict`. |
| `exactOptionalPropertyTypes` | Distinguishes "property absent" from "property set to `undefined`". Prevents silent `PATCH` overwrites. |
| `noPropertyAccessFromIndexSignature` | Forces `obj["key"]` syntax for dynamic access, making dynamic access explicit. |
| `noUnusedLocals` | Finds dead code at compile time. |
| `noUnusedParameters` | Catches signatures that grew stale. |
| `noFallthroughCasesInSwitch` | Prevents missing `break` bugs. |
| `noImplicitReturns` | Every code path must return a value. |

### Never use `any`

```typescript
// ❌ banned — disables the type system at the call site
const result = await (supabase as any).from('orders').select('*');
const handler = (p: any) => doSomething(p);

// ✅ use the generated Database type
import type { Database } from '@/integrations/supabase/types';
type OrderRow = Database['public']['Tables']['orders']['Row'];
const result = await supabase.from('orders').select('*');

// ✅ for unknown catch variables, use unknown
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
}
```

If `any` is unavoidable (third-party lib with no types), document the reason in a comment on the same line:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any — node-forge has no TS types
const p12 = (forge as any).pkcs12.pkcs12FromAsn1(asn1Obj, password);
```

### Database types — use generated types

```typescript
import type { Database } from '@/integrations/supabase/types';

// Use table Row type directly
type Company = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
type CompanyUpdate = Database['public']['Tables']['companies']['Update'];

// Never redefine DB shape manually
// ❌ interface CompanyData { razao_social: string; cnpj: string; ... }
```

### Enums — `as const` objects, not TypeScript enums

TypeScript enums emit runtime code and are not erasable. Use `as const` + `z.enum`:

```typescript
// ❌ TypeScript enum
enum OrderStatus { Pending = 'pending', Shipped = 'shipped' }

// ✅ const object + Zod + derived type
export const ORDER_STATUS = {
  pending: 'pending',
  unlinked: 'unlinked',
  invoice_pending: 'invoice_pending',
  ready_to_print: 'ready_to_print',
  awaiting_pickup: 'awaiting_pickup',
  shipped: 'shipped',
  cancelled: 'cancelled',
  returned: 'returned',
} as const;

export const orderStatusSchema = z.enum(
  Object.values(ORDER_STATUS) as [string, ...string[]]
);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
```

### Discriminated unions for component variants

When a component has multiple behavioral variants, use a discriminated union instead of optional props:

```typescript
// ❌ Optional prop soup — all combinations are valid to TS
interface FilterBarProps {
  nfBadgeFilter?: string;
  vincularBadgeFilter?: 'para_vincular' | 'sem_estoque';
  badgeCounts?: BadgeCounts;
  statusCounts?: StatusCounts;
  // ...
}

// ✅ Discriminated union — each variant has its exact contract
type FilterBarProps =
  | { status: 'a-vincular'; vincularBadgeFilter: 'para_vincular' | 'sem_estoque'; statusCounts: StatusCounts }
  | { status: 'emissao-nf'; nfBadgeFilter: string; badgeCounts: BadgeCounts; onMassEmit: (orders: Order[]) => void }
  | { status: 'impressao'; marketplaceFilter: string; selectedIds: string[]; onPrintLabels: () => void }
  | { status: 'todos' | 'enviado' | 'cancelado'; searchTerm: string; sortKey: string; sortDir: 'asc' | 'desc' };
```

---

## 3. React 19

All new components and hooks target React 19 APIs. The React 19 upgrade PRD is at `MIGRATION/00-upgrade-react-19.md`. Until the upgrade lands, write React 18-compatible code that will need no refactoring after the upgrade.

### `useActionState` — replace `useState` triplets for mutations

```typescript
// ❌ Pre-React 19 pattern — manual loading/error state
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const handleSubmit = async (data: CompanyFormData) => {
  setLoading(true);
  try {
    await saveCompany(data);
    navigate('/configuracoes');
  } catch (e) {
    setError(String(e));
  } finally {
    setLoading(false);
  }
};

// ✅ React 19 — single hook manages pending, state, and error
const [state, submitAction, isPending] = useActionState(
  async (_prev: ActionState, formData: FormData) => {
    const result = await saveCompany(parseCompanyFormData(formData));
    if (!result.ok) return { error: result.error };
    navigate('/configuracoes');
    return null;
  },
  null
);
```

Use `useActionState` for: multi-step form submission, save/create/update flows, any async action triggered by the user.

### `useOptimistic` — replace manual `processingIdsLocal`

```typescript
// ❌ Manual optimistic state (as in useOrdersPageController today)
const [processingIds, setProcessingIds] = useState<string[]>([]);
const addProcessingId = (id: string) => setProcessingIds(prev => [...new Set([...prev, id])]);

// ✅ React 19 — scoped to the async action, auto-reverts on error
const [optimisticOrders, updateOptimistic] = useOptimistic(
  orders,
  (current, { id, status }: { id: string; status: string }) =>
    current.map(o => o.id === id ? { ...o, status, processing: true } : o)
);

// Call inside an async action:
updateOptimistic({ id: orderId, status: 'processing' });
await emitNfe(orderId);
```

### `ref` as a regular prop — no `forwardRef`

```typescript
// ❌ React 18 — forwardRef boilerplate
const OrderTable = forwardRef<HTMLTableSectionElement, OrderTableProps>(
  ({ columns, ...props }, ref) => <thead ref={ref} />
);

// ✅ React 19 — ref is just a prop
function OrderTable({ columns, ref, ...props }: OrderTableProps & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return <thead ref={ref} />;
}
```

### React Compiler — write plain code, let compiler memoize

With the React Compiler enabled (see `MIGRATION/00-upgrade-react-19.md`), do not write `useMemo`, `useCallback`, or `React.memo` manually. The compiler inserts these at build time based on data dependencies.

**Before enabling the compiler**, `useMemo` and `useCallback` remain acceptable. After enabling, remove them gradually.

The compiler requires components to follow the Rules of Hooks and treat props/state as immutable. Never mutate props:

```typescript
// ❌ Breaks compiler optimization
props.items.push(newItem);

// ✅ Return new reference
const updatedItems = [...props.items, newItem];
```

### Document metadata — no third-party libraries

```tsx
// ✅ React 19 native — works from any component
function OrdersPage() {
  return (
    <>
      <title>Pedidos — Novura</title>
      <meta name="description" content="Gerenciamento de pedidos" />
      {/* page content */}
    </>
  );
}
```

### `use()` for conditional context reading

```typescript
// ✅ Unlike useContext, use() can be called inside if/loop
function ConditionalComponent({ showDetails }: { showDetails: boolean }) {
  if (!showDetails) return null;
  const orderDetails = use(OrderDetailsContext); // only reads when rendering
  return <div>{orderDetails.buyerName}</div>;
}
```

---

## 4. Feature Folder Structure

### Target structure (Bulletproof React pattern)

```
src/
├── app/                     # App-level providers, router, layout
│   ├── providers.tsx        # QueryClientProvider, AuthProvider, etc.
│   ├── router.tsx           # Route definitions
│   └── layouts/
│       └── AppLayout.tsx    # Sidebar + GlobalHeader shared layout
├── features/                # One folder per business domain
│   ├── orders/
│   │   ├── api/
│   │   │   ├── keys.ts      # TanStack Query key factories
│   │   │   ├── queries.ts   # useQuery hooks
│   │   │   ├── mutations.ts # useMutation hooks
│   │   │   ├── service.ts   # Raw Supabase calls (no hooks)
│   │   │   └── mocks.ts     # MSW handlers for this feature
│   │   ├── components/
│   │   ├── hooks/           # Hooks that combine api + local state
│   │   ├── schemas/         # Zod schemas for this feature's data
│   │   ├── types.ts         # Feature-local types (non-DB)
│   │   └── utils.ts         # Pure functions for this feature
│   ├── products/
│   ├── listings/
│   ├── companies/
│   ├── auth/
│   ├── team/
│   ├── dashboard/
│   ├── inventory/
│   ├── invoices/
│   ├── settings/
│   └── ...
├── shared/                  # Code reused across features
│   ├── ui/                  # shadcn/Radix components (do not edit)
│   ├── components/          # App-wide presentational (Sidebar, Header)
│   ├── hooks/               # Generic hooks (useLocalStorage, useDebounce)
│   ├── lib/                 # Utilities (datetime, cn, pdf)
│   ├── api/                 # Supabase client, query client config
│   └── types/               # App-wide types (not DB-specific)
├── integrations/
│   └── supabase/            # Generated types — do not edit manually
└── routes/                  # Only route definitions (imported by router)
```

### Unidirectional import rule

Code flows in one direction only:

```
shared/ ← features/ ← app/
```

- `shared/` can be imported by anything.
- `features/` can import from `shared/` but **not** from other features.
- `app/` can import from `features/` and `shared/`.

This rule is enforced by ESLint. See section 10.

**Cross-feature composition happens at the `app/` level**, not between feature folders.

### Not every folder is required

Only create the sub-folders a feature actually needs. A simple feature may only have `api/queries.ts`, `components/FeaturePage.tsx`, and `types.ts`.

---

## 5. Components

### Props are proportional to what a component renders

A component's prop surface should match its visual/behavioral scope. Use this as a heuristic:

| Props count | Signal | Action |
|---|---|---|
| ≤ 5 | Good | No action needed |
| 6–8 | Acceptable | Consider if some can be grouped |
| 9–15 | Warning | Likely doing too much; consider composition or context |
| > 15 | Violation | Split the component or introduce a context |

**Exception:** pure data display components (tables, list cards) may need more data props. The rule targets handler/action prop count.

### Rule of business logic: it belongs in the hook

```tsx
// ❌ Business logic in JSX
<button
  disabled={activeStatus === 'emissao-nf' && nfBadgeFilter === 'processando'}
  onClick={handleClick}
>

// ✅ Derived value from hook, boolean prop to component
const { canSelectAll } = useOrderSelection();
<button disabled={!canSelectAll} onClick={handleClick}>
```

### DOM refs belong to the component that owns the DOM

```typescript
// ❌ Ref created externally and passed down — violates DIP
// useOrdersPageController.ts
const theadRef = useRef<HTMLTableSectionElement>(null);
// ...returned as part of a 50-property object

// ✅ Component creates its own ref; exposes derived values if needed
function OrdersTable({ onGeometryChange }: { onGeometryChange?: (offset: number) => void }) {
  const theadRef = useRef<HTMLTableSectionElement>(null);
  useLayoutEffect(() => {
    if (theadRef.current) onGeometryChange?.(theadRef.current.getBoundingClientRect().bottom);
  }, []);
  return <thead ref={theadRef} />;
}
```

### Layout route — do not repeat sidebar/header in every page

The `AppLayout` component wraps all authenticated pages via a React Router layout route:

```tsx
// app/layouts/AppLayout.tsx
export function AppLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 overflow-auto p-6">
            <Outlet />           {/* only the page content renders here */}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// Each page component — no sidebar/header boilerplate
export function OrdersPage() {
  return (
    <>
      <title>Pedidos — Novura</title>
      {/* page content only */}
    </>
  );
}
```

### Empty state as a component

```tsx
// ❌ Inline empty state inside tbody
<tr><td colSpan={columns.length + 2}>Nenhum pedido encontrado.</td></tr>

// ✅ Reusable component
<EmptyState
  title="Nenhum pedido encontrado"
  description="Tente ajustar os filtros ou sincronizar com o marketplace."
  action={<Button onClick={onSync}>Sincronizar agora</Button>}
/>
```

---

## 6. Data Fetching

### Always TanStack Query — never `useEffect` for server state

```typescript
// ❌ Pre-TanStack pattern (current codebase)
const [orders, setOrders] = useState<Order[]>([]);
const [loading, setLoading] = useState(false);
useEffect(() => {
  setLoading(true);
  fetchAllOrders(orgId).then(setOrders).finally(() => setLoading(false));
}, [orgId]);

// ✅ TanStack Query — cache, dedup, retry, background refetch for free
export function useOrdersQuery(params: OrdersListParams) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: () => fetchOrders(params),
    enabled: !!params.orgId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
```

### Query keys — centralized factories

Every feature has a `keys.ts` file:

```typescript
// features/orders/api/keys.ts
export const orderKeys = {
  all: ['orders'] as const,
  list: (params: OrdersListParams) => [...orderKeys.all, 'list', params] as const,
  detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  counts: (orgId: string) => [...orderKeys.all, 'counts', orgId] as const,
};
```

Keys must include all variables that affect the query result. Changing `orgId`, `status`, or `dateRange` must produce a different key — this is what TanStack uses to decide when to refetch.

### Filters travel via URL search params

```typescript
// ❌ Filter state in useState — lost on navigation, not shareable
const [activeStatus, setActiveStatus] = useState('todos');

// ✅ URL-driven — shareable, survives refresh, works with browser back
const [searchParams, setSearchParams] = useSearchParams();
const activeStatus = searchParams.get('status') ?? 'todos';
const setActiveStatus = (s: string) => setSearchParams(p => { p.set('status', s); return p; });
```

### Mutations — `useMutation`, not try/catch in handlers

```typescript
// ❌ Manual try/catch spread across component
const handleSave = async () => {
  setLoading(true);
  try { await saveCompany(data); toast.success('Salvo!'); navigate('/'); }
  catch (e) { toast.error('Erro'); }
  finally { setLoading(false); }
};

// ✅ useMutation — loading, error, onSuccess centralized
const saveMutation = useMutation({
  mutationFn: saveCompany,
  onSuccess: () => { toast.success('Empresa salva!'); navigate('/configuracoes'); },
  onError: (err) => toast.error(err.message ?? 'Erro ao salvar empresa'),
});
```

### Supabase Realtime — invalidate, do not re-fetch manually

```typescript
// ❌ Manual sync in realtime handler
channel.on('postgres_changes', ..., async (payload) => {
  const updated = await fetchOrderById(orgId, payload.new.id);
  setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
  localStorage.setItem(cacheKey, JSON.stringify(updatedOrders));
});

// ✅ Invalidate and let TanStack refetch
channel.on('postgres_changes', ..., (payload) => {
  queryClient.invalidateQueries({ queryKey: orderKeys.counts(orgId) });
  queryClient.invalidateQueries({ queryKey: orderKeys.detail(payload.new.id) });
  queryClient.invalidateQueries({ queryKey: orderKeys.all, refetchType: 'active' });
});
```

---

## 7. State Management

| State type | Where it lives | Tool |
|---|---|---|
| Server state (DB data) | TanStack Query cache | `useQuery` / `useMutation` |
| URL state (filters, page, tab) | URL search params | `useSearchParams` |
| Feature-local UI state (selected rows, open dialogs) | Feature context | `useReducer` + `createContext` |
| Component-local UI state (input focus, hover) | Component | `useState` |
| Cross-feature global state | Do not create. Compose at `app/` level via TanStack Query. | — |

### Context is for UI state, not server state

```typescript
// ❌ Putting fetched data in context — duplicates TanStack cache
const OrdersContext = createContext<{ orders: Order[]; loading: boolean }>(null!);

// ✅ Context for UI state; data from query
const OrdersSelectionContext = createContext<SelectionState>(null!);
function useOrderSelection(orderId: string) {
  const { selected } = use(OrdersSelectionContext);
  return selected.has(orderId);
}
```

### Avoid God Hooks

A hook that returns more than 10 values is a god hook. Split it:

```typescript
// ❌ God Hook — 50 return values
export function useOrdersPageController() { ... return { pedidos, setPedidos, filters, filterActions, dialogs, dialogActions, ... }; }

// ✅ Domain hooks — each consumed only where needed
export function useOrdersQuery(params) { ... }       // data
export function useOrderSelection() { ... }           // selection UI state
export function useOrderFilters() { ... }             // filter UI state
export function useOrderDialogs() { ... }             // dialog open/close
export function useOrderMutations() { ... }           // emit, sync, print
```

---

## 8. Supabase

### Always use the typed client

```typescript
// ❌ Casts away all generated types
const { data } = await (supabase as any).from('orders').select('*');

// ✅ Typed — schema changes break at compile time, not runtime
import { supabase } from '@/shared/api/supabase';
const { data, error } = await supabase.from('orders').select('id, status, created_at');
// data is typed as Array<Pick<Database['public']['Tables']['orders']['Row'], 'id' | 'status' | 'created_at'>>
```

### RLS is mandatory on every table

Every table used by the frontend must have:

1. `ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;`
2. At least one `USING` policy scoped to `organization_id = auth.jwt() -> 'app_metadata' ->> 'organization_id'`

Tables without RLS are a security vulnerability, not a "temporary simplification".

### RPC functions — security and search_path

```sql
-- Every RPC must have:
CREATE OR REPLACE FUNCTION public.get_orders_status_counts(p_org UUID)
RETURNS TABLE (status TEXT, count BIGINT)
LANGUAGE SQL
STABLE           -- does not modify data; enables query caching
SECURITY INVOKER -- uses the caller's RLS, not the function owner's
SET search_path = ''   -- prevents search_path hijacking
AS $$
  SELECT status, COUNT(*)::BIGINT
  FROM public.orders
  WHERE organization_id = p_org
  GROUP BY status;
$$;
```

Never use `SECURITY DEFINER` unless the function intentionally bypasses RLS (e.g. `auth-on-signup` trigger). Document the reason when used.

### Server-side filtering — not client-side

```typescript
// ❌ Fetch everything, filter in JS
const { data } = await supabase.from('orders').select('*').eq('organization_id', orgId);
const filtered = data.filter(o => o.status === activeStatus && o.created_at >= dateFrom);

// ✅ Filter in Postgres, pay for what you use
let query = supabase
  .from('orders')
  .select(ORDERS_SELECT_FIELDS, { count: 'exact' })
  .eq('organization_id', orgId)
  .order('created_at', { ascending: false })
  .range(from, to);

if (params.status) query = query.eq('status', params.status);
if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
if (params.search) query = query.or(
  `marketplace_order_id.ilike.%${params.search}%,buyer_name.ilike.%${params.search}%`
);
```

### Indexes for common access patterns

Every `WHERE` clause used by the frontend must have a corresponding index. Critical ones for this project:

```sql
-- orders: most common queries
CREATE INDEX orders_org_created_idx ON public.orders (organization_id, created_at DESC);
CREATE INDEX orders_org_status_idx  ON public.orders (organization_id, status);

-- text search (requires pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX orders_buyer_trgm ON public.orders USING GIN (buyer_name gin_trgm_ops);
CREATE INDEX orders_order_id_trgm ON public.orders USING GIN (marketplace_order_id gin_trgm_ops);

-- partial indexes for high-frequency filtered views
CREATE INDEX orders_invoice_pending_idx ON public.orders (organization_id, created_at DESC)
  WHERE status = 'invoice_pending';
```

### Realtime channel filter — send only relevant rows

```typescript
// ❌ Receives all org changes globally — wastes bandwidth
supabase.channel('orders').on('postgres_changes', { table: 'orders' }, handler)

// ✅ Filtered at the server — only rows for this org arrive
supabase
  .channel(`orders:${orgId}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'orders', filter: `organization_id=eq.${orgId}` },
    handler
  )
  .subscribe();
```

---

## 9. Naming and Language

### Language rule

| Location | Language | Rationale |
|---|---|---|
| Identifiers (variables, functions, types, files) | **English** | Eliminates mixed naming like `filteredOrders → filteredPedidos` across file boundaries |
| UI strings (labels, messages, toasts, placeholders) | **Portuguese** | Product is in PT-BR; strings are i18n candidates |
| Code comments explaining business rules | **English** | Enables future international contributors |
| Git commit messages | **English** | Standard convention |
| SQL object names (tables, columns, functions) | **English** | Consistency with Supabase dashboard and generated types |

### File naming

| Type | Convention | Example |
|---|---|---|
| React component | `PascalCase.tsx` | `OrdersTable.tsx` |
| React hook | `camelCase.ts` | `useOrderSelection.ts` |
| Service / utility | `camelCase.ts` | `orderService.ts`, `dateUtils.ts` |
| Schema / types | `camelCase.ts` | `orderSchema.ts`, `types.ts` |
| Test file | `[original].test.ts(x)` | `orderService.test.ts` |
| Constant file | `SCREAMING_SNAKE_CASE.ts` | `ROUTES.ts` (for route constants) |

**Rule:** the file name and the default export name must match.

```typescript
// ❌ File: Orders.tsx — function: Pedidos
function Pedidos() { ... }
export default Pedidos;

// ✅ File: Orders.tsx — function: Orders (or rename file)
function Orders() { ... }
export default Orders;
```

### Hooks — always `use` prefix

```typescript
// ❌ function getOrderSelection() { ... }
// ✅ function useOrderSelection() { ... }
```

### Routes — kebab-case constants

```typescript
// shared/lib/routes.ts
export const ROUTES = {
  dashboard: '/',
  orders: '/pedidos',
  ordersNfe: '/pedidos/emissao_nfe',
  products: '/produtos',
  listings: '/anuncios',
  newCompany: '/empresas/nova',
  editCompany: (id: string) => `/empresas/${id}`,
  settings: '/configuracoes',
} as const;

// Usage (never hardcode strings)
navigate(ROUTES.settings);
```

### Component naming — no abbreviations in exports

```typescript
// ❌ ctl, mgr, svc, vm
const ctl = useOrdersPageController();
const vm = buildRowViewModel(order);

// ✅ Full descriptive names
const orderController = useOrdersController();
const rowModel = buildOrderRowModel(order);
```

---

## 10. Linting and Formatting

### ESLint — flat config (v9+)

Target config (implemented via `MIGRATION/02-eslint-strict.md`):

```javascript
// eslint.config.js — target state
import tseslint from 'typescript-eslint';
import reactCompiler from 'eslint-plugin-react-compiler';
import importPlugin from 'eslint-plugin-import';
import a11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  tseslint.configs.strictTypeChecked,     // catches floating promises, type predicates, etc.
  {
    plugins: { 'react-compiler': reactCompiler },
    rules: {
      'react-compiler/react-compiler': 'error',  // enforces Rules of Hooks for compiler
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      // Feature isolation — no cross-feature imports
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/features', from: './src/app' },
            {
              target: ['./src/shared', './src/shared/**'],
              from: ['./src/features', './src/app'],
            },
          ],
        },
      ],
    },
  },
  a11y.flatConfigs.recommended,
);
```

### Prettier — consistent formatting

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

Do not discuss formatting in code reviews. Prettier handles it.

---

## 11. Design Patterns

### Accepted patterns

| Pattern | When to use | Example in this codebase |
|---|---|---|
| **Custom hook** | Extract stateful logic reused across 2+ components | `useOrderSelection`, `useLocalStorage` |
| **Provider pattern (fatiado)** | Share UI state within a feature without prop drilling | `<OrdersProvider>` with sliced contexts for selection, filters, dialogs |
| **Compound component** | Related sub-components sharing implicit state via context | Radix UI Dialog, Tabs, Select — already used |
| **Composition via `children`** | Extend a component's content without touching its code (OCP) | `<Card><CardHeader>...</CardHeader></Card>` |
| **Factory via custom hook** | Create configured instances of generic behavior | `useOrdersQuery` = `useQuery` pre-configured for orders |
| **Render prop** | Share rendering logic when compound component is too heavy | Occasional — prefer slot/children first |

### Anti-patterns — prohibited

All of these patterns are present in the current codebase and documented in [`ARCHITECTURE.md §10`](./ARCHITECTURE.md#10-current-patterns-observable-facts). They serve as the migration baseline.

| Anti-pattern | Current example (ARCHITECTURE.md §10) | Fix |
|---|---|---|
| **God Hook** | `useOrdersPageController.ts` — ~50 return values | Split by domain (selection, filters, dialogs, mutations) |
| **God Component** | `NewCompany.tsx` — 905 lines | Extract sub-components and hooks (see ENGINEERING_STANDARDS.md size limits) |
| **Prop drilling > 2 levels** | `OrdersFilterBars` receives ~30 props from controller | Introduce context or move state to TanStack Query |
| **Ref as prop** | `useOrdersPageController` creates DOM refs and returns them | Component owns its refs; expose callbacks for measurements |
| **`any` on public contract** | `(supabase as any)` throughout `orders.service.ts` | Type every public interface with generated DB types |
| **Logic in JSX** | `disabled={activeStatus === 'emissao-nf' && nfBadgeFilter === 'processando'}` | Extract to `const isDisabled = condition;` or to a hook |
| **Duplicate insert/update blocks** | `NewCompany.tsx` lines 549–772: separate insert/update payloads | Extract `buildPayload(data, id?)` helper |
| **`alert()` in production code** | — | Use `toast` from `sonner` |
| **`console.log` in committed code** | 18 occurrences in `NewCompany.tsx` | Use `console.error` for real errors only; remove debug logs before commit |
| **Layout boilerplate duplication** | Every page re-renders `SidebarProvider + AppSidebar + GlobalHeader` | Introduce a shared `AppLayout` via React Router layout route (see `MIGRATION/03-layout-route.md`) |

---

## 12. Accessibility

- Use Radix UI primitives — they ship with correct ARIA semantics by default.
- Add `aria-label` / `aria-labelledby` when visual context is not sufficient for screen readers.
- Interactive elements must be reachable by keyboard (`Tab`, `Enter`, `Space`, `Escape`).
- Color alone must not convey information (use icon + color, or text + color).
- Use `eslint-plugin-jsx-a11y` (included in ESLint config above) to catch common issues.
- All images must have `alt` attributes. Decorative images use `alt=""`.
- Focus management after dialog close: return focus to the trigger element (Radix handles this automatically for its Dialog).

---

## 13. Git and PR Conventions

### Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

[optional body]

[optional footer: closes #issue]
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

Scope: feature name or file area (`orders`, `companies`, `auth`, `supabase`).

```
# ✅ Good commits
feat(orders): add server-side status filter to fetchOrders
fix(companies): handle null certificado_validade in parseToBR
refactor(orders): replace useOrdersPageController with domain hooks
test(orders): add contract test for fetchAllOrders
docs: add CONVENTIONS.md and TESTING.md

# ❌ Bad commits
fix bug
wip
update stuff
```

### PR requirements

Every PR that touches application code must include in its description:
- Link to the PRD or issue it implements.
- Tests added or updated (or explicit justification for why no tests were added).
- Manual test instructions for reviewers.

Every PR for a migration step (from `MIGRATION/*.md`) must:
- Be a single, reversible commit (`git revert <sha>` undoes it cleanly).
- Have all "Definition of Done" checkboxes from the PRD checked.
- Pass `npm run typecheck` and `npm run test` in CI.

---

## References

- [React 19 features](https://react.dev/blog/2024/12/05/react-19) — Actions, useActionState, useOptimistic, ref as prop, document metadata
- [React Compiler](https://react.dev/learn/react-compiler) — automatic memoization
- [Bulletproof React — project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature folder pattern
- [SOLID in React — Elvis Duru](https://elvisduru.com/blog/applying-solid-principles-in-react-a-practical-guide)
- [ISP with discriminated unions — Clean Code Guy](https://cleancodeguy.com/tr/blog/interface-segregation-principle)
- [TanStack Query docs](https://tanstack.com/query/latest)
- [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)
- [TypeScript strict flags 2026](https://oneuptime.com/blog/post/2026-01-15-strict-typescript-configuration-react/view)
- [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) — size limits, cycle rules (supersede this document on size)
