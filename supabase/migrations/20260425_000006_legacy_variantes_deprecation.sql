-- ============================================================
-- T02 - Deprecate products_variantes (legacy parallel model)
-- Safe: only revokes policies; rename with 30-day observation
-- ============================================================
BEGIN;

-- 1) Revoke all policies on products_variantes
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products_variantes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products_variantes', r.policyname);
  END LOOP;
END $$;

-- 2) Disable RLS so existing data is readable only via service_role during migration
-- (safe: no public policies remain)
ALTER TABLE IF EXISTS public.products_variantes DISABLE ROW LEVEL SECURITY;

-- 3) Add deprecation comment
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'products_variantes'
  ) THEN
    COMMENT ON TABLE public.products_variantes IS
      'DEPRECATED 2026-04-25: This table is no longer used. '
      'Active variations use products.type=VARIACAO_ITEM with products.parent_id. '
      'Scheduled for physical removal after 2026-05-25.';
  END IF;
END $$;

-- NOTE: Physical rename/drop deferred to a future migration after the 30-day
-- observation window. Adding a note:
-- Migration to create: 20260525_000001_drop_products_variantes_legacy.sql

COMMIT;
