import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the primary company ID for a given organization.
 * Prefers active companies, ordered by creation date.
 * This pattern is duplicated in 8+ files — centralized here.
 */
export async function getCompanyIdForOrg(
  organizationId: string | null
): Promise<string | null> {
  if (!organizationId) return null;

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
