-- ============================================================
-- T02 - Products: add integrity constraints + soft-delete
-- ============================================================
BEGIN;

-- 1) Add deleted_at for soft-delete if not present
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- 2) Type constraint: restrict to known product types
-- Migrate legacy 'ITEM' → 'KIT' first
UPDATE public.products SET type = 'KIT' WHERE type = 'ITEM';

DO $$
BEGIN
  -- Add check constraint only if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_type_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_type_check
      CHECK (type IN ('UNICO','VARIACAO_PAI','VARIACAO_ITEM','KIT'));
  END IF;
END $$;

-- 3) VARIACAO_ITEM must have a parent_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_variacao_item_must_have_parent'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_variacao_item_must_have_parent
      CHECK (type <> 'VARIACAO_ITEM' OR parent_id IS NOT NULL);
  END IF;
END $$;

-- 4) UNICO must not have a parent_id
-- Data healing: legacy rows may have inconsistent parent_id values
UPDATE public.products
SET parent_id = NULL
WHERE type = 'UNICO'
  AND parent_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_unico_no_parent'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_unico_no_parent
      CHECK (type <> 'UNICO' OR parent_id IS NULL);
  END IF;
END $$;

-- 5) Unique SKU per organization (when not soft-deleted)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND indexname = 'uq_products_org_sku_active'
  ) THEN
    CREATE UNIQUE INDEX uq_products_org_sku_active
      ON public.products (organizations_id, sku)
      WHERE deleted_at IS NULL;
  END IF;
END $$;

-- 6) Partial index for active products ordered by name
CREATE INDEX IF NOT EXISTS idx_products_org_type_active
  ON public.products (organizations_id, type, name)
  WHERE deleted_at IS NULL;

-- 7) Index for parent-child queries
CREATE INDEX IF NOT EXISTS idx_products_parent_id
  ON public.products (parent_id)
  WHERE parent_id IS NOT NULL;

COMMIT;
