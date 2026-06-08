import { supabase } from "@/integrations/supabase/client";
import { buildAdjustSourceRef } from "@/services/inventory/source-ref";

type StockRow = { id: string; current: number; reserved?: number };

export class StockWriteError extends Error {
  constructor(
    message: string,
    public readonly toastTitle = "Erro"
  ) {
    super(message);
    this.name = "StockWriteError";
  }
}

export class StockTransferUnavailableError extends StockWriteError {
  constructor(message: string) {
    super(message, "Transferência indisponível");
  }
}

export async function resolveCurrentUserName(organizationId: string): Promise<string> {
  const { data: authRes } = await supabase.auth.getUser();
  const userId = authRes?.user?.id || null;
  if (!userId || !organizationId) return authRes?.user?.email || "Usuario";

  const { data: usr } = await supabase
    .from("users")
    .select("name, organization_id")
    .eq("id", userId)
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();

  return usr?.name || authRes?.user?.email || "Usuario";
}

/** Insert-then-retry on duplicate key (Postgres error code 23505) for first-time stock rows. */
export async function ensureStockRow(
  productId: string,
  storageId: string,
  companyId: string | null,
  operationType: "entrada" | "saida"
): Promise<StockRow> {
  const { data: stockRowRaw, error: stockErr } = await supabase
    .from("products_stock")
    .select("id, current, reserved")
    .eq("product_id", productId)
    .eq("storage_id", storageId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (stockErr) {
    throw new StockWriteError(stockErr.message || "Falha ao consultar estoque.");
  }

  let stockRow = stockRowRaw;
  if (!stockRow?.id) {
    if (operationType !== "entrada") {
      throw new StockWriteError("Registro de estoque não encontrado para este armazém.");
    }

    const ins = await supabase
      .from("products_stock")
      .insert({
        product_id: productId,
        storage_id: storageId,
        company_id: companyId,
        current: 0,
        reserved: 0,
        in_transit: 0,
      })
      .select("id, current")
      .limit(1)
      .maybeSingle();

    if (ins.error) {
      // Use Postgres error code instead of message string to detect duplicate key
      if ((ins.error as any).code === "23505") {
        const retry = await supabase
          .from("products_stock")
          .select("id, current, reserved")
          .eq("product_id", productId)
          .eq("storage_id", storageId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (retry.error || !retry.data?.id) {
          throw new StockWriteError(retry.error?.message || ins.error.message);
        }
        stockRow = retry.data;
      } else {
        throw new StockWriteError(ins.error.message);
      }
    } else {
      stockRow = ins.data;
    }
  }

  return stockRow as StockRow;
}

export interface ApplyStockAdjustmentParams {
  organizationId: string;
  productId: string;
  targetStorageId: string;
  operationType: "entrada" | "saida";
  adjustmentQuantity: number;
  adjustmentNote: string;
}

export async function applyStockAdjustment(params: ApplyStockAdjustmentParams): Promise<void> {
  const quantity =
    params.operationType === "saida"
      ? -Math.abs(params.adjustmentQuantity)
      : Math.abs(params.adjustmentQuantity);

  const { data: prod } = await supabase
    .from("products")
    .select("company_id")
    .eq("id", params.productId)
    .limit(1)
    .maybeSingle();

  const stockRow = await ensureStockRow(
    params.productId,
    params.targetStorageId,
    prod?.company_id || null,
    params.operationType
  );

  const currentDb = Number(stockRow.current || 0);
  const reservedDb = Number(stockRow.reserved || 0);
  const availableDb = Math.max(currentDb - reservedDb, 0);
  if (params.operationType === "saida") {
    if (availableDb <= 0) {
      throw new StockWriteError(
        "Não é possível realizar saída em armazém com estoque disponível zerado."
      );
    }
    if (params.adjustmentQuantity > availableDb) {
      throw new StockWriteError(
        `Quantidade maior que o disponível no armazém (${availableDb}).`
      );
    }
  }

  const nextCurrent = currentDb + quantity;
  if (nextCurrent < 0) {
    throw new StockWriteError("Ajuste inválido: estoque não pode ficar negativo.");
  }

  const { error: updateErr } = await supabase
    .from("products_stock")
    .update({
      current: nextCurrent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockRow.id);

  if (updateErr) {
    throw new StockWriteError(updateErr.message);
  }

  const { data: authData } = await supabase.auth.getUser();
  const actorId = authData?.user?.id || null;
  const displayName = await resolveCurrentUserName(params.organizationId);
  const moveType = params.operationType === "entrada" ? "ENTRADA" : "SAIDA";
  const noteLabel = params.adjustmentNote.trim();

  const txPayload = {
    organizations_id: params.organizationId,
    company_id: prod?.company_id || null,
    product_id: params.productId,
    storage_id: params.targetStorageId,
    movement_type: moveType,
    quantity_change: quantity,
    // Structured fields (preferred for new rows)
    created_by_user_id: actorId,
    description: noteLabel || null,
    entity_type: "manual",
    reason_code: params.operationType === "entrada" ? "manual_adjustment" : "manual_adjustment",
    // Legacy source_ref kept for backward-compat with older rows
    source_ref: buildAdjustSourceRef(displayName, noteLabel, moveType),
  };

  await supabase.from("inventory_transactions").insert(txPayload);
}

export interface ApplyStockTransferParams {
  organizationId: string;
  productId: string;
  transferFromId: string;
  transferToId: string;
  adjustmentQuantity: number;
  transferNote: string;
}

/** RPC error codes returned by transfer_stock_between_warehouses */
const TRANSFER_ERROR_MESSAGES: Record<string, string> = {
  SAME_STORAGE: "Origem e destino não podem ser iguais.",
  INVALID_QUANTITY: "Quantidade inválida para transferência.",
  ORIGIN_NOT_FOUND: "Armazém de origem não encontrado.",
  ORIGIN_NOT_PHYSICAL: "O armazém de origem deve ser um depósito físico editável.",
  DESTINATION_NOT_FOUND: "Armazém de destino não encontrado.",
  DESTINATION_NOT_PHYSICAL: "O armazém de destino deve ser um depósito físico editável.",
  PRODUCT_NOT_IN_ORIGIN: "Produto não encontrado no armazém de origem.",
};

/**
 * Transfers stock between warehouses using the atomic Postgres RPC.
 * All mutations (debit, credit, audit rows) happen inside a single PL/pgSQL
 * transaction — there is no partial-update / "saldo fantasma" risk.
 */
export async function applyStockTransfer(params: ApplyStockTransferParams): Promise<void> {
  const noteLabel = params.transferNote?.trim() || null;

  const { data: result, error: rpcErr } = await supabase.rpc(
    "transfer_stock_between_warehouses",
    {
      p_product_id: params.productId,
      p_from_storage_id: params.transferFromId,
      p_to_storage_id: params.transferToId,
      p_quantity: params.adjustmentQuantity,
      p_org_id: params.organizationId,
      p_note: noteLabel,
    }
  );

  if (rpcErr) {
    throw new StockWriteError(rpcErr.message || "Falha ao executar transferência.");
  }

  const res = result as { ok: boolean; error?: string; available?: number };

  if (!res?.ok) {
    const code = res?.error || "UNKNOWN";

    if (code === "INSUFFICIENT_STOCK") {
      throw new StockWriteError(
        `Estoque insuficiente na origem (disponível: ${res.available ?? 0}).`
      );
    }

    const msg = TRANSFER_ERROR_MESSAGES[code] || `Transferência falhou: ${code}`;
    throw new StockWriteError(msg);
  }
}
