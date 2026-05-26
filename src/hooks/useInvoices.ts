import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchInvoices, type InvoiceRow } from '@/services/invoices.service';

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (orgId: string) => ['invoices', 'list', orgId] as const,
};

export interface UseInvoicesResult {
  invoices: InvoiceRow[];
  isLoading: boolean;
  error: string | null;
}

export function useInvoices(): UseInvoicesResult {
  const { organizationId } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: invoiceKeys.list(organizationId ?? ''),
    queryFn: () => fetchInvoices(organizationId ?? ''),
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 3,
  });

  return {
    invoices: data ?? [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  };
}
