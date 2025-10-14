import { Pedido } from "@/types/pedidos";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useId } from "react";
import { PedidoDetails } from "@/components/pedidos/PedidoDetails";
import { CreditCard, TrendingUp } from "lucide-react";

export interface PedidoDetailsDrawerProps {
    pedido: Pedido | null;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

export function PedidoDetailsDrawer({ pedido, onOpenChange, open }: PedidoDetailsDrawerProps) {
    if (!pedido) return null;

    const contentRef = useRef<HTMLDivElement | null>(null);
    const titleId = useId();
    const descriptionId = useId();

    useEffect(() => {
        if (open) {
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl && !contentRef.current?.contains(activeEl)) {
                activeEl.blur();
            }
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

    // Cálculos financeiros para os cards abaixo do drawer (alinhados com PedidoDetails)
    const comissaoPercentual = 0.12; // 12%
    const impostosPercentual = 0.08; // 8%
    const custoProdutosFixo = 999.0; // MOCK
    const custosExtras = 80.0; // MOCK
    const valorRecebidoFrete = 109.9; // MOCK
    const freteCusto = 159.0; // MOCK
    const cupomFixo = 50.0; // MOCK

    const valorBrutoItens = pedido.valor;
    const comissaoMarketplace = valorBrutoItens * comissaoPercentual;
    const impostosCalculados = valorBrutoItens * impostosPercentual;

    const valorLiquidoReceber =
        valorBrutoItens +
        valorRecebidoFrete -
        comissaoMarketplace -
        impostosCalculados -
        cupomFixo;

    const lucroPedido =
        valorLiquidoReceber -
        custoProdutosFixo -
        custosExtras -
        (freteCusto - valorRecebidoFrete);

    const margemCalculada = valorBrutoItens > 0 ? (lucroPedido / valorBrutoItens) * 100 : 0;

    return (
        <>
            {/* Drawer à direita */}
            <Drawer open={open} onOpenChange={onOpenChange} direction="right" shouldScaleBackground={false}>
                <DrawerContent
                    ref={contentRef}
                    className="w-[45%] p-6 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none"
                    aria-describedby={descriptionId}
                    aria-labelledby={titleId}
                    role="dialog"
                    aria-modal="true"
                    tabIndex={-1}
                >
                    <DrawerHeader>
                        <DrawerTitle id={titleId}>Detalhes do Pedido #{pedido.id}</DrawerTitle>
                        <DrawerDescription id={descriptionId}>Informações detalhadas sobre o pedido e seus itens.</DrawerDescription>
                    </DrawerHeader>
                    <div className="p-4 space-y-4">
                        <PedidoDetails pedido={pedido} />
                    </div>
                    <DrawerFooter>
                        <DrawerClose asChild>
                            <Button variant="outline" data-autofocus>
                                Fechar
                            </Button>
                        </DrawerClose>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>


        </>
    );
}