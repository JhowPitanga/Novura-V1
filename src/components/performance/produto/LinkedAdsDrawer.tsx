import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { AbcBadge } from "@/components/performance/AbcBadge";
import type { AbcListingRow } from "@/services/performance.service";

interface LinkedAdsDrawerProps {
    open: boolean;
    onClose: () => void;
    productName: string;
    linkedListingIds: string[];
    allListings: AbcListingRow[];
}

export function LinkedAdsDrawer({ open, onClose, productName, linkedListingIds, allListings }: LinkedAdsDrawerProps) {
    const linked = allListings.filter((a) => linkedListingIds.includes(a.id));

    return (
        <Drawer open={open} onOpenChange={(o) => !o && onClose()} shouldScaleBackground={false} direction="right">
            <DrawerContent className="w-[420px] p-0 overflow-y-auto overflow-x-hidden fixed right-0 shadow-none rounded-l-3xl ring-1 ring-gray-200/60 bg-white z-[10001]">
                <DrawerHeader className="px-6 pt-6 pb-3">
                    <DrawerTitle>Anúncios Vinculados</DrawerTitle>
                    <DrawerDescription className="truncate">{productName}</DrawerDescription>
                </DrawerHeader>
                <div className="px-6 pb-6 space-y-3">
                    {linked.length === 0 ? (
                        <p className="text-sm text-gray-500 py-4">Nenhum anúncio vinculado ou sem vendas no período.</p>
                    ) : (
                        linked.map((a) => (
                            <div key={a.id} className="flex items-start justify-between gap-3 p-4 border rounded-xl hover:bg-gray-50 transition-colors">
                                <div className="flex items-start gap-2 min-w-0">
                                    <AbcBadge tag={a.tag} size="md" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-gray-900 line-clamp-2">{a.titulo}</p>
                                        <Badge variant="outline" className="mt-1 text-xs">{a.marketplace}</Badge>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-sm font-semibold text-gray-900">
                                        R$ {a.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-gray-500">{a.unidades} un. · {a.pct.toFixed(1)}%</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </DrawerContent>
        </Drawer>
    );
}
