# PRD — C3-T4: Reputation Alerts Frontend

**Cycle:** 3 — Visibilidade e Conformidade
**Status:** 🔴 Not Started
**Depends on:** [C3-T3 — Reputation Sync](./C3-T3-reputation-sync.md) (snapshots table populated)
**Blocks:** Nothing

---

## 1. Plain Language Summary

> **Read this if you are a non-technical founder or PM.**

This task brings the reputation data from the database into the app's interface. Sellers see
their current reputation status, their key metrics (cancellation rate, delayed shipments, claims),
and — most importantly — any open complaints with their exact response deadlines.

The most critical alert (a complaint deadline in the next 24 hours) also shows as a toast
notification when the seller first logs in. This is the "proactive" part: the seller doesn't
have to navigate to a reputation screen to find out they have an urgent issue.

---

## 2. Current State & Progress

**Before starting, the agent must verify:**

- [ ] C3-T3 is complete — `seller_reputation_snapshots` has rows.
- [ ] Read `src/pages/SeuCaixa.tsx` or Dashboard — where should a reputation widget appear?
- [ ] Check `src/components/seu-caixa/AlertCard.tsx` — can reputation alerts use this component?
- [ ] Check if a toast/notification system exists (e.g., from shadcn/ui).

**Update this section before writing code.**

---

## 3. Architecture Context

### Where Reputation Alerts Appear

1. **SeuCaixa "Alerta da semana"** — `risk_level = 'critical'` takes highest priority over stock alerts.
   The `getTopAlert()` function in `alert-priority.ts` needs a `reputation_critical` evaluator added.

2. **New `ReputationWidget` section** on SeuCaixa or a dashboard area.

3. **Toast on login** if `open_complaints_count > 0` AND nearest deadline < 24h away.

### Alert Copy Examples

```
⚠️ 2 reclamações aguardando resposta
   Prazo: domingo, 22/03 às 18h00  [Responder no ML →]

⚠️ Taxa de envios com atraso: 7,3% (limite ML: 5%)
   Você está 2,3% acima do limite  [Ver pedidos atrasados →]

🔴 Reputação em risco
   3 ocorrências críticas esta semana  [Ver detalhes →]
```

**Rule: complaint deadline must show EXACT date+time, not "em 2 dias".**

---

## 4. What to Build

### Section A: Service + Hook

**File:** `src/services/reputation.service.ts`

```typescript
export async function fetchLatestReputation(orgId: string): Promise<ReputationSnapshot | null>
// SELECT * FROM seller_reputation_snapshots WHERE org_id = ... ORDER BY snapshot_at DESC LIMIT 1

export const reputationKeys = {
  latest: (orgId: string) => ['reputation', 'latest', orgId] as const,
}
```

**File:** `src/hooks/useReputation.ts`

```typescript
export function useReputation() {
  // useQuery with staleTime: 10 * 60 * 1000 (10 minutes)
  // Returns: { snapshot, riskLevel, hasUrgentComplaint, isLoading }
  // hasUrgentComplaint: true if any deadline < 24h from now
}
```

**File:** `src/types/reputation.ts`
```typescript
export interface ReputationSnapshot {
  thermometerStatus: string
  claimsRate90d: number | null
  delayedShipmentRate90d: number | null
  cancellationRate90d: number | null
  openComplaintsCount: number
  complaintsResponseDeadline: Array<{ complaintId: string; deadlineAt: string }> | null
  riskLevel: 'ok' | 'warning' | 'critical'
  snapshotAt: string
}
```

---

### Section B: Reputation Components

**`ReputationAlertCard.tsx`** — under 60 lines

Props: `snapshot: ReputationSnapshot`

Shows:
- Thermometer status chip (green/yellow/orange/red colored)
- Rates with threshold indicators (% with "limite ML: X%")
- Open complaints count with nearest deadline (exact date+time)
- "Responder no ML →" link if complaints exist

**`ComplaintDeadlineAlert.tsx`** — under 40 lines

Shows urgent complaint deadline notification:
```
⚠️ Você tem 1 reclamação que vence em [data+hora exata]
[Responder no ML →]
```

Used both in-page and as a toast content.

---

### Section C: Login Toast Notification

In the main layout or `App.tsx`, after auth resolves:
1. Fetch latest reputation snapshot
2. If `riskLevel = 'critical'` AND nearest deadline < 24h: show toast
3. Show toast only once per login session (`sessionStorage['rep_alert_shown']`)

Use the existing toast system (shadcn/ui toast or whatever exists in the project).

---

### Section D: Wire into Alert Priority

In `src/utils/alert-priority.ts` (from C2-T3), add a new alert evaluator:

```typescript
function evaluateReputationCritical(data: AlertData): Alert | null {
  if (data.reputation?.riskLevel === 'critical') {
    return {
      type: 'reputation_critical',
      title: 'Reputação em risco',
      body: `${data.reputation.openComplaintsCount} ocorrências críticas`,
      actionLabel: 'Ver detalhes',
      actionUrl: '/configuracoes/reputacao',
    }
  }
  return null
}
```

Add `'reputation_critical'` to `ALERT_PRIORITY` at index 0 (highest priority — above stock alerts).

---

## 5. Safety Rules

| Rule | Why |
|---|---|
| **Exact deadline, not relative** | "em 2 dias" is useless. Show "domingo, 22/03 às 18h00". |
| **Toast only once per session** | Showing the same alert toast on every page navigation would be maddening. |
| **Don't show 0% rates** | If API returned null, show "—" not "0%". |

---

## 6. Definition of Done — Full Task

- [ ] Service, hook, types, and components created
- [ ] `ReputationAlertCard` shows on SeuCaixa when `risk_level != 'ok'`
- [ ] Toast on login when urgent complaint deadline < 24h
- [ ] `reputation_critical` added to alert priority at highest position
- [ ] Complaint deadline shows exact date+time
- [ ] `npm run build` passes

---

## 9. What NOT to Build

- **Do NOT build complaint response UI within Novura** — link out to ML complaint management.
- **Do NOT show reputation on the orders list** — it belongs on the SeuCaixa/dashboard level.
