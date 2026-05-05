-- ============================================================
-- T10 - categories: add path + level + RPC get_categories_tree
-- ============================================================
BEGIN;

-- 1) Add path and level columns
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS path text NULL,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 0;

-- 2) Index for tree traversal
CREATE INDEX IF NOT EXISTS idx_categories_path ON public.categories (path);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories (parent_id);

-- 3) Function to compute category path recursively
CREATE OR REPLACE FUNCTION public.compute_category_path(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH RECURSIVE tree AS (
    SELECT id, parent_id, name, 0 AS depth
    FROM public.categories
    WHERE id = p_id
    UNION ALL
    SELECT c.id, c.parent_id, c.name, t.depth + 1
    FROM public.categories c
    INNER JOIN tree t ON c.id = t.parent_id
  )
  SELECT string_agg(name, '/' ORDER BY depth DESC)
  FROM tree;
$$;

-- 4) Trigger: recompute path + level on insert/update
CREATE OR REPLACE FUNCTION public.trg_categories_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.path  := NEW.name;
    NEW.level := 0;
  ELSE
    SELECT path || '/' || NEW.name, level + 1
    INTO NEW.path, NEW.level
    FROM public.categories
    WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_path ON public.categories;
CREATE TRIGGER trg_categories_path
  BEFORE INSERT OR UPDATE OF name, parent_id
  ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_categories_path();

-- 5) Backfill existing categories
-- Root categories first
UPDATE public.categories
SET path = name, level = 0
WHERE parent_id IS NULL;

-- Then children (up to 5 levels deep)
DO $$
DECLARE
  i int;
BEGIN
  FOR i IN 1..5 LOOP
    UPDATE public.categories c
    SET path  = p.path || '/' || c.name,
        level = p.level + 1
    FROM public.categories p
    WHERE c.parent_id = p.id
      AND (c.path IS NULL OR c.level <> p.level + 1);
  END LOOP;
END;
$$;

-- 6) RPC: get_categories_tree — flat list ordered by path
CREATE OR REPLACE FUNCTION public.get_categories_tree(p_org_id uuid)
RETURNS TABLE (
  id        uuid,
  name      text,
  parent_id uuid,
  path      text,
  level     int,
  active    boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id,
    c.name,
    c.parent_id,
    c.path,
    c.level,
    c.active
  FROM public.categories c
  WHERE c.active = true
    AND EXISTS (
      -- Ensure the org has access via RLS membership
      SELECT 1 FROM public.organizations o WHERE o.id = p_org_id
    )
  ORDER BY c.path ASC NULLS LAST;
$$;

COMMIT;
