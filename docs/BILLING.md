# Billing — Monetização e Cobrança
**Status:** Implement before or alongside Cycle 1 (required for paywall gates) | **Appetite:** 2-3 weeks
**Team:** 1 fullstack engineer

---

## Purpose of This Document

This document is the complete specification for the billing system. An agent or engineer implementing billing should follow this document exactly. Do not add features not listed here. Billing is a high-risk area — incorrect implementations can result in:
- Users charged without access (churn + support cost)
- Users with access without being charged (revenue loss)
- Double-charges (legal risk)
- Feature access leaks (business risk)

Every implementation decision here is deliberate. Follow it exactly.

---

## Model Overview

```
Free (permanent)
  └── Diagnóstico + ML connect always available, no time limit
  └── No credit card required

Trial (14 days, automatic)
  └── Starts automatically after first ML connection (not at signup)
  └── Full product access
  └── No credit card required
  └── Countdown shown: "X dias restantes do seu período gratuito"

Paid (R$149/mês)
  └── Full product access
  └── Recurring monthly charge via Stripe
  └── Starts after trial ends (seller must subscribe)
```

**Why trial starts at ML connect, not at signup:** A seller who signs up and never connects ML has seen zero value. Charging them a 14-day clock is unfair and will cause negative word-of-mouth. The clock starts when value is delivered.

---

## What Already Exists

**Nothing related to billing exists in the codebase.** Confirmed via codebase search:
- No Stripe SDK installed
- No `stripe-webhook` edge function
- No `subscriptions` or `billing_customers` tables
- No `useSubscription()` hook
- The only "Stripe" reference is a static payment option in `src/pages/SellerResources.tsx` (unrelated)

---

## Database Schema

### Table: `billing_customers`

```sql
CREATE TABLE billing_customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id  text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT billing_customers_org_unique UNIQUE (organization_id),
  CONSTRAINT billing_customers_stripe_unique UNIQUE (stripe_customer_id)
);

ALTER TABLE billing_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON billing_customers
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
```

### Table: `subscriptions`

```sql
CREATE TABLE subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_subscription_id    text,           -- null until seller subscribes (during trial-only phase)
  stripe_customer_id        text NOT NULL,
  status                    text NOT NULL DEFAULT 'trialing'
                              CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'free')),
  plan_id                   text DEFAULT 'novura_pro_monthly',
  trial_start               timestamptz,
  trial_end                 timestamptz,
  current_period_start      timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean NOT NULL DEFAULT false,
  canceled_at               timestamptz,
  grace_period_end          timestamptz,    -- computed: current_period_end + 7 days on payment failure
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_org_unique UNIQUE (organization_id)
);

CREATE INDEX subscriptions_stripe_sub_id ON subscriptions (stripe_subscription_id);
CREATE INDEX subscriptions_status ON subscriptions (status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON subscriptions
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
```

### Migration Files

Create individual files (do NOT combine into one migration):
```
supabase/migrations/YYYYMMDD_create_billing_customers.sql
supabase/migrations/YYYYMMDD_create_subscriptions.sql
supabase/migrations/YYYYMMDD_add_subscription_trigger.sql  -- auto-create subscription on org creation
```

### Trigger: Auto-create subscription record at trial start

```sql
-- This trigger fires when a seller first connects ML (not at signup)
-- The application calls this function explicitly after successful ML import
CREATE OR REPLACE FUNCTION start_trial_for_organization(org_id uuid)
RETURNS void AS $$
BEGIN
  -- Only start trial if no subscription exists yet
  IF NOT EXISTS (SELECT 1 FROM subscriptions WHERE organization_id = org_id) THEN
    INSERT INTO subscriptions (
      organization_id,
      stripe_customer_id,  -- will be set when Stripe customer is created
      status,
      trial_start,
      trial_end
    ) VALUES (
      org_id,
      '',  -- placeholder, updated when Stripe customer is created
      'trialing',
      now(),
      now() + interval '14 days'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This function is called by `orders-sync-ml` after a successful first sync.

---

## Stripe Configuration

### Stripe Product/Price Setup (one-time, via Stripe Dashboard or API)

```
Product: "Novura Pro"
  Price: novura_pro_monthly
    Amount: R$14900 (in centavos = R$149,00)
    Currency: BRL
    Interval: month
    Trial period: 0 days (we handle trial via subscription metadata, not Stripe trial)
    Tax behavior: exclusive (Stripe will not add tax; handle ISS/PIS/COFINS separately if needed later)
```

**Why we don't use Stripe's built-in trial:** Stripe's trial is attached to the subscription object and starts when the subscription is created. Our trial starts when the seller connects ML, before any subscription object exists. Managing trial state in our own DB gives us more control.

### Environment Variables Required

```
# Add to Supabase Edge Function secrets:
STRIPE_SECRET_KEY=sk_live_...          # or sk_test_... for dev
STRIPE_WEBHOOK_SECRET=whsec_...        # from Stripe Dashboard → Webhooks
STRIPE_PRICE_ID=price_...             # ID of novura_pro_monthly price
SITE_URL=https://app.novura.com.br    # for redirect URLs
```

---

## Edge Functions

### Function 1: `stripe-create-checkout-session`
**Location:** `supabase/functions/stripe-create-checkout-session/index.ts`
**Trigger:** Frontend calls this when seller clicks "Assinar"
**Responsibility:** Create Stripe Customer (if not exists) + create Checkout Session

```typescript
import Stripe from 'https://esm.sh/stripe@14'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!)

// Input (from frontend)
interface CheckoutInput {
  organization_id: string
  success_url?: string  // defaults to /billing/sucesso
  cancel_url?: string   // defaults to /configuracoes
}

// Implementation:
// 1. Check if billing_customers row exists for this org
// 2. If not: create Stripe Customer with org metadata
//    const customer = await stripe.customers.create({
//      metadata: { organization_id: organization_id }
//    })
//    Then INSERT into billing_customers
// 3. If yes: fetch existing stripe_customer_id
//
// 4. Create Checkout Session:
//    const session = await stripe.checkout.sessions.create({
//      customer: stripe_customer_id,
//      payment_method_types: ['card'],
//      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
//      mode: 'subscription',
//      success_url: `${SITE_URL}/billing/sucesso?session_id={CHECKOUT_SESSION_ID}`,
//      cancel_url: `${SITE_URL}/configuracoes`,
//      metadata: { organization_id },
//    })
//
// 5. Return { url: session.url }
```

**Critical edge cases:**
- **Race condition — double customer creation:** If two requests fire simultaneously (user double-clicks), both may try to create a Stripe Customer. Mitigate with UPSERT on `billing_customers (organization_id)`. If the INSERT fails due to unique constraint, fetch the existing row.
- **Billing_customers.stripe_customer_id = '':** This is the placeholder set during trial start. Update it when creating the actual Stripe Customer.
- **Seller already has active subscription:** Check before creating session. If `subscriptions.status IN ('active', 'trialing')`: return `{ error: 'already_subscribed' }` — do NOT create a second subscription.

---

### Function 2: `stripe-webhook`
**Location:** `supabase/functions/stripe-webhook/index.ts`
**Trigger:** Stripe posts events to this endpoint
**Responsibility:** Process all Stripe events, update `subscriptions` table

**Security: Validate signature FIRST, always.**
```typescript
const signature = req.headers.get('stripe-signature')
let event: Stripe.Event

try {
  const body = await req.text()  // must be raw body, not parsed JSON
  event = stripe.webhooks.constructEvent(
    body,
    signature!,
    Deno.env.get('STRIPE_WEBHOOK_SECRET')!
  )
} catch (err) {
  return new Response('Invalid signature', { status: 401 })
}
```

**NEVER process an event without signature validation.** A malicious actor could POST fake events to upgrade themselves for free.

**Events to handle:**

```typescript
switch (event.type) {

  case 'checkout.session.completed': {
    // Seller completed checkout
    const session = event.data.object as Stripe.Checkout.Session
    const org_id = session.metadata!.organization_id
    const subscription_id = session.subscription as string

    // Fetch full subscription from Stripe to get accurate dates
    const sub = await stripe.subscriptions.retrieve(subscription_id)

    await supabase.from('subscriptions').upsert({
      organization_id: org_id,
      stripe_subscription_id: subscription_id,
      stripe_customer_id: session.customer as string,
      status: sub.status,  // usually 'active' (our trial is not Stripe's trial)
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' })
    break
  }

  case 'customer.subscription.updated': {
    const sub = event.data.object as Stripe.Subscription
    const org_id = sub.metadata.organization_id

    // If org_id not in metadata: look up via billing_customers table
    // billing_customers WHERE stripe_customer_id = sub.customer → get organization_id

    await supabase.from('subscriptions').update({
      status: sub.status,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', sub.id)
    break
  }

  case 'customer.subscription.deleted': {
    const sub = event.data.object as Stripe.Subscription
    await supabase.from('subscriptions').update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', sub.id)
    break
  }

  case 'invoice.payment_succeeded': {
    const invoice = event.data.object as Stripe.Invoice
    const sub = await stripe.subscriptions.retrieve(invoice.subscription as string)
    await supabase.from('subscriptions').update({
      status: 'active',
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      grace_period_end: null,  // clear grace period on successful payment
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', sub.id)
    break
  }

  case 'invoice.payment_failed': {
    const invoice = event.data.object as Stripe.Invoice
    const sub_id = invoice.subscription as string

    // Set grace_period_end = current_period_end + 7 days
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('current_period_end')
      .eq('stripe_subscription_id', sub_id)
      .single()

    const gracePeriodEnd = new Date(existing.current_period_end)
    gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)

    await supabase.from('subscriptions').update({
      status: 'past_due',
      grace_period_end: gracePeriodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('stripe_subscription_id', sub_id)

    // TODO: trigger email notification (use Resend, Loops, or Customer.io)
    break
  }

  case 'customer.subscription.trial_will_end': {
    // This event fires 3 days before Stripe trial ends.
    // We don't use Stripe trials — ignore this event (we manage trial ourselves)
    // OR: use it to send reminder email if we're using Stripe for trial management
    break
  }
}

// Always return 200 for events we don't handle — Stripe will retry if we return an error
return new Response('ok', { status: 200 })
```

**Critical: Idempotency in webhook processing**
Stripe may deliver the same event multiple times (retries). Every `UPDATE` must be idempotent. Using `UPDATE ... WHERE stripe_subscription_id = sub.id` is safe — running it twice produces the same result.

**Critical: Never return 5xx to Stripe**
If your DB update fails, log the error but still return 200. Returning 5xx causes Stripe to retry, which can create issues. Instead, have a `stripe-sync-subscription` function (see below) as a fallback.

---

### Function 3: `stripe-create-portal-session`
**Location:** `supabase/functions/stripe-create-portal-session/index.ts`
**Trigger:** Frontend calls this when seller clicks "Gerenciar assinatura"

```typescript
// 1. Look up stripe_customer_id for this org
// 2. Create portal session:
const portalSession = await stripe.billingPortal.sessions.create({
  customer: stripe_customer_id,
  return_url: `${SITE_URL}/configuracoes`,
})
// 3. Return { url: portalSession.url }
```

The Stripe Customer Portal handles: view invoices, update payment method, cancel subscription. We do NOT build custom UI for these.

**Pre-requisite:** Configure the Stripe Customer Portal in the Stripe Dashboard before deploying. Set:
- Business information (Novura logo, support email)
- Features enabled: billing history, cancel subscription, update payment method
- Redirect URL after actions

---

### Function 4: `stripe-sync-subscription` (Fallback/Recovery)
**Location:** `supabase/functions/stripe-sync-subscription/index.ts`
**Trigger:** Called on every login (lightweight check) as webhook fallback

```typescript
// Called on login: "Did the webhook arrive? Is our DB in sync with Stripe?"
// 1. Look up stripe_subscription_id for this org
// 2. If exists: call stripe.subscriptions.retrieve(id)
// 3. If Stripe status !== DB status: update DB
// This handles: webhook delivery failures, Stripe retry exhaustion, etc.
```

**On login trigger:** Call this from the `useAuth` hook's session refresh (or from the dashboard page load). It adds ~200ms latency but prevents the scenario where a seller subscribes but the webhook fails to arrive.

---

## Frontend: Feature Gating

### Hook: `useSubscription`
**Location:** `src/hooks/useSubscription.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'

export interface SubscriptionState {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'free' | 'loading'
  isPaid: boolean                // true if trialing | active | (past_due AND within grace period)
  daysLeftInTrial: number | null // null if not in trial
  trialEnded: boolean
  isGracePeriod: boolean
  gracePeriodEndsAt: Date | null
}

export function useSubscription(): SubscriptionState {
  const { organizationId } = useAuth()

  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription', organizationId],
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('organization_id', organizationId!)
        .single()
      return data
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading || !subscription) {
    return { status: 'loading', isPaid: false, daysLeftInTrial: null, trialEnded: false, isGracePeriod: false, gracePeriodEndsAt: null }
  }

  const now = new Date()
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end) : null
  const gracePeriodEnd = subscription.grace_period_end ? new Date(subscription.grace_period_end) : null

  const isTrialing = subscription.status === 'trialing' && trialEnd && trialEnd > now
  const isActive = subscription.status === 'active'
  const isPastDue = subscription.status === 'past_due'
  const isGracePeriod = isPastDue && gracePeriodEnd && gracePeriodEnd > now

  return {
    status: isTrialing ? 'trialing' : subscription.status,
    isPaid: isTrialing || isActive || isGracePeriod,
    daysLeftInTrial: isTrialing ? Math.ceil((trialEnd!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null,
    trialEnded: !isTrialing && !!trialEnd && trialEnd <= now && !isActive,
    isGracePeriod: !!isGracePeriod,
    gracePeriodEndsAt: gracePeriodEnd,
  }
}
```

### Using the Hook in Pages

```typescript
// In any paid feature page or component:
const { isPaid, daysLeftInTrial, status } = useSubscription()

if (!isPaid) {
  return <UpgradeModal feature="orders-margin" />
}
```

### Upgrade Modal Component
**Location:** `src/components/billing/UpgradeModal.tsx`

```typescript
interface UpgradeModalProps {
  feature: 'orders-margin' | 'nfe-emission' | 'stock-intelligence' | 'seu-caixa' | 'ads-efficiency'
}
```

The modal content varies by feature — show 3-4 benefits specific to the feature the seller was trying to access.

Example for `orders-margin`:
```
┌─────────────────────────────────────────────────┐
│ Veja sua margem real por pedido                 │
│                                                 │
│ ✓ Margem após comissão, frete e custo           │
│ ✓ Identifique produtos que estão te custando    │
│ ✓ Filtre pedidos por margem positiva/negativa   │
│ ✓ Histórico completo com custos reais           │
│                                                 │
│ Novura Pro — R$149/mês                          │
│                                                 │
│           [Assinar agora]                       │
│      [Já tenho uma conta? Entrar]               │
└─────────────────────────────────────────────────┘
```

**Never show a generic upgrade modal.** The feature context makes the upgrade feel natural, not like a block.

---

## Frontend: Billing Pages

### Success Page
**Route:** `/billing/sucesso`
**File:** `src/pages/BillingSuccess.tsx`

```typescript
// Query params: ?session_id=cs_...
// 1. Poll subscriptions table for up to 10 seconds waiting for webhook to arrive
// 2. When status = 'active': show success message
// 3. If 10s timeout: show "Estamos processando seu pagamento. Você receberá uma confirmação por email."
```

**Never show success before confirming DB status.** Race condition: Stripe redirects to success URL before the webhook arrives. The polling solves this.

### Settings Page Addition
Add a "Cobrança" section to `src/pages/Settings.tsx`:

```
Plano atual: Novura Pro (ativo)
Próxima cobrança: 15/04/2026 — R$149,00
Método de pagamento: Visa •••• 4242

[Gerenciar assinatura →]  (opens Stripe Portal)
```

For free tier:
```
Plano atual: Gratuito
[Assinar Novura Pro — R$149/mês →]
```

For trialing:
```
Plano atual: Período gratuito (8 dias restantes)
[Assinar para continuar →]
[Ver o que você vai desbloquear]
```

---

## Trial Banner

Show a sticky banner at the top of the app during trial:

```typescript
// src/components/billing/TrialBanner.tsx
const { daysLeftInTrial, trialEnded } = useSubscription()

if (!daysLeftInTrial && !trialEnded) return null

if (daysLeftInTrial <= 3) {
  return <Banner color="red">
    Seu período gratuito termina em {daysLeftInTrial} dias.
    <Button>Assinar agora</Button>
  </Banner>
}

if (daysLeftInTrial > 3) {
  return <Banner color="blue">
    {daysLeftInTrial} dias restantes do seu período gratuito.
    <Button variant="ghost">Assinar</Button>
  </Banner>
}
```

**Do NOT show the banner after the seller subscribes.** Remove it as soon as `status = 'active'`.

---

## Subscription Lifecycle State Machine

```
[signup] → no subscription row
[first ML connect] → start_trial_for_organization() → status = 'trialing'
[trial expires] → status stays 'trialing' until seller subscribes or we downgrade via cron
[seller subscribes] → checkout.session.completed → status = 'active'
[payment succeeds] → invoice.payment_succeeded → status = 'active', renew period
[payment fails] → invoice.payment_failed → status = 'past_due', grace_period_end = +7 days
[grace period expires] → cron job → status = 'past_due' (features blocked after grace_period_end)
[seller cancels] → customer.subscription.deleted → status = 'canceled'
[data retained] → 90 days post-cancellation, then archived
```

### Cron: Downgrade After Trial Expiry
Sellers who don't subscribe after trial need to be blocked from paid features. The `subscriptions.status` stays 'trialing' even after `trial_end` passes (Stripe doesn't know about our trial).

Add a cron that runs daily to check for expired trials and enforce the 'free' status:
```sql
-- supabase/migrations/YYYYMMDD_trial_expiry_cron.sql
SELECT cron.schedule(
  'expire-trials',
  '0 9 * * *',  -- 9am UTC daily
  $$
    UPDATE subscriptions
    SET status = 'free', updated_at = now()
    WHERE status = 'trialing'
      AND trial_end < now()
      AND stripe_subscription_id IS NULL  -- they never subscribed
  $$
);
```

---

## Feature Gating Rules

| Hook/Service | Gate condition |
|---|---|
| `useDiagnostico` | Always free — no gate |
| `useOrdersWithMargin` | `isPaid` must be true |
| `useNfeEmit` | `isPaid` must be true |
| `useStockAlerts` | `isPaid` must be true |
| `useSeuCaixa` | `isPaid` must be true |
| `useMlAds` | `isPaid` must be true |
| `useMercadoPago` | `isPaid` must be true |
| `useListingPerformance` | `isPaid` must be true |
| `useReputation` | `isPaid` must be true |

**Gate location rule:** The gate is in the **hook**, not the UI. The hook returns `null` + `requiresUpgrade: true` when access is denied. The UI reads `requiresUpgrade` and shows the `UpgradeModal`. This prevents a determined user from bypassing UI gates.

```typescript
// Pattern for paid hooks:
export function useOrdersWithMargin() {
  const { isPaid } = useSubscription()

  const query = useQuery({
    queryKey: ['orders', 'with-margin', organizationId],
    queryFn: () => fetchOrdersWithMargin(organizationId!),
    enabled: !!organizationId && isPaid,  // disabled if not paid
  })

  return {
    ...query,
    requiresUpgrade: !isPaid,
  }
}
```

---

## New Files to Create

### Pages
```
src/pages/BillingSuccess.tsx
```

### Components
```
src/components/billing/
  UpgradeModal.tsx
  TrialBanner.tsx
  BillingSection.tsx          — for Settings page
```

### Hooks
```
src/hooks/useSubscription.ts
```

### Edge Functions
```
supabase/functions/stripe-create-checkout-session/index.ts
supabase/functions/stripe-webhook/index.ts
supabase/functions/stripe-create-portal-session/index.ts
supabase/functions/stripe-sync-subscription/index.ts
```

### Migrations
```
supabase/migrations/YYYYMMDD_create_billing_customers.sql
supabase/migrations/YYYYMMDD_create_subscriptions.sql
supabase/migrations/YYYYMMDD_trial_expiry_cron.sql
```

---

## App.tsx Routes to Add

```typescript
<Route path="/billing/sucesso" element={
  <ProtectedRoute>
    <Suspense fallback={<Loading />}><BillingSuccess /></Suspense>
  </ProtectedRoute>
} />
```

---

## Security Checklist

| Risk | Mitigation |
|---|---|
| Webhook without signature validation | `stripe.webhooks.constructEvent()` — reject without signature |
| Stripe Customer created twice (race condition) | UPSERT with `ON CONFLICT (organization_id)` |
| User upgrades via fake event | Signature validation blocks this |
| Trial abused (create new account every 14 days) | Rate limit account creation by IP + email verification requirement |
| Webhook fails → feature not unlocked | `stripe-sync-subscription` called on every login as fallback |
| Seller cancels and loses data | Data retained 90 days post-cancellation. Communicate clearly. |
| Grace period not enforced | `isPaid` logic in `useSubscription()` checks `grace_period_end` explicitly |
| Downgrade doesn't fire (webhook missed) | Daily cron `expire-trials` + login-time sync |

---

## Code Best Practices

### Stripe SDK in Deno/Edge Functions
```typescript
// Use the Stripe npm package via esm.sh (compatible with Deno)
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',  // pin the API version — never use 'latest'
  httpClient: Stripe.createFetchHttpClient(),  // required for Deno
})
```

**Pin the Stripe API version.** Never use unversioned imports. Breaking changes in Stripe's API will silently break your integration.

### Raw body for webhook validation
The Stripe signature validation requires the raw request body (not parsed JSON). In Deno:
```typescript
const body = await req.text()  // NOT await req.json()
// Pass body (string) to stripe.webhooks.constructEvent
// Then parse if needed: JSON.parse(body)
```

### Amounts in Stripe
Stripe works in smallest currency unit (centavos). R$149,00 = 14900 centavos. Never pass R$149 as 149 to Stripe — that creates a R$1,49 charge.

### BRL-specific considerations
- Stripe supports BRL for card payments and for Pix (as of 2024)
- Pix is NOT natively recurring in Stripe. For the subscription (recurring monthly): card only.
- If a seller insists on Pix: consider annual plan as a one-time payment, not recurring. This is a Billing Open Question — do not implement Pix recurring in this cycle.

---

## What NOT to Build

### Rabbit Holes
- **Annual plan** — Validate monthly retention first. Add annual discount after 3 months of monthly data.
- **Boleto support** — Boleto adds significant checkout complexity. Card first.
- **Custom invoice generation** — Use Stripe's hosted invoices (PDF). Do not build custom invoice PDFs.
- **Usage-based billing** — Do not implement per-order or per-volume pricing. Flat R$149/mês only.
- **Multi-seat pricing** — Single plan covers the whole organization. Team features are not gated by seat count.
- **Coupon/promo codes** — Can be added via Stripe Dashboard once needed. Not an engineering task for now.

### No-Gos
- Processing payments without Stripe (no direct card handling)
- Storing card data (never — Stripe handles this)
- Charging sellers without their explicit action (no auto-upgrade from trial)
- Blocking access to Diagnóstico ever (it's always free)

---

## Definition of Done

1. **Trial starts at ML connect** — When a seller completes their first ML sync, a `subscriptions` row is created with `status = 'trialing'` and `trial_end = now + 14 days`.

2. **Checkout flow works** — Seller clicks "Assinar" → Stripe Checkout page → payment → redirect to `/billing/sucesso` → `subscriptions.status = 'active'` within 10 seconds.

3. **Webhook signature is validated** — An invalid signature returns 401 without processing. Verify by sending a POST with a wrong signature to the webhook URL.

4. **Payment failure triggers grace period** — When `invoice.payment_failed` arrives, `grace_period_end = current_period_end + 7 days`. During grace period, `isPaid = true`. After grace period, `isPaid = false`.

5. **Feature gates work** — A seller with `status = 'free'` sees `UpgradeModal` when accessing any paid feature. The hook returns `requiresUpgrade: true`. The UI cannot be bypassed by inspecting network calls.

6. **Stripe Portal works** — Seller can access Stripe Customer Portal from Settings, update their card, and cancel their subscription. After cancellation, `status = 'canceled'` in DB within 30 seconds.

7. **Diagnóstico always accessible** — A seller with `status = 'canceled'` or `status = 'free'` can still access `/diagnostico`. Verify by testing with an expired/canceled account.

8. **Trial expiry cron works** — 24 hours after a test account's `trial_end` passes (without subscribing), `subscriptions.status = 'free'`. Paid features show `UpgradeModal`.
