import { supabase } from '@/integrations/supabase/client';

/** Shape returned by fetchInvoices — mirrors columns consumed by InvoiceTable. */
export interface InvoiceRow {
  id: string;
  source: 'invoices' | 'notas_fiscais';
  organization_id: string | null;
  order_id: string | null;
  company_id: string | null;
  focus_id: string | null;
  nfe_number: number | null;
  nfe_key: string | null;
  serie: string | null;
  status: string;
  status_focus: string | null;
  emission_environment: string | null;
  marketplace: string | null;
  marketplace_order_id: string | null;
  marketplace_submission_status: string | null;
  marketplace_submission_response: unknown | null;
  marketplace_fiscal_document_id: string | null;
  pack_id: string | null;
  total_value: number | null;
  xml_url: string | null;
  pdf_url: string | null;
  xml_base64: string | null;
  pdf_base64: string | null;
  error_message: string | null;
  authorized_at: string | null;
  emitted_at: string | null;
  canceled_at: string | null;
  created_at: string;
  tipo: string | null;
}

const INVOICE_SELECT = [
  'id',
  'organization_id',
  'order_id',
  'company_id',
  'focus_id',
  'nfe_number',
  'nfe_key',
  'serie',
  'status',
  'emission_environment',
  'xml_url',
  'pdf_url',
  'marketplace',
  'marketplace_order_id',
  'marketplace_submission_status',
  'marketplace_submission_response',
  'marketplace_fiscal_document_id',
  'pack_id',
  'total_value',
  'error_message',
  'emitted_at',
  'authorized_at',
  'canceled_at',
  'created_at',
].join(', ');

const LEGACY_INVOICE_SELECT = [
  'id',
  'organization_id',
  'order_id',
  'company_id',
  'focus_nfe_id',
  'nfe_number',
  'nfe_key',
  'serie',
  'status',
  'status_focus',
  'emissao_ambiente',
  'xml_url',
  'pdf_url',
  'xml_base64',
  'pdf_base64',
  'marketplace',
  'marketplace_order_id',
  'marketplace_submission_status',
  'marketplace_submission_response',
  'marketplace_fiscal_document_id',
  'pack_id',
  'total_value',
  'error_details',
  'authorized_at',
  'created_at',
  'tipo',
].join(', ');

function toStringOrNull(value: unknown): string | null {
  return value != null && String(value).trim() ? String(value) : null;
}

function toNumberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeInvoiceRow(
  row: Record<string, unknown>,
  source: 'invoices' | 'notas_fiscais'
): InvoiceRow {
  return {
    id: String(row.id),
    source,
    organization_id: toStringOrNull(row.organization_id),
    order_id: toStringOrNull(row.order_id),
    company_id: toStringOrNull(row.company_id),
    focus_id: toStringOrNull(source === 'invoices' ? row.focus_id : row.focus_nfe_id),
    nfe_number: toNumberOrNull(row.nfe_number),
    nfe_key: toStringOrNull(row.nfe_key),
    serie: toStringOrNull(row.serie),
    status: String(row.status ?? ''),
    status_focus: toStringOrNull(row.status_focus),
    emission_environment: toStringOrNull(source === 'invoices' ? row.emission_environment : row.emissao_ambiente),
    marketplace: toStringOrNull(row.marketplace),
    marketplace_order_id: toStringOrNull(row.marketplace_order_id),
    marketplace_submission_status: toStringOrNull(row.marketplace_submission_status),
    marketplace_submission_response: row.marketplace_submission_response ?? null,
    marketplace_fiscal_document_id: toStringOrNull(row.marketplace_fiscal_document_id),
    pack_id: toStringOrNull(row.pack_id),
    total_value: toNumberOrNull(row.total_value),
    xml_url: toStringOrNull(row.xml_url),
    pdf_url: toStringOrNull(row.pdf_url),
    xml_base64: toStringOrNull(row.xml_base64),
    pdf_base64: toStringOrNull(row.pdf_base64),
    error_message: toStringOrNull(source === 'invoices' ? row.error_message : row.error_details),
    authorized_at: toStringOrNull(row.authorized_at),
    emitted_at: toStringOrNull(row.emitted_at),
    canceled_at: toStringOrNull(row.canceled_at),
    created_at: String(row.created_at ?? ''),
    // Canonical invoices are outbound NF-e from marketplace orders.
    tipo: source === 'invoices' ? 'saida' : toStringOrNull(row.tipo),
  };
}

function sortMostRecentFirst(rows: InvoiceRow[]): InvoiceRow[] {
  return rows.sort((a, b) => {
    const aDate = new Date(a.authorized_at ?? a.emitted_at ?? a.created_at).getTime();
    const bDate = new Date(b.authorized_at ?? b.emitted_at ?? b.created_at).getTime();
    return bDate - aDate;
  });
}

function dedupeInvoices(rows: InvoiceRow[]): InvoiceRow[] {
  const deduped = new Map<string, InvoiceRow>();
  for (const row of rows) {
    const dedupeKey =
      row.nfe_key ||
      (row.serie && row.nfe_number != null ? `${row.serie}-${row.nfe_number}` : '') ||
      (row.marketplace_order_id && row.company_id ? `${row.company_id}-${row.marketplace_order_id}` : '') ||
      row.id;

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, row);
    }
  }

  return Array.from(deduped.values());
}

/** Fetch all invoices for an organization, ordered by most recent first. */
export async function fetchInvoices(organizationId: string): Promise<InvoiceRow[]> {
  const { data: invoicesData, error: invoicesError } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('organization_id', organizationId)
    .order('authorized_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (invoicesError) {
    throw invoicesError;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('notas_fiscais')
    .select(LEGACY_INVOICE_SELECT)
    .eq('organization_id', organizationId)
    .order('authorized_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (legacyError) {
    console.warn('[invoices.service] legacy notas_fiscais query failed:', legacyError);
  }

  const normalizedInvoices = (Array.isArray(invoicesData) ? invoicesData : []).map((row) =>
    normalizeInvoiceRow(row as Record<string, unknown>, 'invoices')
  );
  const normalizedLegacy = (Array.isArray(legacyData) ? legacyData : []).map((row) =>
    normalizeInvoiceRow(row as Record<string, unknown>, 'notas_fiscais')
  );

  return sortMostRecentFirst(dedupeInvoices([...normalizedInvoices, ...normalizedLegacy]));
}

/** Fetch one invoice by id from the canonical or legacy source. */
export async function fetchInvoiceById(invoiceId: string, organizationId: string): Promise<InvoiceRow | null> {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (invoiceError) {
    throw invoiceError;
  }

  if (invoiceData) {
    return normalizeInvoiceRow(invoiceData as Record<string, unknown>, 'invoices');
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('notas_fiscais')
    .select(LEGACY_INVOICE_SELECT)
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (legacyError) {
    throw legacyError;
  }

  return legacyData ? normalizeInvoiceRow(legacyData as Record<string, unknown>, 'notas_fiscais') : null;
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
