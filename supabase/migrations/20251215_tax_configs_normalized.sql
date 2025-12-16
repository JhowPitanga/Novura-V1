BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add separated columns to company_tax_configs to avoid relying on a single payload
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_tax_configs' AND column_name = 'icms'
  ) THEN
    ALTER TABLE public.company_tax_configs ADD COLUMN icms jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_tax_configs' AND column_name = 'ipi'
  ) THEN
    ALTER TABLE public.company_tax_configs ADD COLUMN ipi jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_tax_configs' AND column_name = 'pis'
  ) THEN
    ALTER TABLE public.company_tax_configs ADD COLUMN pis jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_tax_configs' AND column_name = 'cofins'
  ) THEN
    ALTER TABLE public.company_tax_configs ADD COLUMN cofins jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_tax_configs' AND column_name = 'adicionais'
  ) THEN
    ALTER TABLE public.company_tax_configs ADD COLUMN adicionais jsonb;
  END IF;
END $$;

-- Ensure dedicated columns for Natureza de Operação (Saída/Entrada)
ALTER TABLE public.company_tax_configs
  ADD COLUMN IF NOT EXISTS natureza_saida text,
  ADD COLUMN IF NOT EXISTS natureza_entrada text;

DROP TABLE IF EXISTS public.company_tax_icms_configs CASCADE;
DROP TABLE IF EXISTS public.company_tax_ipi_configs CASCADE;
DROP TABLE IF EXISTS public.company_tax_pis_configs CASCADE;
DROP TABLE IF EXISTS public.company_tax_cofins_configs CASCADE;
DROP TABLE IF EXISTS public.company_tax_adicionais CASCADE;

COMMIT;
