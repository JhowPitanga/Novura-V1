BEGIN;

-- Rename organization_id → organizations_id to match the rest of the schema.
-- Uses RENAME COLUMN instead of DROP+CREATE to preserve existing rows.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'company_tax_configs'
      AND column_name  = 'organization_id'
  ) THEN
    ALTER TABLE public.company_tax_configs
      RENAME COLUMN organization_id TO organizations_id;
  END IF;
END $$;

COMMENT ON TABLE public.company_tax_configs IS 'Per-company tax configuration payloads linked to organization and company.';
COMMENT ON COLUMN public.company_tax_configs.payload IS 'Full configuration (basics, icms, icmsExtras, ipi, pis, cofins, adicionais).';

-- Recreate unique index (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS company_tax_configs_one_default_per_company
  ON public.company_tax_configs (company_id)
  WHERE is_default;

-- Recreate updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_company_tax_configs ON public.company_tax_configs;
CREATE TRIGGER set_updated_at_company_tax_configs
  BEFORE UPDATE ON public.company_tax_configs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.company_tax_configs ENABLE ROW LEVEL SECURITY;

-- Recreate RLS policies using the renamed column
DROP POLICY IF EXISTS company_tax_configs_select ON public.company_tax_configs;
DROP POLICY IF EXISTS company_tax_configs_insert ON public.company_tax_configs;
DROP POLICY IF EXISTS company_tax_configs_update ON public.company_tax_configs;
DROP POLICY IF EXISTS company_tax_configs_delete ON public.company_tax_configs;

CREATE POLICY company_tax_configs_select ON public.company_tax_configs
  FOR SELECT USING (
    organizations_id = public.get_current_user_organization_id()
    AND (
      public.current_user_has_permission('configuracoes', 'view')
      OR public.current_user_has_permission('configuracoes', 'edit')
    )
  );

CREATE POLICY company_tax_configs_insert ON public.company_tax_configs
  FOR INSERT WITH CHECK (
    organizations_id = public.get_current_user_organization_id()
    AND public.current_user_has_permission('configuracoes', 'edit')
  );

CREATE POLICY company_tax_configs_update ON public.company_tax_configs
  FOR UPDATE USING (
    organizations_id = public.get_current_user_organization_id()
    AND public.current_user_has_permission('configuracoes', 'edit')
  )
  WITH CHECK (
    organizations_id = public.get_current_user_organization_id()
    AND public.current_user_has_permission('configuracoes', 'edit')
  );

CREATE POLICY company_tax_configs_delete ON public.company_tax_configs
  FOR DELETE USING (
    organizations_id = public.get_current_user_organization_id()
    AND public.current_user_has_permission('configuracoes', 'edit')
  );

COMMIT;
