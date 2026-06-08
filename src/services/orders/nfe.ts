import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { getAuthToken } from "./internal-helpers";

export async function syncNfeForOrder(
  organizationId: string,
  companyId: string,
  orderId: string,
  environment: string,
): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
  const { error } = await (supabase as any).functions.invoke("focus-nfe-sync", {
    body: { organizationId, companyId, orderIds: [orderId], environment },
    headers,
  } as any);
  if (error) throw error;
}

export async function submitXmlSend(
  organizationId: string,
  companyId: string,
  marketplaceOrderId: string,
): Promise<{ invoiceId: string; nfeKey: string; marketplace: string }> {
  const { data: inv, error: invErr } = await (supabase as any)
    .from("invoices")
    .select("id, nfe_key, marketplace, marketplace_order_id")
    .eq("company_id", companyId)
    .eq("marketplace_order_id", marketplaceOrderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (invErr || !inv) {
    throw new Error(invErr?.message || "Invoice não encontrada para este pedido.");
  }
  const marketplace = String((inv as any)?.marketplace || "");
  const queueMessage: Record<string, unknown> = {
    organizations_id: organizationId,
    company_id: companyId,
    invoice_id: String((inv as any)?.id || ""),
    nfe_key: String((inv as any)?.nfe_key || ""),
    marketplace,
  };
  const { error: sendErr } = await (supabase as any).rpc("q_submit_xml_send", {
    p_message: queueMessage,
  } as any);
  if (sendErr) throw sendErr;
  return {
    invoiceId: String(inv.id),
    nfeKey: String(inv.nfe_key || ""),
    marketplace,
  };
}

export async function emitNfeQueue(
  organizationId: string,
  companyId: string,
  orderIds: string[],
  environment: string,
  opts?: { forceNewNumber?: boolean; forceNewRef?: boolean },
): Promise<void> {
  const { error: sendErr } = await (supabase as any).rpc("rpc_queues_emit", {
    p_message: {
      organizations_id: organizationId,
      company_id: companyId,
      environment,
      orderIds,
      forceNewNumber: opts?.forceNewNumber ?? false,
      forceNewRef: opts?.forceNewRef ?? false,
    },
  } as any);
  if (sendErr) throw sendErr;
}
