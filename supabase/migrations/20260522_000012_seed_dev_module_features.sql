BEGIN;

-- Align system_features with every system_modules row (required for per-org toggles + sync).
INSERT INTO public.system_features (key, name, badge_status, is_globally_enabled)
VALUES
  ('recursos_seller', 'Recursos Seller', 'beta', true),
  ('novura_academy', 'Novura Academy', 'new', true),
  ('comunidade', 'Comunidade', 'beta', true),
  ('configuracoes', 'Configurações', 'stable', true),
  ('dashboard', 'Dashboard', 'stable', true),
  ('usuarios', 'Usuários', 'stable', true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  badge_status = EXCLUDED.badge_status;

-- Re-sync all tenants so module_switches.global reflects the full catalog.
SELECT public.sync_all_orgs_module_switches();

COMMIT;
