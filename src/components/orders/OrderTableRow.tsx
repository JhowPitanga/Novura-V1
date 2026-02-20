import { ChevronDown, FileBadge, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox as CustomCheckbox } from "@/components/ui/checkbox";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
  render: (pedido: any) => React.ReactNode;
}

interface OrderTableRowHandlers {
  handleCheckboxChange: (id: string, selected: string[], setter: (fn: any) => void) => void;
  handleVincularClick: (pedido: any) => void;
  handleOpenDetailsDrawer: (pedido: any) => void;
  handleReprintLabel: (pedido: any) => void;
  handleEmitirNfe: (pedidos: any[], opts?: any) => void;
  handleEnviarNfeForPedido: (pedido: any) => void;
  handleSyncNfeForPedido: (pedido: any) => void;
  handleArrangeShipmentForPedido: (pedido: any) => void;
  addProcessingId: (id: string) => void;
  norm: (s: string) => string;
}

interface SelectionState {
  selectedPedidos: string[];
  setSelectedPedidos: (fn: any) => void;
  selectedPedidosEmissao: string[];
  setSelectedPedidosEmissao: (fn: any) => void;
  selectedPedidosImpressao: string[];
  setSelectedPedidosImpressao: (fn: any) => void;
  selectedPedidosEnviado: string[];
  setSelectedPedidosEnviado: (fn: any) => void;
}

interface NfeState {
  nfBadgeFilter: string;
  processingIdsSet: Set<string>;
  nfeAuthorizedByPedidoId: Record<string, boolean>;
  nfeFocusStatusByPedidoId: Record<string, string>;
  xmlLoadingSet: Set<string>;
  arrangeLoadingSet: Set<string>;
}

interface OrderTableRowProps {
  pedido: any;
  activeStatus: string;
  columns: ColumnDef[];
  handlers: OrderTableRowHandlers;
  selection: SelectionState;
  nfeState: NfeState;
}

export function OrderTableRow({
  pedido,
  activeStatus,
  columns,
  handlers,
  selection,
  nfeState,
}: OrderTableRowProps) {
  const payLower = String(pedido?.payment_status || '').toLowerCase();
  const isApprovedRow = payLower === 'approved' || payLower === 'paid' || payLower === 'settled' || Boolean(pedido?.payment_date_approved);
  const isCancelledRow = payLower === 'cancelled';
  const isRefundedRow = payLower === 'refunded';
  const canVincular = activeStatus === 'a-vincular' ? true : (isApprovedRow && !isCancelledRow && !isRefundedRow);
  const vincularTooltip = activeStatus === 'a-vincular'
    ? 'Abrir vinculação'
    : (!isApprovedRow
      ? 'Pagamento ainda não aprovado'
      : (isCancelledRow
        ? 'Pagamento cancelado'
        : (isRefundedRow ? 'Pagamento reembolsado' : 'Abrir vinculação')));
  const hasMultipleItems = Array.isArray(pedido.itens) && pedido.itens.length >= 2;

  const isChecked =
    (activeStatus === "todos" && selection.selectedPedidos.includes(pedido.id)) ||
    (activeStatus === "emissao-nf" && selection.selectedPedidosEmissao.includes(pedido.id)) ||
    (activeStatus === "impressao" && selection.selectedPedidosImpressao.includes(pedido.id)) ||
    (activeStatus === "enviado" && selection.selectedPedidosEnviado.includes(pedido.id));

  const handleRowCheckbox = () => {
    if (activeStatus === "todos") handlers.handleCheckboxChange(pedido.id, selection.selectedPedidos, selection.setSelectedPedidos);
    if (activeStatus === "emissao-nf") handlers.handleCheckboxChange(pedido.id, selection.selectedPedidosEmissao, selection.setSelectedPedidosEmissao);
    if (activeStatus === "impressao") handlers.handleCheckboxChange(pedido.id, selection.selectedPedidosImpressao, selection.setSelectedPedidosImpressao);
    if (activeStatus === "enviado") handlers.handleCheckboxChange(pedido.id, selection.selectedPedidosEnviado, selection.setSelectedPedidosEnviado);
  };

  const hasLabel = Boolean(pedido?.label?.pdf_base64 || pedido?.label?.content_base64 || pedido?.label?.zpl2_base64);

  return (
    <tr className="group hover:bg-gray-50 transition-colors relative overflow-hidden">
      <td className="relative overflow-hidden w-[2%] px-2 py-3 whitespace-nowrap align-top">
        {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado") && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 flex items-center justify-center">
              <CustomCheckbox
                className="outline-none focus:outline-none"
                checked={isChecked}
                disabled={nfeState.nfBadgeFilter === 'processando' && nfeState.processingIdsSet.has(pedido.id)}
                onChange={handleRowCheckbox}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {hasMultipleItems && (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="relative inline-flex items-center justify-center mt-1 cursor-pointer hover:scale-105 transition-transform">
                      <span className="absolute inline-flex h-3 w-3 rounded-full bg-purple-600 opacity-75 animate-ping"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-600 ring-2 ring-transparent hover:ring-purple-500"></span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-purple-600 text-white border border-purple-600 max-w-[260px] whitespace-normal leading-snug text-center">
                    <span>Atenção na embalagem, esse pedido contém múltiplos produtos</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </td>
      {columns.filter(col => col.enabled).map(col => (
        <td
          key={col.id}
          className={`relative py-3 whitespace-nowrap text-sm text-gray-500 min-w-0 ${col.id === 'produto' ? 'text-left w-[26%] pr-0' : ''} ${col.id === 'itens' ? 'w-[4%] text-center pl-0 pr-0' : ''} ${col.id === 'cliente' ? 'w-[14%] text-center pr-0' : ''} ${col.id === 'valor' ? 'w-[10%] text-left' : ''} ${col.id === 'tipoEnvio' ? 'w-[10%] text-center' : ''} ${col.id === 'marketplace' ? 'w-[8%] text-left' : ''} ${col.id === 'status' ? 'w-[10%] text-center' : ''} ${col.id === 'margem' ? 'w-[8%] text-center' : ''} ${pedido.quantidadeTotal >= 2 ? 'align-middle' : ''}`}
        >
          <div className="relative z-[1]">
            {col.render(pedido)}
          </div>
        </td>
      ))}
      <td className="relative overflow-hidden py-3 w-[8%] whitespace-nowrap text-center text-sm font-medium align-middle">
        {activeStatus === "a-vincular" ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="link"
                  className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline"
                  disabled={!canVincular}
                  onClick={(e) => { e.stopPropagation(); if (canVincular) handlers.handleVincularClick(pedido); }}
                >
                  Vincular
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>{vincularTooltip}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : activeStatus === "aguardando-coleta" ? (
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="relative">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="link"
                      className={`h-8 w-8 p-0 ${hasLabel ? 'text-purple-600' : 'text-gray-500'}`}
                      onClick={(e) => { e.stopPropagation(); handlers.handleReprintLabel(pedido); }}
                      aria-label="Imprimir"
                    >
                      <FileBadge className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <span>Reimprimir</span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {pedido.impressoEtiqueta && (
                <CheckCircle2 className="absolute -top-1 -right-1 h-3 w-3 text-green-600 pointer-events-none" />
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="link" className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); }} data-details-trigger>
                  Mais
                  <ChevronDown className="h-2 w-4 ml-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlers.handleOpenDetailsDrawer(pedido); }}>
                  Mostrar detalhes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : activeStatus === "impressao" ? (
          <div className="flex flex-col items-center justify-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="link"
                    className="h-8 w-8 p-0"
                    onClick={(e) => { e.stopPropagation(); handlers.handleReprintLabel(pedido); }}
                    disabled={!hasLabel}
                    aria-label="Reimprimir etiqueta"
                  >
                    <FileBadge className={`h-4 w-4 ${hasLabel ? 'text-purple-600' : 'text-gray-500'}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>Reimprimir</span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="link" className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); }} data-details-trigger>
                  Mais
                  <ChevronDown className="h-2 w-4 ml-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlers.handleOpenDetailsDrawer(pedido); }}>
                  Mostrar detalhes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          (handlers.norm(pedido.status_interno) === 'processando nf' || nfeState.processingIdsSet.has(pedido.id))
            ? (
              <div className="flex items-center justify-center">
                <Badge className="bg-white text-purple-700 border border-purple-300 h-7 px-2 inline-flex items-center gap-2 rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  Processando NF-e
                </Badge>
              </div>
            )
            : (
              <div className={`${activeStatus === "emissao-nf" && (nfeState.nfBadgeFilter === "emitir" || nfeState.nfBadgeFilter === "subir_xml") ? "flex flex-col items-center justify-center gap-1" : "flex items-center justify-center gap-2"}`}>
                {activeStatus === "emissao-nf" && nfeState.nfBadgeFilter === "emitir" && !nfeState.nfeAuthorizedByPedidoId[String(pedido.id)] && (
                  <Button
                    variant="link"
                    className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlers.addProcessingId(String(pedido.id));
                      handlers.handleEmitirNfe([pedido]);
                    }}
                  >
                    Emitir
                  </Button>
                )}
                {activeStatus === "emissao-nf" && nfeState.nfBadgeFilter === "subir_xml" && (
                  nfeState.xmlLoadingSet.has(String(pedido.id)) ? (
                    <span className="inline-flex items-center h-8">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                    </span>
                  ) : (
                    <Button
                      variant="link"
                      className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline"
                      onClick={(e) => { e.stopPropagation(); handlers.handleEnviarNfeForPedido(pedido); }}
                    >
                      Subir xml
                    </Button>
                  )
                )}
                {activeStatus === "emissao-nf" && nfeState.nfBadgeFilter === "subir_xml" && String(pedido.marketplace || '').toLowerCase().includes('shopee') && (
                  nfeState.arrangeLoadingSet.has(String(pedido.id)) ? (
                    <span className="inline-flex items-center h-8">
                      <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                    </span>
                  ) : (
                    <Button
                      variant="link"
                      className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline"
                      onClick={(e) => { e.stopPropagation(); handlers.handleArrangeShipmentForPedido(pedido); }}
                    >
                      Organizar Envio
                    </Button>
                  )
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="link" className="h-8 px-0 text-purple-600 hover:text-purple-700 no-underline" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); }} data-details-trigger>
                      Mais
                      <ChevronDown className="h-2 w-4 ml-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlers.handleOpenDetailsDrawer(pedido); }}>
                      Mostrar detalhes
                    </DropdownMenuItem>

                    {activeStatus === "emissao-nf" && nfeState.nfBadgeFilter !== "subir_xml" && nfeState.nfBadgeFilter !== "emitir" && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlers.handleSyncNfeForPedido(pedido); }}>
                        Sincronizar NF-e
                      </DropdownMenuItem>
                    )}
                    {activeStatus === "emissao-nf" && nfeState.nfBadgeFilter === "falha" && (
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handlers.addProcessingId(String(pedido.id));
                        handlers.handleEmitirNfe([pedido]);
                      }}>
                        Reemitir
                      </DropdownMenuItem>
                    )}
                    {activeStatus === "emissao-nf" && ["cancelado", "cancelada", "rejeitado", "rejeitada"].includes(String(nfeState.nfeFocusStatusByPedidoId[String(pedido.id)] || "").toLowerCase()) && (
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        handlers.addProcessingId(String(pedido.id));
                        handlers.handleEmitirNfe([pedido], { forceNewNumber: true, forceNewRef: true });
                      }}>
                        Gerar Nova NF-e
                      </DropdownMenuItem>
                    )}
                    {activeStatus === "emissao-nf" && nfeState.nfeAuthorizedByPedidoId[String(pedido.id)] && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlers.handleEnviarNfeForPedido(pedido); }}>
                        Subir xml
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
        )}
      </td>
    </tr>
  );
}
