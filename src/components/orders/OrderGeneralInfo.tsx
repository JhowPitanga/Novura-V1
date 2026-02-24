import { useState } from "react";
import { ChevronDown, ChevronUp, Package, User, Copy } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeSP } from "@/lib/datetime";
import { formatShipmentStatus } from "@/utils/orderUtils";

// Light-colored badge styles used in the detail panel (distinct from table badges)
function getDetailStatusColor(status: string): string {
    switch (status) {
        case "Pendente": return "bg-yellow-100 text-yellow-800 border-yellow-300";
        case "A vincular": return "bg-red-100 text-red-800 border-red-300";
        case "Emissao NF": return "bg-blue-100 text-blue-800 border-blue-300";
        case "NF Emitida": return "bg-green-100 text-green-800 border-green-300";
        case "Aguardando Coleta": return "bg-purple-100 text-purple-800 border-purple-300";
        case "Enviado": return "bg-teal-100 text-teal-800 border-teal-300";
        case "Cancelado": return "bg-red-100 text-red-800 border-red-300";
        case "Devolução": return "bg-gray-100 text-gray-800 border-gray-300";
        case "Devolvido": return "bg-gray-100 text-gray-800 border-gray-300";
        default: return "bg-gray-100 text-gray-800 border-gray-300";
    }
}

function getDetailShipmentStatusColor(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
        case 'pending':
        case 'ready_to_print':
        case 'ready_to_ship':
            return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        case 'in_transit':
        case 'shipped':
            return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'delivered':
            return 'bg-green-100 text-green-800 border-green-300';
        case 'not_delivered':
        case 'returned':
            return 'bg-purple-100 text-purple-800 border-purple-300';
        case 'canceled':
        case 'cancelled':
            return 'bg-red-100 text-red-800 border-red-300';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-300';
    }
}

interface OrderGeneralInfoProps {
    pedido: any;
}

export function OrderGeneralInfo({ pedido }: OrderGeneralInfoProps) {
    const [expanded, setExpanded] = useState(false);
    const [copiadoPlataforma, setCopiadoPlataforma] = useState(false);

    const dataBase = pedido?.dataPagamento || pedido.data;
    const dataFormatada = formatDateTimeSP(dataBase);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                    <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                <Package className="w-5 h-5 mr-2 text-purple-600" />
                                Informações Gerais
                            </h3>
                            {expanded
                                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                : <ChevronDown className="w-5 h-5 text-gray-400" />
                            }
                        </div>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-6 pb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">ID da Plataforma:</span>
                                    <span className="font-mono font-semibold text-gray-900 flex items-center gap-2">
                                        {pedido.idPlataforma}
                                        <button
                                            type="button"
                                            className="inline-flex items-center p-1 text-xs text-gray-400 hover:text-gray-600"
                                            onClick={() => {
                                                try {
                                                    navigator.clipboard?.writeText(String(pedido.idPlataforma ?? ""));
                                                    setCopiadoPlataforma(true);
                                                    setTimeout(() => setCopiadoPlataforma(false), 1500);
                                                } catch {}
                                            }}
                                            aria-label="Copiar ID da plataforma"
                                        >
                                            <Copy className="w-3 h-3" />
                                        </button>
                                        {copiadoPlataforma && (
                                            <span className="text-[10px] text-purple-700 font-semibold">COPIADO</span>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Data do Pedido:</span>
                                    <span className="text-gray-900">{dataFormatada}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Cidade:</span>
                                    <span className="text-gray-900">{pedido?.shippingCity || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Estado:</span>
                                    <span className="text-gray-900">{pedido?.shippingState || '-'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">UF:</span>
                                    <span className="text-gray-900">{pedido?.shippingUF || '-'}</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Cliente:</span>
                                    <span className="text-gray-900 font-medium flex items-center">
                                        <User className="w-4 h-4 mr-1 text-gray-400" />
                                        {pedido?.billing_name || pedido.cliente}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Status:</span>
                                    <Badge className={getDetailStatusColor(pedido.status) + " font-bold"}>
                                        {pedido.status}
                                    </Badge>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-600 text-sm">Status de Envio:</span>
                                    <Badge
                                        className={
                                            pedido?.shipment_status
                                                ? getDetailShipmentStatusColor(pedido.shipment_status) + " font-medium"
                                                : "bg-gray-100 text-gray-800 border-gray-300"
                                        }
                                    >
                                        {formatShipmentStatus(pedido?.shipment_status) || '-'}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}
