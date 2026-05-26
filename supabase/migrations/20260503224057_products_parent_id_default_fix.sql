-- Root cause of products_unico_no_parent (23514) on INSERT when parent_id is omitted:
-- legacy DEFAULT gen_random_uuid() on products.parent_id must not apply.
BEGIN;

ALTER TABLE public.products
  ALTER COLUMN parent_id DROP DEFAULT;

-- Ensure UNICO rows remain consistent if any bad data slipped in before app fixes
UPDATE public.products
SET parent_id = NULL
WHERE type = 'UNICO'
  AND parent_id IS NOT NULL
  AND deleted_at IS NULL;

COMMIT;
