/**
 * Label printing, picking-list printing, and CSV export actions.
 * One responsibility: all print/export operations for orders.
 * Extracted from useOrdersActions (Commit B2).
 */
import { useCallback } from "react";
import { markOrdersPrinted } from "@/services/orders.service";
import { generateFunctionalPickingListPDF } from "@/utils/pdfGenerators";
import { exportOrdersCsv } from "@/utils/orderCsvUtils";
import { toast } from "@/components/ui/use-toast";
import type { Order } from "@/types/orders";

interface UsePrintActionsParams {
  organizationId: string | null | undefined;
  pedidos: Order[];
  setPedidos: React.Dispatch<React.SetStateAction<Order[]>>;
  filteredOrders: Order[];
  printSettings: any;
  selectedPedidosImpressao: string[];
  onSetSelectedPedidosImpressao: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidosEmissao: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidos: React.Dispatch<React.SetStateAction<string[]>>;
  onSetSelectedPedidosEnviado: React.Dispatch<React.SetStateAction<string[]>>;
}

export function usePrintActions({
  organizationId,
  pedidos,
  setPedidos,
  filteredOrders,
  printSettings,
  selectedPedidosImpressao,
  onSetSelectedPedidosImpressao,
  onSetSelectedPedidosEmissao,
  onSetSelectedPedidos,
  onSetSelectedPedidosEnviado,
}: UsePrintActionsParams) {
  const handleExportCSV = useCallback(() => {
    exportOrdersCsv(filteredOrders);
  }, [filteredOrders]);

  const handlePrintLabels = useCallback(async () => {
    try {
      const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
      if (pedidosToPrint.length === 0) return;
      const pdfs = pedidosToPrint
        .map(p => (p?.label as { pdf_base64?: string } | null)?.pdf_base64)
        .filter(Boolean) as string[];
      if (pdfs.length === 0) return;
      for (const base64 of pdfs) {
        const binStr = atob(base64);
        const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        window.open(URL.createObjectURL(blob), '_blank');
      }
      try {
        const ids = pedidosToPrint.map((p: any) => p.id);
        if (organizationId) await markOrdersPrinted(ids, organizationId);
      } catch { }
      onSetSelectedPedidosImpressao(() => []);
      onSetSelectedPedidosEmissao(() => []);
      onSetSelectedPedidos(() => []);
      onSetSelectedPedidosEnviado(() => []);
    } catch (err) {
      console.error('Erro ao imprimir etiquetas ML:', err);
    }
  }, [
    pedidos, selectedPedidosImpressao, organizationId,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
  ]);

  const handleReprintLabel = useCallback(async (pedido: any) => {
    try {
      if (!pedido) return;
      const cachedPdf: string | null = pedido?.label?.pdf_base64 || null;
      const cachedContent: string | null = pedido?.label?.content_base64 || null;
      const contentType: string | null = pedido?.label?.content_type || null;
      if (cachedPdf) {
        const binStr = atob(String(cachedPdf));
        const bytes = new Uint8Array([...binStr].map(c => c.charCodeAt(0)));
        window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
      } else if (cachedContent) {
        const binStr = atob(String(cachedContent));
        const bytes = new Uint8Array([...binStr].map(c => c.charCodeAt(0)));
        window.open(URL.createObjectURL(new Blob([bytes], { type: contentType || 'application/pdf' })), '_blank');
      } else {
        toast({ title: "Etiqueta não encontrada", description: "Nenhuma etiqueta salva foi localizada para este pedido.", variant: "destructive" });
        return;
      }
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
      try {
        if (organizationId) await markOrdersPrinted([pedido.id], organizationId);
      } catch { }
    } catch (err) {
      console.error('Erro ao reimprimir etiqueta ML:', err);
    }
  }, [organizationId, setPedidos]);

  const handlePrintPickingList = useCallback(() => {
    const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
    const pdfUrl = generateFunctionalPickingListPDF(pedidosToPrint, printSettings);
    window.open(pdfUrl, '_blank');
    onSetSelectedPedidosImpressao(() => []);
    onSetSelectedPedidosEmissao(() => []);
    onSetSelectedPedidos(() => []);
    onSetSelectedPedidosEnviado(() => []);
  }, [
    pedidos, selectedPedidosImpressao, printSettings,
    onSetSelectedPedidosImpressao, onSetSelectedPedidosEmissao,
    onSetSelectedPedidos, onSetSelectedPedidosEnviado,
  ]);

  return { handleExportCSV, handlePrintLabels, handleReprintLabel, handlePrintPickingList };
}
