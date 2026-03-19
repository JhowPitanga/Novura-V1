# PRD — C1-T5: Freemium Feature Matrix + Paywall Gates

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** [C1-T4 — Orders with Margin](./C1-T4-orders-margin.md) (stub `isPaid = true` must be replaced)
**Blocks:** [C1-T7 — NFe Readiness Checklist](./C1-T7-nfe-readiness-checklist.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Right now every feature in Novura is unlocked for everyone. This task adds the business model:
free users can see the Diagnóstico and browse their orders, but premium features (emitting invoices,
printing labels, managing inventory, editing listings) require a subscription.

The gates work as follows: instead of hiding the button or showing an error, Novura shows the
button normally — but when a free user clicks it, a small modal appears saying what the feature
is and inviting them to subscribe. No bait-and-switch: the feature is visible and accessible,
just gated by subscription.

This task also creates the billing infrastructure that tracks whether a user is subscribed or
in a free trial. The actual Stripe payment UI is out of scope here — this task creates the
subscription record management that the billing pages will use later.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `src/hooks/useSubscription.ts` — does this file exist? If yes, read it.
- [ ] Look for any `subscriptions` or `billing_customers` table in `supabase/migrations/`.
- [ ] Search for `isPaid` in the codebase: `grep -r "isPaid\|useSubscription" src/`
      — note all stub usages (added in C1-T4 with TODO comments).
- [ ] Read `src/hooks/useAuth.tsx` — does it expose any subscription state?
- [ ] Check `src/components/ui/` — does a Dialog/Modal component exist from shadcn/ui?
- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.5: Freemium Feature Matrix" in full.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.5: Freemium Feature Matrix" in full.
      Record: which features are free vs paid, the proportional margin unlock formula.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.
- [ ] Search for all `// TODO C1-T5` comments in the codebase — these are the stub usages
      that must be replaced by the real `useSubscription` hook.
- [ ] Check the database for any existing subscription tables.

---

## 4. Architecture Context

### Feature Gate Matrix

| Feature | Free Tier | Paid (subscribed or in trial) |
|---|---|---|
| Diagnóstico (90 days) | ✅ full | ✅ full |
| Conta health (reputation, rates) | ✅ | ✅ |
| ADS impact summary | ✅ summary | ✅ + campaign detail |
| Orders list (read-only) | ✅ | ✅ + actions |
| Margin per order | ✅ proportional* | ✅ all orders |
| Emitir NFe | ❌ paywall | ✅ |
| Imprimir etiqueta | ❌ paywall | ✅ |
| Gestão de estoque | ❌ paywall | ✅ |
| Editar/criar anúncio | ❌ paywall | ✅ |

*Proportional margin unlock: `Math.min(5, Math.max(1, Math.floor(totalListings * 0.2)))`
- Seller with 10 listings → 2 orders with unlocked margin
- Seller with 25 listings → 5 orders with unlocked margin
- Cap at 5 regardless of listing count

### Subscription States

```typescript
export type SubscriptionStatus =
  | 'none'        // no subscription, no trial
  | 'trialing'    // 14-day trial active
  | 'active'      // paid subscription active
  | 'past_due'    // payment failed
  | 'canceled'    // subscription ended
```

### Data Model

```sql
-- supabase/migrations/YYYYMMDD_000000_create_subscriptions_table.sql

CREATE TABLE IF NOT EXISTS billing_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id  text UNIQUE,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  status              text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none','trialing','active','past_due','canceled')),
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_subscriptions_org ON subscriptions(organization_id);
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER hide features from free users — only gate actions** | Free users must see the full product. Hiding screens creates frustration and kills conversion. Show with paywall, not hide. |
| **NEVER make the paywall modal hostile** | It's a selling opportunity. The modal should show value, not a wall. |
| **The isPaid check must be fast** | Cache subscription status in React Query — never block page render to check subscription. |
| **Trial starts AFTER payment** | Card required to start trial. No free trial without payment method. |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_subscriptions_tables.sql`

Use the schema from Section 4.

Present this SQL to a human for review before applying.

#### Definition of Done — Section A
- [ ] Migration file exists
- [ ] `billing_customers` and `subscriptions` tables created
- [ ] Migration applied to dev environment

---

### Section B: Subscription Service

**File:** `src/services/billing.service.ts`

```typescript
import { supabase } from '@/integrations/supabase/client'
import type { SubscriptionStatus } from '@/types/billing'

export interface SubscriptionInfo {
  status: SubscriptionStatus
  isPaid: boolean          // true if trialing or active
  trialEndsAt: Date | null
  currentPeriodEnd: Date | null
}

export async function fetchSubscription(
  organizationId: string
): Promise<SubscriptionInfo> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, current_period_end')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw error

  const status: SubscriptionStatus = data?.status ?? 'none'
  const isPaid = status === 'trialing' || status === 'active'

  return {
    status,
    isPaid,
    trialEndsAt: data?.trial_ends_at ? new Date(data.trial_ends_at) : null,
    currentPeriodEnd: data?.current_period_end ? new Date(data.current_period_end) : null,
  }
}

export const billingKeys = {
  subscription: (orgId: string) => ['billing', 'subscription', orgId] as const,
}
```

#### Definition of Done — Section B
- [ ] `fetchSubscription` returns `SubscriptionInfo` with correct `isPaid` logic
- [ ] Returns `{ status: 'none', isPaid: false }` when no subscription row exists
- [ ] Under 40 lines

---

### Section C: `useSubscription` Hook

**File:** `src/hooks/useSubscription.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { fetchSubscription, billingKeys } from '@/services/billing.service'

export function useSubscription() {
  const { organizationId } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: billingKeys.subscription(organizationId ?? ''),
    queryFn: () => fetchSubscription(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    isPaid:          data?.isPaid ?? false,
    status:          data?.status ?? 'none',
    trialEndsAt:     data?.trialEndsAt ?? null,
    isLoadingBilling: isLoading,
  }
}
```

#### Definition of Done — Section C
- [ ] `useSubscription` returns `{ isPaid, status, trialEndsAt, isLoadingBilling }`
- [ ] Under 30 lines
- [ ] Replaces all `// TODO C1-T5` stubs in the codebase

---

### Section D: Paywall Components

**File:** `src/components/billing/PaywallButton.tsx`

```typescript
interface PaywallButtonProps {
  feature: string           // e.g. 'nfe', 'print', 'inventory', 'edit-listing'
  label: string             // button label the user would see if paid
  message: string           // e.g. "Emissão de NFe disponível no Novura Pro"
  onAction?: () => void     // only called if isPaid
  variant?: 'default' | 'outline' | 'ghost'
}
```

Behavior:
- If `isPaid`: renders a normal button calling `onAction()`
- If not `isPaid`: renders the button but opens `PaywallModal` on click instead of `onAction()`

**File:** `src/components/billing/PaywallModal.tsx`

```typescript
interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  feature: string
  message: string
}
```

Modal content:
- Title: `"Recurso do Novura Pro"`
- Body: the `message` prop
- Benefit line (derived from feature name):
  - `nfe` → `"Automatize suas notas e economize horas por semana"`
  - `print` → `"Imprima etiquetas diretamente pelo Novura"`
  - `inventory` → `"Controle seu estoque em tempo real"`
  - `edit-listing` → `"Edite seus anúncios sem sair do Novura"`
  - default → `"Desbloqueie com o plano Pro"`
- CTA button: `"Assinar agora"` → navigates to `/configuracoes/assinatura` (create route stub)
- Secondary: `"Cancelar"` → closes modal

Uses the existing shadcn/ui `Dialog` component.

**File:** `src/components/billing/index.ts`
```typescript
export { PaywallButton } from './PaywallButton'
export { PaywallModal } from './PaywallModal'
```

#### Definition of Done — Section D
- [ ] `PaywallButton` renders normally for paid users, opens modal for free users
- [ ] `PaywallModal` shows feature name + benefit + "Assinar agora" CTA
- [ ] Modal closes on "Cancelar"
- [ ] Both components under 60 lines each
- [ ] No `any` types

---

### Section E: Wire Up Real `useSubscription` in Orders.tsx

Replace the stub `const isPaid = true` (added in C1-T4) with the real hook:

```typescript
const { isPaid } = useSubscription()
```

And apply the proportional margin unlock for free users:

```typescript
// The first N orders (sorted by created_at desc) show margin even for free users
// N = Math.min(5, Math.max(1, Math.floor(totalListings * 0.2)))
// For MVP: use a fixed N = 3 if totalListings is not yet available
const freeMarginUnlockCount = 3  // TODO: derive from totalListings when listings count is available

function canShowMarginForRow(rowIndex: number, isPaid: boolean): boolean {
  if (isPaid) return true
  return rowIndex < freeMarginUnlockCount
}
```

#### Definition of Done — Section E
- [ ] `isPaid` stub removed from `Orders.tsx`
- [ ] Real `useSubscription()` used instead
- [ ] Proportional unlock applied (even if simplified to 3 for MVP)

---

### Section F: Apply Gates to Other Features

Apply `PaywallButton` to the following places (find them by searching for the action buttons):

1. **NFe emission button** in `Orders.tsx` (the "Emitir NFe" button)
2. **Print label button** in `Orders.tsx` (the "Imprimir" button)
3. **Edit listing button** in `Listings.tsx` if it exists

Pattern for each:
```typescript
// Before:
<Button onClick={handleEmitNfe}>Emitir NFe</Button>

// After:
<PaywallButton
  feature="nfe"
  label="Emitir NFe"
  message="Emissão de NFe disponível no Novura Pro"
  onAction={handleEmitNfe}
/>
```

#### Definition of Done — Section F
- [ ] NFe emission button gated
- [ ] Print label button gated
- [ ] Each gate replaced with `PaywallButton` component

---

## 7. Integration Checklist

- [ ] `subscriptions` table exists in the database
- [ ] `useSubscription()` hook returns correct `isPaid` for a free user (no row in subscriptions)
- [ ] `useSubscription()` returns `isPaid = true` for a row with `status = 'active'`
- [ ] All `// TODO C1-T5` stubs replaced with real hook
- [ ] `PaywallModal` opens when a free user clicks a gated button
- [ ] "Assinar agora" button navigates to `/configuracoes/assinatura`

---

## 8. Definition of Done — Full Task

- [ ] All Section A–F DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] As a free user: orders list shows margin for first 3 orders, blurred for rest
  - [ ] As a free user: clicking "Emitir NFe" opens PaywallModal
  - [ ] As a free user: clicking "Imprimir" opens PaywallModal
  - [ ] As a paid user: all features accessible normally
  - [ ] PaywallModal shows correct benefit message per feature
  - [ ] "Assinar agora" navigates to `/configuracoes/assinatura`
- [ ] No `any` types
- [ ] All stubs removed

---

## 9. What NOT to Build

- **Do NOT build Stripe payment integration** — the subscription page at `/configuracoes/assinatura`
  can be a placeholder ("Em breve") for now. The billing provider integration is a separate task.
- **Do NOT build trial activation flow** — trial starts when Stripe payment is confirmed.
  For now, inserting a row in `subscriptions` with `status = 'active'` is enough for testing.
- **Do NOT add billing to the auth flow** — the subscription check happens lazily, not at login.
- **Do NOT build plan tiers** — single plan for MVP. No "Basic/Pro/Enterprise" tiers.
- **Do NOT restrict Diagnóstico** — it must always be fully accessible. Never gate it.
