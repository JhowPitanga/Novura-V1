import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listOrganizationModules,
  updateOrganizationFeatures,
  updateSystemModule,
} from "@/services/admin-control.service";
import type { BaseFeatureCapabilities } from "@/types/admin";

export const adminModuleKeys = {
  org: (orgId: string) => ["admin", "modules", orgId] as const,
};

export function useOrganizationModules(organizationId: string) {
  return useQuery({
    queryKey: adminModuleKeys.org(organizationId),
    queryFn: () => listOrganizationModules(organizationId),
    enabled: !!organizationId,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useUpdateOrgModuleAccess() {
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
      qc.invalidateQueries({ queryKey: adminModuleKeys.org(vars.organizationId) });
      qc.invalidateQueries({ queryKey: ["admin", "features", "org", vars.organizationId] });
    },
  });
}

export function useUpdateGlobalModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleName, active }: { moduleName: string; active: boolean }) =>
      updateSystemModule(moduleName, active),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "modules"] });
      qc.invalidateQueries({ queryKey: ["admin", "features"] });
      qc.invalidateQueries({ queryKey: ["admin", "organizations"] });
    },
  });
}
