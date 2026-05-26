import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listOrganizations,
  getOrganization,
  blockOrganization,
  unblockOrganization,
  archiveOrganization,
  type ListOrgsParams,
} from "@/services/admin-control.service";

export const adminOrgKeys = {
  all: ["admin", "organizations"] as const,
  list: (params: ListOrgsParams) => ["admin", "organizations", "list", params] as const,
  detail: (id: string) => ["admin", "organizations", id] as const,
};

export function useAdminOrganizations(params: ListOrgsParams = {}) {
  return useQuery({
    queryKey: adminOrgKeys.list(params),
    queryFn: () => listOrganizations(params),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}

export function useAdminOrganization(id: string) {
  return useQuery({
    queryKey: adminOrgKeys.detail(id),
    queryFn: () => getOrganization(id),
    staleTime: 2 * 60 * 1000,
    enabled: !!id,
  });
}

export function useBlockOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => blockOrganization(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminOrgKeys.all }),
  });
}

export function useUnblockOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unblockOrganization(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminOrgKeys.all }),
  });
}

export function useArchiveOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => archiveOrganization(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminOrgKeys.all }),
  });
}
