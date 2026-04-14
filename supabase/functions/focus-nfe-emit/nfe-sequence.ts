/**
 * NFe number resolution via atomic RPC on the invoices table.
 * Falls back to MAX(nfe_number) when the RPC is unavailable.
 */
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";

export interface NfeSequenceResult {
  readonly invoiceId: string | null;
  readonly nfeNumber: number;
  readonly serie: string | null;
  readonly payload: Record<string, unknown>;
}

/** Reserves an NFe number atomically using fn_reservar_e_numerar_invoices. */
export async function resolveNfeNumber(
  admin: SupabaseClient,
  params: {
    organizationId: string;
    companyId: string;
    orderId: string;
    environment: "homologacao" | "producao";
    payload: Record<string, unknown>;
    marketplace: string | null;
    marketplaceOrderId: string | null;
    packId: string | null;
    totalValue: number;
    proximaNfe: number | null;
    serie: string | null;
  },
): Promise<NfeSequenceResult> {
  try {
    const { data, error } = await (admin as any).rpc("fn_reservar_e_numerar_invoices", {
      p_organization_id: params.organizationId,
      p_company_id: params.companyId,
      p_order_id: params.orderId,
      p_emission_environment: params.environment,
      p_payload: params.payload,
      p_marketplace: params.marketplace,
      p_marketplace_order_id: params.marketplaceOrderId,
      p_pack_id: params.packId,
      p_total_value: params.totalValue,
    });

    if (error) throw new Error(error.message);

    return {
      invoiceId: data?.invoice_id ?? null,
      nfeNumber: Number(data?.numero),
      serie: data?.serie ?? null,
      payload: data?.payload ?? params.payload,
    };
  } catch (rpcError) {
    console.error("[nfe-sequence] RPC failed, using fallback:", rpcError);
    return fallbackResolve(admin, params);
  }
}

async function fallbackResolve(
  admin: SupabaseClient,
  params: {
    companyId: string;
    environment: "homologacao" | "producao";
    payload: Record<string, unknown>;
    proximaNfe: number | null;
    serie: string | null;
  },
): Promise<NfeSequenceResult> {
  let maxNum = 0;
  const baseQuery = (admin as any)
    .from("invoices")
    .select("nfe_number")
    .eq("company_id", params.companyId)
    .eq("emission_environment", params.environment);

  if (params.serie) baseQuery.eq("serie", params.serie);

  const { data } = await baseQuery
    .order("nfe_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.nfe_number) maxNum = Number(data.nfe_number);

  const next = Math.max(maxNum, Number(params.proximaNfe || 0)) + 1;
  const updatedPayload = { ...params.payload, numero: next };
  if (params.serie) (updatedPayload as any).serie = params.serie;

  return {
    invoiceId: null,
    nfeNumber: next,
    serie: params.serie,
    payload: updatedPayload,
  };
}
