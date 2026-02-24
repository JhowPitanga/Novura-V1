import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Search } from "lucide-react";

interface Product {
    id: string;
    name: string;
    sku: string;
    image_url?: string;
    image_urls?: string[];
    barcode?: string;
    available_stock?: number;
}

interface ProductPickerDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    products: Product[];
    selectedProductId: string | null;
    onProductSelect: (id: string) => void;
    loading: boolean;
    error: any;
    canConfirm: boolean;
}

export function ProductPickerDialog({
    isOpen,
    onOpenChange,
    onConfirm,
    searchTerm,
    onSearchChange,
    products,
    selectedProductId,
    onProductSelect,
    loading,
    error,
    canConfirm,
}: ProductPickerDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Buscar produtos do ERP</DialogTitle>
                    <DialogDescription>Pesquise por Nome, SKU ou Código de Barras e confirme a seleção.</DialogDescription>
                </DialogHeader>

                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, SKU ou código de barras"
                        className="h-10 w-full pl-10 pr-4 rounded-lg border"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>

                <div className="max-h-[50vh] overflow-y-auto pr-2">
                    {loading && (
                        <div className="text-center text-gray-500">Carregando produtos...</div>
                    )}
                    {error && (
                        <div className="text-center text-red-500">Erro ao carregar produtos.</div>
                    )}
                    {!loading && !error && (
                        <ul className="space-y-2">
                            {products.length > 0 ? (
                                products.map((produto) => {
                                    const selected = selectedProductId === produto.id;
                                    return (
                                        <li
                                            key={produto.id}
                                            className={`p-3 rounded-lg border flex items-center justify-between transition-colors cursor-pointer ${selected ? 'bg-primary/10 border-primary' : 'hover:bg-gray-50'}`}
                                            onClick={() => onProductSelect(produto.id)}
                                        >
                                            <div className="flex items-center space-x-3">
                                                <img
                                                    src={produto.image_url ?? produto.image_urls?.[0] ?? "/placeholder.svg"}
                                                    alt={produto.name}
                                                    className="w-10 h-10 object-cover rounded-md"
                                                />
                                                <div>
                                                    <div className="font-medium text-sm">{produto.name}</div>
                                                    <div className="text-xs text-gray-500">
                                                        SKU: {produto.sku}
                                                        {produto.available_stock !== undefined ? ` • Estoque: ${produto.available_stock}` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            {selected && <Check className="w-4 h-4 text-primary" />}
                                        </li>
                                    );
                                })
                            ) : (
                                <p className="text-center text-gray-500">Nenhum produto encontrado.</p>
                            )}
                        </ul>
                    )}
                </div>

                <DialogFooter className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button
                        className="bg-primary text-white"
                        onClick={onConfirm}
                        disabled={!canConfirm}
                    >
                        Confirmar seleção
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
