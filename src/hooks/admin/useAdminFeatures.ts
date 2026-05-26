import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSystemFeatures,
  listOrganizationFeatures,
  updateOrganizationPlan,
  updateOrganizationFeatures,
} from "@/services/admin-control.service";
import type { BaseFeatureCapabilities } from "@/types/admin";

export const adminFeatureKeys = {
  system: ["admin", "features", "system"] as const,
  org: (orgId: string) => ["admin", "features", "org", orgId] as const,
};

export function useSystemFeatures() {
  return useQuery({
    queryKey: adminFeatureKeys.system,
    queryFn: listSystemFeatures,
    staleTime: 10 * 60 * 1000,
  });
}

export function useOrganizationFeatures(organizationId: string) {
  return useQuery({
    queryKey: adminFeatureKeys.org(organizationId),
    queryFn: () => listOrganizationFeatures(organizationId),
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpdateOrganizationFeature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      organizationId,
      featureKey,
      is_enabled,
      capabilities,
    }: {
      organizationId: string;
      featureKey: string;
      is_enabled: boolean;
      capabilities: BaseFeatureCapabilities;
    }) => updateOrganizationFeatures(organizationId, featureKey, is_enabled, capabilities),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: adminFeatureKeys.org(vars.organizationId) });
    },
  });
}

export function useUpdateOrganizationPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, planSku }: { organizationId: string; planSku: string }) =>
      updateOrganizationPlan(organizationId, planSku),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
      qc.invalidateQueries({ queryKey: adminFeatureKeys.org(vars.organizationId) });
    },
  });
}
