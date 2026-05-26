BEGIN;

-- =========================================================
-- Helper: is_super_admin()
-- Reads from JWT app_metadata — single source of truth.
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin',
    false
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Returns true when the caller JWT carries app_metadata.role = super_admin.';

-- =========================================================
-- Table: system_features (global feature catalogue)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.system_features (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  badge_status  text        NOT NULL DEFAULT 'stable'
                            CHECK (badge_status IN ('stable', 'beta', 'new')),
  is_globally_enabled boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_features FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_features TO authenticated;

DROP POLICY IF EXISTS "sf_super_admin_select" ON public.system_features;
DROP POLICY IF EXISTS "sf_super_admin_insert" ON public.system_features;
DROP POLICY IF EXISTS "sf_super_admin_update" ON public.system_features;
DROP POLICY IF EXISTS "sf_super_admin_delete" ON public.system_features;

CREATE POLICY "sf_super_admin_select" ON public.system_features FOR SELECT USING (public.is_super_admin());
CREATE POLICY "sf_super_admin_insert" ON public.system_features FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "sf_super_admin_update" ON public.system_features FOR UPDATE USING (public.is_super_admin());
CREATE POLICY "sf_super_admin_delete" ON public.system_features FOR DELETE USING (public.is_super_admin());

-- =========================================================
-- Table: organization_features (per-tenant overrides)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.organization_features (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key     text        NOT NULL REFERENCES public.system_features(key) ON DELETE CASCADE,
  is_enabled      boolean     NOT NULL DEFAULT true,
  capabilities    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_org_features_org_id ON public.organization_features(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_features_key   ON public.organization_features(feature_key);

ALTER TABLE public.organization_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_features FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_features TO authenticated;

DROP POLICY IF EXISTS "of_super_admin_select" ON public.organization_features;
DROP POLICY IF EXISTS "of_super_admin_insert" ON public.organization_features;
DROP POLICY IF EXISTS "of_super_admin_update" ON public.organization_features;
DROP POLICY IF EXISTS "of_super_admin_delete" ON public.organization_features;

CREATE POLICY "of_super_admin_select" ON public.organization_features FOR SELECT USING (public.is_super_admin());
CREATE POLICY "of_super_admin_insert" ON public.organization_features FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "of_super_admin_update" ON public.organization_features FOR UPDATE USING (public.is_super_admin());
CREATE POLICY "of_super_admin_delete" ON public.organization_features FOR DELETE USING (public.is_super_admin());

-- =========================================================
-- Table: system_plans (plan templates)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.system_plans (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  sku               text        NOT NULL UNIQUE,
  price_cents       integer     NOT NULL DEFAULT 0,
  features_template jsonb       NOT NULL DEFAULT '{}'::jsonb,
  max_users         integer     NOT NULL DEFAULT 10,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.system_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_plans FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_plans TO authenticated;

DROP POLICY IF EXISTS "sp_super_admin_select" ON public.system_plans;
DROP POLICY IF EXISTS "sp_super_admin_insert" ON public.system_plans;
DROP POLICY IF EXISTS "sp_super_admin_update" ON public.system_plans;
DROP POLICY IF EXISTS "sp_super_admin_delete" ON public.system_plans;

CREATE POLICY "sp_super_admin_select" ON public.system_plans FOR SELECT USING (public.is_super_admin());
CREATE POLICY "sp_super_admin_insert" ON public.system_plans FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "sp_super_admin_update" ON public.system_plans FOR UPDATE USING (public.is_super_admin());
CREATE POLICY "sp_super_admin_delete" ON public.system_plans FOR DELETE USING (public.is_super_admin());

-- =========================================================
-- Table: organization_status (telemetry + blocking + quotas)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.organization_status (
  organization_id    uuid        PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  status             text        NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'blocked')),
  active_users_count integer     NOT NULL DEFAULT 0,
  max_users_allowed  integer     NOT NULL DEFAULT 10,
  plan_sku           text        REFERENCES public.system_plans(sku) ON DELETE SET NULL,
  blocked_reason     text,
  blocked_at         timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_status_status ON public.organization_status(status);
CREATE INDEX IF NOT EXISTS idx_org_status_plan   ON public.organization_status(plan_sku);

ALTER TABLE public.organization_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_status FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_status TO authenticated;

DROP POLICY IF EXISTS "os_super_admin_select" ON public.organization_status;
DROP POLICY IF EXISTS "os_super_admin_insert" ON public.organization_status;
DROP POLICY IF EXISTS "os_super_admin_update" ON public.organization_status;
DROP POLICY IF EXISTS "os_super_admin_delete" ON public.organization_status;

CREATE POLICY "os_super_admin_select" ON public.organization_status FOR SELECT USING (public.is_super_admin());
CREATE POLICY "os_super_admin_insert" ON public.organization_status FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "os_super_admin_update" ON public.organization_status FOR UPDATE USING (public.is_super_admin());
CREATE POLICY "os_super_admin_delete" ON public.organization_status FOR DELETE USING (public.is_super_admin());

-- =========================================================
-- updated_at triggers
-- =========================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_system_features_updated_at
      BEFORE UPDATE ON public.system_features
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_org_features_updated_at
      BEFORE UPDATE ON public.organization_features
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_system_plans_updated_at
      BEFORE UPDATE ON public.system_plans
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
    EXECUTE 'CREATE OR REPLACE TRIGGER trg_org_status_updated_at
      BEFORE UPDATE ON public.organization_status
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;

-- =========================================================
-- RPC: is_org_active (callable from edge functions via service role)
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_status
    WHERE organization_id = p_org_id
      AND status = 'active'
      AND deleted_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_active(uuid) TO authenticated, service_role;

-- =========================================================
-- Seeds: system_plans
-- =========================================================
INSERT INTO public.system_plans (name, sku, price_cents, max_users, features_template)
VALUES
  ('Trial',      'plan_trial',      0,       3,  '{"max_users": 3}'::jsonb),
  ('Standard',   'plan_standard',   9900,    15, '{"max_users": 15}'::jsonb),
  ('Enterprise', 'plan_enterprise', 29900,   100,'{"max_users": 100}'::jsonb)
ON CONFLICT (sku) DO NOTHING;

-- =========================================================
-- Seeds: system_features
-- =========================================================
INSERT INTO public.system_features (key, name, badge_status, is_globally_enabled)
VALUES
  ('desempenho',    'Desempenho',        'stable', true),
  ('pedidos',       'Pedidos',           'stable', true),
  ('produtos',      'Produtos',          'stable', true),
  ('estoque',       'Estoque',           'stable', true),
  ('notas_fiscais', 'Notas Fiscais',     'stable', true),
  ('anuncios',      'Anúncios',          'stable', true),
  ('aplicativos',   'Aplicativos',       'stable', true),
  ('equipe',        'Equipe',            'beta',   true),
  ('sac',           'SAC',               'beta',   true),
  ('pesquisa_mercado', 'Pesquisa de Mercado', 'new', true)
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- Backfill: organization_status for existing orgs
-- =========================================================
INSERT INTO public.organization_status (
  organization_id,
  status,
  active_users_count,
  max_users_allowed,
  plan_sku
)
SELECT
  o.id,
  'active',
  COALESCE((
    SELECT count(*)::integer
    FROM public.organization_members om
    WHERE om.organization_id = o.id
  ), 0),
  10,
  'plan_standard'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_status os WHERE os.organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

COMMIT;
