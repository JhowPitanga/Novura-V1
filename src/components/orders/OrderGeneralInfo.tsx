import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Copy, Package, User } from "lucide-react";
import { formatDateTimeSP } from "@/lib/datetime";
import { formatShipmentStatus, mapTipoEnvioLabel } from "@/utils/orderUtils";
import type { Order } from "@/types/orders";
import { OrderDrawerSection, OrderDrawerInfoRow } from "./OrderDrawerSection";

function getDetailStatusColor(status: string): string {
  switch (status) {
    case "Pendente": return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "A vincular": return "bg-red-100 text-red-800 border-red-300";
    case "Emissao NF": return "bg-blue-100 text-blue-800 border-blue-300";
    case "Impressao": return "bg-purple-100 text-purple-800 border-purple-300";
    case "Aguardando Coleta": return "bg-purple-100 text-purple-800 border-purple-300";
    case "Enviado": return "bg-teal-100 text-teal-800 border-teal-300";
    case "Cancelado": return "bg-red-100 text-red-800 border-red-300";
    default: return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

interface OrderGeneralInfoProps {
  order: Order;
}

export function OrderGeneralInfo({ order }: OrderGeneralInfoProps) {
  const [copiedPlatform, setCopiedPlatform] = useState(false);
  const dataFormatada = formatDateTimeSP(order.paidAt ?? order.createdAt);
  const channelOrderId = order.marketplaceOrderId || order.platformId;

  return (
    <OrderDrawerSection title="Informações Gerais" icon={Package}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <OrderDrawerInfoRow
            label="ID no canal"
            value={
              <span className="font-mono font-semibold inline-flex items-center gap-2">
                {channelOrderId}
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(String(channelOrderId));
                      setCopiedPlatform(true);
                      setTimeout(() => setCopiedPlatform(false), 1500);
                    } catch {}
                  }}
                  aria-label="Copiar ID"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {copiedPlatform ? <span className="text-[10px] text-purple-700 font-semibold">COPIADO</span> : null}
              </span>
            }
          />
          <OrderDrawerInfoRow label="Pack / Plataforma" value={<span className="font-mono">{order.platformId}</span>} />
          <OrderDrawerInfoRow label="Data do pedido" value={dataFormatada} />
          <OrderDrawerInfoRow label="Tipo de envio" value={mapTipoEnvioLabel(order.shippingType)} />
          <OrderDrawerInfoRow
            label="Cidade"
            value={order.shippingCity ?? "—"}
          />
          <OrderDrawerInfoRow
            label="UF"
            value={order.shippingStateUf ?? order.buyerState ?? "—"}
          />
        </div>
        <div className="space-y-1">
          <OrderDrawerInfoRow
            label="Cliente"
            value={
              <span className="inline-flex items-center gap-1">
                <User className="w-4 h-4 text-gray-400" />
                {order.customerName || "—"}
              </span>
            }
          />
          <OrderDrawerInfoRow
            label="Status"
            value={
              <Badge className={`${getDetailStatusColor(order.status)} font-bold border`}>
                {order.status}
              </Badge>
            }
          />
          <OrderDrawerInfoRow
            label="Status de envio"
            value={formatShipmentStatus(order.shipmentStatus ?? undefined) || "—"}
          />
          <OrderDrawerInfoRow label="Etiqueta impressa" value={order.labelPrinted ? "Sim" : "Não"} />
          <OrderDrawerInfoRow label="NF-e emitida" value={order.hasInvoice ? "Sim" : "Não"} />
        </div>
      </div>
    </OrderDrawerSection>
  );
}
