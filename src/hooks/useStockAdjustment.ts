import { useState } from "react";
import {
  applyStockAdjustment,
  StockTransferUnavailableError,
  StockWriteError,
} from "@/services/inventory/stock-writes.service";

type StockLocation = {
  storage_id: string;
  storage_name: string;
  current: number;
  reserved: number;
  available: number;
};

type EstoqueProduct = {
  id: string;
  stock_by_location?: StockLocation[];
};

type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

export function useStockAdjustment(
  product: EstoqueProduct | null,
  organizationId: string | undefined,
  toast: ToastFn,
  onSuccess?: () => void
) {
  const [adjustmentQuantity, setAdjustmentQuantity] = useState(0);
  const [operationType, setOperationType] = useState<"entrada" | "saida">("entrada");
  const [selectedStorageId, setSelectedStorageId] = useState<string | undefined>();
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [loading, setLoading] = useState(false);

  const stockByStorageId = new Map(
    (product?.stock_by_location || []).map((loc) => [String(loc.storage_id), loc])
  );

  const getStorageAvailable = (storageId?: string) =>
    Number(stockByStorageId.get(String(storageId || ""))?.available || 0);
  const getStorageCurrent = (storageId?: string) =>
    Number(stockByStorageId.get(String(storageId || ""))?.current || 0);

  const previewStorageId =
    selectedStorageId || product?.stock_by_location?.[0]?.storage_id || undefined;
  const selectedCurrent = getStorageCurrent(previewStorageId);
  const selectedAvailable = getStorageAvailable(previewStorageId);
  const rawPreviewStock =
    adjustmentQuantity > 0
      ? selectedCurrent +
        (operationType === "entrada" ? adjustmentQuantity : -adjustmentQuantity)
      : selectedCurrent;
  const isPreviewNegative = operationType === "saida" && rawPreviewStock < 0;
  const previewStock = Math.max(rawPreviewStock, 0);

  const isAdjustmentInvalid =
    adjustmentQuantity <= 0 ||
    (operationType === "saida" &&
      (selectedAvailable <= 0 ||
        adjustmentQuantity > selectedAvailable ||
        rawPreviewStock < 0));

  const reset = (defaultStorageId?: string) => {
    setAdjustmentQuantity(0);
    setOperationType("entrada");
    setAdjustmentNote("");
    setSelectedStorageId(defaultStorageId);
  };

  const handleSaveAdjustment = async () => {
    if (!product || !organizationId) return;
    if (adjustmentQuantity === 0) {
      toast({ title: "Erro", description: "Insira uma quantidade válida.", variant: "destructive" });
      return;
    }

    const targetStorageId =
      selectedStorageId || product.stock_by_location?.[0]?.storage_id || null;
    if (!targetStorageId) {
      toast({ title: "Erro", description: "Nenhum armazém selecionado.", variant: "destructive" });
      return;
    }
    if (operationType === "saida") {
      const available = getStorageAvailable(targetStorageId);
      if (available <= 0) {
        toast({
          title: "Erro",
          description: "Não é possível realizar saída em armazém com estoque disponível zerado.",
          variant: "destructive",
        });
        return;
      }
      if (adjustmentQuantity > available) {
        toast({
          title: "Erro",
          description: `Quantidade maior que o disponível no armazém (${available}).`,
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      await applyStockAdjustment({
        organizationId,
        productId: product.id,
        targetStorageId,
        operationType,
        adjustmentQuantity,
        adjustmentNote,
      });
      toast({
        title: "Sucesso",
        description: `${operationType === "entrada" ? "Entrada" : "Saída"} de ${adjustmentQuantity} un. registrada.`,
      });
      onSuccess?.();
    } catch (err: unknown) {
      if (err instanceof StockTransferUnavailableError) {
        toast({ title: err.toastTitle, description: err.message, variant: "destructive" });
      } else if (err instanceof StockWriteError) {
        toast({ title: err.toastTitle, description: err.message, variant: "destructive" });
      } else if (err instanceof Error) {
        toast({ title: "Erro inesperado", description: err.message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    adjustmentQuantity,
    setAdjustmentQuantity,
    operationType,
    setOperationType,
    selectedStorageId,
    setSelectedStorageId,
    adjustmentNote,
    setAdjustmentNote,
    previewStock,
    isPreviewNegative,
    isAdjustmentInvalid,
    loading,
    getStorageAvailable,
    getStorageCurrent,
    handleSaveAdjustment,
    reset,
  };
}
