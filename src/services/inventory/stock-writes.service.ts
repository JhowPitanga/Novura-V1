// §1 SIZE EXCEPTION (ENGINEERING_STANDARDS.md): ~320 LOC — preserves legacy-safe
// ensureStockRow duplicate-key retry, transfer rollback, and string-match error guards verbatim.
import { supabase } from "@/integrations/supabase/client";
import {
  buildAdjustSourceRef,
  buildTransferSourceRef,
} from "@/services/inventory/source-ref";

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

/** Legacy-safe insert-then-retry when duplicate key (InventoryManagementDrawer lines 205-248). */
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
      const msg = String(ins.error.message || "");
      if (msg.includes("duplicate key")) {
        const retry = await supabase
          .from("products_stock")
          .select("id, current, reserved")
          .eq("product_id", productId)
          .eq("storage_id", storageId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (retry.error || !retry.data?.id) {
          throw new StockWriteError(retry.error?.message || msg);
        }
        stockRow = retry.data;
      } else {
        throw new StockWriteError(msg);
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

export async function applyStockTransfer(params: ApplyStockTransferParams): Promise<void> {
  const actorName = await resolveCurrentUserName(params.organizationId);

  const { data: prod } = await supabase
    .from("products")
    .select("company_id")
    .eq("id", params.productId)
    .limit(1)
    .maybeSingle();

  const noteLabel = params.transferNote?.trim() || "";

  const { data: originRow, error: originErr } = await supabase
    .from("products_stock")
    .select("id, current, reserved")
    .eq("product_id", params.productId)
    .eq("storage_id", params.transferFromId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (originErr || !originRow?.id) {
    throw new StockWriteError("Origem não encontrada para o produto.");
  }

  const originAvailable = Number(originRow.current || 0) - Number(originRow.reserved || 0);
  if (originAvailable < params.adjustmentQuantity) {
    throw new StockWriteError(
      `Estoque insuficiente na origem (${originAvailable}).`
    );
  }

  const { data: destinationRow, error: destSelErr } = await supabase
    .from("products_stock")
    .select("id, current")
    .eq("product_id", params.productId)
    .eq("storage_id", params.transferToId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (destSelErr) {
    throw new StockWriteError(destSelErr.message);
  }

  let destinationId = destinationRow?.id as string | undefined;
  let destinationCurrent = Number(destinationRow?.current || 0);
  if (!destinationId) {
    const insRes = await supabase
      .from("products_stock")
      .insert({
        product_id: params.productId,
        storage_id: params.transferToId,
        company_id: prod?.company_id || null,
        current: 0,
        reserved: 0,
        in_transit: 0,
      })
      .select("id, current")
      .limit(1)
      .single();

    if (insRes.error) {
      const msg = String(insRes.error.message || "");
      if (msg.includes("products_stock_product_id_key")) {
        throw new StockTransferUnavailableError(
          "Seu banco atual ainda não suporta estoque por múltiplos armazéns para o mesmo produto. Aplique a migration de estoque multi-armazém."
        );
      }
      throw new StockWriteError(msg);
    }
    destinationId = insRes.data?.id;
    destinationCurrent = Number(insRes.data?.current || 0);
  }

  const originUpd = await supabase
    .from("products_stock")
    .update({
      current: Number(originRow.current || 0) - Math.abs(params.adjustmentQuantity),
      updated_at: new Date().toISOString(),
    })
    .eq("id", originRow.id);

  if (originUpd.error) {
    throw new StockWriteError(originUpd.error.message);
  }

  const destUpd = await supabase
    .from("products_stock")
    .update({
      current: destinationCurrent + Math.abs(params.adjustmentQuantity),
      updated_at: new Date().toISOString(),
    })
    .eq("id", destinationId!);

  if (destUpd.error) {
    await supabase
      .from("products_stock")
      .update({
        current: Number(originRow.current || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", originRow.id);
    throw new StockWriteError(destUpd.error.message);
  }

  await supabase.from("inventory_transactions").insert([
    {
      organizations_id: params.organizationId,
      company_id: prod?.company_id || null,
      product_id: params.productId,
      storage_id: params.transferFromId,
      movement_type: "TRANSFERENCIA",
      quantity_change: -Math.abs(params.adjustmentQuantity),
      source_ref: buildTransferSourceRef(actorName, noteLabel, "OUT"),
    },
    {
      organizations_id: params.organizationId,
      company_id: prod?.company_id || null,
      product_id: params.productId,
      storage_id: params.transferToId,
      movement_type: "TRANSFERENCIA",
      quantity_change: Math.abs(params.adjustmentQuantity),
      source_ref: buildTransferSourceRef(actorName, noteLabel, "IN"),
    },
  ]);
}
