# marketplace_orders_raw — Column Audit

**Purpose:** Raw archive of ML/Shopee API responses for re-sync and audit. Never query for display.

## Current Columns (from migrations)

| Column | Source | Purpose |
|--------|--------|---------|
| id | PK, gen_random_uuid() | Primary key |
| organizations_id | FK | Tenant isolation |
| company_id | FK (optional) | Company link |
| marketplace_name | text | 'Mercado Livre' / 'Shopee' |
| marketplace_order_id | text | External order ID |
| status | text | Parsed status (redundant with data) |
| status_detail | text | Parsed detail (redundant with data) |
| order_items | jsonb | Parsed items (redundant with data) |
| payments | jsonb | Parsed payments (redundant with data) |
| shipments | jsonb | Merged from marketplace_shipments / API |
| buyer | jsonb | Parsed buyer (redundant with data) |
| seller | jsonb | Parsed seller (redundant with data) |
| feedback | jsonb | Parsed feedback |
| tags | jsonb | Parsed tags |
| data | jsonb | Full API response / backfill payload |
| date_created | timestamptz | From API |
| date_closed | timestamptz | From API |
| last_updated | timestamptz | From API |
| last_synced_at | timestamptz | When we last wrote |
| updated_at | timestamptz | Row update time |
| billing_info | jsonb | Added later |
| labels | jsonb | Label cache (added later) |
| integration_id | uuid | FK to marketplace_integrations (added later) |

**Unique constraint:** `(organizations_id, marketplace_name, marketplace_order_id)`.

## Minimal Set for Re-sync / Audit

For a pure "raw archive" the minimal set would be:

- `id`, `organizations_id`, `marketplace_name`, `marketplace_order_id`, `integration_id` (optional)
- `raw_payload` (single jsonb) — full API response
- `created_at`, `last_synced_at`

That would allow re-sync by reading `raw_payload` and re-running normalizers. All other columns (status, order_items, payments, shipments, buyer, data, labels, billing_info) are either derivable from the payload or used for legacy/views.

## Recommendation for Cycle 0

**Keep as-is.** The table is already used by existing sync code and by triggers/views. Trimming columns would require:

1. Migrating all writers (mercado-livre-sync-orders, shopee-sync-orders, Shopee upsert function) to write only the minimal set.
2. Updating any code that reads from `marketplace_orders_raw` (e.g. process_marketplace_order_presented_new, views).

Cycle 0 does not change how `marketplace_orders_raw` is written; the new pipeline (orders-sync-ml, orders-sync-shopee) will continue to write the same shape or a compatible one so that the table remains the source of truth for re-sync. No migration file is added to trim columns in this cycle. Document "future migration to minimal schema" as optional tech debt.

## New Pipeline Writing Strategy

When implementing orders-sync-ml and orders-sync-shopee, continue to INSERT/UPSERT into `marketplace_orders_raw` with at least: `organizations_id`, `marketplace_name`, `marketplace_order_id`, `data` (full raw response), `last_synced_at`, `updated_at`. Optionally set `integration_id` if available. Other columns can be left NULL or populated from the normalized payload for backward compatibility with any existing readers.

---

## Phase 0 Verification (Cycle 0 Plan)

**Task:** Audit columns and document minimal set for re-sync/audit. **Done.** Minimal set documented above. No migration to trim columns in Cycle 0; keep table as-is. Future migration to minimal schema is optional tech debt.
