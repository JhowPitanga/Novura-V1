-- Fix search_org_members to read email from auth.users and name from user_profiles
BEGIN;

CREATE OR REPLACE FUNCTION public.search_org_members(
  p_org_id uuid,
  p_term text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS TABLE(id uuid, email text, nome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Temporarily disable RLS inside this function; access is controlled by org membership filter
  PERFORM set_config('row_security', 'off', true);

  RETURN QUERY
  SELECT u.id,
         u.email,
         up.display_name AS nome
  FROM auth.users u
  LEFT JOIN public.user_profiles up ON up.id = u.id
  WHERE EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_org_id AND om.user_id = u.id
  )
  AND (
    p_term IS NULL OR
    u.email ILIKE '%'||p_term||'%' OR
    COALESCE(up.display_name, '') ILIKE '%'||p_term||'%'
  )
  ORDER BY up.display_name NULLS LAST, u.email
  LIMIT LEAST(GREATEST(p_limit,1),50);
END;
$$;

COMMIT;