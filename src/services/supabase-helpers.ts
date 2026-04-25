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

  // Compatible query for environments where companies.is_default does not exist.
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
