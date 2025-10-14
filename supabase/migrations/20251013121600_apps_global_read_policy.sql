-- Adjust RLS: apps is globally readable; inserts/updates only by service role or admins

DROP POLICY IF EXISTS "Apps: global members view; org owners/admins view" ON public.apps;
CREATE POLICY "Apps: global read"
ON public.apps
FOR SELECT
USING (true);

-- Keep write restrictions tight (assuming existing policies for insert/update/delete)