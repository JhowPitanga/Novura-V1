BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS public.company_tax_configs CASCADE;

CREATE TABLE IF NOT EXISTS public.company_tax_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  observacao text,
  is_default boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL,
  selected_rule_ids uuid[] DEFAULT '{}',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_tax_configs IS 'Per-company tax configuration payloads linked to organization and company.';
COMMENT ON COLUMN public.company_tax_configs.payload IS 'Full configuration (basics, icms, icmsExtras, ipi, pis, cofins, adicionais).';

CREATE UNIQUE INDEX IF NOT EXISTS company_tax_configs_one_default_per_company
  ON public.company_tax_configs (company_id)
  WHERE is_default;

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
