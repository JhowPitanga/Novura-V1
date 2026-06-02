/**
 * Lazy-loads and caches the companyId for a given org, resetting on org change.
 * Eliminates the identical duplication between useOrdersPageController (lines 93-101)
 * and useOrdersActions (lines 108-115).
 */
import { useCallback, useEffect, useRef } from "react";
import { getCompanyIdForOrg } from "@/services/orders.service";

export function useCompanyIdCache(
  organizationId: string | null | undefined,
): { getCompanyId: () => Promise<string | null> } {
  const companyIdRef = useRef<string | null>(null);

  useEffect(() => {
    companyIdRef.current = null;
  }, [organizationId]);

  const getCompanyId = useCallback(async (): Promise<string | null> => {
    if (companyIdRef.current) return companyIdRef.current;
    if (!organizationId) return null;
    companyIdRef.current = await getCompanyIdForOrg(organizationId);
    return companyIdRef.current;
  }, [organizationId]);

  return { getCompanyId };
}
