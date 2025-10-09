import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Truck } from "lucide-react";

// Removendo ProductModal e o estado interno. O componente pai (RecursosSeller) gerenciará o modal.
// import { ProductModal } from "./ProductModal"; 

// A interface Product deve ser importada ou definida em um arquivo de tipos (typings.ts/types.d.ts)
// Mantendo a definição aqui para que o componente seja auto-contido.
interface Product {
    id: number;
    nome: string;
    preco: number;
    categoria: string;
    image: string;
    descricao: string;
    estoque: number;
    rating?: number; // Adicionado para aprimoramento futuro
    avaliacoes?: any[]; // Adicionado para aprimoramento futuro
    vendas?: number;
}

interface ProductGridProps {
    products: Product[];
    onAddToCart: (product: Product) => void;
    // NOVO: Adicionamos esta prop para que o componente pai lide com a abertura do modal
    onProductClick: (product: Product) => void; 
}

export function ProductGrid({ products, onAddToCart, onProductClick }: ProductGridProps) {
    // ESTADOS DE MODAL REMOVIDOS. A lógica de modal é gerenciada pelo componente pai.

    // A cor roxa deve ser substituída por 'bg-purple-600' se 'novura-primary' não estiver definido no Tailwind.config
    // Estou mantendo 'novura-primary' por enquanto, mas adicionei comentários para clareza.
    const PRIMARY_COLOR_CLASS = "bg-purple-600 hover:bg-purple-700";
    const PRIMARY_TEXT_CLASS = "text-purple-600";


    const getProductTags = (product: Product) => {
        const tags = [];
        
        // Envio rápido para etiquetas e fitas
        if (product.categoria === "etiquetas" || product.categoria === "fitas") {
            tags.push({ text: "Envio Rápido", variant: "blue" });
        }
        
        // Frete grátis para produtos acima de R$ 100 (Aumentei o valor para ser mais premium)
        if (product.preco * 5 > 100) { // Exemplo: 5 unidades garantem frete grátis
            tags.push({ text: "Frete Grátis", variant: "purple" });
        }
        
        // Oferta
        if (product.preco < 20) {
            tags.push({ text: "OFERTA", variant: "orange" });
        }
        
        return tags;
    };

    return (
        // Grid com responsividade típica de marketplace
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-6">
            {products.map((produto) => {
                const tags = getProductTags(produto);
                return (
                    // Card com foco no clique para detalhe
                    <Card 
                        key={produto.id} 
                        className="overflow-hidden hover:shadow-xl transition-all duration-300 group cursor-pointer"
                    >
                        {/* Área de Imagem (CLIQUE AQUI PARA DETALHES) */}
                        <div 
                            className="aspect-square overflow-hidden relative"
                            onClick={() => onProductClick(produto)} // CLIQUE ABRIRÁ O MODAL NO COMPONENTE PAI
                        >
                            <img 
                                src={produto.image} 
                                alt={produto.nome}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            {/* Tags de Destaque */}
                            {tags.length > 0 && (
                                <div className="absolute top-2 left-2 flex flex-col gap-1">
                                    {tags.map((tag, index) => (
                                        <Badge 
                                            key={index}
                                            className={`text-xs font-semibold px-2 py-0.5 shadow-md ${
                                                tag.variant === "blue" ? "bg-blue-600 text-white hover:bg-blue-700" :
                                                tag.variant === "purple" ? PRIMARY_COLOR_CLASS + " text-white" :
                                                "bg-orange-500 text-white hover:bg-orange-600"
                                            }`}
                                        >
                                            {tag.variant === "blue" && <Truck className="w-3 h-3 mr-1" />}
                                            {tag.text}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <CardHeader className="p-3 pb-1">
                            {/* Título: Menor para caber mais na grade */}
                            <CardTitle 
                                className={`text-sm font-semibold truncate hover:${PRIMARY_TEXT_CLASS}`}
                                onClick={() => onProductClick(produto)}
                            >
                                {produto.nome}
                            </CardTitle>
                            {/* Preço com Destaque da Cor Roxa */}
                            <span className={`text-xl font-extrabold ${PRIMARY_TEXT_CLASS}`}>
                                R$ {produto.preco.toFixed(2)}
                            </span>
                            
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className="flex items-center justify-between mb-2">
                                {/* Informação de estoque discreta */}
                                <Badge 
                                    variant="outline" 
                                    className={`text-xs border-dashed ${produto.estoque > 0 ? "text-green-600 border-green-300" : "text-red-600 border-red-300"}`}
                                >
                                    {produto.estoque > 0 ? `${produto.estoque} em estoque` : "Esgotado"}
                                </Badge>
                                {/* Aqui poderia ir o Rating (Star component) */}
                            </div>

                            {/* Botão de Adicionar ao Carrinho (Roxo) */}
                            <Button 
                                onClick={(e) => {
                                    e.stopPropagation(); // Evita que o clique no botão ative o onProductClick do Card
                                    onAddToCart(produto);
                                }}
                                size="sm"
                                className={`w-full ${PRIMARY_COLOR_CLASS} transition-colors`}
                                disabled={produto.estoque === 0}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                {produto.estoque > 0 ? "Adicionar ao Carrinho" : "Avisar-me"}
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}