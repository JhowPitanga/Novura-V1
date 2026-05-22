/**
 * handlers/modules.ts
 * Unified system_modules + system_features catalog per organization.
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";
import { syncAllOrgsModuleSwitches } from "../../_shared/adapters/admin/syncModuleSwitches.ts";
import { fetchOrgModuleCatalog } from "./moduleCatalog.ts";

export async function handleListOrganizationModules(organizationId: string): Promise<Response> {
  const admin = createAdminClient();
  try {
    const modules = await fetchOrgModuleCatalog(admin, organizationId);
    return jsonResponse({ modules });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}

export async function handleUpdateSystemModule(
  moduleName: string,
  active: boolean,
): Promise<Response> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("system_modules")
    .update({ active })
    .eq("name", moduleName);

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);

  try {
    await syncAllOrgsModuleSwitches(admin);
  } catch (syncErr) {
    return jsonResponse({ error: (syncErr as Error).message, code: "SYNC_ERROR" }, 500);
  }

  return jsonResponse({ success: true });
}

export async function handleListSystemPlans(): Promise<Response> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("system_plans").select("*").order("price_cents");
  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ plans: data ?? [] });
}

export async function handleUpdateOrganizationPlan(
  organizationId: string,
  planSku: string,
): Promise<Response> {
  const admin = createAdminClient();
  const { data: plan, error: planError } = await admin
    .from("system_plans")
    .select("sku, max_users")
    .eq("sku", planSku)
    .maybeSingle();

  if (planError || !plan) {
    return jsonResponse({ error: "Plan not found", code: "NOT_FOUND" }, 404);
  }

  const { error } = await admin
    .from("organization_status")
    .update({
      plan_sku: plan.sku,
      max_users_allowed: plan.max_users,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ success: true });
}
