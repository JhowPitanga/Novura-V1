import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  integrationKeys,
  reconcileStaleIntegrationSetups,
  type MarketplaceIntegration,
} from "@/services/marketplace-providers.service";
import { isIntegrationFullyConfigured } from "@/utils/integrationSetup";

/**
 * Repairs integrations with company + warehouse configured but setup_status still pending.
 */
export function useReconcileIntegrationSetup(
  integrations: MarketplaceIntegration[],
) {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();
  const reconciledRef = useRef<string>("");

  useEffect(() => {
    if (!organizationId || !integrations.length) return;

    const hasStale = integrations.some(
      (row) => row.setup_status === "pending" && isIntegrationFullyConfigured(row),
    );
    if (!hasStale) return;

    const signature = integrations
      .filter((row) => row.setup_status === "pending" && isIntegrationFullyConfigured(row))
      .map((row) => row.id)
      .sort()
      .join(",");
    if (!signature || reconciledRef.current === signature) return;

    reconciledRef.current = signature;
    void reconcileStaleIntegrationSetups(organizationId, integrations)
      .then((count) => {
        if (count > 0) {
          void queryClient.invalidateQueries({
            queryKey: integrationKeys.list(organizationId),
          });
        }
      })
      .catch((err) => {
        console.error("[useReconcileIntegrationSetup]", err);
        reconciledRef.current = "";
      });
  }, [integrations, organizationId, queryClient]);
}
