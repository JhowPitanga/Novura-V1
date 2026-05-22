/**
 * syncModuleSwitches.ts
 * Propagates admin feature/module changes to organization_members.module_switches
 * so tenant sessions and realtime subscriptions pick up access changes.
 */

import type { SupabaseClient } from "../../infra/supabase-client.ts";

export async function syncOrgModuleSwitches(
  admin: SupabaseClient,
  organizationId: string,
): Promise<void> {
  const { error } = await admin.rpc("sync_org_module_switches", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

/** Sync switches + member permissions.view so the ERP sidebar reflects org module toggles. */
export async function propagateOrgModuleAccess(
  admin: SupabaseClient,
  organizationId: string,
  moduleName: string,
  enabled: boolean,
): Promise<void> {
  await syncOrgModuleSwitches(admin, organizationId);
  const { error } = await admin.rpc("bulk_set_module_view", {
    p_organization_id: organizationId,
    p_module: moduleName,
    p_view: enabled,
  });
  if (error) throw new Error(error.message);
}

export async function syncAllOrgsModuleSwitches(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.rpc("sync_all_orgs_module_switches");
  if (error) throw new Error(error.message);
}
