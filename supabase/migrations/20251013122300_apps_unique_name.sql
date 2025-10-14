-- Ensure unique app names to support UPSERTs by name
CREATE UNIQUE INDEX IF NOT EXISTS uniq_apps_name ON public.apps(name);

-- Optional: if a unique constraint is preferred over index, uncomment below
-- ALTER TABLE public.apps ADD CONSTRAINT apps_name_unique UNIQUE USING INDEX uniq_apps_name;