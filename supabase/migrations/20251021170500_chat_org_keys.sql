-- Per-organization chat encryption key with RLS and RPC helper
BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_org_keys (
  organization_id uuid PRIMARY KEY,
  secret_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_org_keys ENABLE ROW LEVEL SECURITY;

-- Only members of the organization can read the key (client uses to encrypt/decrypt)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='select org key for members'
  ) THEN
    CREATE POLICY "select org key for members"
      ON public.chat_org_keys FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_org_keys.organization_id
            AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Only owners/admins can insert/update the key
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='upsert org key by owners'
  ) THEN
    CREATE POLICY "upsert org key by owners"
      ON public.chat_org_keys FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_org_keys.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner','admin')
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_org_keys' AND policyname='update org key by owners'
  ) THEN
    CREATE POLICY "update org key by owners"
      ON public.chat_org_keys FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_org_keys.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner','admin')
        )
      );
  END IF;
END $$;

-- Helper to get or create a key for current user's organization
CREATE OR REPLACE FUNCTION public.get_or_create_chat_org_key()
RETURNS TABLE(organization_id uuid, secret_key text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_key text;
BEGIN
  -- Determine current user's organization (prefers owner/admin/member)
  SELECT om.organization_id
    INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  ORDER BY CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User has no organization';
  END IF;

  SELECT secret_key INTO v_key FROM public.chat_org_keys WHERE organization_id = v_org_id;

  IF v_key IS NULL THEN
    -- Generate a random key (URL-safe base64)
    SELECT encode(gen_random_bytes(32), 'base64') INTO v_key;
    INSERT INTO public.chat_org_keys (organization_id, secret_key)
    VALUES (v_org_id, v_key)
    ON CONFLICT (organization_id)
    DO UPDATE SET secret_key = EXCLUDED.secret_key, updated_at = now();
  END IF;

  RETURN QUERY SELECT v_org_id, v_key;
END;
$$;

COMMIT;

