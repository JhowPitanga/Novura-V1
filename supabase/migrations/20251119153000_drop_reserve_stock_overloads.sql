BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT array_to_string(p.proargtypes::regtype[], ', ') AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reserve_stock_for_order_item'
  LOOP
    IF r.sig <> 'uuid, integer, uuid' THEN
      EXECUTE 'DROP FUNCTION IF EXISTS public.reserve_stock_for_order_item(' || r.sig || ')';
    END IF;
  END LOOP;
END $$;

COMMIT;