import type { Order } from "@/types/orders";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useId, useRef, useState } from "react";
import { OrderDetails } from "@/components/orders/OrderDetails";
import { Copy } from "lucide-react";
import { formatMarketplaceLabel, mapTipoEnvioLabel } from "@/utils/orderUtils";

export interface OrderDetailsDrawerProps {
  pedido: Order | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onArrangeShipment?: (pedido: Order) => void;
}

export function OrderDetailsDrawer({ pedido, onOpenChange, open, onArrangeShipment }: OrderDetailsDrawerProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      if (contentRef.current) contentRef.current.scrollTop = 0;
    } catch {}
  }, [open, pedido?.id]);

  if (!pedido) return null;

  const channelOrderId = pedido.marketplaceOrderId || pedido.platformId;

  const copyOrderId = () => {
    try {
      navigator.clipboard?.writeText(String(channelOrderId ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
      <DrawerContent
        ref={contentRef}
        className="w-[35%] min-w-[360px] p-0 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none rounded-l-3xl ring-1 ring-gray-200/60 bg-white z-[10001]"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="border-b border-gray-100 pb-4">
          <DrawerTitle id={titleId} tabIndex={0} data-autofocus className="flex items-center gap-2 text-gray-900">
            Detalhes do Pedido #{channelOrderId}
            <button
              type="button"
              className="inline-flex items-center p-1 text-xs text-gray-400 hover:text-gray-600"
              onClick={copyOrderId}
              aria-label="Copiar número do pedido"
            >
              <Copy className="w-4 h-4" />
            </button>
            {copied ? (
              <span className="text-[10px] text-purple-700 font-semibold">COPIADO</span>
            ) : null}
          </DrawerTitle>
          <div className="mt-1 text-sm text-gray-700 flex flex-wrap items-center gap-2">
            <span className="text-gray-500">Canal:</span>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              {formatMarketplaceLabel(pedido.marketplace)}
            </Badge>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
              {mapTipoEnvioLabel(pedido.shippingType)}
            </Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
              {pedido.status}
            </Badge>
          </div>
          <DrawerDescription id={descriptionId}>
            Informações detalhadas sobre o pedido, itens, financeiro e histórico de status.
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-4 space-y-6">
          <OrderDetails order={pedido} drawerOpen={open} />
        </div>

        <DrawerFooter className="border-t border-gray-100">
          {String(pedido.marketplace || "").toLowerCase().includes("shopee") && onArrangeShipment ? (
            <Button onClick={() => onArrangeShipment(pedido)} className="bg-novura-primary hover:bg-novura-primary/90">
              Organizar Envio (Shopee)
            </Button>
          ) : null}
          <DrawerClose asChild>
            <Button variant="outline">Fechar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
