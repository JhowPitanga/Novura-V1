
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from '@/components/ui/use-toast';
import { useAuth } from "@/hooks/useAuth";
import { useLinkOrderStorage } from '@/hooks/useLinkOrderStorage';
import { useBindableProducts } from '@/hooks/useProducts';
import { linkProductToOrderItems } from "@/services/orders.service";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useState } from 'react';
import { ProductPickerDialog } from './ProductPickerDialog';

interface Product {
    id: string;
    name: string;
    sku: string;
    image_url?: string;
    image_urls?: string[];
    barcode?: string;
    available_stock?: number;
}

interface AnuncioParaVincular {
    id: string;
    nome: string;
    quantidade: number;
    marketplace: string;
    rowId?: string;
    produtoERPId?: string;
    sku?: string;
    variacao?: string;
    image_url?: string;
    marketplaceItemId?: string;
    variationId?: string;
}

interface VincularPedidoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (vinculos: any) => void;
    pedidoId: string;
    anunciosParaVincular: AnuncioParaVincular[];
}

export function LinkOrderModal({ isOpen, onClose, onSave, pedidoId, anunciosParaVincular }: VincularPedidoModalProps) {
    const queryClient = useQueryClient();
    const [isProductPickerOpen, setProductPickerOpen] = useState(false);
    const [didProductFetch, setDidProductFetch] = useState(false);
    const enabledProductsFetch = isProductPickerOpen && !didProductFetch;
    const { bindableProducts, loading, error } = useBindableProducts(enabledProductsFetch);
    const { organizationId: orgIdFromAuth } = useAuth();

    const [vinculacoes, setVinculacoes] = useState<{ [anuncioId: string]: string }>({});
    const [permanenteFlags, setPermanenteFlags] = useState<{ [anuncioId: string]: boolean }>({});
    const [anuncioEmSelecao, setAnuncioEmSelecao] = useState<string | null>(null);
    const [produtoSelecionadoNoPicker, setProdutoSelecionadoNoPicker] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const { storageId: storageIdState, insufficientMap } = useLinkOrderStorage(
        isOpen,
        orgIdFromAuth,
        vinculacoes,
        anunciosParaVincular,
    );

    const filteredProducts: Product[] = bindableProducts.filter((produto: Product) => {
        const term = searchTerm.toLowerCase();
        return (
            (produto.name || '').toLowerCase().includes(term) ||
            (produto.sku ? produto.sku.toLowerCase() : '').includes(term) ||
            (produto.barcode ? produto.barcode.toLowerCase().includes(term) : false)
        );
    });

    const openProductPickerFor = (anuncioId: string) => {
        setAnuncioEmSelecao(anuncioId);
        setProdutoSelecionadoNoPicker(vinculacoes[anuncioId] ?? null);
        setProductPickerOpen(true);
    };

    const handleProductRowClick = (productId: string) => {
        setProdutoSelecionadoNoPicker(productId);
    };

    const handleConfirmSelection = () => {
        if (!anuncioEmSelecao || !produtoSelecionadoNoPicker) {
            toast({
                title: 'Seleção incompleta',
                description: 'Escolha um produto para confirmar a vinculação.',
                variant: 'destructive',
            });
            return;
        }
        setVinculacoes(prev => ({ ...prev, [anuncioEmSelecao]: produtoSelecionadoNoPicker }));
        setProductPickerOpen(false);
        setAnuncioEmSelecao(null);
        setProdutoSelecionadoNoPicker(null);
        toast({
            title: 'Produto vinculado',
            description: 'O produto ERP foi selecionado para o anúncio do pedido.',
            variant: 'default',
        });
    };

    const handleRemoveVinculo = (anuncioId: string) => {
        setVinculacoes(prev => {
            const next = { ...prev };
            delete next[anuncioId];
            return next;
        });
        setPermanenteFlags(prev => ({ ...prev, [anuncioId]: false }));
    };

    const handleSave = async () => {
        const linkedItems = anunciosParaVincular
            .map((anuncio) => {
                const productId = vinculacoes[anuncio.id];
                if (!productId) return null;
                return {
                    anuncioId: anuncio.id,
                    productId,
                    quantity: anuncio.quantidade,
                    permanent: !!permanenteFlags[anuncio.id],
                    marketplace: anuncio.marketplace,
                    adSku: anuncio.sku || null,
                    marketplaceItemId: anuncio.marketplaceItemId || null,
                    variationId: anuncio.variationId ?? '',
                };
            })
            .filter(Boolean) as Array<{
                anuncioId: string;
                productId: string;
                quantity: number;
                permanent: boolean;
                marketplace: string;
                adSku: string | null;
                marketplaceItemId: string | null;
                variationId: string;
            }>;

        if (linkedItems.length === 0) {
            toast({
                title: 'Seleção incompleta',
                description: 'Escolha ao menos um produto para confirmar a vinculação.',
                variant: 'destructive',
            });
            return;
        }

        try {
            const organizationId: string | null = orgIdFromAuth ? String(orgIdFromAuth) : null;
            if (!organizationId) {
                toast({
                    title: 'Organização não encontrada',
                    description: 'Não foi possível identificar a organização atual.',
                    variant: 'destructive',
                });
                return;
            }

            const result = await linkProductToOrderItems({
                orderId: pedidoId,
                organizationId,
                marketplace: anunciosParaVincular[0]?.marketplace || '',
                links: linkedItems.map((li) => ({
                    orderItemId: li.anuncioId,
                    marketplaceItemId: li.marketplaceItemId || '',
                    variationId: li.variationId || '',
                    productId: li.productId,
                    isPermanent: li.permanent,
                })),
            });
            // Invalidate orders cache so UI reflects the new status immediately
            if (result?.statusChanged) {
                queryClient.invalidateQueries({ queryKey: ['orders'] });
            }
            onSave({ linkedItems, storageId: storageIdState, pedidoId });
            onClose();
            toast({
                title: 'Vinculação salva!',
                description: 'Os anúncios foram vinculados corretamente.',
                variant: 'default',
            });
        } catch (e: any) {
            toast({
                title: 'Falha na vinculação',
                description: e?.message || 'Não foi possível concluir a vinculação.',
                variant: 'destructive',
            });
        }
    };

    useEffect(() => {
        if (isProductPickerOpen && !didProductFetch && !loading && Array.isArray(bindableProducts) && bindableProducts.length > 0) {
            setDidProductFetch(true);
        }
    }, [isProductPickerOpen, didProductFetch, loading, bindableProducts]);

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="fixed left-[50%] top-[50%] -translate-x-[50%] -translate-y-[50%] sm:max-w-5xl p-0 max-h-[80vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>Vincular produtos ao pedido</DialogTitle>
                        <DialogDescription>Vincule todos os itens e confirme apenas com estoque suficiente no armazém selecionado.</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6 max-h-[58vh] overflow-y-auto">
                        {anunciosParaVincular.map((anuncio) => {
                            const produtoVinculado = vinculacoes[anuncio.id]
                                ? bindableProducts.find((p: Product) => p.id === vinculacoes[anuncio.id])
                                : null;
                            return (
                                <div key={anuncio.id} className="flex flex-col md:flex-row items-stretch gap-6">
                                    {/* Quadro 1: Detalhes do anúncio */}
                                    <div className="flex-1 rounded-xl border border-primary p-4 bg-white shadow-md min-h-40">
                                        <div className="flex items-center gap-4">
                                            <img src={anuncio.image_url ?? "/placeholder.svg"} alt={anuncio.nome} className="w-12 h-12 object-cover rounded-md" />
                                            <div className="flex-1">
                                                <div className="font-semibold text-sm md:text-base">{anuncio.nome}</div>
                                                <div className="text-xs text-gray-500">{anuncio.variacao ? anuncio.variacao : '—'}</div>
                                            </div>
                                            <div className="text-primary font-bold text-sm md:text-base">QTD: {anuncio.quantidade}</div>
                                        </div>
                                        <div className="mt-2 text-xs text-gray-600">SKU: {anuncio.sku || '—'}</div>
                                        <div className="mt-1 text-[10px] text-gray-500">Marketplace: {anuncio.marketplace}</div>
                                    </div>

                                    {/* Indicador entre quadros */}
                                    <div className="flex items-center justify-center w-24 md:w-32">
                                        <div className="flex-1 h-px bg-primary/40"></div>
                                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center shadow-md mx-2">
                                            <Check className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 h-px bg-primary/40"></div>
                                    </div>

                                    {/* Quadro 2: Produto vinculado ou botão de vincular */}
                                    <div className="flex-1 rounded-xl border border-primary p-4 bg-white shadow-md min-h-28">
                                        {!produtoVinculado ? (
                                            <div className="h-full flex items-center justify-center">
                                                <Button className="bg-primary text-white" onClick={() => openProductPickerFor(anuncio.id)}>
                                                    Vincular produto
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-4">
                                                    <img
                                                        src={produtoVinculado.image_url ?? produtoVinculado.image_urls?.[0] ?? "/placeholder.svg"}
                                                        alt={produtoVinculado.name}
                                                        className="w-12 h-12 object-cover rounded-md"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-sm md:text-base">{produtoVinculado.name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {produtoVinculado.barcode ? `Código de Barras: ${produtoVinculado.barcode}` : '—'}
                                                        </div>
                                                    </div>
                                                    <div className="text-primary font-bold text-sm md:text-base">DEDUZIR: {anuncio.quantidade}</div>
                                                </div>
                                                <div className="text-xs text-gray-600">SKU: {produtoVinculado.sku}</div>
                                                {(() => {
                                                    const info = insufficientMap[anuncio.id];
                                                    const lack = info && info.available !== null && info.available < info.required;
                                                    const unknown = info && info.available === null;
                                                    return (
                                                        <div className={`text-xs ${lack || unknown ? 'text-red-600' : 'text-green-600'}`}>
                                                            {lack
                                                                ? `Sem estoque no armazém selecionado: disponível ${info?.available ?? 0}, solicitado ${info?.required}`
                                                                : unknown
                                                                    ? 'O produto selecionado não possui estoque, adicione e tente novamente'
                                                                    : `Estoque suficiente: disponível ${info?.available ?? 0}, solicitado ${info?.required}`}
                                                        </div>
                                                    );
                                                })()}
                                                <div className="inline-flex items-center gap-2 text-xs">
                                                    <Checkbox
                                                        id={`permanente-${anuncio.id}`}
                                                        checked={!!permanenteFlags[anuncio.id]}
                                                        onCheckedChange={(v) =>
                                                            setPermanenteFlags(prev => ({ ...prev, [anuncio.id]: Boolean(v) }))
                                                        }
                                                    />
                                                    <Label htmlFor={`permanente-${anuncio.id}`} className="text-xs">
                                                        Vincular permanente
                                                    </Label>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button variant="outline" className="text-xs" onClick={() => openProductPickerFor(anuncio.id)}>Alterar Produto</Button>
                                                    <Button variant="ghost" className="text-xs text-red-600" onClick={() => handleRemoveVinculo(anuncio.id)}>Desvincular</Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {anunciosParaVincular.length === 0 && (
                            <div className="text-sm text-gray-600">Nenhum item de anúncio para vincular.</div>
                        )}
                    </div>

                    <DialogFooter className="bg-gray-100 p-4 border-t flex justify-end">
                        <Button
                            onClick={handleSave}
                            disabled={
                                Object.keys(vinculacoes).length === 0 ||
                                (anunciosParaVincular.length > 0 && (
                                    Object.keys(vinculacoes).length < anunciosParaVincular.length ||
                                    anunciosParaVincular.some(a => !vinculacoes[a.id])
                                )) ||
                                Object.values(insufficientMap).some((v) => v.available === null || v.available < v.required)
                            }
                        >
                            <Check className="h-4 w-4 mr-2" />
                            Salvar Alterações
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ProductPickerDialog
                isOpen={isProductPickerOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        setProductPickerOpen(false);
                        setAnuncioEmSelecao(null);
                        setProdutoSelecionadoNoPicker(null);
                    }
                }}
                onConfirm={handleConfirmSelection}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                products={filteredProducts}
                selectedProductId={produtoSelecionadoNoPicker}
                onProductSelect={handleProductRowClick}
                loading={loading}
                error={error}
                canConfirm={!!produtoSelecionadoNoPicker && !!anuncioEmSelecao}
            />
        </>
    );
}
