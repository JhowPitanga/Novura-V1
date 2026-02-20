import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FileBadge, StickyNote } from "lucide-react";
import { ensureHttpUrl, getStatusColor, mapStatusFocusToBadge, mapTipoEnvioLabel, normalizeShippingType } from "@/utils/orderUtils";

export interface ColumnRenderContext {
  activeStatus: string;
  nfBadgeFilter: string;
  processingIdsSet: Set<string>;
  nfeErrorMessageByPedidoId: Record<string, string>;
  nfeFocusStatusByPedidoId: Record<string, string>;
}

export function createOrderColumns(ctx: ColumnRenderContext) {
  const { activeStatus, nfBadgeFilter, processingIdsSet, nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId } = ctx;

  return [
    {
      id: "produto", name: "Produto", enabled: true, alwaysVisible: true, render: (pedido: any) => (
        <div className="flex flex-col space-y-1">
          {pedido.itens?.map((it: any, idx: number) => (
            <div key={idx} className="flex items-center space-x-1 min-h-[15px] py-0.9">
              <img
                src={((idx === 0 ? (pedido.imagem || it?.imagem) : it?.imagem) || '/placeholder.svg')}
                alt={(idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto'))}
                className="w-10 h-10 rounded-lg object-cover"
                loading="lazy"
                decoding="async"
                width="40"
                height="40"
              />
              <div className="min-w-0 flex-none w-[82%]">
                <div className={`text-sm font-medium text-gray-900 ${pedido.quantidadeTotal >= 2 ? 'font-bold' : ''}`}>
                  {(() => {
                    const rawTitle: string = idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto');
                    const displayTitle: string = rawTitle.length > 40 ? rawTitle.slice(0, 40) + '..' : rawTitle;
                    const link: string | null = (
                      idx === 0
                        ? (pedido?.permalink || pedido?.first_item_permalink || it?.permalink || null)
                        : (it?.permalink || pedido?.first_item_permalink || null)
                    );
                    if (link) {
                      return (
                        <a
                          href={ensureHttpUrl(link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-900 hover:text-purple-600 group-hover:text-purple-600 cursor-pointer transition-colors block truncate"
                          title={rawTitle}
                        >
                          {displayTitle}
                        </a>
                      );
                    }
                    return (
                      <span className="block truncate" title={rawTitle}>
                        {displayTitle}
                      </span>
                    );
                  })()}
                </div>
                {pedido.linkedSku && (
                  <div className="text-xs text-gray-500">SKU: {pedido.linkedSku}</div>
                )}
                {(it?.variationLabel || (idx === 0 ? pedido.variationColorNames : '')) && (
                  <div className="text-xs text-gray-500">{it?.variationLabel || pedido.variationColorNames}</div>
                )}
              </div>
            </div>
          ))}
          {activeStatus === 'emissao-nf' && nfBadgeFilter === 'falha' && (() => {
            const msg = nfeErrorMessageByPedidoId[String(pedido.id)];
            return msg ? (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs p-2 leading-snug whitespace-normal break-words relative z-[10]">
                {msg}
              </div>
            ) : null;
          })()}
        </div>
      )
    },
    {
      id: "itens", name: "Itens", enabled: true, alwaysVisible: true, render: (pedido: any) => (
        <div className="flex flex-col items-center space-y-1">
          {pedido.itens?.map((item: any, index: number) => (
            <div key={index} className="min-h-10 py-0.5 flex items-center justify-center w-full">
              <span
                className={`inline-flex items-center justify-center h-6 min-w-6 rounded-md px-2 text-sm md:text-base border ${pedido.quantidadeTotal >= 2 ? 'text-purple-600 border-purple-600 bg-purple-600/10' : 'text-gray-700 border-gray-300'}`}
                title={`Qtd: ${item.quantidade}`}
              >
                {item.quantidade}
              </span>
            </div>
          ))}
        </div>
      )
    },
    {
      id: "cliente", name: "Cliente", enabled: false, render: (pedido: any) => {
        const name = String(pedido?.first_name_buyer || pedido?.cliente || "");
        const truncated = name.length > 20 ? name.slice(0, 20) + "…" : name;
        return (<span className="text-gray-900 block truncate">{truncated}</span>);
      }
    },
    {
      id: "valor", name: "Valor do Pedido", enabled: true, render: (pedido: any) => (
        <span className="text-gray-900 font-semibold">{pedido.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
      )
    },
    {
      id: "tipoEnvio", name: "Tipo de Envio", enabled: true, alwaysVisible: true, render: (pedido: any) => {
        const shipmentStatus = String(pedido?.shipment_status || '').toLowerCase();
        const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
        const isOrderCancelledOrReturned = (
          pedido?.status_interno === 'Cancelado' ||
          pedido?.status_interno === 'Devolução'
        );
        const allowedBoards = ['a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta'];
        const allowedLabels = new Set(['A vincular', 'Emissao NF', 'Impressao', 'Aguardando Coleta']);
        const computedLabel = String(pedido?.status_interno || 'Pendente');
        const isAllowedByBoard = allowedBoards.includes(activeStatus) || (activeStatus === 'todos' && allowedLabels.has(computedLabel));
        const showSLA = isAllowedByBoard && !deliveredStatuses.includes(shipmentStatus) && !isOrderCancelledOrReturned && computedLabel !== 'Enviado' && pedido?.slaDespacho?.expected_date;
        let countdown: JSX.Element | null = null;
        if (showSLA) {
          const expected = new Date(pedido.slaDespacho.expected_date);
          const now = new Date();
          const diffMs = expected.getTime() - now.getTime();
          const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
          const days = Math.floor(totalMinutes / (60 * 24));
          const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
          const minutes = totalMinutes % 60;
          const slaStatusLower = String(pedido?.slaDespacho?.status || '').toLowerCase();
          const color = ((diffMs <= 0) || slaStatusLower === 'delayed') ? 'text-red-600' : 'text-purple-600';
          const cdText = `ENVIE EM: ${days}d ${hours}h ${minutes}m`;
          const cdLen = cdText.length;
          const cdSize = cdLen > 30 ? 'text-[10px]' : (cdLen > 15 ? 'text-[9px]' : 'text-[10px]');
          countdown = (
            <span className={`${cdSize} leading-[1rem] font-medium whitespace-nowrap ${color}`}>
              {cdText}
            </span>
          );
        }
        return (
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            {(() => {
              const lbl = mapTipoEnvioLabel(pedido.tipoEnvio);
              const len = lbl.length;
              const size = len > 12 ? 'text-[8px]' : (len > 10 ? 'text-[9px]' : 'text-[10px]');
              return (
                <Badge className={`uppercase bg-purple-600 text-white hover:bg-purple-700 h-5 px-2 w-[92px] ${size} leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                  {lbl}
                </Badge>
              );
            })()}
            {countdown}
          </div>
        );
      }
    },
    {
      id: "marketplace", name: "Marketplace", enabled: true, render: (pedido: any) => (
        <div className="flex flex-col leading-tight">
          <span className="text-gray-900 text-sm">{pedido.marketplace}</span>
          <span className="text-xs text-gray-500 break-all">{String(pedido.idPlataforma || '')}</span>
        </div>
      )
    },
    {
      id: "status", name: "Status", enabled: true, alwaysVisible: true, render: (pedido: any) => {
        const boardLabel = String(pedido?.status || 'Pendente');
        const displayLabel = boardLabel === 'Aguardando Coleta' ? 'Coleta' : boardLabel;
        const badgeClass = getStatusColor(boardLabel);
        const shipmentStatusLower = String(pedido?.shipment_status || '').toLowerCase();
        const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
        const isOrderCancelledOrReturned = (
          pedido?.status_interno === 'Cancelado' ||
          pedido?.status_interno === 'Devolução'
        );
        const slaStatusLower = String(pedido?.slaDespacho?.status || '').toLowerCase();
        const ed = pedido?.slaDespacho?.expected_date;
        const expired = ed ? (new Date(ed).getTime() - new Date().getTime() <= 0) : false;
        const showDelayedBadge = (slaStatusLower === 'delayed' || expired) && !deliveredStatuses.includes(shipmentStatusLower) && !isOrderCancelledOrReturned && String(pedido?.status_interno || '') !== 'Enviado';
        const isProcessing = processingIdsSet.has(pedido.id);
        return (
          <div className="flex flex-col items-center space-y-2 text-center">
            {isProcessing ? (
              <Badge className="uppercase bg-white text-purple-700 border border-purple-300 h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate relative overflow-hidden">
                <span className="relative z-[1]">Processando</span>
                <span className="absolute inset-y-0 left-0 w-0 bg-novura-primary/40 animate-[processingGrowWidth_1.2s_ease-in-out_infinite]"></span>
              </Badge>
            ) : showDelayedBadge ? (
              <Badge className="uppercase bg-red-600 hover:bg-red-700 text-white h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate">
                Atrasado
              </Badge>
            ) : (
              <Badge className={`uppercase ${badgeClass} h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                {displayLabel}
              </Badge>
            )}
            {activeStatus === 'enviado' && String(pedido?.shipment_status || '').toLowerCase() === 'delivered' && (
              <Badge className={`uppercase bg-green-600 hover:bg-green-700 text-white h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                Entregue
              </Badge>
            )}
            {activeStatus === "impressao" && (
              <div className="flex items-center space-x-2 mt-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <StickyNote className={`h-4 w-4 ${pedido.impressoLista ? 'text-primary' : 'text-gray-300'}`} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{pedido.impressoLista ? 'Lista de Separação Impressa' : 'Lista de Separação não impressa'}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <FileBadge className={`h-4 w-4 ${pedido.impressoEtiqueta ? 'text-primary' : 'text-gray-300'}`} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{pedido.impressoEtiqueta ? 'Etiqueta Impressa' : 'Etiqueta não impressa'}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            {activeStatus === 'emissao-nf' && (() => {
              const st = nfeFocusStatusByPedidoId[String(pedido.id)];
              const b = mapStatusFocusToBadge(st);
              return st ? (
                <Badge className={`uppercase ${b.className} h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                  {b.label}
                </Badge>
              ) : null;
            })()}
            {activeStatus === 'emissao-nf' && nfBadgeFilter === 'falha' && (() => {
              const msg = nfeErrorMessageByPedidoId[String(pedido.id)];
              return msg ? (
                <div className="mt-1 rounded-md border border-red-200 bg-red-50 text-red-700 text-[10px] leading-snug px-2 py-1 max-w-[220px] whitespace-normal break-words mx-auto relative z-[10]">
                  {msg}
                </div>
              ) : null;
            })()}
          </div>
        );
      }
    },
    {
      id: "margem", name: "Margem %", enabled: true, alwaysVisible: true, render: (pedido: any) => {
        const tn = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
        const isZeroed = String(pedido?.status || '').toLowerCase() === 'cancelado' || String(pedido?.status || '').toLowerCase() === 'devolução';
        const zeroIfNeeded = (n: number) => (isZeroed ? 0 : n);
        const valorBrutoItens = (pedido?.itens || []).reduce((sum: number, it: any) => sum + (tn(it?.valor) * (tn(it?.quantidade) || 0)), 0) || tn((pedido as any)?.financeiro?.valorPedido) || tn(pedido?.valor);
        const f: any = (pedido as any)?.financeiro || {};
        const comissaoMarketplace = tn(f?.taxaMarketplace);
        const impostosCalculados = tn(f?.impostos);
        const custoProdutosFixo = tn(f?.custoProdutos);
        const custosExtras = tn(f?.custosExtras);
        const cupomFixo = tn(f?.cupom);
        const freteCusto = tn(f?.taxaFrete);
        const freteRecebidoLiquido = tn(f?.freteRecebidoLiquido ?? (tn(f?.freteRecebido) - tn(f?.shippingFeeBuyer)));
        const custosVariaveisTotal =
          zeroIfNeeded(comissaoMarketplace) +
          zeroIfNeeded(impostosCalculados) +
          zeroIfNeeded(custoProdutosFixo) +
          zeroIfNeeded(custosExtras) +
          zeroIfNeeded(cupomFixo) +
          zeroIfNeeded(freteCusto);
        const despesasVariaveisTotal = zeroIfNeeded(freteRecebidoLiquido);
        const mcValor =
          zeroIfNeeded(valorBrutoItens) -
          custosVariaveisTotal +
          despesasVariaveisTotal;
        const mcPercent = isZeroed ? 0 : (valorBrutoItens > 0 ? (mcValor / valorBrutoItens) * 100 : 0);
        const badgeClass = mcPercent < 0 ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white';
        return (
          <Badge className={`uppercase ${badgeClass} h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
            {mcPercent.toFixed(1)}%
          </Badge>
        );
      }
    },
  ];
}
