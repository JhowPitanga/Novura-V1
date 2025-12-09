BEGIN;

ALTER TABLE public.system_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System modules: active view" ON public.system_modules;
CREATE POLICY "System modules: active view"
ON public.system_modules
FOR SELECT
USING (
  active = true
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.global_role = 'nv_superadmin'
  )
);

DROP POLICY IF EXISTS "System modules: superadmin update" ON public.system_modules;
CREATE POLICY "System modules: superadmin update"
ON public.system_modules
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.global_role = 'nv_superadmin'
  )
);

DROP POLICY IF EXISTS "System modules: superadmin insert" ON public.system_modules;
CREATE POLICY "System modules: superadmin insert"
ON public.system_modules
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.global_role = 'nv_superadmin'
  )
);

DROP POLICY IF EXISTS "System modules: superadmin delete" ON public.system_modules;
CREATE POLICY "System modules: superadmin delete"
ON public.system_modules
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.global_role = 'nv_superadmin'
  )
);

GRANT SELECT ON public.system_modules TO authenticated;

COMMIT;

