/**
 * Derives status counts, status blocks, and delayed-order predicates from
 * a base-filtered order list and list-readiness flag.
 * Extracted from useOrdersPageController (lines 322-359).
 */
import { useCallback, useMemo } from "react";
import { matchStatus } from "@/hooks/useOrderFiltering";
import { isPedidoAtrasado, buildStatusCounts } from "@/utils/orderStatusUtils";
import type { Order } from "@/types/orders";

interface UseOrdersDerivedParams {
  baseFiltered: Order[];
  listReady: boolean;
}

interface UseOrdersDerivedResult {
  statusCounts: Record<string, number>;
  statusBlocks: Array<{ id: string; title: string; count: number; description: string }>;
  isPedidoAtrasado: (p: any) => boolean;
  hasDelayedByBlock: (blockId: string) => boolean;
}

export function useOrdersDerived({
  baseFiltered,
  listReady,
}: UseOrdersDerivedParams): UseOrdersDerivedResult {
  const statusCounts = useMemo<Record<string, number>>(
    () => buildStatusCounts(baseFiltered),
    [baseFiltered],
  );

  const isPedidoAtrasadoCb = useCallback((p: any) => isPedidoAtrasado(p), []);

  const allowedTooltipBlocks = useMemo(
    () => new Set(['a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta']),
    [],
  );

  const hasDelayedByBlock = useCallback(
    (blockId: string) => {
      if (!allowedTooltipBlocks.has(blockId)) return false;
      return listReady
        ? baseFiltered.some(p => matchStatus(p, blockId) && isPedidoAtrasado(p))
        : false;
    },
    [allowedTooltipBlocks, listReady, baseFiltered],
  );

  const statusBlocks = useMemo(
    () => [
      { id: 'todos', title: 'Todos os Pedidos', count: listReady ? statusCounts['todos'] : 0, description: 'Sincronizados com marketplaces' },
      { id: 'a-vincular', title: 'A Vincular', count: listReady ? statusCounts['a-vincular'] : 0, description: 'Pedidos sem vínculo de SKU' },
      { id: 'emissao-nf', title: 'Emissão de NFe', count: listReady ? statusCounts['emissao-nf'] : 0, description: 'Aguardando emissão' },
      { id: 'impressao', title: 'Impressão', count: listReady ? statusCounts['impressao'] : 0, description: 'NF e etiqueta' },
      { id: 'aguardando-coleta', title: 'Coleta', count: listReady ? statusCounts['aguardando-coleta'] : 0, description: 'Prontos para envio' },
      { id: 'enviado', title: 'Enviado', count: listReady ? statusCounts['enviado'] : 0, description: 'Pedidos em trânsito' },
      { id: 'cancelado', title: 'Cancelados', count: listReady ? statusCounts['cancelado'] : 0, description: 'Pedidos cancelados/devolvidos' },
    ],
    [listReady, statusCounts],
  );

  return { statusCounts, statusBlocks, isPedidoAtrasado: isPedidoAtrasadoCb, hasDelayedByBlock };
}
