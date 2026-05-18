# Novura — Architecture (Current State)

> **Descriptive document — no prescription.** This document describes the codebase as it is today. It is not a list of requirements or best practices. Use [CONVENTIONS.md](./CONVENTIONS.md) for coding standards and [TESTING.md](./TESTING.md) for testing strategy. Migration steps that change this state live in [MIGRATION/](./MIGRATION/).

> **Last updated:** April 2026. Based on codebase analysis of `src/` at this date. Refresh when a feature migrates to the target structure described in `CONVENTIONS.md`.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Folder Organization](#2-folder-organization)
3. [Application Bootstrap and Global Providers](#3-application-bootstrap-and-global-providers)
4. [Routing](#4-routing)
5. [Authentication and Authorization](#5-authentication-and-authorization)
6. [Typical Page Data Flow](#6-typical-page-data-flow)
7. [Feature Inventory](#7-feature-inventory)
8. [Database — Tables, RPCs, Edge Functions](#8-database--tables-rpcs-edge-functions)
9. [External Integrations](#9-external-integrations)
10. [Current Patterns (Observable Facts)](#10-current-patterns-observable-facts)
11. [Dependency Inventory](#11-dependency-inventory)

---

## 1. Tech Stack

| Layer | Library / Tool | Version |
|---|---|---|
| UI framework | React | 18.3.1 |
| Build tool | Vite | 5.x |
| Language | TypeScript | 5.x |
| Routing | React Router DOM | 6.26.2 |
| Server state | TanStack Query | 5.56.2 |
| Backend / DB | Supabase (PostgreSQL 17) | supabase-js 2.50.3 |
| UI components | shadcn/ui + Radix UI primitives | various (see §11) |
| Styling | Tailwind CSS | 3.x |
| Forms | react-hook-form | 7.53.0 |
| Validation | Zod | 3.23.8 |
| Animation | Framer Motion | 12.x |
| Date picker | react-day-picker | 8.10.1 |
| Crypto (P12/PFX) | node-forge | 1.3.1 |
| Test runner | Vitest | 4.0.18 |
| API mocking | MSW | 2.12.10 |
| E2E browser | Playwright | **not installed** |
| CI | Not configured | — |

---

## 2. Folder Organization

```
Novura-V1/
├── src/
│   ├── components/          # UI components, grouped by feature area
│   │   ├── orders/page/     # Orders-specific components
│   │   ├── products/        # Products-specific components
│   │   ├── listings/        # Listings-specific components
│   │   ├── team/            # Team (Chat, Tasks, Gamification)
│   │   ├── inventory/       # Inventory control
│   │   ├── invoices/        # Invoice components
│   │   ├── settings/        # Settings panels
│   │   ├── dashboard/       # Dashboard cards and charts
│   │   ├── performance/     # Performance analytics
│   │   ├── market-research/ # Market research views
│   │   ├── apps/            # App integrations panel
│   │   ├── community/       # Community feed
│   │   ├── auth-switch.tsx  # Login/signup form switch
│   │   ├── AppSidebar.tsx   # Navigation sidebar
│   │   ├── GlobalHeader.tsx # Top header bar
│   │   ├── ProtectedRoute.tsx
│   │   ├── RestrictedRoute.tsx
│   │   └── ui/              # shadcn/Radix primitives (do not edit)
│   ├── hooks/               # Custom hooks (not co-located with features)
│   │   ├── useAuth.tsx      # Auth context + Supabase session
│   │   ├── useOrdersPageController.ts  # ~525-line god hook
│   │   ├── useOrdersPageData.ts
│   │   ├── useOrderFiltering.ts
│   │   ├── useChat.ts
│   │   ├── useProducts.ts
│   │   ├── useListings.ts
│   │   └── ...
│   ├── pages/               # Page-level components (one per route)
│   │   ├── Orders.tsx
│   │   ├── Products.tsx
│   │   ├── Listings.tsx, CreateListingML.tsx, EditListingML.tsx
│   │   ├── NewCompany.tsx   # ~905 lines
│   │   ├── Settings.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Team.tsx
│   │   ├── Inventory.tsx
│   │   ├── Invoices.tsx
│   │   ├── Performance.tsx
│   │   ├── MarketResearch.tsx
│   │   ├── Apps.tsx
│   │   ├── Auth.tsx, Login.tsx, InviteAccepted.tsx
│   │   ├── CustomerService.tsx
│   │   ├── SellerResources.tsx
│   │   ├── Community.tsx
│   │   ├── MercadoLivreCallback.tsx, ShopeeCallback.tsx
│   │   ├── NovuraAcademy.tsx, NovuraAdmin.tsx, NotFound.tsx
│   │   └── Landing.tsx
│   ├── services/            # Data access functions (raw Supabase calls)
│   │   ├── orders.service.ts        # ~688 lines
│   │   ├── listings.service.ts
│   │   ├── create-listing.service.ts
│   │   ├── inventory.service.ts
│   │   ├── invoices.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── performance.service.ts
│   │   ├── auth.service.ts
│   │   └── query-keys.ts
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts    # Supabase client (typed)
│   │       └── types.ts     # Generated DB types (~1959 lines)
│   ├── lib/                 # Utility functions
│   │   ├── cn.ts
│   │   ├── utils.ts
│   │   ├── mercado-livre.ts
│   │   └── ...
│   ├── utils/               # Additional utilities (overlaps with lib/)
│   │   ├── orderUtils.ts
│   │   ├── nfeUtils.ts
│   │   └── ...
│   ├── types/               # Shared TypeScript types
│   ├── App.tsx              # Root router + global providers
│   └── main.tsx             # React DOM render entry point
├── supabase/
│   ├── migrations/          # 205 SQL migration files
│   ├── functions/           # ~70 Deno Edge Functions
│   ├── config.toml
│   └── seed.sql
├── api/                     # Serverless webhook proxy (not part of Vite app)
│   ├── mercado-livre-webhook.ts
│   └── shopee-webhook.ts
├── docs/                    # Documentation (this file and siblings)
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── TESTING.md
│   ├── ENGINEERING_STANDARDS.md  # Size limits, cycle rules — read first
│   ├── EDGE_FUNCTIONS.md
│   ├── SUPABASE_RPCS.md
│   └── prds/                # Cycle PRDs (C0-T*, C1-T*, C2-T*)
└── src/WebhooksAPI/         # Frontend-side OAuth + webhook helpers
    └── marketplace/
        └── mercado-livre/
```

**Observed structural duplications:**
- `src/lib/` and `src/utils/` overlap in purpose — utility functions live in both.
- `src/services/` and `src/hooks/` sometimes duplicate data fetching concerns (e.g., both have orders-related files).
- No `features/` folder exists today; code is organized by technical role (`components/`, `hooks/`, `services/`) rather than by business domain.

---

## 3. Application Bootstrap and Global Providers

`src/App.tsx` wraps the entire application in these providers, from outermost to innermost:

```
QueryClientProvider (TanStack Query)
  └── AuthProvider (custom context from useAuth.tsx)
        └── TooltipProvider (Radix)
              └── Toaster + Sonner (toast notifications)
                    └── BrowserRouter
                          └── Routes (all route definitions)
```

**QueryClient default config:**

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 minutes
      gcTime: 10 * 60 * 1000,      // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
```

**`AuthProvider`** (`src/hooks/useAuth.tsx`):
- Subscribes to `supabase.auth.onAuthStateChange`.
- On session, calls `rpc_get_user_access_context` (cached 5 min in `sessionStorage`) to get `organizationId`, `permissions`, `role`, `globalRole`, `moduleSwitches`, `displayName`.
- Exposes: `user`, `session`, `organizationId`, `permissions`, `userRole`, `globalRole`, `loading`, `signIn()`, `signUp()`, `signOut()`.
- Subscribes to Supabase Realtime on `public.organization_members` (filtered by `user_id`) to update permissions without page reload.

---

## 4. Routing

All routes are defined in `src/App.tsx`. Pages are lazy-loaded via `React.lazy()`.

**Loading fallback:** `ModuleLoadingFallback` renders `SidebarProvider` + `AppSidebar` + `GlobalHeader` + a spinner. Each protected page also duplicates this layout internally (no shared layout route exists today).

### Public routes

| Path | Component |
|---|---|
| `/landing` | `Landing` |
| `/auth`, `/cadastro` | `Auth` (cadastro redirects to `/auth?mode=signup`) |
| `/convite-aceito` | `InviteAccepted` |
| `/oauth/mercado-livre/callback` | `MercadoLivreCallback` |
| `/oauth/shopee/callback` | `ShopeeCallback` |
| `*` | `NotFound` |

**Note:** `Login` is imported lazy but has no `<Route>`. The credential form is in `Auth.tsx` → `auth-switch.tsx`.

### Protected routes (ProtectedRoute)

`ProtectedRoute` reads `useAuth().loading` and `useAuth().user`. While loading, shows the sidebar shell. If no user, redirects to `/auth`.

| Path | Component | RestrictedRoute module + actions |
|---|---|---|
| `/` | `Dashboard` | None — all authenticated users |
| `/desempenho/*` | `Performance` | `desempenho` / `view` |
| `/pesquisa-mercado` | `MarketResearch` | `pesquisa_mercado` |
| `/produtos/*` | `Products` | `produtos` / `view` |
| `/anuncios/*` | `Listings` | `anuncios` / `view` |
| `/anuncios/criar` | `CreateListingML` | `anuncios` / `create,publish,view` |
| `/anuncios/edicao/:itemId` | `EditListingML` | `anuncios` / `edit,view` |
| `/recursos-seller/*` | `SellerResources` | `recursos_seller` / `view` |
| `/recursos-seller/produto/:id` | `ProductDetailsPage` | same |
| `/equipe/*` | `Team` | `equipe` / `view` |
| `/aplicativos/*` | `Apps` | `aplicativos` / `view` |
| `/sac` | `CustomerService` | `sac` / `view` |
| `/pedidos` + `/pedidos/emissao_nfe/...` | `Orders` | `pedidos` / `view` |
| `/estoque` | `Inventory` | `estoque` |
| `/notas-fiscais/*` | `Invoices` | `notas_fiscais` |
| `/configuracoes` | `Settings` | `configuracoes` |
| `/configuracoes/notas-fiscais/nova-empresa` | `NewCompany` | `notas_fiscais` / `create,edit,view` |
| `/novura-academy/*` | `NovuraAcademy` | `novura_academy` |
| `/novura-admin/*` | `NovuraAdmin` | `novura_admin` (requires `globalRole === 'nv_superadmin'`) |
| `/comunidade/*` | `Community` | `comunidade` |

**`RestrictedRoute`** checks `usePermissions(module, actions)`. The special `novura_admin` module only passes for `globalRole === 'nv_superadmin'` or `globalRole === null`.

---

## 5. Authentication and Authorization

### Auth provider: Supabase Auth

Login via `supabase.auth.signInWithPassword` / `signUp`. Sessions are JWT-based, 3600-second expiry.

### Access context RPC

After login, `rpc_get_user_access_context` returns the full access context:
- `organization_id` — the user's organization
- `permissions` — map of `{ [module]: [actions] }`
- `role` — user role within the organization (e.g., `owner`, `admin`, `member`)
- `global_role` — Novura superadmin role (`nv_superadmin` or null)
- `module_switches` — feature flags per module
- `display_name`

This is cached in `sessionStorage` with a 5-minute TTL (`auth.service.ts`).

### New user signup

1. `supabase.auth.signUp` creates the auth user.
2. `rpc_bootstrap_user_org` creates the organization, user profile, and default permissions.
3. `auth-on-signup` Edge Function may be triggered to set up additional records.
4. `ensureEditorRecord` and `ensurePublicUserRecord` are called client-side post-signup.

### Marketplace OAuth (Mercado Livre, Shopee)

Not handled by Supabase Auth social OAuth. The flow:
1. Frontend calls Edge Function `mercado-livre-start-auth` or `shopee-start-auth` → receives `authorization_url`.
2. Browser redirects to marketplace OAuth.
3. Marketplace redirects back to `/oauth/mercado-livre/callback` or `/oauth/shopee/callback`.
4. Callback page calls `mercado-livre-callback` or `shopee-callback` Edge Function to exchange the code and persist tokens in `marketplace_integrations`.

**Sandbox variant:** `shopee-callback-sandbox` (note: this Edge Function folder was not found in `supabase/functions/` at analysis time).

---

## 6. Typical Page Data Flow

Most authenticated pages today follow this pattern:

```
Page component (e.g., Orders.tsx)
  │
  ├── calls useXyzPageController (god hook, 30–50 returns)
  │     │
  │     ├── calls useXyzPageData
  │     │     │
  │     │     ├── useEffect → fetchAllXyz() → Supabase .from('xyz').select(...)
  │     │     ├── stores result in useState
  │     │     ├── manual localStorage cache read/write
  │     │     └── Supabase Realtime channel.on() → fetchXyzById() → update state
  │     │
  │     ├── calls useXyzFiltering (status, search, sort)
  │     ├── manages dialog open/close states
  │     ├── manages selection state (selectedIds)
  │     ├── manages DOM refs (thead, scrollContainer)
  │     └── returns ~50 values
  │
  ├── passes 30–50 props to child components
  │     ├── XyzFilterBars (10–30 props, variant switch via activeStatus)
  │     ├── XyzTable (10–20 props, including DOM refs)
  │     └── XyzDialogs (10–20 props, dialog open states)
  │
  └── Each page repeats: SidebarProvider + AppSidebar + GlobalHeader + page content
```

**TanStack Query is configured and used** in several hooks (`useQuery` / `useMutation`), but not consistently across all features. Orders uses manual `useEffect` + `useState`; other newer features (Listings, Products) use TanStack Query more.

---

## 7. Feature Inventory

### Orders

| File | Lines | Role |
|---|---|---|
| `src/pages/Orders.tsx` | 206 | Page — delegates to controller hook, renders filter bars + table + dialogs |
| `src/hooks/useOrdersPageController.ts` | 525 | God hook — ~50 return values; orchestrates data, filters, selection, dialogs |
| `src/hooks/useOrdersPageData.ts` | — | Data fetching via `useEffect`; `localStorage` cache; Supabase Realtime |
| `src/hooks/useOrderFiltering.ts` | — | Status/search/sort filtering on client-side |
| `src/services/orders.service.ts` | 688 | Raw Supabase calls — `fetchAllOrders`, `fetchOrderById`, `resolveOrgId`, `emitNfe`, etc. |
| `src/services/query-keys.ts` | 87 | TanStack Query key factories (partially integrated) |
| `src/components/orders/page/OrdersFilterBars.tsx` | 210 | Status-variant filter bar; prop explosion; 2 known linter bugs |
| `src/components/orders/page/OrdersTable.tsx` | 168 | Table with 16 props, DOM refs, selection logic |
| `src/components/orders/page/OrdersDialogs.tsx` | — | All order dialogs (NF-e, vincular, etiqueta, sync) |

**Key data:** Tables: `orders`, `order_items`, `order_labels`, `order_shipping`. Edge Functions: `mercado-livre-sync-orders`, `shopee-sync-orders`, `emit-invoice`, `focus-nfe-emit`, `mark-labels-printed`, `link-order-product`, `orders-queue-worker`.

**Known issues (documented, not prescribed):**
- `fetchAllOrders` loads all orders for the org without pagination.
- `(supabase as any)` is pervasive, disabling TS checks.
- `processingIdsLocal` manual optimistic state pattern.
- Status string inconsistency: `'cancelado'` in controller vs. `'cancelados'` in filter bar (bug — `CanceledFilterBar` never renders).

### Products

`Products.tsx` defines internal sub-routes: `/`, `/variacoes`, `/kits`, `/criar`, `/editar/:id`, `/editar-variacao/:id`, `/editar-kit/:id` using `SingleProducts`, `ProductVariations`, `ProductKits`, `CreateProductPage`, `EditProduct`, etc.

**Tables:** `products`, `products_stock`, `product_kits`, `product_kit_items`, `categories`, `marketplace_item_product_links`, `marketplace_items`, `marketplace_integrations`.
**RPCs:** `duplicate_product`, `get_current_user_organization_id`, `current_user_has_permission`.
**Storage:** `ad-images`.

### Listings

Three pages: `Listings`, `CreateListingML`, `EditListingML`.

**Tables:** `marketplace_items`, `marketplace_items_raw`, `marketplace_items_unified`, `marketplace_drafts`, `marketplace_item_descriptions`, `marketplace_integrations`.
**Storage:** `ad-images`.
**Edge Functions (sample):** `mercado-livre-orchestrate-sync`, `mercado-livre-update-item-status`, `mercado-livre-categories-attributes`, `mercado-livre-listing-prices`, `mercado-livre-shipping-methods`, `shopee-sync-items`, `shopee-update-stock`, `shopee-product-attributes`, `mercado-livre-categories-predict`, `shopee-categories-predict`.
**External HTTP:** `https://api.mercadolibre.com/` (categories, listing types — direct `fetch` in some service paths).

### Team

Three tabs: Chat, Tasks, Gamification.

- **Chat:** real-time channel messaging; hooks: `useChat`, `useChatChannels`, `useOrgMemberSearch`.  
  Tables: `chat_channels`, `chat_channel_members`, `chat_messages`, `chat_unread_counts`.  
  Storage: `chat-attachments`.  
  RPCs: `search_org_members`, `mark_channel_read`, `get_channel_messages_plain`, `get_message_plain`.
- **Tasks:** CRUD via `supabase` client directly in `Team.tsx` and modals.  
  Table: `tasks`.
- **Gamification:** data is mocked in the component; no Supabase integration.

### Inventory

Tabs: "Controle" (stock) and "Armazém" (storage).

**Tables:** `products`, `storage`, `products_stock`, `inventory_transactions`, `user_profiles`, `user_organization_settings`.
**RPCs:** `upsert_product_stock`.
**Service:** `src/services/inventory.service.ts`.

### Invoices

**Tables:** `invoices`, `companies`, `orders`.
**Edge Functions:** `focus-nfe-cancel`, `focus-nfe-sync`, `download-nfe-xml`.
**Service:** `src/services/invoices.service.ts`.

### Settings

Tabs: "Usuários" + "Fiscais" (for non-member roles), "Pessoais" (all roles).

**Tables:** `system_modules`, `user_invitations`, `user_profiles`, `companies`, `company_tax_configs`, `tax_rules_catalog`.
**Edge Functions:** `manage-users`, `admin-create-member`, `process-invitation`, `upload-company-certificate`, `focus-company-create`.

### Dashboard

**Service:** `src/services/dashboard.service.ts`.
**Tables:** `companies`, `orders`.
**Hooks:** `useExpiringCerts`, `useOrderStatusCounts` (via `useDashboard`).

### Performance

Sub-routes: overview + product breakdown.
**Service:** `src/services/performance.service.ts`.
**Tables:** `marketplace_integrations`, `orders`, `order_items`, `products`.

### Market Research

Tabs: categories, keywords, product.
**No Supabase queries detected** — data comes from `https://api.mercadolibre.com/` (public ML API) via `useCreateListingCategories` and similar hooks.

### Apps

Marketplace integration management (connect/disconnect ML, Shopee).
**Tables:** `apps_public_view`, `marketplace_integrations`.
**RPCs:** `disconnect_marketplace_cascade`.
**Edge Functions:** `mercado-livre-start-auth`, `shopee-start-auth` / `shopee-start-auth-sandbox`.

### Auth

- **Login/Signup:** `Auth.tsx` → `auth-switch.tsx` → `useAuth().signIn()` / `signUp()`.
- **Invite flow:** `InviteAccepted.tsx` → Edge Function `process-invitation`.
- **Services:** `src/services/auth.service.ts` (`rpc_get_user_access_context`, `rpc_bootstrap_user_org`, `sessionStorage` cache).

### Customer Service

Inbox with per-marketplace tabs.
**Status:** Data is currently mocked (`mockTickets`). The UI shows "Em breve" for Shopee, Magalu, and Amazon integrations. Not yet connected to real data.

### Seller Resources

Resource store with cart and modals.
**Status:** Mostly mocked data (categories, reviews, etc.) in the component file. No Supabase queries detected.

### Community

Feed and profile.
**Status:** Mostly mocked data. `FeedTab` uses external Unsplash image URLs as placeholders.

### NewCompany (Company Fiscal Setup)

Route: `/configuracoes/notas-fiscais/nova-empresa`.

**File:** `src/pages/NewCompany.tsx` (~905 lines).
**Tables:** `companies`, `company_tax_configs`.
**Storage:** certificate file upload (bucket name from variable).
**Edge Functions:** `cnpj-lookup`, `upload-company-certificate`, `focus-company-create`.
**External:** `https://receitaws.com.br/v1/cnpj/...` (via `cnpj-lookup` Edge Function), `http://www.sintegra.gov.br/` (informational link).
**Crypto:** `node-forge` for P12/PFX certificate parsing (local, no network).

---

## 8. Database — Tables, RPCs, Edge Functions

### Tables and views referenced in `src/`

`apps_public_view`, `categories`, `chat_channel_members`, `chat_channels`, `chat_messages`, `chat_unread_counts`, `companies`, `company_tax_configs`, `editor`, `inventory_transactions`, `invoices`, `marketplace_drafts`, `marketplace_item_descriptions`, `marketplace_item_product_links`, `marketplace_items`, `marketplace_items_raw`, `marketplace_items_unified`, `marketplace_integrations`, `order_items`, `orders`, `organization_members`, `product_kit_items`, `product_kits`, `products`, `products_stock`, `storage`, `system_modules`, `tasks`, `tax_rules_catalog`, `user_invitations`, `user_organization_settings`, `user_profiles`, `users`.

**Supabase Storage buckets:** `ad-images`, `chat-attachments`, and certificate uploads (dynamic bucket name).

### RPCs called from `src/`

| RPC | Called from |
|---|---|
| `rpc_get_user_access_context` | `auth.service.ts` |
| `rpc_bootstrap_user_org` | `auth.service.ts` |
| `get_current_user_organization_id` | multiple hooks/services |
| `get_user_organization_id` | `orders.service.ts` |
| `current_user_has_permission` | `Products`, `Listings`, hooks |
| `duplicate_product` | Products (kit/variation) |
| `search_org_members` | `useChat.ts` |
| `mark_channel_read` | Chat components |
| `get_channel_messages_plain` | Chat |
| `get_message_plain` | Chat |
| `upsert_product_stock` | `InventoryManagementDrawer` |
| `disconnect_marketplace_cascade` | `Apps` |
| `set_user_permissions` | Settings |
| `rpc_get_member_permissions` | Settings |
| `q_submit_xml_send` | Orders (NF-e queue) |
| `rpc_queues_emit` | Orders |
| `rpc_create_mock_orders_emissao_nf` | Dev/testing mock |

### Edge Functions (in `supabase/functions/`)

~70 functions total. Grouped by domain:

| Domain | Functions |
|---|---|
| Auth | `auth-on-signup`, `create-user`, `admin-create-member`, `manage-users`, `process-invitation` |
| Companies / NFe | `cnpj-lookup`, `upload-company-certificate`, `focus-company-create`, `focus-nfe-emit`, `focus-nfe-cancel`, `focus-nfe-sync`, `focus-resend-hook`, `focus-webhook`, `emit-invoice`, `emit-queue-consume` |
| Orders | `orders-queue-worker`, `orders-sync-ml`, `orders-sync-shopee`, `orders-webhook` |
| Labels | `mark-labels-printed`, `unmark-labels-printed` |
| Products / Links | `link-order-product`, `linked_products_item`, `inventory-jobs-worker` |
| Mercado Livre | `mercado-livre-start-auth`, `mercado-livre-callback`, `mercado-livre-refresh`, `mercado-livre-sync-orders`, `mercado-livre-sync-items`, `mercado-livre-sync-all`, `mercado-livre-sync-descriptions`, `mercado-livre-sync-prices`, `mercado-livre-sync-stock-distribution`, `mercado-livre-orchestrate-sync`, `mercado-livre-publish-item`, `mercado-livre-process-presented`, `mercado-livre-update-item-fields`, `mercado-livre-update-item-status`, `mercado-livre-update-metrics`, `mercado-livre-update-quality`, `mercado-livre-update-reviews`, `mercado-livre-retry-worker`, `mercado-livre-submit-xml`, `mercado-livre-webhook-items`, `mercado-livre-webhook-orders`, + attributes/categories/listing-types/prices/shipping/technical-specs functions |
| Shopee | `shopee-start-auth`, `shopee-callback`, `shopee-refresh`, `shopee-sync-orders`, `shopee-sync-items`, `shopee-sync-all`, `shopee-product-add-item`, `shopee-product-attributes`, `shopee-product-category`, `shopee-process-presented`, `shopee-update-stock`, `shopee-arrange-shipment`, `shopee-webhook-items`, `shopee-webhook-orders`, `shopee-categories-predict`, `shopee-submit-xml` |
| XML / NFe download | `download-nfe-xml` |

**Shared code:** `supabase/functions/_shared/` — utilities imported by multiple functions.

### Supabase configuration

- **Project ID:** `frwnfukydjwilfobxxhw`
- **Database:** PostgreSQL 17, port 54322 (local)
- **API:** port 54321 (local), schemas: `public`, `graphql_public`, `pgmq_public`, max rows: 1000
- **Auth:** JWT expiry 3600s, email confirmations disabled (local dev)
- **Storage:** file size limit 50 MiB
- **Migrations:** 205 SQL files in `supabase/migrations/`

---

## 9. External Integrations

| Integration | Base URL | Where called |
|---|---|---|
| Supabase project | `https://frwnfukydjwilfobxxhw.supabase.co` | `src/integrations/supabase/client.ts` |
| Mercado Livre API (public) | `https://api.mercadolibre.com/` | `create-listing.service.ts`, `useCreateListingData.ts`, `useCreateListingCategories.ts` — direct `fetch` in some paths |
| Mercado Livre product URL | `https://produto.mercadolivre.com.br/MLB-...` | `src/lib/mercado-livre.ts` (UI link) |
| Focus NFe | `https://api.focusnfe.com.br/` (prod), `https://homologacao.focusnfe.com.br` (test) | `src/utils/nfeUtils.ts` (base URL); actual HTTP calls in Edge Functions (`focus-nfe-emit`, `focus-nfe-sync`, `focus-company-create`, `focus-webhook`) |
| CNPJ / ReceitaWS | `https://receitaws.com.br/v1/cnpj/{cnpj}` | `supabase/functions/cnpj-lookup/index.ts` — called by frontend via `cnpj-lookup` Edge Function |
| Shopee OAuth redirect | `https://www.novuraerp.com.br/oauth/shopee/callback` | `Apps.tsx` — hardcoded fallback |
| Sintegra (informational) | `http://www.sintegra.gov.br/` | `CompanyStep1.tsx` — external link only |

**ViaCEP:** no usage found in the repository.

### Webhook proxy (`api/`)

`api/mercado-livre-webhook.ts` and `api/shopee-webhook.ts` are standalone serverless handlers (not part of the Vite app). They proxy inbound marketplace webhooks to the Supabase Edge Function `orders-webhook`, forwarding marketplace-specific signature headers (`x-meli-signature`, `x-shopee-signature`, `x-request-id`).

---

## 10. Current Patterns (Observable Facts)

The following patterns appear throughout the codebase. They are documented here without judgment. The target pattern for each is described in [CONVENTIONS.md](./CONVENTIONS.md) — see: §6 (data fetching), §2 (TypeScript / no `any`), §5 (components / layout route), §7 (state management / no god hooks), §9 (naming / language). These serve as the baseline for [MIGRATION/](./MIGRATION/) PRDs.

### Data fetching

- **`useEffect` + `useState`:** primary data fetching mechanism in Orders and some other features. Pattern: `setLoading(true)` → `fetchXyz()` → `setData(result)` → `setLoading(false)` in `.finally()`.
- **TanStack Query (`useQuery` / `useMutation`):** used in some features (Listings, Products, Settings) but not consistently. `QueryClient` is globally configured in `App.tsx`.
- **`localStorage` as manual cache:** `useOrdersPageData.ts` reads/writes a JSON string to `localStorage` as a stale-while-revalidate cache. Parse errors are silently caught.
- **Realtime → full re-fetch:** Supabase Realtime triggers `fetchOrderById` for every changed row, then replaces the local array entry. No TanStack Query invalidation.

### Type safety

- **`(supabase as any)`:** pervasive in `orders.service.ts` and other services. All generated type information is discarded at these call sites.
- **`(p: any)`:** callback parameters in hooks typed as `any`, especially in `useOrdersPageController.ts`.
- **`(result as any).field`:** access to Supabase response fields without generated types.
- **Generated `types.ts` exists** (`src/integrations/supabase/types.ts`, ~1959 lines) but is frequently bypassed.

### Component structure

- **Layout boilerplate duplication:** every page component renders its own `SidebarProvider` + `AppSidebar` + `GlobalHeader`. No shared layout route.
- **God hooks:** `useOrdersPageController.ts` returns ~50 values and manages unrelated concerns (data, filters, selection, dialog state, DOM refs, event listeners).
- **Prop drilling:** child components receive 20–40+ props from the page via the controller hook. `OrdersFilterBars` receives ~30 props, most used by only one variant.
- **DOM refs in hooks:** `useOrdersPageController` creates `useRef` for DOM elements and returns them as part of its object.

### Language

- Identifiers mix Portuguese and English: `filteredPedidos`, `pedidos`, `useOrdersPageController`, `Pedidos()` function name in `Orders.tsx`, `normalizeTipoEmpresa`, etc.
- UI strings are in Portuguese (correct).

### Error handling

- Silent `try {} catch {}` blocks in several hooks — errors are swallowed without logging or user notification.
- Some paths use `console.log` for error debugging (18 occurrences in `NewCompany.tsx`).

### Other observations

- `react-beautiful-dnd` (v13.1.1) is in `package.json` with no usage in `src/` — deprecated library.
- `react-is` is at `^19.1.0` while `react` is at `^18.3.1` — version mismatch.
- `Login.tsx` is imported lazy in `App.tsx` but has no corresponding `<Route>`.
- `normalizeTipoEmpresa` in `NewCompany.tsx` has a latent bug: `s === 'matríZ'` will never match after `toLowerCase()`.
- `CustomerService`, `SellerResources`, and `Community` pages use mostly mocked data.

---

## 11. Dependency Inventory

### Production dependencies (key)

| Package | Version | Notes |
|---|---|---|
| `react` | ^18.3.1 | Target: 19 (see `MIGRATION/00-upgrade-react-19.md`) |
| `react-dom` | ^18.3.1 | |
| `react-router-dom` | ^6.26.2 | |
| `@tanstack/react-query` | ^5.56.2 | Configured globally, used inconsistently |
| `@supabase/supabase-js` | ^2.50.3 | |
| `zod` | ^3.23.8 | |
| `react-hook-form` | ^7.53.0 | |
| `framer-motion` | ^12.23.22 | |
| `node-forge` | ^1.3.1 | P12/PFX certificate parsing |
| `react-day-picker` | ^8.10.1 | |
| `react-is` | ^19.1.0 | **Mismatch** — should be 18.x with current React |
| `react-beautiful-dnd` | ^13.1.1 | **Unused, archived** — no usage in `src/` |
| `@types/react-beautiful-dnd` | ^13.1.8 | **Unused** — remove with above |
| `lucide-react` | — | Icons |

### Radix UI packages (sample)

`@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-avatar`, `@radix-ui/react-checkbox`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-popover`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-select`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-slot`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle`, `@radix-ui/react-tooltip`. Versions range from 1.1.0 to 1.3.3.

### Dev dependencies (key)

| Package | Version | Notes |
|---|---|---|
| `vitest` | ^4.0.18 | Installed, 7 test files exist |
| `msw` | ^2.12.10 | Installed, server/handlers setup exists |
| `@playwright/test` | — | **Not installed** |
| `@testing-library/react` | — | **Not installed** |
| `@testing-library/user-event` | — | **Not installed** |
| `typescript` | ^5.x | |
| `vite` | ^5.x | |
| `@vitejs/plugin-react-swc` | — | |
| `tailwindcss` | ^3.x | |

---

## Related Documents

| Document | Purpose |
|---|---|
| [CONVENTIONS.md](./CONVENTIONS.md) | How new code should be written (forward-looking) |
| [TESTING.md](./TESTING.md) | Testing strategy and priority queue |
| [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) | Size limits and cycle-specific rules (takes precedence on size) |
| [EDGE_FUNCTIONS.md](./EDGE_FUNCTIONS.md) | Edge Function reference |
| [SUPABASE_RPCS.md](./SUPABASE_RPCS.md) | RPC reference |
| [docs/prds/](./prds/) | Feature PRDs by cycle (C0, C1, C2) |
| [MIGRATION/](./MIGRATION/) | Step-by-step migration PRDs (to be created) |
