ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS focus_token_producao text;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS focus_token_homologacao text;

