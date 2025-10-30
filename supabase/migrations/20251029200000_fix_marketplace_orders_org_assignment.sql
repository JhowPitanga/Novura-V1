-- Corrige assignments de organização em pedidos brutos
-- Atualiza organizations_id em marketplace_orders_raw usando companies.company_id -> companies.organization_id
-- Idempotente: só atualiza registros com organizations_id IS NULL

BEGIN;

-- Garante que a tabela e coluna existem antes de atualizar
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketplace_orders_raw'
      AND column_name = 'organizations_id'
  ) THEN
    -- Atualiza organizations_id nulos usando o mapeamento de companies
    UPDATE public.marketplace_orders_raw AS r
    SET organizations_id = c.organization_id
    FROM public.companies AS c
    WHERE r.company_id = c.id
      AND r.organizations_id IS NULL;
  END IF;
END $$;

COMMIT;