import { useState } from "react";
import { Plus, Search, Filter, ExternalLink, Edit, Pause, Play, TrendingUp, Eye, BarChart, ShoppingCart, Percent, Copy, MoreHorizontal, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { GlobalHeader } from "@/components/GlobalHeader";

// Dados de navegação para a CleanNavigation
const navigationItems = [
    { title: "Todos", path: "", description: "Visualizar todos os anúncios" },
    { title: "Ativos", path: "/ativos", description: "Anúncios ativos" },
    { title: "Pausados", path: "/pausados", description: "Anúncios pausados" },
];

// Dados simulados de anúncios - serão substituídos por dados do Supabase
const mockAds = [
    {
        id: 1,
        title: "Smartphone Galaxy S24 Ultra",
        sku: "SM-S24U-001",
        marketplace: "Mercado Livre",
        price: 4999.99,
        promoPrice: 4799.99,
        status: "Ativo",
        visits: 1245,
        questions: 8,
        sales: 23,
        stock: 15,
        marketplaceId: "MLB123456789",
        image: "/placeholder.svg",
        shipping: ["Flex", "Full"],
        quality: 93,
        margin: 25.50
    },
    {
        id: 2,
        title: "Notebook Dell Inspiron 15",
        sku: "NB-DEL-002",
        marketplace: "Amazon",
        price: 3299.99,
        promoPrice: null,
        status: "Pausado",
        visits: 892,
        questions: 3,
        sales: 12,
        stock: 8,
        marketplaceId: "ASIN-B08N5WRWNW",
        image: "/placeholder.svg",
        shipping: ["Envio Padrão"],
        quality: 78,
        margin: 15.20
    },
    {
        id: 3,
        title: "Fone JBL Tune 720BT",
        sku: "FN-JBL-003",
        marketplace: "Shopee",
        price: 289.99,
        promoPrice: 259.99,
        status: "Ativo",
        visits: 567,
        questions: 12,
        sales: 45,
        stock: 32,
        marketplaceId: "SPE789123456",
        image: "/placeholder.svg",
        shipping: ["Correios"],
        quality: 98,
        margin: 30.15
    },
];

// Dados para o gráfico de vendas (simulados)
const salesChartData = [
    { name: 'Jan', ML: 65, Amazon: 45, Shopee: 25 },
    { name: 'Fev', ML: 59, Amazon: 52, Shopee: 30 },
    { name: 'Mar', ML: 80, Amazon: 48, Shopee: 35 },
    { name: 'Abr', ML: 81, Amazon: 55, Shopee: 40 },
    { name: 'Mai', ML: 56, Amazon: 60, Shopee: 45 },
    { name: 'Jun', ML: 55, Amazon: 58, Shopee: 50 },
];

export default function Anuncios() {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("todos");

    const filteredAds = mockAds
        .filter(ad => {
            if (activeTab === "ativos" && ad.status !== "Ativo") return false;
            if (activeTab === "pausados" && ad.status !== "Pausado") return false;
            return true;
        })
        .filter(ad => {
            const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.marketplaceId.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSearch;
        });

    const getMarketplaceColor = (marketplace: string) => {
        const colors = {
            "Mercado Livre": "bg-yellow-500",
            "Amazon": "bg-orange-500",
            "Shopee": "bg-red-500",
            "Magazine Luiza": "bg-blue-500",
            "Casas Bahia": "bg-purple-500"
        };
        return colors[marketplace as keyof typeof colors] || "bg-gray-500";
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Implementar um toast para feedback do usuário
        console.log("Copiado: ", text);
    };

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />

                    <CleanNavigation items={navigationItems} basePath="/anuncios" />

                    <main className="flex-1 overflow-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900">Gestão de Anúncios</h1>
                                    <p className="text-gray-600">Monitore e gerencie seus anúncios em todos os marketplaces</p>
                                </div>
                                <Button className="bg-novura-primary hover:bg-novura-primary/90">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Novo Anúncio
                                </Button>
                            </div>

                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center space-x-4">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <Input
                                            placeholder="Buscar por título, SKU ou ID do anúncio..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="pl-10 min-w-[300px]"
                                        />
                                    </div>
                                    <Button variant="outline" size="sm">
                                        <Filter className="w-4 h-4 mr-2" />
                                        Filtros
                                    </Button>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button variant="outline">Alterar em Massa</Button>
                                    <Button variant="outline">Gerar Relatório</Button>
                                </div>
                            </div>

                            <Tabs defaultValue="todos" className="w-full" onValueChange={setActiveTab}>
                                <TabsList>
                                    <TabsTrigger value="todos">Todos</TabsTrigger>
                                    <TabsTrigger value="ativos">Ativos</TabsTrigger>
                                    <TabsTrigger value="pausados">Pausados</TabsTrigger>
                                </TabsList>
                            </Tabs>

                            <Card className="mt-6">
                                <CardContent className="p-0">
                                    <div className="space-y-4">
                                        {filteredAds.length > 0 ? (
                                            filteredAds.map((ad) => (
                                                <div key={ad.id} className="grid grid-cols-5 gap-4 items-center p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                                                    
                                                    {/* Coluna do Anúncio */}
                                                    <div className="flex items-start space-x-4">
                                                        <img
                                                            src={ad.image}
                                                            alt={ad.title}
                                                            className="w-24 h-24 rounded-lg object-cover bg-gray-100"
                                                        />
                                                        <div className="flex flex-col h-full justify-between">
                                                            <div>
                                                                <h3 className="font-semibold text-lg text-gray-900 line-clamp-2">{ad.title}</h3>
                                                                <div className="mt-2 text-sm text-gray-500">
                                                                    <div className="flex items-center space-x-1">
                                                                        <span>ID: {ad.marketplaceId}</span>
                                                                        <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copyToClipboard(ad.marketplaceId)}>
                                                                            <Copy className="w-3 h-3 text-gray-400" />
                                                                        </Button>
                                                                    </div>
                                                                    <div className="flex items-center space-x-1">
                                                                        <span>SKU: {ad.sku}</span>
                                                                        <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copyToClipboard(ad.sku)}>
                                                                            <Copy className="w-3 h-3 text-gray-400" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Coluna de Preço */}
                                                    <div className="flex flex-col items-center space-y-1 justify-center">
                                                        <div className="text-2xl font-bold text-gray-900">
                                                            R$ {ad.price.toFixed(2)}
                                                        </div>
                                                        {ad.promoPrice && (
                                                            <>
                                                                <div className="text-lg text-gray-600 font-semibold line-through">
                                                                    R$ {ad.promoPrice.toFixed(2)}
                                                                </div>
                                                                <Button variant="link" className="p-0 h-auto text-sm text-novura-primary">Ver promoções</Button>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Coluna de Envio */}
                                                    <div className="flex flex-col items-center space-y-2 justify-center">
                                                        <Badge className={`${getMarketplaceColor(ad.marketplace)} text-white text-xs px-2`}>
                                                            {ad.marketplace}
                                                        </Badge>
                                                        {ad.shipping && ad.shipping.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {ad.shipping.map((method, index) => (
                                                                    <Badge key={index} variant="secondary" className="font-medium text-xs bg-gray-100 text-gray-700">
                                                                        {method}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-gray-500">N/A</span>
                                                        )}
                                                    </div>

                                                    {/* Coluna de Métricas */}
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="flex flex-col items-center">
                                                                <BarChart className="w-5 h-5 text-novura-primary" />
                                                                <span className="font-bold text-lg text-gray-900">{ad.visits}</span>
                                                                <span className="text-xs text-gray-500">Visitas</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <ShoppingCart className="w-5 h-5 text-novura-primary" />
                                                                <span className="font-bold text-lg text-gray-900">{ad.sales}</span>
                                                                <span className="text-xs text-gray-500">Vendas</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <Percent className="w-5 h-5 text-novura-primary" />
                                                                <span className="font-bold text-lg text-gray-900">{((ad.sales / ad.visits) * 100).toFixed(1)}%</span>
                                                                <span className="text-xs text-gray-500">Conversão</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <DollarSign className="w-5 h-5 text-novura-primary" />
                                                                <span className="font-bold text-lg text-gray-900">{ad.margin}%</span>
                                                                <span className="text-xs text-gray-500">Margem</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Coluna de Qualidade e Ações */}
                                                    <div className="flex flex-col items-center justify-center">
                                                        <div className="flex items-center space-x-2">
                                                            <div className="relative w-12 h-12 flex items-center justify-center">
                                                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                                                    <path className="text-gray-200" d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="100" strokeDashoffset="0"></path>
                                                                    <path className={`text-novura-primary transition-all duration-500`} d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="100" strokeDashoffset={100 - ad.quality}></path>
                                                                </svg>
                                                                <span className="absolute text-sm font-bold text-gray-800">{ad.quality}</span>
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                <p className="font-semibold">Qualidade</p>
                                                                <p>{ad.quality > 90 ? "Profissional" : ad.quality > 70 ? "Boa" : "Regular"}</p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon">
                                                                        <MoreHorizontal className="w-5 h-5" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent>
                                                                    <DropdownMenuItem>
                                                                        <ExternalLink className="w-4 h-4 mr-2" /> Ver no Marketplace
                                                                    </DropdownMenuItem>
                                                                    <Drawer>
                                                                        <DrawerTrigger asChild>
                                                                            <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                                                                <TrendingUp className="w-4 h-4 mr-2" /> Desempenho
                                                                            </DropdownMenuItem>
                                                                        </DrawerTrigger>
                                                                        <DrawerContent>
                                                                            {/* Conteúdo da Drawer de Desempenho */}
                                                                        </DrawerContent>
                                                                    </Drawer>
                                                                    <DropdownMenuItem>
                                                                        <Copy className="w-4 h-4 mr-2" /> Duplicar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem>
                                                                        <Edit className="w-4 h-4 mr-2" /> Editar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem>
                                                                        {ad.status === "Ativo" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                                                                        {ad.status === "Ativo" ? "Pausar" : "Ativar"}
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-10 text-center text-gray-500">
                                                Nenhum anúncio encontrado.
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
