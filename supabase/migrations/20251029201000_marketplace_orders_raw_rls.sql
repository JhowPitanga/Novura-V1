-- Habilita RLS e cria política de SELECT por organização no marketplace_orders_raw

BEGIN;

-- Habilitar RLS na tabela raw
ALTER TABLE IF EXISTS public.marketplace_orders_raw ENABLE ROW LEVEL SECURITY;

-- Garantir privilégios de SELECT para authenticated (políticas exigem privilégios + condição)
GRANT SELECT ON TABLE public.marketplace_orders_raw TO authenticated;

-- Remover política anterior se existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'marketplace_orders_raw'
      AND policyname = 'select_orders_for_my_org'
  ) THEN
    DROP POLICY select_orders_for_my_org ON public.marketplace_orders_raw;
  END IF;
END $$;

-- Criar política de SELECT restrita à organização do usuário logado
CREATE POLICY select_orders_for_my_org
  ON public.marketplace_orders_raw
  FOR SELECT
  TO authenticated
  USING (
    organizations_id IN (
      SELECT id FROM public.get_my_organizations()
    )
  );

COMMIT;