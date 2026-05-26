import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { warehouseKeys } from "@/services/query-keys";
import {
  fetchWarehouseConfig,
  fetchStorageByType,
  fetchAllActiveStorage,
  upsertWarehouseConfig,
  createFulfillmentStorage,
  type StorageType,
  type StorageOption,
  type WarehouseConfigFull,
} from "@/services/warehouse.service";

// Re-export types so consumers import from a single place
export type { StorageOption, WarehouseConfigFull, StorageType };

// ---------------------------------------------------------------------------
// Fetch warehouse config for a single integration
// ---------------------------------------------------------------------------

export function useWarehouseConfig(integrationId: string | null | undefined) {
  const { organizationId } = useAuth();

  return useQuery<WarehouseConfigFull | null>({
    queryKey: warehouseKeys.config(integrationId ?? ""),
    queryFn: () => fetchWarehouseConfig(organizationId!, integrationId!),
    enabled: !!organizationId && !!integrationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Fetch storage locations filtered by type
// ---------------------------------------------------------------------------

export function useStorageByType(type: StorageType, marketplaceName?: string | null) {
  const { organizationId } = useAuth();

  return useQuery<StorageOption[]>({
    queryKey: warehouseKeys.storageByType(organizationId ?? "", type),
    queryFn: () => fetchStorageByType(organizationId!, type),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    select: (data) => {
      if (type === "fulfillment" && marketplaceName) {
        // Prefer storages linked to the same marketplace, fall back to all fulfillment
        const linked = data.filter(
          (s) =>
            s.marketplace_name?.toLowerCase() === marketplaceName.toLowerCase()
        );
        return linked.length > 0 ? linked : data;
      }
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// Fetch all active storage (any type) - used for display in cards
// ---------------------------------------------------------------------------

export function useAllActiveStorage() {
  const { organizationId } = useAuth();

  return useQuery<StorageOption[]>({
    queryKey: warehouseKeys.storageAll(organizationId ?? ""),
    queryFn: () => fetchAllActiveStorage(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutation: upsert warehouse config
// ---------------------------------------------------------------------------

export function useWarehouseConfigMutation() {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    {
      integrationId: string;
      physicalStorageId: string;
      fulfillmentStorageId: string | null;
    }
  >({
    mutationFn: ({ integrationId, physicalStorageId, fulfillmentStorageId }) =>
      upsertWarehouseConfig(
        organizationId!,
        integrationId,
        physicalStorageId,
        fulfillmentStorageId
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.config(variables.integrationId) });
      queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
      // Also invalidate integration-warehouse-config query used in Inventory.tsx
      queryClient.invalidateQueries({ queryKey: ["integration-warehouse-config"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation: create fulfillment storage
// ---------------------------------------------------------------------------

export function useCreateFulfillmentStorageMutation() {
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    StorageOption,
    Error,
    { name: string; integrationId: string; marketplaceName: string }
  >({
    mutationFn: ({ name, integrationId, marketplaceName }) =>
      createFulfillmentStorage(organizationId!, name, integrationId, marketplaceName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
    },
  });
}
