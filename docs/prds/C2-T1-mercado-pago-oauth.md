# PRD — C2-T1: Mercado Pago OAuth Integration

**Cycle:** 2 — Seu Caixa
**Status:** 🔴 Not Started
**Depends on:** Cycle 1 complete (users onboarded to ML)
**Blocks:** [C2-T2 — MP Balance Sync](./C2-T2-mp-balance-sync.md)

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

Mercado Pago is the payment service attached to Mercado Livre. Even though sellers already
connected their Mercado Livre account, MP is a separate authorization — like connecting your
bank account separately from your store account.

This task builds the "Connect Mercado Pago" button that appears on the Diagnóstico page and
the SeuCaixa screen. When clicked, it takes the seller through MP's authorization flow (similar
to how they connected ML), then stores the credentials so Novura can check their MP balance
and payment schedule.

This is an optional integration. Sellers who don't connect MP can still use everything else.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] `supabase/functions/mercado-pago-start-auth/` — does this directory exist?
- [ ] `supabase/functions/mercado-pago-callback/` — does this directory exist?
- [ ] `supabase/functions/mercado-pago-refresh/` — does this directory exist?
- [ ] `src/pages/MercadoPagoCallback.tsx` — does this file exist?
- [ ] Check if `mercado_pago_integrations` table migration exists:
      `ls supabase/migrations/ | grep mercado_pago`
- [ ] Read `supabase/functions/mercado-livre-start-auth/index.ts` in full.
      This is the EXACT pattern to follow. The MP functions mirror it.
- [ ] Read `supabase/functions/mercado-livre-callback/index.ts` in full.
- [ ] Read `src/WebhooksAPI/marketplace/mercado-livre/index.ts` — pattern for `startMercadoLivreAuth()`.
- [ ] Read `supabase/functions/_shared/adapters/infra/token-utils.ts` — how are tokens encrypted?

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_2_SEU_CAIXA.md` section "Feature F2.1: Mercado Pago Integration" in full.
      Record: OAuth scopes needed, the separate sessionStorage key prefix (`mp_` not `ml_`), PKCE model.
- [ ] Read `docs/CYCLE_0_ORDERS_PLATFORM.md` section "OAuth2 Security Model" in full.
      This is the canonical reference. Follow it exactly.
- [ ] Read `supabase/functions/mercado-livre-start-auth/index.ts` — mirror this exactly.
- [ ] Read `supabase/functions/mercado-livre-callback/index.ts` — mirror this exactly.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1, 2, 3.
- [ ] Confirm `_shared/adapters/infra/token-utils.ts` has `encryptToken` / `decryptToken` functions.

---

## 4. Architecture Context

### PKCE Security Rules (non-negotiable)

```
1. code_verifier is generated in the start-auth edge function
2. code_verifier is returned to the browser in the HTTP response body (NOT embedded in state)
3. Browser stores code_verifier in sessionStorage['mp_pkce_verifier']
4. Browser stores CSRF token in sessionStorage['mp_oauth_csrf']
5. After authorization, browser reads verifier from sessionStorage, sends to callback edge function
6. callback edge function reads verifier from request body (NOT from state)
7. After callback (success or fail), browser clears sessionStorage['mp_pkce_verifier'] and ['mp_oauth_csrf']
```

Use `mp_` prefix for sessionStorage keys to avoid collision with `ml_` ML OAuth keys.

### Edge Function Structure

```
supabase/functions/
  mercado-pago-start-auth/index.ts    ← generate PKCE, return {authorization_url, state, code_verifier}
  mercado-pago-callback/index.ts      ← exchange code for token, encrypt, store in DB
  mercado-pago-refresh/index.ts       ← refresh expired token (6h expiry, same as ML)

supabase/migrations/
  YYYYMMDD_000000_create_mercado_pago_integrations.sql
```

### Database Table

```sql
CREATE TABLE IF NOT EXISTS mercado_pago_integrations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  mp_user_id          text NOT NULL,
  access_token        text NOT NULL,        -- AES-GCM encrypted via token-utils
  refresh_token       text,                  -- AES-GCM encrypted
  token_expires_at    timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_mp_integrations_org ON mercado_pago_integrations(organization_id);
```

### Frontend Flow

```
ConnectMercadoPagoButton.tsx
  → calls startMercadoPagoAuth() from src/WebhooksAPI/marketplace/mercado-pago/index.ts
  → redirect to MP authorization page
  → callback: src/pages/MercadoPagoCallback.tsx
  → validates CSRF + sends verifier in body
  → on success: navigates to /seu-caixa
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **NEVER embed code_verifier in state URL param** | State is publicly visible in browser address bar. |
| **Use `mp_` prefix for sessionStorage keys** | Avoid collision with existing ML OAuth keys (`ml_pkce_verifier`, `ml_oauth_csrf`). |
| **Tokens MUST be AES-GCM encrypted before DB storage** | Use existing `encryptToken()` from `token-utils.ts`. Never store plaintext. |
| **Handle the case where seller already connected ML** | ML and MP are separate authorizations even if the same developer platform. Always go through full OAuth for MP. |
| **Use UPSERT in callback** | A reconnection must update the existing row, not create a duplicate. |

---

## 6. What to Build

### Section A: Database Migration

**File:** `supabase/migrations/[DATE]_000000_create_mercado_pago_integrations.sql`

Use the schema from Section 4. Present to human for review before applying.

#### Definition of Done — Section A
- [ ] Migration file exists in `supabase/migrations/`
- [ ] `UNIQUE(organization_id)` constraint on the table

---

### Section B: `mercado-pago-start-auth` Edge Function

**File:** `supabase/functions/mercado-pago-start-auth/index.ts`

Mirror `mercado-livre-start-auth/index.ts` exactly. Differences:
- MP OAuth authorization URL: `https://auth.mercadolibre.com.ar/authorization`
- Scope: `read` (for balance + release schedule read access)
- Redirect URI: `${SITE_URL}/oauth/mercado-pago/callback`
- Return: `{ authorization_url, state, code_verifier }` — code_verifier in response body

Under 80 lines.

#### Definition of Done — Section B
- [ ] Function exists and compiles (`deno check`)
- [ ] Returns `code_verifier` in response body (not in state)
- [ ] Scope is `read`

---

### Section C: `mercado-pago-callback` Edge Function

**File:** `supabase/functions/mercado-pago-callback/index.ts`

Mirror `mercado-livre-callback/index.ts`. Differences:
- Reads `code_verifier` from request body
- Validates `state.csrf` === the CSRF from request body
- Exchanges code for MP access token
- Encrypts tokens via `encryptToken()` from `_shared/adapters/infra/token-utils.ts`
- UPSERT into `mercado_pago_integrations` (not `marketplace_integrations`)
- After storing: trigger `mercado-pago-sync-balance` (fire-and-forget, do not await)

Under 80 lines.

#### Definition of Done — Section C
- [ ] Reads `code_verifier` from request body
- [ ] Tokens encrypted before storage
- [ ] UPSERT on `organization_id` conflict
- [ ] Triggers `mercado-pago-sync-balance` after successful store

---

### Section D: `mercado-pago-refresh` Edge Function

**File:** `supabase/functions/mercado-pago-refresh/index.ts`

Mirror `mercado-livre-refresh/index.ts`. Pattern:
1. Fetch row from `mercado_pago_integrations`
2. Decrypt refresh token
3. Call MP token refresh endpoint
4. Re-encrypt new tokens
5. UPDATE row

Under 80 lines.

#### Definition of Done — Section D
- [ ] Refresh function compiles and follows same pattern as ML refresh

---

### Section E: Frontend Callback Page

**File:** `src/pages/MercadoPagoCallback.tsx`

Mirror `src/pages/MercadoLivreCallback.tsx`. Differences:
- Reads from `sessionStorage['mp_oauth_csrf']` and `sessionStorage['mp_pkce_verifier']`
- Calls `mercado-pago-callback` edge function
- After success: navigate to `/seu-caixa`
- Clears `mp_pkce_verifier` and `mp_oauth_csrf` from sessionStorage (always, even on error)

Register route in `src/App.tsx`: `/oauth/mercado-pago/callback`

#### Definition of Done — Section E
- [ ] Callback page exists, validates CSRF, sends verifier in body
- [ ] Clears sessionStorage on success and failure
- [ ] Route registered in App.tsx

---

### Section F: `startMercadoPagoAuth()` Frontend Function

**File:** `src/WebhooksAPI/marketplace/mercado-pago/index.ts`

Mirror `src/WebhooksAPI/marketplace/mercado-livre/index.ts`:
1. Call `mercado-pago-start-auth` edge function
2. Store `code_verifier` in `sessionStorage['mp_pkce_verifier']`
3. Store `state.csrf` in `sessionStorage['mp_oauth_csrf']`
4. Redirect to `authorization_url`

#### Definition of Done — Section F
- [ ] Function exists and follows ML pattern
- [ ] Uses `mp_` sessionStorage prefix

---

### Section G: Connect MP Button Component

**File:** `src/components/mercado-pago/ConnectMercadoPagoButton.tsx`

Simple button component:
```
Props: onConnected?: () => void
Button text: "Conectar Mercado Pago"
On click: calls startMercadoPagoAuth()
```

Used on Diagnóstico page (after Block 1, as contextual CTA) and on SeuCaixa page.

Under 30 lines.

#### Definition of Done — Section G
- [ ] Component renders a button that triggers MP OAuth
- [ ] Under 30 lines

---

## 7. Integration Checklist

- [ ] After MP OAuth completes, `mercado_pago_integrations` row exists in DB
- [ ] Token in DB is encrypted (not plaintext)
- [ ] sessionStorage cleared after callback (success and failure)
- [ ] Route `/oauth/mercado-pago/callback` registered in App.tsx

---

## 8. Definition of Done — Full Task

- [ ] All Section A–G DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA checklist:
  - [ ] Clicking "Conectar Mercado Pago" opens MP authorization page
  - [ ] After authorization, user lands on `/seu-caixa`
  - [ ] `mercado_pago_integrations` row exists in DB
  - [ ] Reconnecting (clicking connect again) updates the existing row (not duplicate)

---

## 9. What NOT to Build

- **Do NOT add MP to the onboarding flow** — it's contextual, never required.
- **Do NOT build Mercado Pago payment processing** — read-only balance/schedule access only.
- **Do NOT share tokens between ML and MP** — they are separate OAuth authorizations.
