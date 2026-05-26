# Multi-Company Architecture (Multi-CNPJ)

## Overview

Novura supports multiple companies (CNPJs) per organization. Each company can have its own marketplace integrations, orders, stock reservations, and fiscal operations.

The entity chain is:

```
Organization → Company (CNPJ) → Marketplace Integration → Orders / Stock / NFe
```

---

## Database Changes (MC-T1)

### `companies` table — new columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_default` | `boolean NOT NULL` | `false` | Exactly one company per org can be true. Enforced by partial unique index. |
| `focus_company_id` | `text` | `null` | ID returned by Focus NFe API after company creation. |
| `focus_status` | `text NOT NULL` | `'pending'` | One of `pending`, `synced`, `error`. |

**Partial unique index:**
```sql
CREATE UNIQUE INDEX uq_companies_default_per_org
  ON companies(organization_id)
  WHERE is_default = true;
```

### `marketplace_integrations` — constraint change

The old constraint `UNIQUE (organizations_id, marketplace_name)` was replaced by:
```sql
UNIQUE (organizations_id, marketplace_name, company_id)
```
This allows multiple integrations of the same marketplace (e.g., two ML accounts) as long as each is linked to a different company.

`company_id` is now `NOT NULL`.

### `orders` — new columns

| Column | Type | Description |
|--------|------|-------------|
| `company_id` | `uuid REFERENCES companies(id)` | Company that owns the order (set from integration at sync time). |
| `integration_id` | `uuid REFERENCES marketplace_integrations(id)` | Integration that originated the order. |

---

## Business Rules

### Default Company

- Every organization must have exactly one default company (`is_default = true`).
- The first company created is automatically set as default.
- The user can change the default via Settings → Empresas.

### Company Deletion (soft delete)

A company **cannot** be deleted (deactivated) if:

| Condition | Message |
|-----------|---------|
| `is_default = true` | "Defina outra empresa como padrão antes de excluir esta" |
| Only active company | "Não é possível excluir a única empresa ativa" |
| Has pending orders | "Existem pedidos pendentes vinculados a esta empresa" |
| Has active integrations | "Desconecte as integrações de marketplace antes de excluir" |
| Has pending invoices | "Existem notas fiscais pendentes de emissão ou cancelamento" |

Deletion is always a **soft delete** (`is_active = false`). The `company-delete` edge function enforces all rules and optionally removes the company from Focus API.

---

## OAuth with Company Selection (MC-T3)

When connecting a marketplace integration, the user selects the company (CNPJ) to link. The `companyId` is embedded in the OAuth `state` parameter and read back by the callback.

**Backward compat:** if `companyId` is absent from state (old sessions), the callback falls back to the org's default company with a warning log.

The UPSERT conflict key changed from `(organizations_id, marketplace_name)` to `(organizations_id, marketplace_name, company_id)`.

---

## Order Pipeline (MC-T4)

When the `orders-queue-worker` processes a webhook:

1. It resolves the marketplace integration (via `meli_user_id` or `shop_id`).
2. The integration row now carries `company_id` (populated by MC-T1 backfill / MC-T3 OAuth).
3. `company_id` is written to `orders.company_id` at upsert time.
4. `integration_id` is written to `orders.integration_id` by `resolveAndPersistWarehouse`.

---

## Stock RPCs — company-aware (MC-T5)

`reserve_stock_for_order_v2`, `consume_stock_for_order_v2`, `refund_stock_for_order_v2` now read `company_id` directly from `orders.company_id`:

```sql
SELECT o.organization_id, o.company_id, o.pack_id, o.storage_id
INTO v_org_id, v_company_id, v_pack_id, v_storage_id
FROM orders o WHERE o.id = p_order_id;
```

**Fallback chain (backward compat for legacy rows where `orders.company_id IS NULL`):**
1. `companies WHERE organization_id = X AND is_default = true`
2. `companies WHERE organization_id = X ORDER BY is_active DESC, created_at LIMIT 1`

---

## Frontend (MC-T6)

### `useCompanyContext` hook

Located at `src/hooks/useCompanyContext.tsx`. Provides:

```typescript
const { companies, activeCompanyId, activeCompany, setActiveCompanyId, isLoading } = useCompanyContext();
```

The active company ID is persisted per-org in `localStorage` under key `novura:active_company:{org_id}`.

### `CompanySelector` component

Located at `src/components/CompanySelector.tsx`. A dropdown that is **only rendered** when the org has 2+ active companies — completely invisible for single-company orgs (backward compat).

### `CompanyManagement` component

Located at `src/components/settings/CompanyManagement.tsx`. Available in Settings → Empresas. Allows:
- Viewing all companies with their Focus sync status
- Setting the default company
- Deactivating (soft-deleting) a company (with pre-flight checks via `company-delete`)
- Navigating to `/nova-empresa` to add a new company

### `ConnectDialog` — company selector

When the org has 2+ companies, the connect dialog shows a company dropdown. For single-company orgs, the company is pre-selected silently (no UI change).

---

## Backward Compatibility

| Scenario | Behavior |
|----------|---------|
| Org with 1 company | `CompanySelector` hidden; all flows use that single company |
| Orders without `company_id` | Stock RPCs fall back to default → oldest active company |
| OAuth without `companyId` in state | Callback falls back to default company + warning log |
| `getCompanyIdForOrg` | Returns `is_default` company first, falls back to oldest active |

---

## Migration Files

| File | Description |
|------|-------------|
| `20260414_000006_multi_company_architecture.sql` | MC-T1: Schema changes, backfill, indexes |
| `20260414_000007_stock_rpcs_company_aware.sql` | MC-T5: Updated stock RPCs |

---

## Edge Functions

| Function | Change |
|----------|--------|
| `focus-company-create` | Supports `dry_run`, saves `focus_company_id` + `focus_status` |
| `company-delete` (new) | Validates rules, soft-deletes, optionally removes from Focus API |
| `mercado-livre-start-auth` | Accepts + forwards `companyId` in state |
| `mercado-livre-callback` | Uses `companyId` from state; new UPSERT conflict key |
| `shopee-start-auth` | Accepts + forwards `companyId` in state |
| `shopee-callback` | Uses `companyId` from state; changed from INSERT to UPSERT |
