import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  completeIntegrationSetup,
  fetchIntegrationById,
  fetchBlockedCompanies,
  fetchIntegrations,
  integrationKeys,
  updateIntegrationStoreName,
} from "@/services/marketplace-providers.service";

/** Returns all active integrations for the current organization. */
export function useIntegrations() {
  const { organizationId } = useAuth();

  return useQuery({
    queryKey: integrationKeys.list(organizationId ?? ""),
    queryFn: () => fetchIntegrations(organizationId!),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useIntegrationDetail(integrationId: string | null) {
  const { organizationId } = useAuth();

  return useQuery({
    queryKey: integrationKeys.detail(organizationId ?? "", integrationId ?? ""),
    queryFn: () => fetchIntegrationById(organizationId!, integrationId!),
    enabled: Boolean(organizationId) && Boolean(integrationId),
    staleTime: 30 * 1000,
  });
}

/** Returns company IDs that are blocked (already linked) for a given provider in this org. */
export function useBlockedCompaniesForProvider(providerKey: string | null) {
  const { organizationId } = useAuth();

  return useQuery({
    queryKey: integrationKeys.blockedCompanies(
      organizationId ?? "",
      providerKey ?? "",
    ),
    queryFn: () => fetchBlockedCompanies(organizationId!, providerKey!),
    enabled: Boolean(organizationId) && Boolean(providerKey),
    staleTime: 60 * 1000, // 1 min — fairly fresh to prevent duplicate selections
  });
}

/** Marks an integration setup as completed by linking company + warehouse. */
export function useCompleteIntegrationSetup() {
  const queryClient = useQueryClient();
  const { organizationId } = useAuth();

  return useMutation({
    mutationFn: ({
      integrationId,
      companyId,
    }: {
      integrationId: string;
      companyId: string;
    }) => completeIntegrationSetup(integrationId, companyId, organizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(organizationId ?? ""),
      });
    },
  });
}

export function useUpdateIntegrationStoreName() {
  const queryClient = useQueryClient();
  const { organizationId } = useAuth();

  return useMutation({
    mutationFn: ({ integrationId, storeName }: { integrationId: string; storeName: string }) =>
      updateIntegrationStoreName(integrationId, organizationId!, storeName),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: integrationKeys.list(organizationId ?? ""),
      });
      queryClient.invalidateQueries({
        queryKey: integrationKeys.detail(organizationId ?? "", variables.integrationId),
      });
    },
  });
}
