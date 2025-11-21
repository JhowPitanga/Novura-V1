BEGIN;

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_transactions' AND policyname = 'inventory_transactions_select_member'
  ) THEN
    CREATE POLICY inventory_transactions_select_member
      ON public.inventory_transactions
      AS PERMISSIVE
      FOR SELECT
      TO authenticated
      USING (public.is_org_member(auth.uid(), organizations_id));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'inventory_transactions' AND policyname = 'inventory_transactions_insert_member'
  ) THEN
    CREATE POLICY inventory_transactions_insert_member
      ON public.inventory_transactions
      AS PERMISSIVE
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_org_member(auth.uid(), organizations_id));
  END IF;
END $$;

GRANT SELECT ON TABLE public.inventory_transactions TO authenticated;
GRANT INSERT ON TABLE public.inventory_transactions TO authenticated;
REVOKE DELETE ON TABLE public.inventory_transactions FROM authenticated;

COMMIT;