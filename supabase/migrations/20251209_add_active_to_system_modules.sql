ALTER TABLE public.system_modules
ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

