ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS global_role text;

UPDATE public.users
SET global_role = 'nv_superadmin'
WHERE id = 'a3280b65-df29-48ab-bee0-f11ad07bd78c';

