/**
 * moduleCatalog.ts
 * Shared catalog builder: every system_modules row + feature/org overrides.
 */

import type { SupabaseClient } from "../../_shared/adapters/infra/supabase-client.ts";

const DEFAULT_CAPS = {
  can_view: true,
  can_create: true,
  can_edit: true,
  can_delete: false,
};

export type OrgModuleRow = {
  module_key: string;
  module_id: string;
  display_name: string;
  description: string | null;
  global_module_active: boolean;
  badge_status: string;
  feature_globally_enabled: boolean;
  is_enabled: boolean;
  capabilities: Record<string, unknown>;
  has_feature_catalog: boolean;
  /** Same formula as build_effective_module_switches — what tenants actually see */
  effective_active: boolean;
};

export async function fetchOrgModuleCatalog(
  admin: SupabaseClient,
  organizationId: string,
): Promise<OrgModuleRow[]> {
  const [modsRes, featsRes, orgFeatsRes] = await Promise.all([
    admin.from("system_modules").select("id, name, display_name, description, active").order("name"),
    admin.from("system_features").select("key, name, badge_status, is_globally_enabled"),
    admin
      .from("organization_features")
      .select("feature_key, is_enabled, capabilities")
      .eq("organization_id", organizationId),
  ]);

  if (modsRes.error) throw new Error(modsRes.error.message);
  if (featsRes.error) throw new Error(featsRes.error.message);
  if (orgFeatsRes.error) throw new Error(orgFeatsRes.error.message);

  const featByKey = new Map((featsRes.data ?? []).map((f) => [f.key, f]));
  const orgByKey = new Map((orgFeatsRes.data ?? []).map((f) => [f.feature_key, f]));

  return (modsRes.data ?? []).map((mod) => {
    const feat = featByKey.get(mod.name);
    const orgF = orgByKey.get(mod.name);
    const globalGate = Boolean(mod.active) && Boolean(feat?.is_globally_enabled ?? true);
    const orgEnabled = orgF?.is_enabled ?? globalGate;
    const effectiveActive = globalGate && Boolean(orgEnabled);
    return {
      module_key: mod.name,
      module_id: mod.id,
      display_name: mod.display_name ?? mod.name,
      description: mod.description ?? null,
      global_module_active: Boolean(mod.active),
      badge_status: feat?.badge_status ?? "stable",
      feature_globally_enabled: feat?.is_globally_enabled ?? true,
      is_enabled: orgEnabled,
      effective_active: effectiveActive,
      capabilities: (orgF?.capabilities as Record<string, unknown>) ?? DEFAULT_CAPS,
      has_feature_catalog: Boolean(feat),
    };
  });
}

export async function ensureSystemFeatureForModule(
  admin: SupabaseClient,
  featureKey: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("system_features")
    .select("key")
    .eq("key", featureKey)
    .maybeSingle();
  if (existing) return;

  const { data: mod, error: modErr } = await admin
    .from("system_modules")
    .select("name, display_name")
    .eq("name", featureKey)
    .maybeSingle();

  if (modErr || !mod) {
    throw new Error(`Module not found: ${featureKey}`);
  }

  const devKeys = new Set(["recursos_seller", "novura_academy", "comunidade"]);
  const badge = featureKey === "novura_academy"
    ? "new"
    : devKeys.has(featureKey)
    ? "beta"
    : "stable";

  const { error: insErr } = await admin.from("system_features").insert({
    key: mod.name,
    name: mod.display_name ?? mod.name,
    badge_status: badge,
    is_globally_enabled: true,
  });
  if (insErr) throw new Error(insErr.message);
}
