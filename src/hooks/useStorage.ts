import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { inventoryKeys } from "@/services/query-keys";
import {
  fetchStorageLocations,
  type Storage,
} from "@/services/inventory.service";

export type { Storage };

export function useStorage() {
  const { user, organizationId } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: inventoryKeys.storage(organizationId || ""),
    queryFn: () => fetchStorageLocations(organizationId),
    enabled: !!user,
  });

  return {
    storageLocations: data ?? [],
    loading: isLoading,
    refetch,
  };
}
