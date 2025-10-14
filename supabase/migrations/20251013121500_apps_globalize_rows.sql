-- Globalize apps rows: remove org/user/company scoping by nullifying these columns
-- This aligns with the product logic: apps is a global catalog managed by us; per-account data lives in marketplace_integrations

UPDATE public.apps
SET organizations_id = NULL,
    company_id = NULL,
    user_id = NULL;