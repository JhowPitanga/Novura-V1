import { useQuery } from "@tanstack/react-query";
import { listGlobalUsers, type ListUsersParams } from "@/services/admin-control.service";

export const adminUserKeys = {
  list: (params: ListUsersParams) => ["admin", "users", "list", params] as const,
};

export function useAdminUsers(params: ListUsersParams = {}) {
  return useQuery({
    queryKey: adminUserKeys.list(params),
    queryFn: () => listGlobalUsers(params),
    staleTime: 2 * 60 * 1000,
    retry: 2,
  });
}
