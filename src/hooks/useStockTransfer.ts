import { useState } from "react";
import {
  applyStockTransfer,
  StockTransferUnavailableError,
  StockWriteError,
} from "@/services/inventory/stock-writes.service";

type StockLocation = {
  storage_id: string;
  available: number;
};

type EstoqueProduct = {
  id: string;
  estoque?: number;
  stock_by_location?: StockLocation[];
};

type ToastFn = (opts: {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}) => void;

export function useStockTransfer(
  product: EstoqueProduct | null,
  organizationId: string | undefined,
  adjustmentQuantity: number,
  toast: ToastFn,
  onSuccess?: () => void
) {
  const [transferFromId, setTransferFromId] = useState<string | undefined>();
  const [transferToId, setTransferToId] = useState<string | undefined>();
  const [transferNote, setTransferNote] = useState("");
  const [loading, setLoading] = useState(false);

  const stockByStorageId = new Map(
    (product?.stock_by_location || []).map((loc) => [String(loc.storage_id), loc])
  );
  const getStorageAvailable = (storageId?: string) =>
    Number(stockByStorageId.get(String(storageId || ""))?.available || 0);

  const transferAvailable = getStorageAvailable(transferFromId);
  const isTransferInvalid =
    !transferFromId ||
    !transferToId ||
    transferFromId === transferToId ||
    adjustmentQuantity <= 0 ||
    transferAvailable <= 0 ||
    adjustmentQuantity > transferAvailable;

  const reset = (defaultFromId?: string) => {
    setTransferFromId(defaultFromId);
    setTransferToId(undefined);
    setTransferNote("");
  };

  const handleSaveTransfer = async () => {
    if (!product || !organizationId) return;
    if (!transferFromId || !transferToId) {
      toast({ title: "Erro", description: "Selecione origem e destino.", variant: "destructive" });
      return;
    }
    if (transferFromId === transferToId) {
      toast({ title: "Erro", description: "Origem e destino não podem ser iguais.", variant: "destructive" });
      return;
    }
    if (adjustmentQuantity <= 0) {
      toast({ title: "Erro", description: "Insira uma quantidade válida.", variant: "destructive" });
      return;
    }
    if (Number(product.estoque || 0) <= 0) {
      toast({
        title: "Erro",
        description: "Não é possível transferir produto com estoque total zerado.",
        variant: "destructive",
      });
      return;
    }
    const availableFrom = getStorageAvailable(transferFromId);
    if (availableFrom <= 0) {
      toast({
        title: "Erro",
        description: "Armazém de origem com estoque disponível zerado.",
        variant: "destructive",
      });
      return;
    }
    if (adjustmentQuantity > availableFrom) {
      toast({
        title: "Erro",
        description: `Quantidade maior que o disponível na origem (${availableFrom}).`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      await applyStockTransfer({
        organizationId,
        productId: product.id,
        transferFromId,
        transferToId,
        adjustmentQuantity,
        transferNote,
      });
      toast({
        title: "Transferência realizada",
        description: `${adjustmentQuantity} un. transferidas com sucesso.`,
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
    transferFromId,
    setTransferFromId,
    transferToId,
    setTransferToId,
    transferNote,
    setTransferNote,
    transferAvailable,
    isTransferInvalid,
    loading,
    handleSaveTransfer,
    reset,
  };
}
