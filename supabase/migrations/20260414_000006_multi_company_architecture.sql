-- ============================================================
-- MC-T1: Multi-Company Architecture — Schema Migration
-- Adds is_default / focus columns to companies,
-- revises marketplace_integrations UNIQUE constraint,
-- adds company_id + integration_id to orders,
-- plus backfill and performance indexes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. New columns on companies
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS focus_company_id text,
  ADD COLUMN IF NOT EXISTS focus_status text NOT NULL DEFAULT 'pending'
    CHECK (focus_status IN ('pending', 'synced', 'error'));

-- Partial unique index: at most one default company per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_default_per_org
  ON public.companies(organization_id)
  WHERE is_default = true;

-- Index to look up Focus company quickly
CREATE INDEX IF NOT EXISTS idx_companies_focus_id
  ON public.companies(focus_company_id)
  WHERE focus_company_id IS NOT NULL;

-- ============================================================
-- 2. Backfill: mark the oldest active company per org as default
-- ============================================================

WITH oldest AS (
  SELECT DISTINCT ON (organization_id)
    id
  FROM public.companies
  WHERE is_active = true
  ORDER BY organization_id, created_at ASC
)
UPDATE public.companies c
SET is_default = true
FROM oldest o
WHERE c.id = o.id
  AND c.is_default = false;

-- ============================================================
-- 3. marketplace_integrations: revise UNIQUE constraint
--    from (org, marketplace) → (org, marketplace, company)
-- ============================================================

-- Drop the old constraint (added in 20260301_000006)
ALTER TABLE public.marketplace_integrations
  DROP CONSTRAINT IF EXISTS uq_marketplace_integrations_org_marketplace;

-- Add new compound constraint that allows multi-company
ALTER TABLE public.marketplace_integrations
  ADD CONSTRAINT uq_marketplace_integrations_org_mkt_company
  UNIQUE (organizations_id, marketplace_name, company_id);

-- ============================================================
-- 4. marketplace_integrations: backfill company_id = default company
--    for any rows that still have a NULL company_id
-- ============================================================

UPDATE public.marketplace_integrations mi
SET company_id = def.id
FROM (
  SELECT organization_id, id
  FROM public.companies
  WHERE is_default = true
) def
WHERE mi.company_id IS NULL
  AND mi.organizations_id = def.organization_id;

-- Now that every row has a value, enforce NOT NULL
ALTER TABLE public.marketplace_integrations
  ALTER COLUMN company_id SET NOT NULL;

-- ============================================================
-- 5. Add company_id and integration_id to orders
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS company_id uuid
    REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS integration_id uuid
    REFERENCES public.marketplace_integrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_company
  ON public.orders(company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_integration
  ON public.orders(integration_id)
  WHERE integration_id IS NOT NULL;

-- ============================================================
-- 6. Backfill orders: set company_id and integration_id
--    via marketplace_integrations resolved by meli_user_id
--    (marketplace_order_id prefix 'ML' → Mercado Livre)
-- ============================================================

-- Step 6a: orders that have a matching marketplace_integrations row
-- (match by organization_id + marketplace name)
UPDATE public.orders o
SET
  integration_id = mi.id,
  company_id     = mi.company_id
FROM public.marketplace_integrations mi
WHERE o.organization_id = mi.organizations_id
  AND o.marketplace     = mi.marketplace_name
  AND o.company_id IS NULL
  AND o.integration_id IS NULL;

-- Step 6b: fallback — orders still without company_id → use default company
UPDATE public.orders o
SET company_id = def.id
FROM (
  SELECT organization_id, id
  FROM public.companies
  WHERE is_default = true
) def
WHERE o.company_id IS NULL
  AND o.organization_id = def.organization_id;

-- ============================================================
-- 7. Performance indexes on marketplace_integrations
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_mi_org_company
  ON public.marketplace_integrations(organizations_id, company_id);

CREATE INDEX IF NOT EXISTS idx_mi_meli_user
  ON public.marketplace_integrations(meli_user_id)
  WHERE meli_user_id IS NOT NULL;

COMMIT;
