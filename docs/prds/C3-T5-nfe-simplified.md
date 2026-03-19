# PRD — C3-T5: NFe Simplified Emission Flow

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** C0-T8 (`emit-invoice` edge function deployed), C1-T7 (readiness checklist complete)
**Blocks:** Nothing

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

The existing NFe page at `/notas-fiscais` already works for issuing tax invoices but it's
complex — designed for accountants, not sellers. This task adds a shortcut: a "Emitir NF-e"
button directly in the orders list that pre-fills everything automatically and lets the seller
confirm and emit in two clicks.

It's designed specifically for Simples Nacional sellers (the most common regime for small
sellers), which allows very simple rules: the CFOP is determined automatically (5.102 for
intrastate, 6.102 for interstate), and most fiscal codes are auto-filled. The seller only
needs to review and confirm.

It also handles the case where multiple orders need NFe at once: a batch mode that processes
them one by one, showing progress, and reports any errors in plain Portuguese instead of SEFAZ codes.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] C0-T8 is complete — `supabase/functions/emit-invoice/` exists and is deployed.
- [ ] C1-T7 is complete — `useNfeReadiness()` hook exists.
- [ ] Read `src/pages/Orders.tsx` — where is the existing NFe action? How does it currently work?
- [ ] Read `src/pages/Invoices.tsx` — understand the existing NFe flow to avoid conflicts.
- [ ] Check `companies` table — confirm `regime_tributario` (or equivalent) column exists.
- [ ] Read `supabase/functions/emit-invoice/index.ts` — understand the input shape.
- [ ] Check `order_shipping` table — confirm delivery address columns for NFe recipient.

**Update this section before writing code.**

---

## 3. ⚠️ Agent: Mandatory Code Review Before Writing Any Code

- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` section "Feature F3.3: NFe Emission — Simplified" in full.
      Record: pre-fill logic, validation chain, batch emission pattern, error translation map.
- [ ] Read `docs/CYCLE_3_VISIBILIDADE.md` → Factory Pattern (buildNfePayload), Chain of Responsibility
      (nfe-validation.ts), and Batch NFe (sequential emission) engineering standards.
- [ ] Read `supabase/functions/emit-invoice/index.ts` in full. Record the exact input shape.
- [ ] Read `docs/ENGINEERING_STANDARDS.md` sections 1–4.
- [ ] Check `companies.regime_tributario` — if column doesn't exist, add a migration.

---

## 4. Architecture Context

### Simples Nacional Only

This simplified path is ONLY for `companies.regime_tributario = 'simples_nacional'`.
If the company is Lucro Real or Presumido: hide the button entirely and show:
`"Use a área de Notas Fiscais para emitir para este regime tributário."`

### CFOP Auto-Selection

```typescript
// src/utils/nfe-defaults.ts

function selectCfop(sellerUF: string, buyerUF: string): string {
  return sellerUF === buyerUF ? '5.102' : '6.102'
  // 5.102 = intrastate sale of goods (same state)
  // 6.102 = interstate sale of goods (different state)
  // Note: does NOT cover services, exports, or Zona Franca — Simples only
}
```

### Factory Pattern: `buildNfePayload`

**File:** `src/utils/nfe-defaults.ts`

Pure factory function (no supabase, no React):
```typescript
export function buildNfePayload(
  order: Order,
  items: OrderItem[],
  shipping: OrderShipping,
  company: Company
): NfePayload {
  return {
    cfop:      selectCfop(company.state_uf, order.buyer_state),
    recipient: buildRecipient(order, shipping),
    items:     items.map(buildNfeItem),
    totals:    buildTotals(items),
    emitter:   buildEmitter(company),
  }
}
// Private: selectCfop, buildRecipient, buildNfeItem, buildTotals, buildEmitter
// Each sub-builder < 20 lines
```

### Validation Chain

**File:** `src/utils/nfe-validation.ts`

```typescript
export function validateNfeEmission(order: Order, company: Company): ValidationResult {
  for (const validate of nfeValidators) {
    const result = validate(order, company)
    if (!result.valid) return result
  }
  return { valid: true }
}

const nfeValidators: Validator[] = [
  validateOrderNotCancelled,
  validateBuyerDocument,
  validateBuyerState,
  validateCompanyFiscalData,
  validateNoExistingInvoice,
]
```

### Error Translation Map

**File:** `src/utils/nfe-errors.ts`

```typescript
export const NFE_ERROR_MESSAGES: Record<string, string> = {
  '539': 'CPF do destinatário inválido — verifique o CPF do comprador',
  '362': 'Nota já autorizada pela SEFAZ com esta chave',
  '217': 'CNPJ da empresa emitente inválido — verifique suas configurações',
  '204': 'Certificado digital expirado — renove o certificado da sua empresa',
  '206': 'Chave de acesso inválida',
  '999': 'Erro interno da SEFAZ — tente novamente em alguns minutos',
}

export function translateNfeError(code: string): string {
  return NFE_ERROR_MESSAGES[code]
    ?? `Erro SEFAZ ${code}: tente novamente. Se persistir, entre em contato com o suporte.`
}
```

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Validate BEFORE calling emit-invoice** | Never call Focus API with invalid data. The validation chain catches issues locally first. |
| **Batch emission is sequential, not parallel** | Focus API rate limit. Use `for...of` with `await`, never `Promise.all`. |
| **Only for Simples Nacional** | This simplified path cannot safely handle Lucro Real/Presumido taxes. |
| **Never re-emit an authorized invoice** | Check `invoices` table for existing authorized row BEFORE calling emit-invoice. |

---

## 6. What to Build

### Section A: Utils

**Files:** `src/utils/nfe-defaults.ts`, `src/utils/nfe-validation.ts`, `src/utils/nfe-errors.ts`

Implement as described in Section 4. Each file under 80 lines.

#### Definition of Done — Section A
- [ ] `buildNfePayload` is a pure factory function (no supabase, no React)
- [ ] Validation chain has 5 validators
- [ ] Error translation map covers the 6 common SEFAZ codes
- [ ] No `any` types

---

### Section B: `useNfeEmit` Hook

**File:** `src/hooks/useNfeEmit.ts`

```typescript
export function useNfeEmit() {
  const emitSingle = useMutation({
    mutationFn: async (order: Order) => {
      const validation = validateNfeEmission(order, company)
      if (!validation.valid) throw new Error(validation.message)
      const payload = buildNfePayload(order, order.order_items, order.order_shipping, company)
      return callEmitInvoice(payload)
    },
  })

  const emitBatch = async (orders: Order[], onProgress: (done: number, total: number) => void) => {
    const results = []
    for (const order of orders) {
      const result = await emitSingle.mutateAsync(order).catch(e => ({ error: e.message }))
      results.push(result)
      onProgress(results.length, orders.length)
    }
    return summarizeBatchResults(results)
  }

  return { emitSingle, emitBatch }
}
```

`callEmitInvoice` calls the `emit-invoice` edge function with the built payload.

#### Definition of Done — Section B
- [ ] Single emission validates before calling Focus
- [ ] Batch emission is sequential (not parallel)
- [ ] Progress callback called after each item

---

### Section C: NFe Emit UI Components

**`NfeEmitButton.tsx`** — under 30 lines
```typescript
// Props: order: Order, isReady: boolean (from useNfeReadiness)
// If !isReady: disabled with tooltip
// If isSimples: opens NfeEmitModal
// If not Simples: shows "Use a área de NF-e" message
```

**`NfeEmitModal.tsx`** — under 100 lines
```typescript
// Props: order, onClose, onSuccess
// Shows pre-filled review:
//   - Buyer name + document
//   - Gross amount
//   - Regime + CFOP with plain label
// Buttons: [Alterar dados] [Confirmar e emitir]
// Loading state: "Emitindo nota fiscal..."
// Success state: "Nota emitida! NF-e 000.001" + [Baixar PDF] [Baixar XML]
// Error state: translateNfeError(focusErrorCode)
```

**`NfeEmitProgress.tsx`** — under 50 lines
```typescript
// Props: current: number, total: number
// Shows: "Emitindo notas... 12 de 34 concluídas"
// Used for batch emission
```

#### Definition of Done — Section C
- [ ] All 3 components exist under stated line limits
- [ ] `NfeEmitModal` shows validation errors before attempting emission
- [ ] Success state shows NF-e number
- [ ] Error state shows Portuguese translation (not raw SEFAZ code)

---

### Section D: Wire into Orders.tsx

In `src/pages/Orders.tsx`:
1. Replace existing NFe action with `NfeEmitButton` component
2. Add checkbox selection + batch "Emitir NF-e em lote" action
3. Batch action opens `NfeEmitProgress` showing sequential progress

Do NOT change any other part of Orders.tsx.

---

## 7. Integration Checklist

- [ ] `emit-invoice` edge function called with correct `order_id` (from `orders.id`, not old table)
- [ ] Company `regime_tributario` checked before showing simplified path
- [ ] `validateNfeEmission` runs client-side BEFORE `emit-invoice` is called
- [ ] Batch runs sequentially (no Focus rate limit errors)
- [ ] Error codes translated via `translateNfeError`

---

## 8. Definition of Done — Full Task

- [ ] All Section A–D DoD items checked
- [ ] `npm run build` passes
- [ ] Manual QA:
  - [ ] For Simples Nacional seller: "Emitir NF-e" button visible and functional
  - [ ] For non-Simples seller: button shows "Use a área de NF-e" message
  - [ ] Pre-filled modal shows correct buyer name, amount, CFOP
  - [ ] Successful emission shows NF-e number
  - [ ] SEFAZ error 539 shows "CPF do destinatário inválido"
  - [ ] Batch emission shows progress counter
  - [ ] Already-authorized invoices are not re-emitted

---

## 9. What NOT to Build

- **Do NOT replace `/notas-fiscais` page** — this is a parallel fast path only.
- **Do NOT support Lucro Real/Presumido** — Simples Nacional only.
- **Do NOT build NFe cancellation here** — use existing `focus-nfe-cancel` flow.
- **Do NOT allow parallel batch emission** — always sequential.
