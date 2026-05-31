import { memo, type ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  FileBadge,
  FilePlus,
  FileText,
  Link2,
  Loader2,
  MoreHorizontal,
  Package,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
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
import { normStatus } from "@/hooks/useOrderFiltering";

const ACTION_BTN_CLASS = "h-10 w-10 shrink-0 rounded-lg p-0 [&_svg]:size-5";
const ACTION_ICON_CLASS = "h-5 w-5";

const iconActionClass =
  `${ACTION_BTN_CLASS} text-purple-600 hover:bg-purple-50 hover:text-purple-700`;
const iconActionMutedClass =
  `${ACTION_BTN_CLASS} text-gray-400 hover:bg-gray-50 hover:text-gray-600`;
const menuTriggerClass =
  `${ACTION_BTN_CLASS} text-gray-500 hover:bg-gray-50 hover:text-purple-600`;

function OrderRowIconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  loading,
  muted,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  muted?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={muted ? iconActionMutedClass : iconActionClass}
          disabled={disabled || loading}
          onClick={onClick}
          aria-label={label}
        >
          {loading ? (
            <Loader2 className={`${ACTION_ICON_CLASS} animate-spin`} />
          ) : (
            <Icon className={ACTION_ICON_CLASS} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}

function OrderRowMoreMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={menuTriggerClass}
          onClick={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLButtonElement).blur();
          }}
          data-details-trigger
          aria-label="Mais ações"
        >
          <MoreHorizontal className={ACTION_ICON_CLASS} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ColumnDef {
  id: string;
  name: string;
  enabled: boolean;
  render: (pedido: any) => React.ReactNode;
}

// Flat primitive props — every field compares by value (Object.is), so React.memo
// shallow equality correctly skips re-renders when only unrelated page state changes.
interface OrderTableRowProps {
  pedido: any;
  isChecked: boolean;
  isProcessing: boolean;
  isNfeAuthorized: boolean;
  nfeFocusStatus: string;
  isXmlLoading: boolean;
  isArrangeLoading: boolean;
  activeStatus: string;
  columns: ColumnDef[];
  nfBadgeFilter: string;
  onToggle: (id: string) => void;
  onOpenDetails: (pedido: any) => void;
  onVincular: (pedido: any) => void;
  onReprintLabel: (pedido: any) => void;
  onEmitir: (pedidos: any[], opts?: any) => void;
  onSubirXml: (pedido: any) => void;
  onSyncNfe: (pedido: any) => void;
  onArrangeShipment: (pedido: any) => void;
  addProcessingId: (id: string) => void;
}

function OrderTableRowImpl({
  pedido,
  isChecked,
  isProcessing,
  isNfeAuthorized,
  nfeFocusStatus,
  isXmlLoading,
  isArrangeLoading,
  activeStatus,
  columns,
  nfBadgeFilter,
  onToggle,
  onOpenDetails,
  onVincular,
  onReprintLabel,
  onEmitir,
  onSubirXml,
  onSyncNfe,
  onArrangeShipment,
  addProcessingId,
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
  const hasMultipleItems = Array.isArray(pedido.items) && pedido.items.length >= 2;
  const hasLabel = Boolean(pedido?.label?.pdf_base64 || pedido?.label?.content_base64 || pedido?.label?.zpl2_base64);
  const isCheckboxStatusAllowed = activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado";

  return (
    <tr className="group hover:bg-gray-50 transition-colors relative overflow-hidden">
      <td className="relative overflow-hidden w-[2%] px-2 py-3 whitespace-nowrap align-top">
        {isCheckboxStatusAllowed && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-5 h-5 flex items-center justify-center">
              <CustomCheckbox
                className="outline-none focus:outline-none"
                checked={isChecked}
                disabled={nfBadgeFilter === 'processando' && isProcessing}
                onChange={() => onToggle(pedido.id)}
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
          className={`relative py-3 whitespace-nowrap text-sm text-gray-500 min-w-0 ${col.id === 'produto' ? 'text-left w-[26%] pr-0' : ''} ${col.id === 'itens' ? 'w-[4%] text-center pl-0 pr-0' : ''} ${col.id === 'cliente' ? 'w-[14%] text-center pr-0' : ''} ${col.id === 'valor' ? 'w-[10%] text-left' : ''} ${col.id === 'tipoEnvio' ? 'w-[10%] text-center' : ''} ${col.id === 'marketplace' ? 'w-[8%] text-left' : ''} ${col.id === 'status' ? 'w-[10%] text-center' : ''} ${col.id === 'margem' ? 'w-[8%] text-center' : ''} ${pedido.totalQuantity >= 2 ? 'align-middle' : ''}`}
        >
          <div className="relative z-[1]">
            {col.render(pedido)}
          </div>
        </td>
      ))}
      <td className="relative overflow-hidden py-3 w-[10%] min-w-[88px] whitespace-nowrap text-center text-sm font-medium align-middle">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center justify-center gap-1">
            {activeStatus === "a-vincular" ? (
              <OrderRowIconAction
                label={vincularTooltip}
                icon={Link2}
                disabled={!canVincular}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canVincular) onVincular(pedido);
                }}
              />
            ) : activeStatus === "aguardando-coleta" ? (
              <>
                <div className="relative">
                  <OrderRowIconAction
                    label="Reimprimir etiqueta"
                    icon={FileBadge}
                    muted={!hasLabel}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReprintLabel(pedido);
                    }}
                  />
                  {pedido.labelPrinted && (
                    <CheckCircle2 className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 text-green-600 pointer-events-none" />
                  )}
                </div>
                <OrderRowMoreMenu>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(pedido); }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Mostrar detalhes
                  </DropdownMenuItem>
                </OrderRowMoreMenu>
              </>
            ) : activeStatus === "impressao" ? (
              <>
                <OrderRowIconAction
                  label="Reimprimir etiqueta"
                  icon={FileBadge}
                  disabled={!hasLabel}
                  muted={!hasLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReprintLabel(pedido);
                  }}
                />
                <OrderRowMoreMenu>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(pedido); }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Mostrar detalhes
                  </DropdownMenuItem>
                </OrderRowMoreMenu>
              </>
            ) : (normStatus(pedido.internalStatus) === "processando_nf" || isProcessing) ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge className="bg-white text-purple-700 border border-purple-300 h-10 w-10 p-0 inline-flex items-center justify-center rounded-lg">
                    <Loader2 className={`${ACTION_ICON_CLASS} animate-spin text-purple-600`} />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <span>Processando NF-e</span>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                {activeStatus === "emissao-nf" && nfBadgeFilter === "emitir" && !isNfeAuthorized && (
                  <OrderRowIconAction
                    label="Emitir NF-e"
                    icon={FileText}
                    onClick={(e) => {
                      e.stopPropagation();
                      addProcessingId(String(pedido.id));
                      onEmitir([pedido]);
                    }}
                  />
                )}
                {activeStatus === "emissao-nf" && nfBadgeFilter === "subir_xml" && (
                  <OrderRowIconAction
                    label="Subir XML"
                    icon={Upload}
                    loading={isXmlLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSubirXml(pedido);
                    }}
                  />
                )}
                {activeStatus === "emissao-nf" && nfBadgeFilter === "subir_xml" && String(pedido.marketplace || "").toLowerCase().includes("shopee") && (
                  <OrderRowIconAction
                    label="Organizar envio"
                    icon={Package}
                    loading={isArrangeLoading}
                    onClick={(e) => {
                      e.stopPropagation();
                      onArrangeShipment(pedido);
                    }}
                  />
                )}

                <OrderRowMoreMenu>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpenDetails(pedido); }}>
                    <Eye className="mr-2 h-4 w-4" />
                    Mostrar detalhes
                  </DropdownMenuItem>

                  {activeStatus === "emissao-nf" && nfBadgeFilter !== "subir_xml" && nfBadgeFilter !== "emitir" && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSyncNfe(pedido); }}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sincronizar NF-e
                    </DropdownMenuItem>
                  )}
                  {activeStatus === "emissao-nf" && nfBadgeFilter === "falha" && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      addProcessingId(String(pedido.id));
                      onEmitir([pedido]);
                    }}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Reemitir
                    </DropdownMenuItem>
                  )}
                  {activeStatus === "emissao-nf" && ["cancelado", "cancelada", "rejeitado", "rejeitada"].includes(String(nfeFocusStatus).toLowerCase()) && (
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      addProcessingId(String(pedido.id));
                      onEmitir([pedido], { forceNewNumber: true, forceNewRef: true });
                    }}>
                      <FilePlus className="mr-2 h-4 w-4" />
                      Gerar nova NF-e
                    </DropdownMenuItem>
                  )}
                  {activeStatus === "emissao-nf" && isNfeAuthorized && (
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSubirXml(pedido); }}>
                      <Upload className="mr-2 h-4 w-4" />
                      Subir XML
                    </DropdownMenuItem>
                  )}
                </OrderRowMoreMenu>
              </>
            )}
          </div>
        </TooltipProvider>
      </td>
    </tr>
  );
}

export const OrderTableRow = memo(OrderTableRowImpl);
