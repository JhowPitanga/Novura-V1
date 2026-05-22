/**
 * assertOrgActive.ts
 * Edge Function middleware that rejects requests from blocked organizations.
 * Use after resolving organizationId in a function's handler.
 */

import { jsonResponse } from "./http-utils.ts";
import { createAdminClient } from "./supabase-client.ts";

export interface OrgActiveResult {
  readonly active: true;
}

export interface OrgBlockedResult {
  readonly active: false;
  readonly response: Response;
}

export type OrgCheckResult = OrgActiveResult | OrgBlockedResult;

export async function assertOrgActive(organizationId: string): Promise<OrgCheckResult> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organization_status")
    .select("status, deleted_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    // If table doesn't exist yet or any DB error, allow (fail-open during migration)
    console.warn("assertOrgActive: DB error", error.message);
    return { active: true };
  }

  if (!data) {
    // No status row means org hasn't been backfilled yet — allow
    return { active: true };
  }

  if (data.status === "blocked" || data.deleted_at !== null) {
    return {
      active: false,
      response: jsonResponse({ error: "Organization is blocked", code: "ORG_BLOCKED" }, 403),
    };
  }

  return { active: true };
}

export function isOrgActive(result: OrgCheckResult): result is OrgActiveResult {
  return result.active;
}
