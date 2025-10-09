-- Restrict INSERT on public.storage to organization admins/owners (master/admin)

-- Helper function: a user is considered admin/master if they have role 'owner' or 'admin' in any organization
CREATE OR REPLACE FUNCTION public.is_admin_or_master(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = p_user_id AND m.role = ANY(ARRAY['owner','admin'])
  );
$$;

-- Ensure RLS is enabled on storage table
ALTER TABLE public.storage ENABLE ROW LEVEL SECURITY;

-- Replace existing INSERT policy to allow only admin/master (owner/admin) users to create warehouses
DROP POLICY IF EXISTS "Users can create storage" ON public.storage;
CREATE POLICY "Admins/Masters can create storage"
ON public.storage
FOR INSERT
WITH CHECK (public.is_admin_or_master(auth.uid()));