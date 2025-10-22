-- Improve RLS for chat_channels insert and add org member search RPC
BEGIN;

-- Additional insert policy to ensure org members can create channels in their org
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_channels' AND policyname='Insert channels for org members'
  ) THEN
    CREATE POLICY "Insert channels for org members" ON public.chat_channels
      FOR INSERT
      WITH CHECK (
        created_by = auth.uid() AND organization_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = chat_channels.organization_id AND om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Optional grant (RLS still governs access)
GRANT INSERT, SELECT, UPDATE, DELETE ON public.chat_channels TO authenticated;

-- RPC to search members within an organization (bypasses RLS in users via row_security off)
CREATE OR REPLACE FUNCTION public.search_org_members(
  p_org_id uuid,
  p_term text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(id uuid, email text, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);
  RETURN QUERY
  SELECT u.id, u.email, u.nome
  FROM public.users u
  WHERE EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = u.id
  )
  AND (
    p_term IS NULL OR
    u.email ILIKE '%'||p_term||'%' OR
    COALESCE(u.nome, '') ILIKE '%'||p_term||'%'
  )
  ORDER BY u.nome NULLS LAST, u.email
  LIMIT LEAST(GREATEST(p_limit,1),50);
END;
$$;

COMMIT;


