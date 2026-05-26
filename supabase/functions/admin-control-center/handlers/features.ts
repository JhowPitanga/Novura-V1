/**
 * handlers/features.ts
 * System features + per-org capability management.
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";
import { propagateOrgModuleAccess } from "../../_shared/adapters/admin/syncModuleSwitches.ts";
import { ensureSystemFeatureForModule, fetchOrgModuleCatalog } from "./moduleCatalog.ts";
import type { UpdateFeaturesBody } from "../types/AdminApiTypes.ts";

export async function handleListSystemFeatures(): Promise<Response> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("system_features")
    .select("*")
    .order("key");

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ features: data });
}

export async function handleUpdateOrganizationFeatures(body: UpdateFeaturesBody): Promise<Response> {
  const admin = createAdminClient();

  try {
    await ensureSystemFeatureForModule(admin, body.featureKey);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message, code: "NOT_FOUND" }, 404);
  }

  const { error } = await admin
    .from("organization_features")
    .upsert(
      {
        organization_id: body.organizationId,
        feature_key: body.featureKey,
        is_enabled: body.is_enabled,
        capabilities: body.capabilities,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,feature_key" },
    );

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);

  try {
    await propagateOrgModuleAccess(
      admin,
      body.organizationId,
      body.featureKey,
      Boolean(body.is_enabled),
    );
  } catch (syncErr) {
    return jsonResponse({ error: (syncErr as Error).message, code: "SYNC_ERROR" }, 500);
  }

  return jsonResponse({ success: true });
}

export async function handleListOrganizationFeatures(organizationId: string): Promise<Response> {
  const admin = createAdminClient();
  try {
    const modules = await fetchOrgModuleCatalog(admin, organizationId);
    const features = modules.map((m) => ({
      feature_key: m.module_key,
      name: m.display_name,
      badge_status: m.badge_status,
      is_globally_enabled: m.global_module_active && m.feature_globally_enabled,
      is_enabled: m.is_enabled,
      capabilities: m.capabilities,
    }));
    return jsonResponse({ features, modules });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}
