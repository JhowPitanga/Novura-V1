# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Novura is a multi-tenant SaaS ERP platform for Brazilian e-commerce sellers. It manages products, orders, inventory, invoices (NFe), and analytics across marketplace integrations (Shopee and Mercado Livre). The UI is entirely in Portuguese (pt-BR).

## Commands

```bash
npm run dev        # Start dev server (Vite, port 5174)
npm run build      # Production build
npm run lint       # ESLint check
npm run preview    # Preview production build locally
```

Supabase Edge Functions are deployed separately via `supabase functions deploy <function-name>`. Database migrations live in `supabase/migrations/`.

## Architecture

### Frontend (React + TypeScript + Vite)

- **Routing**: React Router v6 in `src/App.tsx`. All pages lazy-loaded via `Suspense`. Protected routes use `<ProtectedRoute>` (auth) and `<RestrictedRoute module="..." actions={[...]}>` (permissions).
- **Pages**: `src/pages/` — each page is a top-level route component.
- **Components**: `src/components/` — organized by feature module (e.g., `pedidos/`, `produtos/`, `estoque/`). The `ui/` subfolder contains shadcn/ui primitives.
- **Hooks**: `src/hooks/` — custom hooks for auth (`useAuth`), permissions (`usePermissions`), data fetching (`useProducts`, `useStockData`, `useChat`), and form state (`useProductForm`, `useVariations`).
- **State management**: React Query for server state, Context API for auth, React Hook Form + Zod for forms.
- **Styling**: Tailwind CSS with custom purple (#7C3AED) primary color. shadcn/ui component library configured in `components.json`.
- **Path alias**: `@/*` maps to `./src/*`.

### Backend (Supabase)

- **Database**: PostgreSQL via Supabase with Row Level Security (RLS) for multi-tenant data isolation by `organization_id`.
- **Types**: Auto-generated database types in `src/integrations/supabase/types.ts`. Client initialized in `src/integrations/supabase/client.ts`.
- **Edge Functions**: 54+ Deno/TypeScript functions in `supabase/functions/` handling marketplace sync, OAuth, webhooks, NFe emission, and user management.
- **Migrations**: 166+ SQL migration files in `supabase/migrations/` with format `YYYYMMDD_HHMMSS_description.sql`.

### Serverless API (Vercel)

- `api/shopee-webhook.ts` and `api/mercado-livre-webhook.ts` — webhook forwarders to Supabase Edge Functions.
- Deployed automatically with Vercel; config in `vercel.json`.

### Marketplace Integrations

- **Shopee**: OAuth2 flow, order webhooks, product/inventory sync via `shopee-*` edge functions.
- **Mercado Livre**: OAuth2 flow, item/price sync, quality scores, technical specs via `mercado-livre-*` edge functions. Tokens expire every 6 hours and are auto-refreshed.
- **Focus NFeS**: Invoice emission and sync via `focus-*` edge functions.

### Webhook Flow

External marketplace → Vercel API route (`api/`) → forwards to Supabase Edge Function → processes and stores in database.

## Key Patterns

- Each feature module follows: page (`pages/`), subcomponents (`components/<module>/`), hooks (`hooks/use<Module>.ts`), types (`types/<module>.ts`), and optionally logic (`logic/<Module>/`).
- Auth context (`useAuth`) provides `user`, `organizationId`, `permissions`, and `modulesSwitches` with a 5-minute sessionStorage cache.
- All protected pages require both authentication and module-level permissions checked against the `permissions` and `system_modules` tables.
- Real-time features (chat, order updates) use Supabase real-time subscriptions.

## TypeScript Configuration

The project uses lenient TypeScript settings: `noImplicitAny: false`, `strictNullChecks: false`, `noUnusedParameters: false`. ESLint also has many rules relaxed (unused vars, explicit any, empty blocks are allowed).

## Frontend Best Practices

These are the standards to follow when writing or refactoring frontend code in this project.

### 1. TypeScript Strict Mode

- Target enabling `strict: true` in `tsconfig.json` (currently disabled). When refactoring a module, eliminate `any` types and add proper interfaces/types.
- Prefer `unknown` over `any` for untyped data, then narrow with type guards.
- Define explicit return types on exported functions and hooks.

### 2. Server State vs Client State

- Use **TanStack Query (React Query)** for all server state (data fetching, caching, mutations). It is already installed.
- Recommended defaults: `staleTime: 5 * 60 * 1000`, `gcTime: 30 * 60 * 1000`, `retry: 3`, `refetchOnWindowFocus: true`.
- Reserve `useState`/`useReducer` exclusively for UI-local state (form inputs, toggles, modals). Never store fetched data in `useState`.
- Use `useMutation` with `onSuccess` → `queryClient.invalidateQueries()` for write operations.

### 3. Service Layer / API Abstraction

- Follow the pattern: `src/services/<module>.ts` (raw Supabase queries) → `src/hooks/use<Module>.ts` (React Query wrappers) → `src/pages/<Page>.tsx` (UI only).
- Pages and components must never call `supabase.from(...)` directly. All data access goes through hooks backed by services.
- Colocate query keys with services: `export const productKeys = { all: ['products'], list: (filters) => ['products', 'list', filters], detail: (id) => ['products', id] }`.

### 4. Component Architecture

- Keep components under 200 lines. If a component exceeds this, extract subcomponents or custom hooks.
- Separate concerns: container components (data fetching via hooks) vs presentational components (props only, no side effects).
- Use composition over prop drilling — prefer `children` patterns and context for deeply shared state.
- Colocate component-specific hooks, types, and helpers within the feature folder.

### 5. Performance

- Prioritize fixing waterfalls (sequential fetches) and bundle size over micro-optimizations.
- Use `React.memo` only when profiling shows unnecessary re-renders — not by default.
- Lazy-load routes (already done in `App.tsx`). Consider lazy-loading heavy components within pages (charts, rich editors).
- Avoid inline object/array creation in JSX props when passed to memoized children.

### 6. Error Handling & Resilience

- Wrap route-level components with React Error Boundaries to prevent full-page crashes.
- Never silently swallow errors (`catch(e) {}`). Always log to console at minimum, and show user-facing toast/notification for actionable errors.
- Use TanStack Query's `onError` callbacks and `error` state to display contextual error messages.
- Validate external data (API responses, webhook payloads) at system boundaries with Zod schemas.

### 7. Testing

- Use **Vitest** (native to Vite) for unit and integration tests.
- Test hooks with `@testing-library/react-hooks`, components with `@testing-library/react`.
- Prioritize testing: business logic in services/hooks > complex component interactions > simple presentational components.

### 8. Accessibility

- All interactive elements must be keyboard-navigable and have proper ARIA attributes.
- Use semantic HTML (`<button>`, `<nav>`, `<main>`, `<section>`) over generic `<div>` with click handlers.
- Ensure sufficient color contrast ratios (4.5:1 for normal text, 3:1 for large text).
- shadcn/ui components are accessible by default — do not override their a11y attributes.
