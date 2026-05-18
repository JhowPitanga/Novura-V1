# Novura — Testing Strategy

> **Forward-looking document.** Describes how tests should be written and what to prioritize. The current codebase has ~2 % file coverage (7 test files for 350 source files). This document defines the strategy for building up to a useful safety net incrementally.

---

## Table of Contents

1. [Philosophy — The Testing Trophy](#1-philosophy--the-testing-trophy)
2. [Tool Stack](#2-tool-stack)
3. [The Four Levels](#3-the-four-levels)
4. [Conventions](#4-conventions)
5. [MSW Setup](#5-msw-setup-mock-service-worker)
6. [Playwright Setup](#6-playwright-setup)
7. [Coverage](#7-coverage)
8. [CI Gates](#8-ci-gates)
9. [What Not to Test](#9-what-not-to-test)
10. [Priority Queue — What to Test First](#10-priority-queue--what-to-test-first)

---

## 1. Philosophy — The Testing Trophy

The classic test pyramid (many unit tests, some integration, few E2E) does not map well to React applications. This project follows the **Testing Trophy** model (Kent C. Dodds):

```
           ┌───────────┐
           │    E2E    │  ← few, slow, high confidence
           │  (money   │
           │  paths)   │
        ┌──┴───────────┴──┐
        │   Integration   │  ← most tests, medium speed
        │  (the big layer)│
      ┌─┴─────────────────┴─┐
      │        Unit          │  ← some, fast, pure logic only
    ┌─┴───────────────────────┴─┐
    │   Static (TS + ESLint)    │  ← the base — always on
    └───────────────────────────┘
```

**The key insight:** integration tests give the highest return on investment for frontend code. They test components together with their real hooks, real queries, and MSW-mocked API responses — asserting what the user actually sees, not how the code is structured internally.

### Core rules

1. **Test behavior, not implementation.** A test that breaks when you rename a variable is not a useful test. A test that breaks when a user action stops producing the correct output is.
2. **Do not mock internals.** Mock only at the network boundary, using MSW.
3. **Write tests. Not too many. Mostly integration.** (Kent C. Dodds)
4. **If a test is hard to write, the code is probably too coupled.** Difficulty writing tests is a design signal.

---

## 2. Tool Stack

| Purpose | Tool | Status |
|---|---|---|
| Unit + integration test runner | **Vitest** v4 | Installed |
| Component interaction | **React Testing Library** | To install |
| API mocking | **MSW** v2 | Installed |
| E2E browser testing | **Playwright** | To install |
| DOM environment | **jsdom** (via Vitest config) | To configure |

### Why these tools

- **Vitest** — Vite-native, 4-10x faster than Jest, same API. No duplicate build config.
- **MSW v2** — intercepts at the network layer (fetch/XHR), not the function call. Your components call the real `supabase` client; MSW intercepts the HTTP request before it leaves Node. This means the actual data-fetching code runs in tests.
- **Playwright** — multi-browser, reliable `storageState` for auth persistence, first-class TypeScript, no iframe restrictions. Standard for 2026.
- **React Testing Library** — queries the DOM the way a user would (by role, label text, display value), not by CSS classes or component internals.

### Dependencies to install

```bash
# Integration testing
npm install --save-dev @testing-library/react @testing-library/user-event @testing-library/jest-dom

# E2E
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium firefox
```

---

## 3. The Four Levels

### Level 1 — Static Analysis (always on)

**What:** TypeScript + ESLint catch bugs before tests run.
**Speed:** Instant (compile time).
**Confidence:** Catches type errors, unused code, rule violations, floating promises.

This is the base of the trophy. A codebase with `strict: true` and `@typescript-eslint/strict-type-checked` already prevents entire classes of runtime bugs.

Run on every save and in CI:
```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src/
```

**Real examples where static analysis would have caught bugs in this codebase** (see [`ARCHITECTURE.md §10`](./ARCHITECTURE.md#10-current-patterns-observable-facts)):
- `onNavigate={navigate}` in `OrdersFilterBars.tsx` (line 139) — `navigate` is not defined, caught by `no-undef`.
- `(supabase as any)` — caught by `@typescript-eslint/no-explicit-any`.
- Floating promises from unawaited `supabase` calls — caught by `@typescript-eslint/no-floating-promises`.

### Level 2 — Unit Tests

**What:** Test single pure functions or simple hooks in isolation. No DOM, no network, no Supabase.
**Speed:** Milliseconds each.
**When:** The function has complex branching logic with 5+ cases, or the function is called from many places and a bug would be hard to trace.

**Template:**

```typescript
// src/features/orders/utils.test.ts
import { describe, it, expect } from 'vitest';
import { isPedidoAtrasado, matchStatus, normStatus } from './utils';

describe('isPedidoAtrasado', () => {
  it('returns false for delivered orders', () => {
    const order = { shipmentStatus: 'delivered', internalStatus: 'shipped', shippingSla: null };
    expect(isPedidoAtrasado(order)).toBe(false);
  });

  it('returns true when SLA status is delayed', () => {
    const order = {
      shipmentStatus: 'pending',
      internalStatus: 'awaiting_pickup',
      shippingSla: { status: 'delayed', expectedDate: null },
    };
    expect(isPedidoAtrasado(order)).toBe(true);
  });

  it('returns true when expectedDate is in the past', () => {
    const order = {
      shipmentStatus: 'pending',
      internalStatus: 'awaiting_pickup',
      shippingSla: { status: 'ok', expectedDate: '2024-01-01T00:00:00Z' },
    };
    expect(isPedidoAtrasado(order)).toBe(true);
  });

  it('returns false for cancelled orders even with past SLA', () => {
    const order = {
      shipmentStatus: 'pending',
      internalStatus: 'cancelled',
      shippingSla: { status: 'delayed', expectedDate: '2024-01-01T00:00:00Z' },
    };
    expect(isPedidoAtrasado(order)).toBe(false);
  });
});
```

**What unit tests cover in this codebase (priority order):**

| Function | File | Why |
|---|---|---|
| `isValidCNPJ` | `src/pages/NewCompany.tsx` | 14-digit algorithm with edge cases |
| `getCnpjBlockInfo` | `src/pages/NewCompany.tsx` | Regex rules for CNPJ situation blocking |
| `isPedidoAtrasado` | `src/hooks/useOrdersPageController.ts` | 8+ conditions, business rule |
| `matchStatus` / `normStatus` | `src/hooks/useOrderFiltering.ts` | Status mapping used everywhere |
| `parseOrderRow` | `src/services/orders.service.ts` | DB → domain model, many fields |
| `normalizeTipoEmpresa` | `src/pages/NewCompany.tsx` | Has a latent bug (`matríZ` never matches) |
| `normalizeTributacao` | `src/pages/NewCompany.tsx` | Silent fallback to 'Simples Nacional' |
| `ddmmyyyyToISO` | `src/pages/NewCompany.tsx` | Date format conversion |
| `buildFinancials` | `src/services/orders.service.ts` | Financial calculations |

### Level 3 — Integration Tests (the biggest layer)

**What:** Mount a component (or hook) with its real dependencies — real custom hooks, real TanStack Query setup, MSW intercepting the Supabase REST API. Assert on what the user sees.
**Speed:** 50–500ms each.
**When:** Testing a user-facing feature slice: "the filter bar updates the list when the user changes the status".

**Setup — Vitest + RTL + MSW:**

```typescript
// src/testing/setup.ts (add to vitest.config.ts setupFiles)
import '@testing-library/jest-dom';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// src/testing/server.ts
import { setupServer } from 'msw/node';
import { orderHandlers } from '@/features/orders/api/mocks';
import { companyHandlers } from '@/features/companies/api/mocks';

export const server = setupServer(...orderHandlers, ...companyHandlers);

// src/testing/render.tsx — custom render with providers
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

export function renderWithProviders(ui: React.ReactElement, { route = '/' } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}
```

**MSW handlers matching PostgREST URL pattern:**

```typescript
// src/features/orders/api/mocks.ts
import { http, HttpResponse } from 'msw';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321';

export const orderHandlers = [
  http.get(`${SUPABASE_URL}/rest/v1/orders`, ({ request }) => {
    const url = new URL(request.url);
    const orgId = url.searchParams.get('organization_id');
    if (!orgId) return HttpResponse.json({ error: 'Missing org' }, { status: 400 });
    return HttpResponse.json(mockOrders);
  }),
  http.get(`${SUPABASE_URL}/rest/v1/orders`, ({ request }) => {
    // Single order (detail)
    const url = new URL(request.url);
    if (url.searchParams.has('id')) {
      return HttpResponse.json(mockOrders[0]);
    }
  }),
];
```

**Integration test example — contract test for fetchAllOrders:**

```typescript
// src/features/orders/api/service.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrdersQuery } from './queries';
import { renderWithProviders } from '@/testing/render';

describe('useOrdersQuery', () => {
  it('returns paginated orders for org', async () => {
    const { result } = renderHook(
      () => useOrdersQuery({ orgId: 'org-1', page: 1, pageSize: 20 }),
      { wrapper: renderWithProviders }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.rows).toHaveLength(2);
    expect(result.current.data?.rows[0]).toMatchObject({
      id: expect.any(String),
      status: expect.any(String),
      items: expect.arrayContaining([expect.objectContaining({ sku: expect.any(String) })]),
    });
  });

  it('does not fetch when orgId is null', () => {
    const { result } = renderHook(
      () => useOrdersQuery({ orgId: null, page: 1, pageSize: 20 }),
      { wrapper: renderWithProviders }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });
});
```

**Integration test example — component interaction:**

```typescript
// src/features/orders/components/OrdersFilterBars.test.tsx
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/testing/render';
import { NfeFilterBar } from './NfeFilterBar';

describe('NfeFilterBar', () => {
  it('emits selected orders when the "Emitir selecionados" button is clicked', async () => {
    const onSelectedEmit = vi.fn();
    renderWithProviders(
      <NfeFilterBar
        status="emissao-nf"
        nfBadgeFilter="emitir"
        selectedIds={['order-1', 'order-2']}
        onSelectedEmit={onSelectedEmit}
        // ... other required props
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /emitir selecionados/i }));
    expect(onSelectedEmit).toHaveBeenCalledWith(['order-1', 'order-2']);
  });
});
```

**Service contract test — survives refactors:**

The contract test below describes what `fetchAllOrders` *must* return, regardless of how it is implemented internally. It survives a migration from `useEffect` to TanStack Query:

```typescript
// src/features/orders/api/service.test.ts
import { fetchAllOrders } from './service';
import { server } from '@/testing/server';
import { http, HttpResponse } from 'msw';

it('normalizes DB row to Order domain type', async () => {
  server.use(
    http.get('*/rest/v1/orders', () =>
      HttpResponse.json([{
        id: 'ord-1',
        status: 'invoice_pending',
        order_items: [{ id: 'item-1', sku: 'SKU-123', title: 'Produto X', quantity: 2 }],
        order_shipping: [{ status: 'pending', sla_expected_date: '2026-06-01' }],
        order_labels: [],
      }])
    )
  );

  const orders = await fetchAllOrders('org-1');
  expect(orders[0]).toMatchObject({
    id: 'ord-1',
    internalStatus: 'invoice_pending',
    items: [expect.objectContaining({ sku: 'SKU-123', quantity: 2 })],
    shippingSla: expect.objectContaining({ expectedDate: '2026-06-01' }),
  });
});
```

### Level 4 — E2E Tests (Playwright, targeted)

**What:** A real browser against the running app. Tests user journeys that cross multiple pages or require real auth.
**Speed:** 10–60 seconds each.
**How many:** 5–7 "money paths" — flows that, if broken, mean users cannot use the core product.

**Novura money paths (E2E coverage targets):**

| # | Flow | Why critical |
|---|---|---|
| 1 | Login → see orders list | Auth + main data load; most common entry point |
| 2 | Filter orders by "Emissão NF" → count matches badge | Core business flow |
| 3 | Emit NF-e in homologação → status changes to authorized | The primary revenue action |
| 4 | Create company (NewCompany 4-step form) → appears in settings | Onboarding gate |
| 5 | Link order to product (vincular) → order moves to "Impressão" | Second most common daily action |
| 6 | Sync ML orders → new orders appear | External integration |
| 7 | Login with an invited user (invite flow) | User acquisition flow |

**Auth persistence with `storageState`:**

```typescript
// playwright/global-setup.ts
import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // Authenticate once using Supabase test credentials
  await page.goto(process.env.BASE_URL + '/auth');
  await page.fill('[name="email"]', process.env.TEST_USER_EMAIL!);
  await page.fill('[name="password"]', process.env.TEST_USER_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
  await browser.close();
}
export default globalSetup;

// playwright/fixtures.ts
import { test as base } from '@playwright/test';
export const test = base.extend({
  page: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: 'playwright/.auth/user.json' });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },
});
```

**E2E test example:**

```typescript
// playwright/tests/orders.spec.ts
import { test, expect } from '../fixtures';

test('filter by emissao-nf and emit a note', async ({ page }) => {
  await page.goto('/pedidos');
  await expect(page.getByRole('heading', { name: /pedidos/i })).toBeVisible();

  // Click the "Emissão NF" status card
  await page.getByTestId('status-card-emissao-nf').click();
  await expect(page).toHaveURL(/emissao_nfe/);

  // Select first order and emit
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: /emitir selecionados/i }).click();

  // Verify status changes (optimistic or after poll)
  await expect(page.getByText(/autorizad/i)).toBeVisible({ timeout: 10_000 });
});
```

---

## 4. Conventions

### Co-location

Tests live next to the file they test, following the feature folder structure defined in [`CONVENTIONS.md §4`](./CONVENTIONS.md#4-feature-folder-structure):

```
src/features/orders/
├── api/
│   ├── service.ts
│   ├── service.test.ts        ← test next to source
│   ├── queries.ts
│   └── queries.test.ts
├── utils.ts
└── utils.test.ts
```

**Exception:** Playwright E2E tests live in `playwright/tests/` because they run against the full app, not a module.

### Selectors — prefer semantic queries

```typescript
// ❌ Brittle — breaks on CSS/class renames
screen.getByClassName('order-row-active');
screen.getByTestId('btn-emit');

// ✅ Semantic — mirrors how users find elements
screen.getByRole('button', { name: /emitir nota/i });
screen.getByLabelText(/senha do certificado/i);
screen.getByText('Empresa cadastrada com sucesso');
```

Use `data-testid` only when no semantic selector is available (e.g., custom canvas elements, complex table cells with no accessible text).

### No snapshot tests

Snapshot tests break on any markup change (including formatting) and get habitually "updated" without review. They provide false confidence.

```typescript
// ❌ Do not use
expect(container).toMatchSnapshot();

// ✅ Assert on behavior
expect(screen.getByRole('button', { name: /emitir/i })).toBeDisabled();
```

### No internal mocking

```typescript
// ❌ Mocking internal implementation — test is coupled to code structure
vi.mock('@/services/orders.service', () => ({
  fetchAllOrders: vi.fn().mockResolvedValue([mockOrder]),
}));

// ✅ Mock at the network boundary via MSW — implementation can change freely
server.use(http.get('*/rest/v1/orders', () => HttpResponse.json([mockOrder])));
```

Exception: third-party libraries with no HTTP interface (e.g., `node-forge` for certificate parsing) may be mocked directly.

### Async — always await properly

```typescript
// ❌ Missing await — test passes even when assertion is wrong
fireEvent.click(button);
expect(screen.getByText('Salvo!')).toBeInTheDocument();

// ✅ Wait for the DOM update
await userEvent.click(button);
await screen.findByText('Salvo!');          // findBy waits up to 1000ms
// or
await waitFor(() => expect(screen.getByText('Salvo!')).toBeInTheDocument());
```

---

## 5. MSW Setup (Mock Service Worker)

MSW v2 is already installed. Configuration needed:

### vitest.config.ts — add jsdom and setup file

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      exclude: ['node_modules/', 'src/testing/', 'src/integrations/supabase/types.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### Handler structure by feature

```
src/
├── testing/
│   ├── setup.ts           # beforeAll/afterEach/afterAll
│   ├── server.ts          # central MSW server (imports all handlers)
│   ├── render.tsx         # renderWithProviders utility
│   └── factories/         # test data factories
│       ├── order.factory.ts
│       └── company.factory.ts
├── features/
│   └── orders/
│       └── api/
│           └── mocks.ts   # MSW handlers for the orders feature
```

### Supabase PostgREST URL pattern

PostgREST generates URLs in the format:
```
GET  /rest/v1/<table>?select=...&organization_id=eq.<id>&order=created_at.desc.nullslast
POST /rest/v1/<table>
PATCH /rest/v1/<table>?id=eq.<id>
```

RPC calls:
```
POST /rest/v1/rpc/<function_name>
```

Edge Function calls:
```
POST /functions/v1/<function_name>
```

Match the right pattern in your handler to avoid silent mismatches.

### Factory pattern for test data

```typescript
// src/testing/factories/order.factory.ts
import type { Order } from '@/features/orders/types';

let idCounter = 0;
export function makeOrder(overrides: Partial<Order> = {}): Order {
  idCounter++;
  return {
    id: `order-${idCounter}`,
    status: 'invoice_pending',
    buyerName: 'João Silva',
    marketplace: 'Mercado Livre',
    items: [makeOrderItem()],
    shippingSla: { status: 'ok', expectedDate: null, service: null, lastUpdated: null },
    ...overrides,
  };
}
```

---

## 6. Playwright Setup

### playwright.config.ts

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './playwright/tests',
  globalSetup: './playwright/global-setup.ts',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

### Environment variables for E2E

```
# .env.test (do not commit)
TEST_USER_EMAIL=test-e2e@novura.com.br
TEST_USER_PASSWORD=<supabase-test-password>
BASE_URL=http://localhost:5173
```

Create a dedicated Supabase test organization for E2E — never run E2E against production data.

### Directory structure

```
playwright/
├── global-setup.ts       # auth persistence
├── fixtures.ts           # authenticated test fixture
├── .auth/
│   └── user.json         # generated by globalSetup (gitignored)
└── tests/
    ├── auth.spec.ts
    ├── orders.spec.ts
    ├── companies.spec.ts
    ├── nfe.spec.ts
    └── listings.spec.ts
```

---

## 7. Coverage

### Current state

7 test files covering ~2 % of source files. Coverage CI gate: **none**.

### Target state — incremental

| Phase | When | Coverage target | Gate |
|---|---|---|---|
| Now | Start writing tests | 0 % (no gate) | None |
| After Priority Queue (section 10) | 2–4 weeks | 20–30 % | `npm run test:coverage` must not error |
| After first feature migration | Per-feature: 60 % | Gate on new files only |
| Long term | — | 50–70 % total | Gate on regression (coverage must not drop) |

**Do not target 80–90 % overall.** High coverage targets create incentives to write shallow tests for UI boilerplate that has no business logic. Coverage of utility functions and service contracts should be high (80 %+). Coverage of page components can be low (covered implicitly by E2E).

### Running coverage

```bash
# Already configured in package.json
npm run test:coverage

# View HTML report
open coverage/index.html
```

---

## 8. CI Gates

### On every push (fast feedback, < 2 min)

```yaml
# .github/workflows/ci.yml (to create)
- name: Type check
  run: npm run typecheck

- name: Lint
  run: npm run lint

- name: Unit + Integration tests
  run: npm run test:run    # vitest run (no watch)
```

### On pull requests (full validation, < 5 min)

```yaml
- name: Unit + Integration tests + coverage
  run: npm run test:coverage

- name: E2E tests (smoke only)
  run: npx playwright test --project=chromium
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
    TEST_USER_EMAIL: ${{ secrets.E2E_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.E2E_PASSWORD }}
```

### Before deploy to production

```yaml
- name: E2E full suite (chromium + firefox)
  run: npx playwright test
```

---

## 9. What Not to Test

Do not write tests for:

| What | Why |
|---|---|
| shadcn/Radix UI components in isolation | Third-party library, already tested by its authors |
| A `<Button>` with a `disabled` prop | Covered implicitly by integration tests |
| Snapshot tests of any component | See section 4 — they break constantly and are updated blindly |
| CSS class presence | Tests implementation, not behavior; breaks on Tailwind changes |
| `console.log` was called | Not user-visible behavior |
| Vitest configuration itself | Not application code |
| Generated Supabase types | Auto-generated, not authored |
| The `updateEmpresaData` helper in `NewCompany.tsx` | `(data) => ({ ...prev, ...data })` — too simple to test |

The guiding question: **"If this test failed, would I know something important broke?"** If not, do not write it.

---

## 10. Priority Queue — What to Test First

This is the order in which tests add the most safety relative to the migration effort, given the current state of the codebase.

> The functions and bugs listed below are documented in [`ARCHITECTURE.md §7`](./ARCHITECTURE.md#7-feature-inventory) (feature inventory) and [`ARCHITECTURE.md §10`](./ARCHITECTURE.md#10-current-patterns-observable-facts) (observed patterns). The naming conventions for test files follow [`CONVENTIONS.md §9`](./CONVENTIONS.md#9-naming-and-language).

### Phase 1 — Business logic helpers (1–2 days, high ROI)

These are pure functions with complex logic. Test them first because:
- They are easy to test (no DOM, no Supabase).
- They contain the most dangerous bugs (financial, fiscal, status logic).
- They survive any architectural refactor.

| Function | Location | Priority |
|---|---|---|
| `isValidCNPJ` | `src/pages/NewCompany.tsx` | P0 — gateway to empresa creation |
| `getCnpjBlockInfo` | `src/pages/NewCompany.tsx` | P0 — business blocking rule |
| `normalizeTipoEmpresa` | `src/pages/NewCompany.tsx` | P0 — has a latent bug (`'matríZ'` never matches) |
| `normalizeTributacao` | `src/pages/NewCompany.tsx` | P1 — silent fallback to wrong value |
| `isPedidoAtrasado` | `src/hooks/useOrdersPageController.ts` | P0 — drives delay UI in status blocks |
| `matchStatus` / `normStatus` | `src/hooks/useOrderFiltering.ts` | P0 — drives every status badge count |
| `parseOrderRow` | `src/services/orders.service.ts` | P1 — DB → domain model for all orders |
| `ddmmyyyyToISO` | `src/pages/NewCompany.tsx` | P1 — date format used in NF-e emission |
| `buildFinancials` / `toOrderFinancialInfo` | `src/services/orders.service.ts` | P1 — financial display |
| `isAbortLikeError` | `src/utils/orderUtils.ts` | P2 — error handling heuristic |

### Phase 2 — Service contracts (2–3 days, medium ROI)

Write MSW handlers + contract tests for service functions. These tests survive refactors to TanStack Query because they test the *contract* (input → output), not the fetching mechanism.

| Service function | Location | What to assert |
|---|---|---|
| `fetchAllOrders` | `src/services/orders.service.ts` | Returns `Order[]` with nested `items` and `shippingSla`; handles empty result |
| `fetchOrderById` | `src/services/orders.service.ts` | Returns single `Order`; throws on not-found |
| `resolveOrgId` | `src/services/orders.service.ts` | Returns string on success; returns null on error |
| `getCompanyIdForOrg` | `src/services/orders.service.ts` | Returns company id or null |
| `fetchAllOrders` (error path) | `src/services/orders.service.ts` | Throws with meaningful message on Supabase error |

### Phase 3 — E2E smoke (2–3 days, highest confidence)

Set up Playwright with the 5 money paths from section 3, Level 4. This alone gives more protection than 200 unit tests for the happy path:

1. Login → dashboard
2. View orders list → filter by "Emissão NF"
3. Emit NF-e (homologação) → authorized status
4. Create company (4 steps) → visible in settings
5. Vincular pedido → moves to "Impressão"

### Phase 4 — Integration per feature (ongoing, as features migrate)

As each feature migrates to `features/<name>/` structure, add integration tests for that feature's main page interaction. Tests are written *before* the migration PR (contract tests) and expanded *in* the migration PR.

---

## References

- [The Testing Trophy — Kent C. Dodds](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
- [Write tests. Not too many. Mostly integration. — Kent C. Dodds](https://kentcdodds.com/blog/write-tests)
- [React Testing Library docs](https://testing-library.com/docs/react-testing-library/intro/)
- [MSW v2 docs](https://mswjs.io/docs/)
- [Playwright docs](https://playwright.dev/docs/intro)
- [Vitest docs](https://vitest.dev/guide/)
- [React Testing Strategy 2026 — softaims.com](http://softaims.com/blog/react-testing-strategy-vitest-playwright-2026)
