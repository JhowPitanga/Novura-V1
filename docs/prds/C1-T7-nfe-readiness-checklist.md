# PRD — C1-T7: Operational Readiness Checklist (NFe)

**Cycle:** 1 — O Primeiro Minuto
**Status:** 🔴 Not Started
**Depends on:** [C1-T5 — Freemium Gates](./C1-T5-freemium-gates.md) (subscription state available)
**Blocks:** Nothing — last Cycle 1 task

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

To emit tax invoices (NFe) in Brazil, a seller needs several things set up: their company data,
a digital certificate, each product's tax classification (NCM), and their state tax registration number.
Most sellers don't know exactly what's missing until they try to emit an invoice and it fails.

This task creates a checklist that shows the seller exactly what's missing and links directly
to the screen where they can fix it. No guessing. No hunting through menus.

The checklist shows on the orders page (for subscribed users) and on the settings page.
When the checklist is complete, the "Emitir NFe" button becomes active. Until then,
hovering over it shows a tooltip explaining what's missing.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] Read `src/pages/Orders.tsx` — where is the "Emitir NFe" button? Is it disabled or gated?
- [ ] Read `src/pages/Settings.tsx` (or `Configuracoes.tsx`) — is there an existing settings page?
- [ ] Check if `companies` table has `certificate`, `tax_regime`, `ie` (inscrição estadual) columns.
      Run: `grep -r "inscrição_estadual\|ie\|certificate\|regime" supabase/migrations/ | head -20`
- [ ] Check if `products` table has `ncm` column (required for NFe).
      Run: `grep -r "ncm\|tributacao" supabase/migrations/ | head -20`
- [ ] Check if any checklist component already exists: `grep -r "checklist\|readiness" src/`
- [ ] Read `src/hooks/useAuth.tsx` — confirm `organizationId` is available.
- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.7: Operational Readiness Checklist" in full.

**Update this section with findings before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_1_PRIMEIRO_MINUTO.md` section "Feature F1.7" in full.
      Record: the 6 checklist items, their data sources, and what "complete" means for each.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–3.
- [ ] Read the `companies` table migration to confirm which columns exist.
- [ ] Read the `products` table migration to confirm if `ncm` exists.
- [ ] Check if `focus-nfe-emit` edge function validates these fields — if so, the checklist
      must reflect the same requirements (not a different set).

---

## 4. Architecture Context

### The 6 Checklist Items

| Item | How to check | Link to fix |
|---|---|---|
| Empresa configurada (CNPJ, razão social, endereço) | `companies` row has all 3 non-null | `/configuracoes/empresa` |
| Regime tributário definido | `companies.tax_regime` is non-null | `/configuracoes/empresa` |
| Certificado digital A1 | `companies.certificate` (or separate table) is non-null | `/configuracoes/certificado` |
| Todos produtos com NCM | `products` where `ncm IS NULL AND organization_id = orgId` count = 0 | `/produtos` |
| Todos produtos com tributação configurada | `products` where `tributacao IS NULL` count = 0 | `/produtos` |
| Inscrição Estadual (IE) | `companies.state_tax_id` (or `ie`) is non-null | `/configuracoes/empresa` |

**Note:** The agent must verify the exact column names by reading migrations — the names above
are approximations. Use the actual column names found.

### Completeness Logic

```typescript
export interface ReadinessItem {
  id: string
  label: string              // pt-BR text shown to seller
  isComplete: boolean
  fixUrl: string | null      // null if not actionable (e.g., external certificate)
  detail: string | null      // shown when incomplete, e.g., "3 produtos sem tributação"
}

export interface NfeReadiness {
  items: ReadinessItem[]
  completedCount: number
  totalCount: number
  isReady: boolean           // all items complete
}
```

### Where Checklist Appears

1. **Orders page** — collapsed summary widget for subscribed users:
   `"3/6 itens completos — [Ver checklist →]"` that expands or opens a side panel

2. **Settings page** — full checklist visible permanently

### NFe Button State

When `!isReady`:
- `PaywallButton` for non-subscribed users (from C1-T5)
- Disabled button with tooltip for subscribed users: `"Complete a configuração fiscal primeiro [Ver checklist →]"`

When `isReady`:
- Normal enabled button

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Never block the subscription — only the NFe action** | A seller can subscribe even with incomplete checklist. The checklist only blocks the "Emitir NFe" button. |
| **Use maybeSingle() — some tables may have no row** | Not every org has a `companies` row yet. Return `isComplete: false` gracefully, not an error. |
| **Show exact counts for products** | "3 produtos sem NCM" is actionable. "Produtos sem NCM" is not. |

---

## 6. What to Build

### Section A: Readiness Service

**File:** `src/services/nfe-readiness.service.ts`

```typescript
import { supabase } from '@/integrations/supabase/client'
import type { NfeReadiness, ReadinessItem } from '@/types/nfe-readiness'

export async function fetchNfeReadiness(organizationId: string): Promise<NfeReadiness> {
  // 1. Fetch companies row for this org
  // 2. Fetch count of products with null NCM
  // 3. Fetch count of products with null tributacao
  // Build ReadinessItem array from the results
  // Return NfeReadiness with completedCount and isReady
}

export const nfeReadinessKeys = {
  readiness: (orgId: string) => ['nfe-readiness', orgId] as const,
}
```

Implement `fetchNfeReadiness` by making separate queries for each check. Under 50 lines total.

Each check:
```typescript
// Check 1: company configured
const { data: company } = await supabase
  .from('companies')
  .select('cnpj, name, address, tax_regime, certificate, state_tax_id')
  .eq('organization_id', organizationId)
  .maybeSingle()

// Check items from the result:
items.push({
  id: 'company-configured',
  label: 'Empresa configurada (CNPJ, razão social, endereço)',
  isComplete: !!(company?.cnpj && company?.name && company?.address),
  fixUrl: '/configuracoes/empresa',
  detail: null,
})
```

**Important:** The exact column names must come from reading the actual migration files,
not from this PRD. Adjust the column names to match reality.

#### Definition of Done — Section A
- [ ] `fetchNfeReadiness` returns all 6 items
- [ ] Returns `{ isReady: false }` gracefully when company row doesn't exist (no error thrown)
- [ ] Products without NCM count is accurate
- [ ] Under 60 lines (split into helpers if needed)
- [ ] No `any` types

---

### Section B: Types

**File:** `src/types/nfe-readiness.ts`

```typescript
export interface ReadinessItem {
  id: string
  label: string
  isComplete: boolean
  fixUrl: string | null
  detail: string | null
}

export interface NfeReadiness {
  items: ReadinessItem[]
  completedCount: number
  totalCount: number
  isReady: boolean
}
```

#### Definition of Done — Section B
- [ ] Types defined, no `any`

---

### Section C: `useNfeReadiness` Hook

**File:** `src/hooks/useNfeReadiness.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { fetchNfeReadiness, nfeReadinessKeys } from '@/services/nfe-readiness.service'

export function useNfeReadiness() {
  const { organizationId } = useAuth()

  const { data, isLoading } = useQuery({
    queryKey: nfeReadinessKeys.readiness(organizationId ?? ''),
    queryFn: () => fetchNfeReadiness(organizationId!),
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,  // short stale time — settings can change
  })

  return {
    readiness: data ?? null,
    isReady: data?.isReady ?? false,
    isLoadingReadiness: isLoading,
  }
}
```

#### Definition of Done — Section C
- [ ] Under 30 lines
- [ ] Returns `isReady: false` when loading (safe default)

---

### Section D: Checklist Component

**File:** `src/components/nfe/NfeReadinessChecklist.tsx`

Props: `readiness: NfeReadiness | null`, `isLoading: boolean`

Renders:
```
Para emitir NFe você precisa:
✅ Empresa configurada (CNPJ, razão social, endereço)
✅ Regime tributário definido (Simples Nacional)
⚪ Certificado digital A1 — [Fazer upload →]
✅ 83 produtos com NCM
⚪ 3 produtos sem tributação configurada — [Resolver agora →]
⚪ Inscrição Estadual (IE) — [Informar →]

Progresso: 3/6 itens ✓
```

UI:
- ✅ green check for complete items
- ⚪ gray circle for incomplete items
- Each incomplete item shows `detail` (if available) and a link to `fixUrl`
- Footer shows `${completedCount}/${totalCount} itens ✓`
- Loading state: skeleton rows

Constraints: under 80 lines. Uses `Link` from React Router for `fixUrl` links.

#### Definition of Done — Section D
- [ ] Component renders correctly with real `NfeReadiness` data
- [ ] Incomplete items show action link
- [ ] Progress counter shows correctly
- [ ] Under 80 lines

---

### Section E: Wire into Orders Page

In `src/pages/Orders.tsx`, add a condensed readiness banner visible to subscribed users
who have `isReady: false`:

```
⚠️  "Configure para emitir NFe" — 3/6 itens completos — [Ver checklist →]
```

The `[Ver checklist →]` link opens a side panel or navigates to `/configuracoes/fiscal`.

Also update the "Emitir NFe" button behavior for subscribed + not-ready users:
```typescript
// Already subscribed but checklist incomplete:
<Button
  disabled={!isReady}
  title={!isReady ? 'Complete a configuração fiscal primeiro' : undefined}
  onClick={handleEmitNfe}
>
  Emitir NFe
</Button>
```

This replaces/extends the `PaywallButton` logic for subscribed users.

#### Definition of Done — Section E
- [ ] Banner shows on orders page for subscribed users with incomplete checklist
- [ ] Banner hidden when `isReady` or when not subscribed
- [ ] "Emitir NFe" button disabled with tooltip when not ready

---

### Section F: Wire into Settings Page

Add `NfeReadinessChecklist` to the fiscal/invoicing section of the settings page.
Identify the correct location by reading the settings page structure.

#### Definition of Done — Section F
- [ ] Checklist visible on the settings page in the NFe/fiscal section

---

## 7. Integration Checklist

- [ ] `fetchNfeReadiness` reads actual column names from the database (not approximations from this PRD)
- [ ] Products without NCM count uses the correct column name
- [ ] `isReady = true` when all 6 items are complete
- [ ] Orders page "Emitir NFe" button is disabled for subscribed users with incomplete checklist
- [ ] Settings page shows full checklist

---

## 8. Definition of Done — Full Task (Cycle 1 Complete)

- [ ] All Section A–F DoD items checked
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] Manual QA checklist:
  - [ ] Settings page shows checklist with correct item states
  - [ ] Completing an item (e.g., adding company address) makes it go green after page refresh
  - [ ] Orders page shows condensed banner when checklist incomplete
  - [ ] "Emitir NFe" button disabled with tooltip when not ready
  - [ ] All fix links navigate to correct screens
- [ ] No `any` types

### Cycle 1 Final Verification

When all C1-T1 through C1-T7 are complete, verify the full Cycle 1 Definition of Done:

1. ⬜ Time from "Conectar ML" to Diagnóstico < 5 minutes
2. ⬜ Zero configuration required before seeing Diagnóstico
3. ⬜ Money leaks accurate (±1% vs ML seller center)
4. ⬜ Diagnóstico hides blocks when data is missing (never shows zero)
5. ⬜ Product cost saves and propagates to orders within 5 seconds
6. ⬜ Margin color coding correct (green/yellow/red thresholds)
7. ⬜ Import failure handled gracefully (never blank screen)
8. ⬜ Simples Nacional disclaimer always visible

---

## 9. What NOT to Build

- **Do NOT build NFe emission itself** — that is `emit-invoice` from C0-T8.
  This checklist only gates the button. The emission function is separate.
- **Do NOT build the digital certificate upload UI** — show the item as incomplete
  and link to `/configuracoes/certificado`. The upload UI is a separate task.
- **Do NOT auto-check compliance** — Novura does not know the complete Brazilian tax rules.
  The checklist checks only what Novura has data for (CNPJ, NCM, certificate). It is NOT
  a guarantee that an emission will succeed — just a best-effort validation.
- **Do NOT block subscription with the checklist** — sellers can pay and then complete setup.
  The checklist only controls the NFe button, not the billing flow.
