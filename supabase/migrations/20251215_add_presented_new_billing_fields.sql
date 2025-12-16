BEGIN;

ALTER TABLE public.marketplace_orders_presented_new
  ADD COLUMN IF NOT EXISTS billing_doc_number text,
  ADD COLUMN IF NOT EXISTS billing_doc_type text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_phone text,
  ADD COLUMN IF NOT EXISTS billing_name text,
  ADD COLUMN IF NOT EXISTS billing_state_registration text,
  ADD COLUMN IF NOT EXISTS billing_taxpayer_type text,
  ADD COLUMN IF NOT EXISTS billing_cust_type text,
  ADD COLUMN IF NOT EXISTS billing_is_normalized boolean,
  ADD COLUMN IF NOT EXISTS billing_address jsonb;

DROP TRIGGER IF EXISTS trg_presented_new_billing ON public.marketplace_orders_presented_new;
DROP FUNCTION IF EXISTS public.fill_presented_new_billing_fields();
 
ALTER TABLE public.marketplace_orders_presented_new
  DROP COLUMN IF EXISTS billing_last_name;
 
COMMIT;
