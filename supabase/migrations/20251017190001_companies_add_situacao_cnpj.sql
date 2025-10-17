-- Alinhar schema: adicionar coluna situacao_cnpj à tabela companies
ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS situacao_cnpj text;