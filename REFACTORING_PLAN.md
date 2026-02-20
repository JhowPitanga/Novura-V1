# Novura ERP Frontend Refactoring Plan

## Context

The Novura frontend has significant technical debt: 15+ hooks using `useState`/`useEffect` instead of TanStack Query (installed but unused), zero test infrastructure, no service layer, god pages (Orders: 4,145 LOC, Listings: 2,137 LOC, Invoices: 1,235 LOC), and Portuguese file/class names throughout. This plan refactors in 7 independently-deployable phases using TDD. **No visual/CSS changes** — only React code structure, data flow, architecture, and naming.

## Naming Convention

**All code in English, all user-facing text stays in Portuguese (pt-BR).**

- File names, component names, function names, variable names, type/interface names → English
- UI labels, toasts, error messages, placeholder text → Portuguese (unchanged)
- URL routes in `App.tsx` → unchanged (avoid breaking bookmarks/links)

---

## Complete Renaming Map

### Pages (`src/pages/`)

| Current | New |
|---------|-----|
| `Pedidos.tsx` | `Orders.tsx` |
| `Anuncios.tsx` | `Listings.tsx` |
| `AnunciosCriarML.tsx` | `CreateListingML.tsx` |
| `AnunciosEditarML.tsx` | `EditListingML.tsx` |
| `NotasFiscais.tsx` | `Invoices.tsx` |
| `Estoque.tsx` | `Inventory.tsx` |
| `Produtos.tsx` | `Products.tsx` |
| `Desempenho.tsx` | `Performance.tsx` |
| `Equipe.tsx` | `Team.tsx` |
| `Comunidade.tsx` | `Community.tsx` |
| `PesquisaMercado.tsx` | `MarketResearch.tsx` |
| `RecursosSeller.tsx` | `SellerResources.tsx` |
| `Aplicativos.tsx` | `Apps.tsx` |
| `Configuracoes.tsx` | `Settings.tsx` |
| `NovaEmpresa.tsx` | `NewCompany.tsx` |
| `ConviteAceito.tsx` | `InviteAccepted.tsx` |
| `SAC.tsx` | `CustomerService.tsx` |
| `Index.tsx` | `Dashboard.tsx` |

Pages that stay: `Auth.tsx`, `Landing.tsx`, `Login.tsx`, `NotFound.tsx`, `ProductDetailsPage.tsx`, `NovuraAcademy.tsx`, `NovuraAdmin.tsx`, `MercadoLivreCallback.tsx`, `ShopeeCallback.tsx`

### Component directories (`src/components/`)

| Current | New |
|---------|-----|
| `pedidos/` | `orders/` |
| `estoque/` | `inventory/` |
| `equipe/` | `team/` |
| `configuracoes/` | `settings/` |
| `comunidade/` | `community/` |
| `pesquisa-mercado/` | `market-research/` |
| `produtos/` | delete (old tree → merge live files into `products/`) |
| `recursos/` | `seller-resources/` |

Stays: `products/`, `ui/`

### Component files

**`pedidos/` → `orders/`**
| Current | New |
|---------|-----|
| `VincularPedidoModal.tsx` | `LinkOrderModal.tsx` |
| `PedidoDetails.tsx` | `OrderDetails.tsx` |
| `PedidoDetailsDrawer.tsx` | `OrderDetailsDrawer.tsx` |
| `ImpressaoLista.tsx` | `PrintList.tsx` |
| `NfeEmitirLista.tsx` | `NfeEmissionList.tsx` |
| `Paginacao.tsx` | `Pagination.tsx` |
| `ConfiguracoesImpressaoModal.tsx` | `PrintSettingsModal.tsx` |

Stays: `PrintConfigModal.tsx`, `PrintSettings.tsx`, `ScannerModal.tsx`

**`estoque/` → `inventory/`**
| Current | New |
|---------|-----|
| `EstoqueFilters.tsx` | `InventoryFilters.tsx` |
| `EstoqueManagementDrawer.tsx` | `InventoryManagementDrawer.tsx` |
| `EstoqueStats.tsx` | `InventoryStats.tsx` |
| `tabs/EstoqueTab.tsx` | `tabs/StockTab.tsx` |
| `tabs/ExpedicaoTab.tsx` | `tabs/ShippingTab.tsx` |
| `tabs/InventarioTab.tsx` | `tabs/StockCountTab.tsx` |
| `tabs/RecebimentoTab.tsx` | `tabs/ReceivingTab.tsx` |

Stays: `StorageManagementDrawer.tsx`, `tabs/FulfillmentTab.tsx`, `tabs/PickingTab.tsx`

**`configuracoes/` → `settings/`**
| Current | New |
|---------|-----|
| `ConfiguracoesFiscais.tsx` | `FiscalSettings.tsx` |
| `ConfiguracoesPessoais.tsx` | `PersonalSettings.tsx` |
| `ConfiguracoesUsuarios.tsx` | `UserSettings.tsx` |
| `empresa/EmpresaStep1-4.tsx` | `company/CompanyStep1-4.tsx` |
| `impostos/AdicionarImpostoModal.tsx` | `taxes/AddTaxModal.tsx` |

Stays: `AddUserModal.tsx`, `EditPermissionsModal.tsx`, `UserProfileDrawer.tsx`

**`comunidade/` → `community/`**
| Current | New |
|---------|-----|
| `EventosTab.tsx` | `EventsTab.tsx` |
| `GruposTab.tsx` | `GroupsTab.tsx` |
| `PerfilTab.tsx` | `ProfileTab.tsx` |

Stays: `ComposerModal.tsx`, `FeedTab.tsx`, `PostCard.tsx`, `ProfilePage.tsx`, `types.ts`

**`pesquisa-mercado/` → `market-research/`**
| Current | New |
|---------|-----|
| `BuscarCategoriasTab.tsx` | `SearchCategoriesTab.tsx` |
| `PalavrasChaveTab.tsx` | `KeywordsTab.tsx` |
| `ProdutoTab.tsx` | `ProductTab.tsx` |

### Types, logic, utils

| Current | New |
|---------|-----|
| `src/types/estoque.ts` | `src/types/inventory.ts` |
| `src/types/Pedidos/index.ts` | `src/types/orders.ts` (flatten directory) |
| `src/logic/Pedidos/functions.ts` | `src/logic/orders/functions.ts` |
| `src/utils/estoqueUtils.tsx` | `src/utils/inventoryUtils.tsx` |
| `src/data/estoqueData.ts` | `src/data/inventoryData.ts` |

Stays: `src/types/products.ts`, all hooks (already English)

### Lazy imports in App.tsx

Update all `lazy(() => import(...))` references to match new file names. URL paths (e.g., `/pedidos`, `/anuncios`) remain unchanged.

---

## Phase 0: Test Infrastructure & Foundation

**Goal**: Set up testing pipeline, service layer scaffolding, shared utilities.

### 0.1 Install testing dependencies
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw
```

### 0.2 Create `vitest.config.ts`
- Extend from `vite.config.ts` alias (`@/` → `./src/`)
- Environment: `jsdom`, globals: `true`
- Setup file: `src/test/setup.ts`
- Coverage on `src/services/**` and `src/hooks/**`

### 0.3 Create test utilities (`src/test/`)
| File | Purpose |
|------|---------|
| `setup.ts` | `@testing-library/jest-dom`, cleanup, MSW server lifecycle |
| `test-utils.tsx` | Custom `renderWithProviders()` wrapping QueryClient + AuthProvider mock |
| `mocks/supabase.ts` | Mock factory for supabase client (from/rpc/auth/channel) |
| `mocks/server.ts` | MSW server instance |
| `mocks/handlers.ts` | Default MSW handlers |

### 0.4 Create service layer scaffolding
| File | Purpose |
|------|---------|
| `src/services/query-keys.ts` | Centralized query key factory for all modules |
| `src/services/supabase-helpers.ts` | Shared `getCompanyIdForOrg()` (currently duplicated in 8+ files) |

### 0.5 Configure QueryClient defaults
Modify `src/App.tsx` line 43:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

### 0.6 Add test scripts to `package.json`
```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```

### 0.7 Rename pages + update App.tsx lazy imports
Rename all pages per the renaming map above. Update `src/App.tsx` lazy imports:
```typescript
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Performance = lazy(() => import("./pages/Performance"));
const MarketResearch = lazy(() => import("./pages/MarketResearch"));
const Products = lazy(() => import("./pages/Products"));
const Listings = lazy(() => import("./pages/Listings"));
const CreateListingML = lazy(() => import("./pages/CreateListingML"));
const EditListingML = lazy(() => import("./pages/EditListingML"));
const SellerResources = lazy(() => import("./pages/SellerResources"));
const Apps = lazy(() => import("./pages/Apps"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Orders = lazy(() => import("./pages/Orders"));
const Team = lazy(() => import("./pages/Team"));
const Community = lazy(() => import("./pages/Community"));
const Settings = lazy(() => import("./pages/Settings"));
const NewCompany = lazy(() => import("./pages/NewCompany"));
const CustomerService = lazy(() => import("./pages/CustomerService"));
const InviteAccepted = lazy(() => import("./pages/InviteAccepted"));
// These stay unchanged:
// NovuraAcademy, NovuraAdmin, Auth, Landing, Login, NotFound,
// ProductDetailsPage, MercadoLivreCallback, ShopeeCallback
```

URL paths (`/pedidos`, `/anuncios`, `/estoque`, etc.) remain unchanged — only file references change.

**Verification**: `npm test` runs cleanly with 0 tests, `npm run build` succeeds.

---

## Phase 1: Auth & Permissions

**Goal**: Refactor the foundational system every protected module depends on.

### Files involved
- `src/hooks/useAuth.tsx` (391 lines) — 7 useState calls, inline RPC, 5-min cache, real-time
- `src/hooks/usePermissions.tsx` (202 lines) — 3 near-identical functions (~40 lines each)
- `src/components/ProtectedRoute.tsx` (43 lines) — clean, no changes needed
- `src/components/RestrictedRoute.tsx` (29 lines) — clean, no changes needed

### TDD: Write tests first
- `src/services/__tests__/auth.service.test.ts` — test `loadAccessContext()`, cache behavior, `ensureEditorRecord()`, `ensurePublicUserRecord()`
- `src/hooks/__tests__/usePermissions.test.ts` — test all permission check scenarios: owner bypass, superadmin bypass, module switch disabled, boolean/object/array permission formats

### Refactor
1. **Extract `src/services/auth.service.ts`** — move RPC calls, cache logic, and helper functions out of the React context
2. **Refactor `usePermissions.tsx`** — unify the 3 duplicated functions (`hasPermission`, `hasModuleAccess`, `hasAnyPermission`) into a single internal `resolvePermission()` resolver. Target: ~100 lines (from 202)
3. **Simplify `useAuth.tsx`** — consolidate 7 `useState` calls into one `AuthState` object, extract `resetAuthState()` helper for the 3x-repeated logout reset. Target: ~250 lines (from 391)

**Verification**: All auth/permission tests pass, `npm run build` succeeds, login/logout/route-guard behavior unchanged.

---

## Phase 2: Simple Independent Modules

**Goal**: Practice the service + TanStack Query pattern on the easiest modules.

### Modules & renames
| Page (new name) | Component dir rename | Component file renames |
|---|---|---|
| `Community.tsx` | `comunidade/` → `community/` | `EventosTab` → `EventsTab`, `GruposTab` → `GroupsTab`, `PerfilTab` → `ProfileTab` |
| `MarketResearch.tsx` | `pesquisa-mercado/` → `market-research/` | `BuscarCategoriasTab` → `SearchCategoriesTab`, `PalavrasChaveTab` → `KeywordsTab`, `ProdutoTab` → `ProductTab` |
| `SellerResources.tsx` | `recursos/` → `seller-resources/` | All already English |

### TDD + Refactor
1. Rename files/directories per table above, update all imports
2. Audit each module's components for direct `supabase.from()` calls
3. Write characterization tests for any data-fetching components
4. Extract Supabase calls to `src/services/<module>.service.ts` where found
5. Wrap in TanStack Query hooks where applicable

**Verification**: Tests pass, `npm run build` succeeds, pages render identically.

---

## Phase 3: Medium Complexity Modules

### 3A: Inventory (best-structured — reference implementation)

**Renames**:
- `src/pages/Inventory.tsx` (already renamed in Phase 0)
- `src/components/estoque/` → `src/components/inventory/`
- Files: `EstoqueFilters` → `InventoryFilters`, `EstoqueManagementDrawer` → `InventoryManagementDrawer`, `EstoqueStats` → `InventoryStats`, `EstoqueTab` → `StockTab`, `ExpedicaoTab` → `ShippingTab`, `InventarioTab` → `StockCountTab`, `RecebimentoTab` → `ReceivingTab`
- `src/types/estoque.ts` → `src/types/inventory.ts`
- `src/utils/estoqueUtils.tsx` → `src/utils/inventoryUtils.tsx`
- `src/data/estoqueData.ts` → `src/data/inventoryData.ts`

**Files**: `src/hooks/useStockData.ts` (213 lines), `src/hooks/useStorage.ts` (59 lines)

1. **Tests**: `src/services/__tests__/inventory.service.test.ts`
2. **Rename** all files/directories per above, update all imports
3. **Extract `src/services/inventory.service.ts`** — move `fetchProductsWithDetailedStock()` (already standalone at line 59 of `useStockData.ts`) and `fetchStorageLocations()`
4. **Migrate `useStockData.ts` and `useStorage.ts`** to TanStack Query (`useQuery`)
5. **Replace `useProductSync.ts`** (52 lines) — swap `lastUpdate` counter with `queryClient.invalidateQueries()` from real-time channel

### 3B: Team

**Renames**:
- `src/pages/Team.tsx` (already renamed in Phase 0)
- `src/components/equipe/` → `src/components/team/`
- Component files already have English names

**Files**: `src/hooks/useChat.ts` (468 lines), `src/components/team/` (1,935 LOC, 8 files)

1. **Tests**: `src/services/__tests__/chat.service.test.ts`, `src/hooks/__tests__/useChat.test.ts`
2. **Rename** directory, update imports
3. **Extract `src/services/chat.service.ts`** — channel CRUD, message ops, member search
4. **Migrate `useChat.ts`** to TanStack Query — `useChatChannels`, `useChannelMessages`, `useOrgMemberSearch` with `useMutation` for writes. Real-time uses `queryClient.setQueryData` for optimistic inserts
5. **Break `Team.tsx`** (1,016 lines) — extract gamification tab into `src/components/team/GamificationTab.tsx`

### 3C: Settings

**Renames**:
- `src/pages/Settings.tsx` (already renamed in Phase 0)
- `src/components/configuracoes/` → `src/components/settings/`
- Files: `ConfiguracoesFiscais` → `FiscalSettings`, `ConfiguracoesPessoais` → `PersonalSettings`, `ConfiguracoesUsuarios` → `UserSettings`, `empresa/` → `company/`, `EmpresaStep*` → `CompanyStep*`, `impostos/` → `taxes/`, `AdicionarImpostoModal` → `AddTaxModal`

1. **Tests**: `src/services/__tests__/settings.service.test.ts`
2. **Rename** all files/directories per above, update imports
3. **Extract `src/services/settings.service.ts`** — org members CRUD, invitation flow, fiscal config, permissions updates
4. **Break `AddTaxModal.tsx`** (884 lines) — split into form sections

**Verification**: All tests pass, `npm run build` succeeds, all 3 modules render identically.

---

## Phase 4: Products & Invoices

### 4A: Product Ecosystem

**Files**:
- Hooks: `useProducts.ts` (207), `useCategories.ts` (157), `useKits.ts` (254), `useVariations.ts` (201), `useProductForm.ts` (705)
- Old tree: `src/components/produtos/` (2,488 LOC) — including `EditarProduto.tsx` (1,017 lines)
- New tree: `src/components/products/` (1,800 LOC)
- Types: `src/types/products.ts` (75 lines)

**Renames**:
- Delete `src/components/produtos/` (old tree), migrate live files into `src/components/products/`
- `EditarProduto.tsx` → broken into English-named components in `products/`

1. **Tests**: `src/services/__tests__/products.service.test.ts`, `categories.service.test.ts`, `kits.service.test.ts`, `variations.service.test.ts`
2. **Create services**: `products.service.ts`, `categories.service.ts`, `kits.service.ts`, `variations.service.ts`
3. **Migrate hooks** to TanStack Query (`useQuery` + `useMutation` with `invalidateQueries`)
4. **Split `useProductForm.ts`** (705 lines) — extract 20+ Supabase calls to `product-form.service.ts`, keep only form state. Target: ~200 lines
5. **Resolve dual trees** — `src/components/products/` is canonical, migrate remaining live files from `produtos/`, delete `produtos/`
6. **Break `EditarProduto.tsx`** (1,017 lines) into: `EditProductPage.tsx` (~100), `EditProductForm.tsx` (~200), `EditProductImages.tsx` (~150), `EditProductStock.tsx` (~150), `EditProductFiscal.tsx` (~150), `useEditProduct.ts` (TanStack Query hook)

### 4B: Invoices

**Renames**:
- `src/pages/Invoices.tsx` (already renamed in Phase 0)
- Create `src/components/invoices/` (new — currently no subcomponents exist)

**Files**: `src/pages/Invoices.tsx` (1,235 lines — god page, no subcomponents)

1. **Tests**: `src/services/__tests__/invoices.service.test.ts`
2. **Extract `src/services/invoices.service.ts`** — nota fetching, NFe emission, XML upload
3. **Extract `src/utils/nfeUtils.ts`** — move inline helpers `extractXmlMeta`, `extractXmlTotal`, `normalizeTipo`, `normalizeFocusUrl` (currently at lines 19-75)
4. **Break page** into `src/components/invoices/`: `InvoiceListPage.tsx`, `InvoiceTable.tsx`, `UploadXmlModal.tsx`, `InvoiceDetailDrawer.tsx`, `InvoiceFilters.tsx` (all <200 lines)

**Verification**: All tests pass, `npm run build` succeeds.

---

## Phase 5: Orders & Listings (most complex)

### 5A: Orders

**Renames**:
- `src/pages/Orders.tsx` (already renamed in Phase 0)
- `src/components/pedidos/` → `src/components/orders/`
- Files: `VincularPedidoModal` → `LinkOrderModal`, `PedidoDetails` → `OrderDetails`, `PedidoDetailsDrawer` → `OrderDetailsDrawer`, `ImpressaoLista` → `PrintList`, `NfeEmitirLista` → `NfeEmissionList`, `Paginacao` → `Pagination`, `ConfiguracoesImpressaoModal` → `PrintSettingsModal`
- `src/types/Pedidos/index.ts` → `src/types/orders.ts`
- `src/logic/Pedidos/functions.ts` → `src/logic/orders/functions.ts`

**Files**: current `Pedidos.tsx` (4,145 lines, 51+ inline supabase calls), `src/components/pedidos/` (2,951 LOC, 10 files)

1. **Tests**: `src/services/__tests__/orders.service.test.ts`, `src/hooks/__tests__/useOrders.test.ts`
2. **Rename** all files/directories per above, update imports
3. **Extract `src/services/orders.service.ts`** — order fetching, status updates, linking, printing marks, marketplace connections
4. **Create `src/hooks/useOrders.ts`** — TanStack Query wrappers: `useOrders`, `useOrderDetail`, `useUpdateOrderStatus` (mutation), `useLinkOrder` (mutation)
5. **Extract `src/utils/orderUtils.ts`** — move helpers `mapTipoEnvioLabel`, `normalizeShippingType`, `ensureHttpUrl`, `normalizeMarketplaceId`, `formatMarketplaceLabel`, `isAbortLikeError`
6. **Break `Orders.tsx`** into `src/components/orders/`: `OrdersPage.tsx` (~150), `OrderFilters.tsx` (~200), `OrderStats.tsx` (~100), `OrderList.tsx` (~200), `OrderRow.tsx` (~100), `OrderBulkActions.tsx` (~150), `OrderNfeTab.tsx` (~200)
7. **Break large existing subcomponents**: `LinkOrderModal.tsx` (704 lines) → form + search + confirm; `OrderDetails.tsx` (584 lines) → info + items + financials + timeline
8. **Expand types** in `src/types/orders.ts` — add `OrderFilters`, `OrderStatus`, `ShippingType`, `Marketplace`

### 5B: Listings

**Renames**:
- `src/pages/Listings.tsx` (already renamed in Phase 0)
- Create `src/components/listings/` (new — currently ZERO subcomponents)

**Files**: current `Anuncios.tsx` (2,137 lines, 40+ inline supabase calls, zero subcomponents)

1. **Tests**: `src/services/__tests__/listings.service.test.ts`, `src/hooks/__tests__/useListings.test.ts`
2. **Extract `src/services/listings.service.ts`** — listing fetch, sync, stock update, draft management, metrics, marketplace connections
3. **Create `src/hooks/useListings.ts`** — TanStack Query wrappers
4. **Create `src/types/listings.ts`** — `Listing`, `Draft`, `ListingFilters`, `ListingMetrics`, `StockUpdate`
5. **Create entire component tree** `src/components/listings/`: `ListingsPage.tsx` (~100), `ListingsNavigation.tsx` (~80), `ListingList.tsx` (~200), `ListingCard.tsx` (~150), `ListingFilters.tsx` (~100), `ListingStockModal.tsx` (~150), `ListingBulkActions.tsx` (~100), `ListingDrafts.tsx` (~150), `ListingVariations.tsx` (~100), `ListingStats.tsx` (~100)

**Verification**: All tests pass, `npm run build` succeeds.

---

## Phase 6: Analytics & Read-Only Modules

### Modules & renames
| Page (new name) | Action |
|---|---|
| `Performance.tsx` | Break into `src/components/performance/` |
| `CustomerService.tsx` | Break into `src/components/customer-service/` |
| `Apps.tsx` | Break into `src/components/apps/` |
| `Dashboard.tsx` | Break into `src/components/dashboard/` |

### Hooks to migrate
- `useOrdersMetrics.ts` (190 lines) — already exports standalone `getOrdersMetrics()`
- `useListingsRanking.ts` (169 lines) — already exports standalone `getListingsRanking()`
- `useSalesByState.ts` (91 lines) — already exports standalone `getSalesByState()`
- `useOrdersSummary.ts` (72 lines) — useState/useEffect pattern

### TDD + Refactor
1. **Move standalone functions** to `src/services/analytics.service.ts` + `src/services/apps.service.ts`
2. **Wrap in TanStack Query hooks** in `src/hooks/useAnalytics.ts`
3. **Break `Performance.tsx`** (885 lines) into: `PerformancePage.tsx`, `OverviewTab.tsx`, `MetricsCards.tsx`, `SalesChart.tsx`, `MarketplaceBreakdown.tsx`, `TopListingsTable.tsx`, `ByProductTab.tsx`
4. **Break `Apps.tsx`** (814 lines) into: `AppsPage.tsx`, `AppGrid.tsx`, `AppCard.tsx`, `AppConnectionDialog.tsx`, `ConnectedAppsList.tsx`
5. **Break `CustomerService.tsx`** (641 lines) into: `CustomerServicePage.tsx`, `TicketList.tsx`, `TicketDetail.tsx`, `TicketFilters.tsx` + `src/types/customer-service.ts`
6. **Break `Dashboard.tsx`** (418 lines) into: `DashboardPage.tsx`, `QuickStats.tsx`, `RecentOrders.tsx`, `DashboardSalesChart.tsx`

**Verification**: All tests pass, `npm run build` succeeds.

---

## Phase 7: TypeScript Strictness & Cleanup

1. **Incrementally enable strict settings** in `tsconfig.json` and `tsconfig.app.json`:
   - Step 1: `"noImplicitAny": true` — fix all `any` types in services first
   - Step 2: `"strictNullChecks": true` — fix null handling
   - Step 3: `"strict": true` — full strict mode
2. **Create missing type files**: `src/types/auth.ts`, `chat.ts`, `listings.ts` (if not already from Phase 5), `customer-service.ts`, `performance.ts`, `apps.ts`, `settings.ts`
3. **Remove dead code** — old `src/components/produtos/` stubs (if any remain), commented-out mock data, unused imports
4. **Delete `src/Autenticação mercado livre/`** directory (stale, space in name)

---

## Phase Dependency Graph

```
Phase 0 (Infrastructure + Page Renames)
    │
    v
Phase 1 (Auth/Permissions) ── used by ALL subsequent phases
    │
    ├──> Phase 2 (Simple Modules: Community, MarketResearch, SellerResources)
    │
    ├──> Phase 3 (Inventory, Team, Settings)
    │         │
    │         └──> Phase 4 (Products, Invoices)
    │                   │
    │                   └──> Phase 5 (Orders, Listings)
    │
    └──> Phase 6 (Performance, CustomerService, Apps, Dashboard)
              │
              v
         Phase 7 (TypeScript Strictness)
```

---

## Per-Module TDD Workflow

1. **Rename** files/directories to English, update all imports
2. **Write tests** for the service functions (data access, business logic)
3. **Extract service** — move Supabase calls from hooks/pages to `src/services/<module>.service.ts`
4. **Run tests** — service tests must pass
5. **Migrate hooks** — replace `useState`/`useEffect` with `useQuery`/`useMutation`
6. **Break god components** — extract subcomponents (<200 lines each, English names)
7. **Run full test suite** + `npm run build` — everything must pass
8. **Manual smoke test** — verify no visual changes in browser

---

## Risk Mitigation

- **Backward compatibility during migration**: Old hooks can temporarily wrap new services to maintain the same return API so consumers don't need updating all at once
- **URL routes unchanged**: All `/pedidos`, `/anuncios`, `/estoque` etc. routes stay the same — only internal file references change
- **Real-time subscriptions**: `lastUpdate` counter pattern replaced with `queryClient.invalidateQueries()` — cleaner, no stale re-render cascade
- **Each phase is independently deployable**: After each phase, `npm run build` must succeed and the app behaves identically
- **Service functions are pure async** — trivially testable without React provider mocking
- **Renames are safe**: Done as first step of each phase with immediate `npm run build` verification before any logic changes
