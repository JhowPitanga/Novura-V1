import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, ShoppingCart, Search, Link } from "lucide-react"; 
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SuccessModal } from "@/components/recursos/SuccessModal";
import { ProductGrid } from "@/components/recursos/ProductGrid";
import { CategoryFilter } from "@/components/recursos/CategoryFilter";
import { CartDrawer } from "@/components/recursos/CartDrawer";
import { PurchasesTab } from "@/components/recursos/PurchasesTab";
import { RecurringPurchaseModal } from "@/components/recursos/RecurringPurchaseModal";
import { ShopBanner } from "@/components/recursos/ShopBanner";
import { ModernTabs } from "@/components/recursos/ModernTabs";
// NOVOS Componentes (Mockados - precisam ser implementados)
import { ProductDetailModal } from "@/components/recursos/ProductModal";
import { ProductCarousel } from "@/components/recursos/ProductCarousel"; 


// --- DADOS MOCKADOS (Aprimorados para Marketplace) ---

// Interface de produto unificada
interface Product {
    id: number;
    nome: string;
    preco: number;
    categoria: string;
    image: string;
    descricao: string;
    estoque: number;
    rating?: number; 
    avaliacoes?: any[]; 
}

const mockReviews = [
    { id: 1, autor: "Seller Alpha", rating: 5, comentario: "Produto excelente e entrega super rápida. Recomendo o vendedor!" },
    { id: 2, autor: "Logística Beta", rating: 4, comentario: "Fita de boa qualidade, mas a embalagem poderia ser melhor." },
    { id: 3, autor: "E-commerce Gamma", rating: 5, comentario: "Compra recorrente. Sempre atende minhas expectativas." },
];

const categorias = [
    { id: "fitas", nome: "Fitas", count: 24, icon: "📦" },
    { id: "embalagens", nome: "Embalagens", count: 45, icon: "✉️" },
    { id: "impressoras", nome: "Impressoras", count: 12, icon: "🖨️" },
    { id: "etiquetas", nome: "Etiquetas", count: 18, icon: "🏷️" },
];

const produtos: Record<string, Product[]> = {
    fitas: [
        { id: 1, nome: "Fita Adesiva Transparente 48mm", preco: 12.90, categoria: "fitas", image: "/placeholder.svg", descricao: "Fita transparente de alta aderência, 48mm x 100m. Vendedor: Embalagens Express.", estoque: 50, rating: 4.8, avaliacoes: mockReviews },
        { id: 2, nome: "Fita Dupla Face 12mm", preco: 8.50, categoria: "fitas", image: "/placeholder.svg", descricao: "Fita dupla face 12mm x 30m, perfeita para fixações leves.", estoque: 30, rating: 4.2, avaliacoes: mockReviews },
        { id: 3, nome: "Fita Kraft 48mm", preco: 15.90, categoria: "fitas", image: "/placeholder.svg", descricao: "Fita kraft marrom, ecologicamente correta. 48mm x 50m.", estoque: 25, rating: 4.5, avaliacoes: mockReviews },
        { id: 4, nome: "Fita de Segurança VOID", preco: 25.90, categoria: "fitas", image: "/placeholder.svg", descricao: "Fita de segurança que deixa marca 'VOID' ao ser removida.", estoque: 15, rating: 4.9, avaliacoes: mockReviews },
    ],
    embalagens: [
        { id: 5, nome: "Envelope Plástico 26x36cm", preco: 0.45, categoria: "embalagens", image: "/placeholder.svg", descricao: "Envelope plástico com aba adesiva, resistente e leve.", estoque: 1000, rating: 4.7, avaliacoes: mockReviews },
        { id: 6, nome: "Caixa de Papelão 16x11x6cm", preco: 1.20, categoria: "embalagens", image: "/placeholder.svg", descricao: "Caixa de papelão ondulado, tamanho P, fácil de montar.", estoque: 500, rating: 4.3, avaliacoes: mockReviews },
        { id: 7, nome: "Envelope Kraft 19x25cm", preco: 0.35, categoria: "embalagens", image: "/placeholder.svg", descricao: "Envelope kraft com bolha, proteção extra para itens frágeis.", estoque: 800, rating: 4.6, avaliacoes: mockReviews },
        { id: 8, nome: "Caixa de Papelão 27x18x9cm", preco: 2.10, categoria: "embalagens", image: "/placeholder.svg", descricao: "Caixa média para envios, suporta até 5kg.", estoque: 300, rating: 4.1, avaliacoes: mockReviews },
    ],
    impressoras: [
        { id: 9, nome: "Zebra GK420T", preco: 1299.99, categoria: "impressoras", image: "/placeholder.svg", descricao: "Impressora térmica de etiquetas de alto desempenho.", estoque: 5, rating: 4.9, avaliacoes: mockReviews },
        { id: 10, nome: "Zebra ZD230", preco: 899.99, categoria: "impressoras", image: "/placeholder.svg", descricao: "Impressora térmica direta, ideal para pequenos volumes.", estoque: 8, rating: 4.0, avaliacoes: mockReviews },
        { id: 11, nome: "Zebra GC420T", preco: 1150.00, categoria: "impressoras", image: "/placeholder.svg", descricao: "Impressora térmica compacta e confiável, para uso geral.", estoque: 3, rating: 4.5, avaliacoes: mockReviews },
        { id: 12, nome: "Zebra ZD421", preco: 1599.99, categoria: "impressoras", image: "/placeholder.svg", descricao: "Impressora térmica avançada com tela LCD.", estoque: 4, rating: 4.7, avaliacoes: mockReviews },
    ],
    etiquetas: [
        { id: 13, nome: "Etiqueta Térmica 100x50mm", preco: 35.90, categoria: "etiquetas", image: "/placeholder.svg", descricao: "Rolo com 1000 etiquetas, compatível com as principais impressoras.", estoque: 100, rating: 4.8, avaliacoes: mockReviews },
        { id: 14, nome: "Etiqueta Adesiva 60x40mm", preco: 22.50, categoria: "etiquetas", image: "/placeholder.svg", descricao: "Etiquetas brancas adesivas, para uso geral e código de barras.", estoque: 150, rating: 4.2, avaliacoes: mockReviews },
        { id: 15, nome: "Etiqueta Código de Barras", preco: 45.00, categoria: "etiquetas", image: "/placeholder.svg", descricao: "Etiquetas pré-impressas para controle de estoque.", estoque: 80, rating: 4.6, avaliacoes: mockReviews },
        { id: 16, nome: "Etiqueta Térmica 80x60mm", preco: 28.90, categoria: "etiquetas", image: "/placeholder.svg", descricao: "Rolo com 500 etiquetas, ideal para informações detalhadas.", estoque: 120, rating: 4.4, avaliacoes: mockReviews },
    ],
};

const comprasRealizadas = [
    // ... (Mantido como no original)
];

const enderecos = [
    {
        id: "endereco1",
        tipo: "Escritório Principal",
        endereco: "Rua das Flores, 123 - Centro",
        cidade: "São Paulo, SP - 01234-567"
    },
    {
        id: "endereco2",
        tipo: "Depósito",
        endereco: "Av. Industrial, 500 - Distrito Industrial",
        cidade: "São Paulo, SP - 08500-000"
    }
];

const meiosPagamento = [
    { id: "stripe", nome: "Cartão de Crédito (via Stripe)", ativo: true },
    { id: "pix", nome: "PIX", ativo: true },
    { id: "boleto", nome: "Boleto Bancário", ativo: false },
];


const RecursosSeller = () => {
    // --- ESTADOS DE PRODUTOS E CARRINHO ---
    const [categoriaAtiva, setCategoriaAtiva] = useState("fitas");
    const [searchTerm, setSearchTerm] = useState("");
    const [carrinho, setCarrinho] = useState<Product[]>([]);
    
    // --- ESTADOS DE FLUXO DE COMPRA ---
    const [carrinhoOpen, setCarrinhoOpen] = useState(false);
    const [stepAtual, setStepAtual] = useState(0); // 0: Carrinho, 1: Endereço, 2: Pagamento
    const [enderecoSelecionado, setEnderecoSelecionado] = useState("endereco1");
    const [pagamentoSelecionado, setPagamentoSelecionado] = useState("stripe");
    const [activeTab, setActiveTab] = useState("produtos");

    // --- ESTADOS DE MODAIS ---
    const [successModalOpen, setSuccessModalOpen] = useState(false);
    const [recurringModalOpen, setRecurringModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [productModalOpen, setProductModalOpen] = useState(false);

    // --- LÓGICA DE DADOS DERIVADOS ---
    // Filtra produtos na aba "produtos"
    const produtosCategoria = produtos[categoriaAtiva] || [];
    
    // Filtra todos os produtos quando a busca está ativa (comportamento de marketplace)
    const filteredProducts = searchTerm 
        ? Object.values(produtos).flat().filter(produto =>
            produto.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            produto.descricao.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : produtosCategoria;
    
    // Produtos para o carrossel (ex: 8 produtos mais vendidos no geral)
    const produtosEmDestaque = Object.values(produtos).flat().sort(() => 0.5 - Math.random()).slice(0, 8);
    const hasEtiquetasInCart = carrinho.some(item => item.categoria === "etiquetas");

    // --- MANIPULADORES DE EVENTO ---

    // Abre o modal de detalhes do produto
    const handleProductClick = (produto: Product) => {
        setSelectedProduct(produto);
        setProductModalOpen(true);
    };
    
    // Adiciona o produto ao carrinho e abre o Drawer
    const adicionarAoCarrinho = (produto: Product) => {
        const itemExistente = carrinho.find(item => item.id === produto.id);
        if (itemExistente) {
            setCarrinho(carrinho.map(item => 
                item.id === produto.id 
                  ? { ...item, quantidade: (item as any).quantidade + 1 }
                  : item
            ));
        } else {
            setCarrinho([...carrinho, { ...produto, quantidade: 1 } as Product]);
        }
        setCarrinhoOpen(true); // Abre o drawer de compra rápida após adicionar
        setProductModalOpen(false); // Fecha o modal de detalhe
    };

    // Atualiza a quantidade de itens no carrinho
    const updateQuantidade = (id: number, delta: number) => {
        setCarrinho(carrinho.map(item => 
          item.id === id 
            ? { ...item, quantidade: Math.max(0, (item as any).quantidade + delta) }
            : item
        ).filter(item => (item as any).quantidade > 0));
    };

    // Finaliza a compra (Simula a integração Stripe e abre o modal de sucesso)
    const finalizarCompra = () => {
        setSuccessModalOpen(true);
        setCarrinhoOpen(false);
        setCarrinho([]);
        setStepAtual(0);
    };


    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />

                    <main className="flex-1 overflow-auto">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
                            {/* ModernTabs com cor roxa para destaque */}
                            <ModernTabs 
                                value={activeTab} 
                                onValueChange={setActiveTab}
                                tabs={[
                                    { value: "produtos", label: "Marketplace de Insumos", icon: <ShoppingBag className="w-4 h-4" /> },
                                    { value: "compras", label: "Minhas Compras", icon: <Link className="w-4 h-4" /> } 
                                ]}
                                className="bg-white border-b sticky top-0 z-10"
                            />

                            <TabsContent value="produtos" className="p-6 space-y-8">
                                
                                {/* 1. Shop Banner - Destaque Principal (Roxo) */}
                                <ShopBanner 
                                    title="Seu Galpão Nunca Mais Para!"
                                    subtitle="Insumos para e-commerce com preço e prazo de quem entende de logística."
                                    buttonText="Compre com 20% OFF"
                                    className="bg-purple-600 hover:bg-purple-700 text-white" 
                                />

                                {/* 2. Carrossel - Produtos em Destaque */}
                                <section>
                                    <h2 className="text-xl font-semibold mb-4 text-gray-800">🔥 Ofertas da Semana</h2>
                                    <ProductCarousel 
                                        products={produtosEmDestaque} 
                                        onProductClick={handleProductClick} 
                                    />
                                </section>
                                
                                <hr className="border-gray-200" />
                                
                                <div className="flex flex-col lg:flex-row gap-6">
                                    {/* Filtro de Categorias */}
                                    <div className="w-full lg:w-64 flex-shrink-0">
                                         <CategoryFilter
                                            categories={categorias}
                                            activeCategory={categoriaAtiva}
                                            onCategoryChange={setCategoriaAtiva}
                                            className="bg-white p-4 rounded-lg shadow-sm sticky top-20"
                                        />
                                    </div>

                                    {/* Conteúdo da Busca e Grid de Produtos */}
                                    <div className="flex-1">
                                        {/* Search Bar */}
                                        <div className="relative mb-6 max-w-xl">
                                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                            <Input
                                                placeholder={`Buscar em ${searchTerm ? "todos os insumos" : categoriaAtiva}...`}
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10 h-12 text-base border-2 border-gray-300 focus:border-purple-600 focus:ring-purple-600 rounded-lg shadow-sm"
                                            />
                                        </div>

                                        <h2 className="text-2xl font-bold mb-4 text-gray-800">
                                            {searchTerm ? `Resultados para "${searchTerm}"` : categoriaAtiva.charAt(0).toUpperCase() + categoriaAtiva.slice(1)}
                                            <Badge variant="secondary" className="ml-3 text-sm font-medium bg-purple-100 text-purple-700">
                                                {filteredProducts.length} Produtos
                                            </Badge>
                                        </h2>

                                        {/* Products Grid (com clique para abrir o Modal) */}
                                        <ProductGrid
                                            products={filteredProducts}
                                            onAddToCart={adicionarAoCarrinho}
                                            onProductClick={handleProductClick} // Manipulador para abrir o modal
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="compras" className="p-6">
                                <PurchasesTab purchases={comprasRealizadas} />
                            </TabsContent>
                        </Tabs>
                    </main>
                    
                    {/* Botão flutuante do carrinho */}
                    {carrinho.length > 0 && (
                        <Button
                            className="fixed bottom-6 right-6 p-4 rounded-full shadow-xl bg-purple-600 hover:bg-purple-700 transition-all duration-300 z-50"
                            onClick={() => {
                                setCarrinhoOpen(true);
                                setStepAtual(0); 
                            }}
                        >
                            <ShoppingCart className="w-6 h-6 mr-2" />
                            <span className="font-semibold text-lg">{carrinho.length} Item(s)</span>
                        </Button>
                    )}

                </div>
            </div>

            {/* --- MODAIS E DRAWERS DE FLUXO --- */}

            {/* 1. Product Detail Modal (Visualização detalhada do produto) */}
            <ProductDetailModal
                open={productModalOpen}
                onOpenChange={setProductModalOpen}
                product={selectedProduct}
                onAddToCart={adicionarAoCarrinho}
            />

            {/* 2. Cart Drawer (Fluxo de Compra Rápida de 3 Passos) */}
            <CartDrawer
                open={carrinhoOpen}
                onOpenChange={setCarrinhoOpen}
                cartItems={carrinho}
                currentStep={stepAtual}
                addresses={enderecos}
                paymentMethods={meiosPagamento}
                selectedAddress={enderecoSelecionado}
                selectedPayment={pagamentoSelecionado}
                onStepChange={setStepAtual}
                onUpdateQuantity={updateQuantidade}
                onAddressChange={setEnderecoSelecionado}
                onPaymentChange={setPagamentoSelecionado}
                onFinalizePurchase={finalizarCompra}
                hasEtiquetas={hasEtiquetasInCart}
                onOpenRecurringModal={() => setRecurringModalOpen(true)}
            />

            {/* 3. Modais de Confirmação e Recorrência */}
            <SuccessModal open={successModalOpen} onOpenChange={setSuccessModalOpen} />
            <RecurringPurchaseModal open={recurringModalOpen} onOpenChange={setRecurringModalOpen} />
        </SidebarProvider>
    );
};

export default RecursosSeller;