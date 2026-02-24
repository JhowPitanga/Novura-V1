import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { updateShopeeStock } from "@/services/listings.service";

export interface StockVariation {
    id: string | number;
    sku: string;
    seller_stock_total: number;
}

interface StockEditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemId: string | null;
    orgId: string | null | undefined;
    variations: StockVariation[];
    onSuccess: (itemId: string, updates: Array<{ model_id: number; seller_stock: number }>) => void;
}

export function StockEditModal({ open, onOpenChange, itemId, orgId, variations, onSuccess }: StockEditModalProps) {
    const [stockEditsMap, setStockEditsMap] = useState<Record<string, number>>({});
    const [stockBulkValue, setStockBulkValue] = useState("");
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    const getCurrentValue = (v: StockVariation) => {
        const key = String(v.id);
        return typeof stockEditsMap[key] === 'number' ? stockEditsMap[key] : v.seller_stock_total;
    };

    const handleApplyBulk = () => {
        const num = Number(stockBulkValue);
        if (!Number.isFinite(num)) return;
        setStockEditsMap(prev => {
            const next = { ...prev };
            variations.forEach(v => { next[String(v.id)] = num; });
            return next;
        });
    };

    const handleClose = () => {
        setStockEditsMap({});
        setStockBulkValue("");
        onOpenChange(false);
    };

    const handleUpdate = async () => {
        if (!itemId || !orgId) return;
        const itemIdNum = Number(itemId);
        if (!Number.isFinite(itemIdNum)) return;
        const updates = Object.entries(stockEditsMap)
            .map(([modelIdStr, qty]) => ({ model_id: Number(modelIdStr), seller_stock: Number(qty) }))
            .filter(it => Number.isFinite(it.model_id) && Number.isFinite(it.seller_stock));
        if (!updates.length) return;
        try {
            setLoading(true);
            await updateShopeeStock(orgId, itemId, updates);
            onSuccess(itemId, updates);
            handleClose();
            toast({ title: 'Estoque atualizado' });
        } catch (e: any) {
            toast({ title: 'Falha ao atualizar estoque', description: e?.message || String(e), variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Atualizar estoque (Shopee)</DialogTitle>
                    <DialogDescription>Edite o estoque das variações e confirme.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            placeholder="Valor para todos"
                            value={stockBulkValue}
                            onChange={(e) => setStockBulkValue(e.target.value)}
                        />
                        <Button variant="outline" onClick={handleApplyBulk}>Aplicar a todos</Button>
                    </div>
                    <div className="max-h-[50vh] overflow-y-auto pr-1">
                        <div className="space-y-3">
                            {variations.map((v) => (
                                <div key={String(v.id)} className="grid grid-cols-12 items-center gap-3">
                                    <div className="col-span-5">
                                        <div className="text-xs text-gray-500">SKU</div>
                                        <div className="text-sm font-medium text-gray-900">{v.sku}</div>
                                    </div>
                                    <div className="col-span-3">
                                        <div className="text-xs text-gray-500">Atual</div>
                                        <div className="text-sm font-medium text-gray-900">{v.seller_stock_total}</div>
                                    </div>
                                    <div className="col-span-4">
                                        <Input
                                            type="number"
                                            value={getCurrentValue(v)}
                                            onChange={(e) => {
                                                const num = Number(e.target.value);
                                                setStockEditsMap(prev => ({ ...prev, [String(v.id)]: num }));
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                    <Button disabled={loading} onClick={handleUpdate}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
