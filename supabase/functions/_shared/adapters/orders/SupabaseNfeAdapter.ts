import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { INfePort, InvoiceRecord } from "../../domain/orders/ports/INfePort.ts";

type NotasFiscaisRow = {
  readonly id: string;
  readonly order_id: string | null;
  readonly company_id: string | null;
  readonly marketplace_order_id: string | null;
  readonly marketplace: string | null;
  readonly pack_id: string | null;
  readonly status: string | null;
  readonly status_focus: string | null;
  readonly emissao_ambiente: string | null;
  readonly focus_nfe_id: string | null;
  readonly nfe_key: string | null;
  readonly nfe_number: number | null;
  readonly serie: string | null;
  readonly authorized_at: string | null;
  readonly xml_base64: string | null;
  readonly pdf_base64: string | null;
  readonly error_details: unknown | null;
};

function mapRow(row: NotasFiscaisRow, invoice: InvoiceRecord): InvoiceRecord {
  return {
    orderId: invoice.orderId,
    companyId: invoice.companyId,
    marketplaceOrderId: row.marketplace_order_id,
    marketplace: row.marketplace,
    packId: row.pack_id,
    status: row.status ?? invoice.status,
    statusFocus: row.status_focus,
    environment: (row.emissao_ambiente as "homologacao" | "producao") ?? invoice.environment,
    focusNfeId: row.focus_nfe_id,
    nfeKey: row.nfe_key,
    nfeNumber: row.nfe_number,
    serie: row.serie,
    authorizedAt: row.authorized_at,
    xmlBase64: row.xml_base64,
    pdfBase64: row.pdf_base64,
    errorDetails: row.error_details,
  };
}

/** Adapter that persists NFe invoices to the `notas_fiscais` table. */
export class SupabaseNfeAdapter implements INfePort {
  constructor(private readonly supabase: SupabaseClient) {}

  async findInvoiceByOrder(params: {
    readonly companyId: string;
    readonly orderId: string;
    readonly environment: "homologacao" | "producao";
  }): Promise<InvoiceRecord | null> {
    const { data, error } = await (this.supabase as any)
      .from("notas_fiscais")
      .select("*")
      .eq("company_id", params.companyId)
      .eq("order_id", params.orderId)
      .eq("emissao_ambiente", params.environment)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`SupabaseNfeAdapter.findInvoiceByOrder failed: ${error.message}`);
    if (!data) return null;
    const row = data as NotasFiscaisRow;
    return mapRow(row, {
      orderId: params.orderId,
      companyId: params.companyId,
      marketplaceOrderId: null,
      marketplace: null,
      packId: null,
      status: row.status ?? "",
      statusFocus: row.status_focus,
      environment: params.environment,
      focusNfeId: row.focus_nfe_id,
      nfeKey: row.nfe_key,
      nfeNumber: row.nfe_number,
      serie: row.serie,
      authorizedAt: row.authorized_at,
      xmlBase64: row.xml_base64,
      pdfBase64: row.pdf_base64,
      errorDetails: row.error_details,
    });
  }

  async upsertInvoice(invoice: InvoiceRecord): Promise<void> {
    const payload = {
      order_id: invoice.orderId,
      company_id: invoice.companyId,
      marketplace_order_id: invoice.marketplaceOrderId,
      marketplace: invoice.marketplace,
      pack_id: invoice.packId,
      status: invoice.status,
      status_focus: invoice.statusFocus,
      emissao_ambiente: invoice.environment,
      focus_nfe_id: invoice.focusNfeId,
      nfe_key: invoice.nfeKey,
      nfe_number: invoice.nfeNumber,
      serie: invoice.serie,
      authorized_at: invoice.authorizedAt,
      xml_base64: invoice.xmlBase64,
      pdf_base64: invoice.pdfBase64,
      error_details: invoice.errorDetails,
    };

    const { data: existing, error: findErr } = await (this.supabase as any)
      .from("notas_fiscais")
      .select("id")
      .eq("company_id", invoice.companyId)
      .eq("order_id", invoice.orderId)
      .eq("emissao_ambiente", invoice.environment)
      .limit(1)
      .maybeSingle();

    if (findErr) throw new Error(`SupabaseNfeAdapter.upsertInvoice find failed: ${findErr.message}`);

    if (existing?.id) {
      const { error: updErr } = await (this.supabase as any)
        .from("notas_fiscais")
        .update(payload)
        .eq("id", existing.id);
      if (updErr) throw new Error(`SupabaseNfeAdapter.upsertInvoice update failed: ${updErr.message}`);
    } else {
      const { error: insErr } = await (this.supabase as any)
        .from("notas_fiscais")
        .insert(payload);
      if (insErr) throw new Error(`SupabaseNfeAdapter.upsertInvoice insert failed: ${insErr.message}`);
    }
  }
}
