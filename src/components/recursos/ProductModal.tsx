import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";

// Defina a interface Product (idealmente importada de um arquivo de types)
interface Product {
    id: number;
    nome: string;
    preco: number;
    image: string;
    descricao: string;
    estoque: number;
    rating?: number;
    avaliacoes?: any[];
}

interface ProductDetailModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: Product | null;
    onAddToCart: (product: Product) => void;
}

export function ProductDetailModal({ open, onOpenChange, product, onAddToCart }: ProductDetailModalProps) {
    if (!product) return null;

    const handleAddToCart = () => {
        onAddToCart(product);
        onOpenChange(false); // Fecha o modal após adicionar ao carrinho
    };

    return (
        // O Dialog é o seu componente Modal
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">{product.nome}</DialogTitle>
                </DialogHeader>

                <div className="grid md:grid-cols-2 gap-6 p-4">
                    {/* Imagem do Produto */}
                    <div className="flex flex-col items-center">
                        <img 
                            src={product.image} 
                            alt={product.nome} 
                            className="w-full h-auto object-cover rounded-lg border"
                        />
                        {/* Exibir avaliações aqui futuramente */}
                    </div>

                    {/* Detalhes do Produto */}
                    <div className="space-y-4">
                        <p className="text-3xl font-bold text-purple-600">
                            R$ {product.preco.toFixed(2)}
                        </p>
                        <p className="text-gray-600">{product.descricao}</p>
                        
                        <div className="space-y-2 pt-4 border-t">
                            <p className="text-sm font-medium">Estoque: <span className="text-green-600 font-semibold">{product.estoque} unidades</span></p>
                            {/* Detalhes do Vendedor (a ser implementado) */}
                            <p className="text-sm text-gray-500">Vendido por: <span className="font-semibold text-purple-600">Seller X</span></p>
                        </div>
                        
                        <Button 
                            onClick={handleAddToCart}
                            disabled={product.estoque === 0}
                            className="w-full bg-purple-600 hover:bg-purple-700 mt-6"
                        >
                            <ShoppingCart className="w-4 h-4 mr-2" />
                            {product.estoque > 0 ? "Comprar / Adicionar ao Carrinho" : "Produto Esgotado"}
                        </Button>
                    </div>
                </div>
                
                {/* Seção de Avaliações (Mockadas) */}
                <div className="mt-6 border-t pt-4">
                    <h3 className="text-xl font-semibold mb-3">Avaliações de Clientes</h3>
                    {(product.avaliacoes && product.avaliacoes.length > 0) ? (
                        <p className="text-gray-500">Visualizar {product.avaliacoes.length} avaliações.</p> // Substituir por renderização real
                    ) : (
                        <p className="text-gray-500">Ainda não há avaliações para este produto.</p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}