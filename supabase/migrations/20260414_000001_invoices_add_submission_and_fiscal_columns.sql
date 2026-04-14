-- Add marketplace submission tracking columns to invoices.
-- marketplace_submission_response and marketplace_fiscal_document_id did not exist
-- in the original create_invoices_table migration.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS marketplace_submission_response  jsonb,
  ADD COLUMN IF NOT EXISTS marketplace_fiscal_document_id   text;
