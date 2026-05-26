import { supabase } from '@/integrations/supabase/client';

/** Shape returned by fetchInvoices — mirrors columns consumed by InvoiceTable. */
export interface InvoiceRow {
  id: string;
  nfe_number: number | null;
  nfe_key: string | null;
  serie: string | null;
  status: string;
  marketplace: string | null;
  total_value: number | null;
  authorized_at: string | null;
  created_at: string;
  tipo: string | null;
}

/** Fetch all invoices for an organization, ordered by most recent first. */
export async function fetchInvoices(organizationId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, nfe_number, nfe_key, serie, status, marketplace, total_value, authorized_at, created_at, tipo')
    .eq('organization_id', organizationId)
    .order('authorized_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    id: String(r.id),
    nfe_number: r.nfe_number ?? null,
    nfe_key: r.nfe_key ?? null,
    serie: (r as Record<string, unknown>).serie != null ? String((r as Record<string, unknown>).serie) : null,
    status: String(r.status ?? ''),
    marketplace: r.marketplace ?? null,
    total_value: r.total_value != null ? Number(r.total_value) : null,
    authorized_at: r.authorized_at ?? null,
    created_at: String(r.created_at),
    tipo: (r as Record<string, unknown>).tipo != null ? String((r as Record<string, unknown>).tipo) : null,
  }));
}

/** Fetch the 10 most recent invoices — used by the chat module picker. */
export async function fetchRecentInvoicesSummary(): Promise<Array<{
  id: string;
  nfe_number: number | null;
  nfe_key: string | null;
  status: string;
  authorized_at: string | null;
}>> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, nfe_number, nfe_key, status, authorized_at')
    .order('authorized_at', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error) {
    console.error('[invoices.service] fetchRecentInvoicesSummary error:', error);
    return [];
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => ({
    id: String(r.id),
    nfe_number: r.nfe_number ?? null,
    nfe_key: r.nfe_key ?? null,
    status: String(r.status ?? ''),
    authorized_at: r.authorized_at ?? null,
  }));
}
