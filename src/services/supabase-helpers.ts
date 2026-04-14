import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the primary company ID for a given organization.
 * Prefers the default company (is_default = true), falls back to oldest active.
 * Used as a fallback when no explicit company context is available.
 */
export async function getCompanyIdForOrg(
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;

  // First: try the explicit default company
  const { data: defaultData } = await (supabase as any)
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .limit(1);

  if (Array.isArray(defaultData) && defaultData.length > 0) {
    return String(defaultData[0].id);
  }

  // Fallback: oldest active company (handles orgs created before is_default was backfilled)
  const { data } = await (supabase as any)
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  if (Array.isArray(data) && data.length > 0) {
    return String(data[0].id);
  }

  return null;
}
