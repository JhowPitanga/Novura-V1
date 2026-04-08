# PRD — C1-T1: Onboarding Page + ML Connection Flow

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** C0 complete (`orders` table populated, `orders-sync-ml` deployed)
**Blocks:** [C1-T2 — Diagnóstico](./C1-T2-diagnostico.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

When a new seller signs up for Novura, right now they land on a confusing empty dashboard.
This task fixes that: the first thing they see is a single screen that says "Connect your
Mercado Livre account" — no forms, no setup wizard, no choices. They click one button,
authorize Novura on ML, and the system immediately starts importing their last 90 days of orders.

While it imports, they see a live progress message (not a spinner): "Importing your orders...
247 found", then "247 imported", then "Analyzing your listings..." — creating anticipation,
not anxiety. When done, they are automatically taken to the Diagnóstico screen.

The entire experience must take less than 5 minutes. That 5-minute window is the whole Cycle 1 bet.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `src/pages/Onboarding.tsx` — does this file exist? If yes, read it.
- [ ] `src/components/onboarding/` — does this directory exist? If yes, list files.
- [ ] `src/hooks/useOnboardingStatus.ts` — does this file exist? If yes, read it.
- [ ] `src/App.tsx` — is `/onboarding` route already registered?
- [ ] `supabase/functions/mercado-livre-start-auth/index.ts` — read it. Does it return `code_verifier` separately (not in state)? This is the security model — do not change it.
- [ ] `src/WebhooksAPI/marketplace/mercado-livre/index.ts` — does `startMercadoLivreAuth()` store verifier in sessionStorage? If yes, reuse this function.
- [ ] `src/pages/MercadoLivreCallback.tsx` — does it read verifier from sessionStorage? If yes, leave it untouched.
- [ ] Check `supabase/functions/orders-sync-ml/index.ts` — what HTTP endpoint/auth does it need?

**Update this section with your findings before writing any code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

The ML OAuth security model is already implemented and must NOT be changed.

- [ ] Read `supabase/functions/mercado-livre-start-auth/index.ts` in full.
      Record: what does it return? Is `code_verifier` returned separately from `state`?
- [ ] Read `src/WebhooksAPI/marketplace/mercado-livre/index.ts` in full.
      Record: what does `startMercadoLivreAuth()` do? Can it be called from the new page?
- [ ] Read `src/pages/MercadoLivreCallback.tsx` in full.
      Record: where does it redirect after success? Does it trigger `orders-sync-ml`?
- [ ] Read `src/hooks/useAuth.tsx`.
      Record: what does it expose? Specifically `organizationId`.
- [ ] Read `src/App.tsx` lines containing "Route" to understand the current route structure.
      Record: is `/onboarding` registered? What pattern do protected routes follow?
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1 (Architecture), 3 (Service Layer).
- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` sections "Feature F1.1: Onboarding Page" and "What Already Exists".

**Do not write any code until you have read all files above.**

---

## 4. Architecture Context

### State Machine

```
OnboardingStep enum:
  CONNECT    → user has not connected ML yet
  IMPORTING  → OAuth done, sync in progress
  COMPLETE   → sync done, about to redirect
  ERROR      → sync failed
```

The state is driven by:
1. `marketplace_integrations` table — does a row exist for this org + `mercado_livre`?
2. URL param `?step=importing` — set by the callback page after successful OAuth
3. Polling the `orders` table count for the organization

### Component Hierarchy

```
src/pages/Onboarding.tsx                    ← state machine, reads from useOnboardingStatus
  └── ConnectML.tsx                         ← rendered when step = CONNECT
  └── ImportProgress.tsx                    ← rendered when step = IMPORTING
  └── ImportComplete.tsx                    ← rendered when step = COMPLETE
  └── error state (inline, simple)          ← rendered when step = ERROR

src/hooks/useOnboardingStatus.ts            ← determines step, tracks import progress
src/components/onboarding/ConnectML.tsx
src/components/onboarding/ImportProgress.tsx
src/components/onboarding/ImportComplete.tsx
```

### Layer Rules

```
Onboarding.tsx        → calls useOnboardingStatus(), passes props to subcomponents
useOnboardingStatus   → calls startMercadoLivreAuth() (existing function), polls orders count
ConnectML.tsx         → UI only, receives onConnect() callback as prop
ImportProgress.tsx    → UI only, receives progress data as props
ImportComplete.tsx    → UI only, receives orderCount as prop, fires redirect after 1.5s
```

No `supabase.from(...)` in any component. No inline fetches. Only in `useOnboardingStatus`.

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **DO NOT change `mercado-livre-start-auth` or `mercado-livre-callback`** | Security model is already correct — any change introduces risk. |
| **DO NOT change `MercadoLivreCallback.tsx`** | It already works. Connect from it by passing a callback, not by editing it. |
| **DO NOT store `code_verifier` in state URL param** | State is public. Only store in `sessionStorage`. |
| **DO NOT show the spinner as the only progress indicator** | A number builds trust. Show order count as it grows. |
| **DO NOT redirect on error — show retry button** | A blank or stuck screen on import failure creates churn at the most critical moment. |

---

## 6. What to Build

### Section A: `useOnboardingStatus` Hook

**File:** `src/hooks/useOnboardingStatus.ts`

```typescript
export const OnboardingStep = {
  CONNECT:   'connect',
  IMPORTING: 'importing',
  COMPLETE:  'complete',
  ERROR:     'error',
} as const
export type OnboardingStep = typeof OnboardingStep[keyof typeof OnboardingStep]

export interface OnboardingProgress {
  step: OnboardingStep
  importedCount: number     // orders in DB so far (from polling)
  isConnected: boolean      // ML integration row exists
  error: string | null
}

// Hook behavior:
// 1. Check marketplace_integrations for org + 'mercado_livre' → if row exists, isConnected = true
// 2. If URL param ?step=importing is present, set step = IMPORTING
// 3. When step = IMPORTING, poll orders count for the org every 2 seconds
//    → when count stabilizes for 3 consecutive polls (no new rows), set step = COMPLETE
//    → on poll error: set step = ERROR
// 4. When step = COMPLETE, Onboarding.tsx triggers redirect after 1.5s
```

**Constraints:**
- Under 80 lines
- Use TanStack Query for the marketplace_integrations check (`useQuery`)
- Use a `useInterval` pattern (or `setInterval` in `useEffect`) for polling — NOT TanStack Query polling (polling interval too short for React Query's refetch model)
- Export `OnboardingStep` as a const enum (not TypeScript enum — avoids transpile issues)

#### Definition of Done — Section A
- [ ] File exists at `src/hooks/useOnboardingStatus.ts`
- [ ] Returns `{ step, importedCount, isConnected, error }`
- [ ] Polling stops when step = COMPLETE or ERROR
- [ ] `npx tsc --noEmit` passes on this file

---

### Section B: Subcomponents

#### `ConnectML.tsx`

**File:** `src/components/onboarding/ConnectML.tsx`

Pure presentational component. Receives `onConnect: () => void` as prop.

UI content:
- Headline: `"Conecte sua loja do Mercado Livre"`
- Subtext: `"Vamos analisar seus últimos 90 dias de vendas e te mostrar onde está o seu dinheiro."`
- Button: `"Conectar Mercado Livre"` — calls `onConnect()` on click
- No forms, no other fields

`onConnect()` calls the existing `startMercadoLivreAuth()` from `src/WebhooksAPI/marketplace/mercado-livre/index.ts`.

Constraints: under 50 lines, no supabase calls, no hooks.

#### `ImportProgress.tsx`

**File:** `src/components/onboarding/ImportProgress.tsx`

Props: `importedCount: number`

UI content (lines appear sequentially — use CSS transition or simple opacity):
- `"✅ Conectado ao Mercado Livre"`
- `"⏳ Importando seus pedidos... (${importedCount} encontrados)"`
  → updates live as `importedCount` changes
- A progress message, not a progress bar (the count IS the progress indicator)
- Font size: large — this is the hero content of the screen

Constraints: under 50 lines, no logic, only visual.

#### `ImportComplete.tsx`

**File:** `src/components/onboarding/ImportComplete.tsx`

Props: `orderCount: number`, `onRedirect: () => void`

UI content:
- `"✅ Pronto! Encontramos ${orderCount} pedidos."`
- `"Levando você para o Diagnóstico..."`
- Calls `onRedirect()` via `useEffect` after 1500ms

Constraints: under 30 lines.

#### Definition of Done — Section B
- [ ] All 3 files exist in `src/components/onboarding/`
- [ ] No `supabase.from(...)` in any component file
- [ ] Each component under 50 lines
- [ ] TypeScript props interfaces defined (no `any`)

---

### Section C: `Onboarding.tsx` Page

**File:** `src/pages/Onboarding.tsx`

```typescript
// Renders the correct component based on step from useOnboardingStatus()
// Uses useNavigate() to redirect to /diagnostico when step = COMPLETE
// Error state (inline, no subcomponent needed):
//   "Não conseguimos importar seus pedidos. [Tentar novamente]"
//   The retry button calls the polling restart logic (clear error, reset to IMPORTING)
```

Constraints: under 80 lines. All logic in `useOnboardingStatus` — the page only renders based on step.

---

### Section D: Register Route in App.tsx

Add `/onboarding` to the protected routes section in `src/App.tsx`:

```typescript
<Route path="/onboarding" element={
  <Suspense fallback={<Loading />}>
    <Onboarding />
  </Suspense>
} />
```

**Important:** This route is protected (requires auth) but has NO module permission gate.
Any authenticated user can access it — even those with no modules enabled.

Also verify that after `mercado-livre-callback` completes successfully, the user is redirected
to `/onboarding?step=importing`. If the current callback redirects elsewhere, update it —
but keep the callback logic itself unchanged.

#### Definition of Done — Section D
- [ ] `/onboarding` route registered in `App.tsx` as a lazy import
- [ ] Route is inside the auth-protected section
- [ ] Route does NOT have a `<RestrictedRoute>` wrapper

---

## 7. Integration Checklist

- [ ] `startMercadoLivreAuth()` (existing function) is called from `ConnectML.tsx` → `Onboarding.tsx`
- [ ] After successful OAuth callback, user lands on `/onboarding?step=importing`
- [ ] `orders-sync-ml` is triggered after OAuth (from the callback edge function or from `useOnboardingStatus`)
- [ ] Polling correctly detects when sync is complete (count stops growing)
- [ ] Error state shows with retry — not a blank screen
- [ ] Redirect to `/diagnostico` happens automatically at 1.5s after complete (no click needed)

---

## 8. Definition of Done — Full Task

- [ ] All Section A, B, C, D DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] New user signs up → sees `/onboarding` screen with "Conectar Mercado Livre"
  - [ ] Clicks "Conectar" → redirected to ML authorization page
  - [ ] Completes ML auth → returns to `/onboarding?step=importing`
  - [ ] Import progress shows live order count
  - [ ] After import completes, auto-redirected to `/diagnostico`
  - [ ] Refreshing during import → stays on importing state with correct count
  - [ ] If ML API fails → shows error with retry button (not blank screen)
- [ ] No TypeScript `any` introduced
- [ ] No supabase calls in component files

---

## 9. What NOT to Build

- **Do NOT build CNPJ step here** — CNPJ enrichment is in the onboarding flow for C1 but is
  a separate concern from the ML connection. The ML connection is the critical path. CNPJ
  can be collected later (via the NFe readiness checklist).
- **Do NOT add a "Connect Shopee" button** — Shopee onboarding is Cycle 3.
- **Do NOT show sample/demo data** — only real imported data, always.
- **Do NOT build a multi-step wizard** — the flow is: Connect → Import → Diagnóstico.
  No step indicators, no "Step 2 of 5" patterns.
- **Do NOT build subscription/billing UI** — that's C1-T5.
