-- Tabela para configurar NF-e por empresa, vinculada à organização
CREATE TABLE IF NOT EXISTS public.company_nf_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  numero_serie text NOT NULL,
  proxima_nfe integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Garantir apenas um registro por empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_nf_conf_company ON public.company_nf_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_company_nf_conf_org ON public.company_nf_configs(organizations_id);

-- Função de atualização de updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trg_company_nf_conf_updated_at ON public.company_nf_configs;
CREATE TRIGGER trg_company_nf_conf_updated_at
BEFORE UPDATE ON public.company_nf_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill dos dados já existentes na tabela companies (quando organization_id existir)
INSERT INTO public.company_nf_configs (organizations_id, company_id, numero_serie, proxima_nfe)
SELECT c.organization_id, c.id, COALESCE(c.numero_serie, ''), COALESCE(c.proxima_nfe, 1)
FROM public.companies c
WHERE c.organization_id IS NOT NULL
  AND (c.numero_serie IS NOT NULL OR c.proxima_nfe IS NOT NULL)
ON CONFLICT (company_id) DO UPDATE
SET numero_serie = EXCLUDED.numero_serie,
    proxima_nfe = EXCLUDED.proxima_nfe;

-- RLS e políticas
ALTER TABLE public.company_nf_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view company NF configs" ON public.company_nf_configs;
CREATE POLICY "Members can view company NF configs"
ON public.company_nf_configs
FOR SELECT
USING (
  public.is_org_member(auth.uid(), organizations_id)
);

DROP POLICY IF EXISTS "Owners/Admins can insert company NF configs" ON public.company_nf_configs;
CREATE POLICY "Owners/Admins can insert company NF configs"
ON public.company_nf_configs
FOR INSERT
WITH CHECK (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can update company NF configs" ON public.company_nf_configs;
CREATE POLICY "Owners/Admins can update company NF configs"
ON public.company_nf_configs
FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);

DROP POLICY IF EXISTS "Owners/Admins can delete company NF configs" ON public.company_nf_configs;
CREATE POLICY "Owners/Admins can delete company NF configs"
ON public.company_nf_configs
FOR DELETE
USING (
  public.has_org_role(auth.uid(), organizations_id, ARRAY['owner','admin'])
);