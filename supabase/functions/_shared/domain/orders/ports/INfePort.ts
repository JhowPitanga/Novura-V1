/**
 * Immutable invoice record representing a single NFe emission result.
 * Persisted to `notas_fiscais` table.
 */
export interface InvoiceRecord {
  readonly orderId: string;
  readonly companyId: string;
  readonly marketplaceOrderId: string | null;
  readonly marketplace: string | null;
  readonly packId: string | null;
  /** Internal domain status (maps to OrderStatus). */
  readonly status: string;
  /** Status returned directly from Focus NFe API. */
  readonly statusFocus: string | null;
  readonly environment: "homologacao" | "producao";
  readonly focusNfeId: string | null;
  readonly nfeKey: string | null;
  readonly nfeNumber: number | null;
  readonly serie: string | null;
  readonly authorizedAt: string | null;
  readonly xmlBase64: string | null;
  readonly pdfBase64: string | null;
  readonly errorDetails: unknown | null;
}

/**
 * Port for NFe invoice persistence.
 * Implementations interact with the `notas_fiscais` table.
 */
export interface INfePort {
  /**
   * Returns the existing invoice for a given order and environment, or null if none exists.
   */
  findInvoiceByOrder(params: {
    readonly companyId: string;
    readonly orderId: string;
    readonly environment: "homologacao" | "producao";
  }): Promise<InvoiceRecord | null>;

  /**
   * Creates or updates the invoice record for the given order.
   * Must be idempotent: repeated calls with the same orderId + environment are safe.
   */
  upsertInvoice(invoice: InvoiceRecord): Promise<void>;
}
