import { Pedido } from "@/types/orders";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useRef, useId, useState } from "react";
import { OrderDetails } from "@/components/orders/OrderDetails";
import { Copy } from "lucide-react";

export interface OrderDetailsDrawerProps {
    pedido: Pedido | null;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    onArrangeShipment?: (pedido: Pedido) => void;
}

export function OrderDetailsDrawer({ pedido, onOpenChange, open, onArrangeShipment }: OrderDetailsDrawerProps) {
    const contentRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();
    const [copiadoPedido, setCopiadoPedido] = useState(false);

    useEffect(() => {
        if (open) {
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl && !contentRef.current?.contains(activeEl)) {
                activeEl.blur();
            }
            try {
                if (contentRef.current) {
                    contentRef.current.scrollTop = 0;
                }
            } catch {}
            setTimeout(() => {
                const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
                const firstFocusable =
                    autofocusEl ||
                    contentRef.current?.querySelector<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                if (firstFocusable) {
                    firstFocusable.focus();
                } else {
                    contentRef.current?.focus();
                }
            }, 0);
        }
    }, [open]);

    if (!pedido) return null;

    const shippingLabel = (() => {
        const s = String((pedido as any)?.tipoEnvio || '').toLowerCase();
        if (s === 'full') return 'Full';
        if (s === 'flex') return 'Flex';
        if (s === 'envios') return 'Envios';
        if (s === 'correios') return 'Correios';
        if (s === 'no_shipping') return 'Sem Envio';
        return s ? s : '—';
    })();

    // Os cálculos financeiros agora são realizados dentro de PedidoDetails usando pedido.financeiro

    return (
        <>
            {/* Drawer à direita */}
            <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
                <DrawerContent
                    ref={contentRef}
                    className="w-[35%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none rounded-l-3xl ring-1 ring-gray-200/60 bg-white z-[10001]"
                    aria-describedby={descriptionId}
                    aria-labelledby={titleId}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <DrawerHeader>
                        <div className="flex items-center justify-between">
                            <DrawerTitle id={titleId} tabIndex={0} data-autofocus className="flex items-center gap-2">
                                Detalhes do Pedido #{pedido.idPlataforma}
                                <button
                                    type="button"
                                    className="inline-flex items-center p-1 text-xs text-gray-400 hover:text-gray-600"
                                    onClick={() => {
                                        try {
                                            const value = String(pedido.idPlataforma ?? "");
                                            navigator.clipboard?.writeText(value);
                                            setCopiadoPedido(true);
                                            setTimeout(() => setCopiadoPedido(false), 1500);
                                        } catch (e) {
                                            // ignore copy errors
                                        }
                                    }}
                                    aria-label="Copiar número do pedido"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                {copiadoPedido && (
                                    <span className="text-[10px] text-purple-700 font-semibold">COPIADO</span>
                                )}
                            </DrawerTitle>
                        </div>
                        <div className="mt-1 text-sm text-gray-700 flex items-center gap-2">
                            <span>Marketplace:</span>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {pedido.marketplace}
                            </Badge>
                            <span className="text-gray-500">-</span>
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                {shippingLabel}
                            </Badge>
                        </div>
                        <DrawerDescription id={descriptionId}>Informações detalhadas sobre o pedido e seus itens.</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-6">
                        <OrderDetails pedido={pedido} />
                    </div>
                    <DrawerFooter>
                        {String(pedido.marketplace || '').toLowerCase().includes('shopee') && (
                            <Button
                                onClick={() => { if (onArrangeShipment) onArrangeShipment(pedido); }}
                                className="bg-novura-primary"
                            >
                                Organizar Envio (Shopee)
                            </Button>
                        )}
                        <DrawerClose asChild>
                            <Button variant="outline">
                                Fechar
                            </Button>
                        </DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>


        </>
    );
}
