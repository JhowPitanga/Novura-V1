-- Ensure legacy notas_fiscais has organization_id for compatibility with the new invoices flow.
-- This migration is idempotent and safe to run multiple times.

BEGIN;

ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Backfill organization_id from company first.
UPDATE public.notas_fiscais nf
SET organization_id = c.organization_id
FROM public.companies c
WHERE nf.company_id = c.id
  AND nf.organization_id IS NULL;

-- Backfill remaining rows from orders when company lookup is unavailable.
UPDATE public.notas_fiscais nf
SET organization_id = o.organization_id
FROM public.orders o
WHERE nf.order_id = o.id
  AND nf.organization_id IS NULL;

ALTER TABLE public.notas_fiscais
  DROP CONSTRAINT IF EXISTS notas_fiscais_organization_id_fkey;

ALTER TABLE public.notas_fiscais
  ADD CONSTRAINT notas_fiscais_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notas_fiscais_organization_id_idx
  ON public.notas_fiscais (organization_id);

CREATE OR REPLACE FUNCTION public.set_notas_fiscais_organization_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF NEW.company_id IS NOT NULL THEN
      SELECT c.organization_id
      INTO NEW.organization_id
      FROM public.companies c
      WHERE c.id = NEW.company_id;
    END IF;

    IF NEW.organization_id IS NULL AND NEW.order_id IS NOT NULL THEN
      SELECT o.organization_id
      INTO NEW.organization_id
      FROM public.orders o
      WHERE o.id = NEW.order_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_notas_fiscais_organization_id ON public.notas_fiscais;
CREATE TRIGGER trg_set_notas_fiscais_organization_id
BEFORE INSERT OR UPDATE OF company_id, order_id, organization_id
ON public.notas_fiscais
FOR EACH ROW
EXECUTE FUNCTION public.set_notas_fiscais_organization_id();

COMMIT;
