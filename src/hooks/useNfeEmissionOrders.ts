import { useQuery } from "@tanstack/react-query";
import { fetchNfeEmissionOrders, type NfeEmissionOrderData } from "@/services/orders.service";

function resolveErrorMessage(error: unknown): string | null {
  if (error == null) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Erro desconhecido';
}

export const nfeEmissionOrdersKeys = {
  all: ['nfe-emission-orders'] as const,
  page: (orgId: string, offset: number, limit: number) =>
    ['nfe-emission-orders', orgId, offset, limit] as const,
};

export interface UseNfeEmissionOrdersResult {
  orders: NfeEmissionOrderData[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useNfeEmissionOrders(
  orgId: string | null | undefined,
  offset: number,
  limit: number,
): UseNfeEmissionOrdersResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: nfeEmissionOrdersKeys.page(orgId ?? '', offset, limit),
    queryFn: () => fetchNfeEmissionOrders(orgId ?? null, offset, limit),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });

  return {
    orders: data?.orders ?? [],
    totalCount: data?.count ?? 0,
    isLoading,
    error: resolveErrorMessage(error),
    refetch,
  };
}
