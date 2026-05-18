# PRD: Remove Unnecessary Supabase RPCs

**Status:** Draft
**Author:** Engineering
**Date:** 2026-03-03
**Reference:** `docs/SUPABASE_RPCS.md`

---

## Problem

The codebase has 36 Supabase RPCs. After auditing them (see `SUPABASE_RPCS.md`), only 8 require DB-level atomicity and must stay as PL/pgSQL functions. The remaining ones are simple lookups, single-table updates, or batch writes — operations the Supabase JS client handles natively.

Having RPCs for non-atomic operations creates the following problems:
- Business logic is split between TypeScript and PL/pgSQL, making it harder to read, test, and audit
- Each RPC is an invisible DB dependency — breaking changes in the function signature don't surface at compile time
- Supabase's type codegen doesn't cover custom RPCs, so all callers use `as any` casts
- Debugging requires reading Postgres logs instead of edge function logs
- New developers have to know to look in `supabase/migrations/` for logic that "should" be in the service layer

---

## Goals

1. Replace every non-atomic RPC with an equivalent direct `supabase.from()` call or service function
2. Delete 3 RPCs that are obsolete (Cycle 0) or dev-only
3. Leave the 8 atomic RPCs untouched
4. Zero functional regression — same behavior, same data

## Non-Goals

- Rewriting the atomic RPCs (`reserve_stock_for_order`, `fn_reservar_e_numerar_notas`, etc.)
- Changing the PGMQ architecture or queue wrappers
- Changing `disconnect_marketplace_cascade` or `duplicate_product` (multi-table atomics)
- Any schema migrations

---

## What Stays (Do Not Touch)

These have legitimate DB-level atomicity requirements:

| RPC | Reason |
|---|---|
| `fn_reservar_e_numerar_notas` | Sequential NF number assignment — race condition without DB transaction |
| `reserve_stock_for_order` | Row-level lock on stock mutation |
| `consume_reserved_stock_for_order` | Same |
| `refund_reserved_stock_for_order` | Same |
| `fn_order_reserva_stock_linked` | Multi-row stock reservation, all-or-nothing |
| `rpc_bootstrap_user_org` | Creates org + member in one transaction on signup |
| `disconnect_marketplace_cascade` | Cascades deletes across 8+ tables atomically |
| `duplicate_product` | Deep-copies product with all relations atomically |
| All `pgmq_public.*` and `q_*` wrappers | Required by PGMQ architecture |

---

## What Changes

### Group A — Delete (obsolete / dev-only)

These can be removed immediately. No callers depend on them in the active code path.

#### 1. `upsert_marketplace_order_raw`

**Caller:** `mercado-livre-webhook-orders/index.ts` (marked `@deprecated`)
**Action:** Delete the RPC. The deprecated edge function is already being replaced by `orders-webhook` + `orders-sync-ml`.
**Risk:** None — only deprecated code calls it.

#### 2. `upsert_marketplace_order_raw_shopee`

**Caller:** `shopee-webhook-orders/index.ts` (marked `@deprecated`), `shopee-sync-orders/index.ts`
**Action:** Delete the RPC. `shopee-sync-orders` has a fallback path via `rawAdapter.upsert()` that already runs when the RPC fails. The fallback becomes the primary path.
**Risk:** Low — fallback already proven to work.

#### 3. `rpc_create_mock_orders_emissao_nf`

**Caller:** `NfeEmissionList.tsx` (dev helper button)
**Action:** Remove the button from the UI and delete the RPC. Seed data belongs in local dev scripts, not production DB functions.
**Risk:** None — dev-only.

---

### Group B — Replace with direct queries (Auth & Access)

#### 4. `get_user_organization_id`

**Callers:** `manage-users`, `upload-company-certificate`, `orders.service.ts`
**Replacement:**
```ts
const { data } = await supabase
  .from("organization_members")
  .select("organization_id")
  .eq("user_id", userId)
  .single();
const organizationId = data?.organization_id;
```
**Where to put it:** Extract `resolveOrgId(userId)` helper into `services/supabase-helpers.ts` (already exists). Edge functions get their own inline version.

---

#### 5. `get_current_user_organization_id`

**Callers:** `InvoiceActions.tsx`, `NfeEmissionList.tsx`, `LinkOrderModal.tsx`, `useProducts.ts`
**Replacement:** All these callers already have access to `organizationId` from `useAuth()`. Pass it as a prop or read it from context instead of firing a DB call.
**Note:** This is the highest-value change — it eliminates a redundant DB round-trip on every component mount.

---

#### 6. `is_org_member`

**Callers:** `focus-nfe-sync`, `focus-company-create`, `focus-nfe-cancel`, `mercado-livre-submit-xml`, `focus-nfe-emit`, `upload-company-certificate`
**Replacement:**
```ts
const { data } = await admin
  .from("organization_members")
  .select("id")
  .eq("user_id", userId)
  .eq("organization_id", orgId)
  .maybeSingle();
const isMember = data !== null;
```
**Where to put it:** Extract `assertOrgMember(admin, userId, orgId)` helper in `_shared/adapters/infra/` that throws a 403 response if not a member. All 6 callers replace their current pattern with one line.

---

#### 7. `current_user_has_permission`

**Caller:** `useProductForm.ts`
**Replacement:** `usePermissions()` hook is already loaded in the component tree. Read `permissions.produtos.create` from it directly instead of issuing a DB call.

---

#### 8. `rpc_get_member_permissions`

**Callers:** `mercado-livre-sync-orders`, `mercado-livre-sync-items`, `mercado-livre-sync-stock-distribution`, `mercado-livre-sync-prices`, `manage-users`, `items.ts (WebhooksAPI)`
**Replacement:**
```ts
const { data } = await admin
  .from("organization_members")
  .select("role, permissions(*)")
  .eq("user_id", userId)
  .eq("organization_id", orgId)
  .single();
```
Exact join shape depends on the schema. Extract as `fetchMemberPermissions(admin, userId, orgId)` in `_shared/adapters/infra/`.
**Note:** For edge functions that only check one specific permission (most callers), an `assertPermission(admin, userId, orgId, module, action)` helper may be cleaner than fetching the full map.

---

### Group C — Replace with direct queries (Admin)

#### 9. `set_user_permissions`

**Caller:** `NovuraAdmin.tsx`
**Replacement:** Direct `UPDATE` or `UPSERT` on the `permissions` table.
**Note:** Admin panel is internal-only — no need for an RPC abstraction layer here.

---

#### 10. `bulk_set_module_enabled`

**Caller:** `manage-users`
**Replacement:**
```ts
await admin
  .from("organization_modules")  // or equivalent junction table
  .upsert(moduleRows, { onConflict: "organization_id,module_id" });
```

---

#### 11. `set_global_module_switch`

**Caller:** `manage-users`
**Replacement:** Direct `UPDATE` on `system_modules`.

---

### Group D — Replace with direct queries (Orders)

#### 12. `rpc_marketplace_order_print_label`

**Caller:** `orders.service.ts` → `markOrdersPrinted()`
**Replacement:**
```ts
await supabase
  .from("order_labels")
  .update({ printed_at: new Date().toISOString() })
  .in("order_id", orderIds);
```
Exact table depends on Cycle 0 schema (`order_labels` vs flag on `orders`). Update after Cycle 0 migration is stable.

---

### Group E — Replace with direct queries (Chat)

#### 13. `mark_channel_read`

**Callers:** `Team.tsx`, `ChatTab.tsx`
**Replacement:**
```ts
await supabase
  .from("channel_members")   // or channel_read_cursors
  .update({ last_read_at: new Date().toISOString() })
  .eq("channel_id", channelId)
  .eq("user_id", currentUserId);
```

---

#### 14. `search_org_members`

**Callers:** `Team.tsx`, `ChatTab.tsx`, `useChat.ts`
**Replacement:**
```ts
const q = supabase
  .from("organization_members")
  .select("user_id, display_name, avatar_url")
  .eq("organization_id", orgId)
  .limit(limit);

if (term && term.trim().length >= 2) {
  q.ilike("display_name", `%${term}%`);
}
const { data } = await q;
```
Extract as `searchOrgMembers(orgId, term, limit)` in `services/team.service.ts`.

---

#### 15. `get_channel_messages_plain`

**Caller:** `useChat.ts`
**Replacement:**
```ts
const { data } = await supabase
  .from("channel_messages")
  .select("id, content, created_at, sender_id, ...")
  .eq("channel_id", channelId)
  .lt("created_at", before)
  .order("created_at", { ascending: false })
  .limit(limit);
```
The `_plain` suffix implies decrypted content. If the RPC also decrypts, the decryption logic must move to the service layer (client-side decrypt or a dedicated decrypt helper).

---

#### 16. `get_message_plain`

**Caller:** `useChat.ts` (real-time new message fetch)
**Replacement:**
```ts
const { data } = await supabase
  .from("channel_messages")
  .select("id, content, created_at, sender_id, ...")
  .eq("id", messageId)
  .single();
```

---

## Optional / Low Priority

### `rpc_get_user_access_context`

This aggregates 4–5 tables (org, permissions, role, modules, profile) in one call. It's not atomic — it's purely an efficiency optimization. The 5-minute sessionStorage cache means it fires at most once per session.

**Arguments for moving to code:** Consistent with the principle that RPCs are only for atomics. The join could be written as a service function.

**Arguments for keeping:** It's the single most-called RPC, runs on every page load before the cache warms, and aggregates enough tables that 4 sequential round-trips would be noticeable on slow connections.

**Recommendation:** Keep for now. Revisit when connection pooling and query batching are better understood. Mark it explicitly in the codebase as "efficiency RPC — not atomic."

---

## Implementation Plan

Execute in order — each group is independent of the others within the group, but Group A (deletes) should happen last to avoid dangling callers.

| Phase | Group | Items | Notes |
|---|---|---|---|
| 1 | C — Admin | `set_user_permissions`, `bulk_set_module_enabled`, `set_global_module_switch` | Low risk, internal admin only |
| 2 | B — Auth helpers (edge functions) | `is_org_member` → `assertOrgMember()` helper | Extract shared helper first, update 6 callers |
| 3 | B — Auth helpers (frontend) | `get_current_user_organization_id`, `current_user_has_permission` | Pass from `useAuth()` context instead |
| 4 | B — `rpc_get_member_permissions` | Extract `fetchMemberPermissions()` helper | 6 callers in edge functions |
| 5 | B — `get_user_organization_id` | Merge into existing `resolveOrgId()` in `supabase-helpers.ts` | 3 callers |
| 6 | D — Orders | `rpc_marketplace_order_print_label` | After Cycle 0 schema confirmed |
| 7 | E — Chat | All 4 chat RPCs | Depends on knowing the chat table schema |
| 8 | A — Delete | 3 obsolete RPCs + DB function cleanup | After all callers confirmed removed |

---

## Success Criteria

- [ ] Zero `.rpc(` calls in `src/` except for atomic RPCs (stock, NF, bootstrap, cascade, duplicate) and PGMQ wrappers
- [ ] Zero `.rpc(` calls in `supabase/functions/` for non-atomic operations
- [ ] `is_org_member` RPC deleted from DB
- [ ] `get_user_organization_id` / `get_current_user_organization_id` RPCs deleted from DB
- [ ] `rpc_get_member_permissions` RPC deleted from DB
- [ ] 3 obsolete/dev RPCs deleted from DB
- [ ] No `as any` casts introduced to work around missing types (all replacements use typed `.from()` calls)
- [ ] Existing behavior unchanged — no user-visible changes

---

## Files Affected

**Edge functions (add shared helper, update callers):**
- `supabase/functions/_shared/adapters/infra/` — add `assert-org-member.ts`, `fetch-member-permissions.ts`
- `supabase/functions/focus-nfe-sync/index.ts`
- `supabase/functions/focus-company-create/index.ts`
- `supabase/functions/focus-nfe-cancel/index.ts`
- `supabase/functions/mercado-livre-submit-xml/index.ts`
- `supabase/functions/focus-nfe-emit/index.ts`
- `supabase/functions/upload-company-certificate/index.ts`
- `supabase/functions/manage-users/index.ts`
- `supabase/functions/mercado-livre-sync-orders/index.ts`
- `supabase/functions/mercado-livre-sync-items/index.ts`
- `supabase/functions/mercado-livre-sync-stock-distribution/index.ts`
- `supabase/functions/mercado-livre-sync-prices/index.ts`
- `supabase/functions/shopee-sync-orders/index.ts` (remove `upsert_marketplace_order_raw_shopee` fallback)

**Frontend:**
- `src/services/supabase-helpers.ts` — update `resolveOrgId()`
- `src/services/orders.service.ts` — replace `rpc_marketplace_order_print_label`
- `src/services/team.service.ts` — new file, extract chat queries
- `src/hooks/useChat.ts` — replace 3 chat RPCs
- `src/hooks/useProductForm.ts` — read permission from `usePermissions()` context
- `src/pages/NovuraAdmin.tsx` — replace `set_user_permissions`
- `src/pages/Apps.tsx` — keep `disconnect_marketplace_cascade` (atomic)
- `src/pages/Team.tsx` — replace 3 chat/member RPCs
- `src/components/orders/NfeEmissionList.tsx` — remove mock seed button, replace `get_current_user_organization_id`
- `src/components/orders/LinkOrderModal.tsx` — replace `get_current_user_organization_id`
- `src/components/invoices/InvoiceActions.tsx` — replace `get_current_user_organization_id`
- `src/components/team/ChatTab.tsx` — replace 3 chat/member RPCs
