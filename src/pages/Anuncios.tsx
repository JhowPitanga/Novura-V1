import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchMercadoLivreItems, subscribeMercadoLivreItems, syncMercadoLivreItems } from "@/WebhooksAPI/marketplace/mercado-livre/items";

// Dados de navegação para a CleanNavigation
const navigationItems = [
    { title: "Todos", path: "", description: "Visualizar todos os anúncios" },
    { title: "Ativos", path: "/ativos", description: "Anúncios ativos" },
    { title: "Pausados", path: "/pausados", description: "Anúncios pausados" },
];

// Dados simulados de anúncios - serão substituídos por dados do Supabase
// const mockAds = [ /* removido: agora usamos dados reais do banco */ ];

// Dados para o gráfico de vendas (simulados)
// const salesChartData = [ /* removido: gráfico será alimentado futuramente */ ];

export default function Anuncios() {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("todos");
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const { organizationId } = useAuth();
    const { toast } = useToast();

    const loadItems = async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const rows = await fetchMercadoLivreItems(supabase as any, organizationId);
            setItems(rows);
        } catch (e: any) {
            console.error("Erro ao buscar anúncios:", e);
            toast({ title: "Falha ao carregar anúncios", description: e?.message || "", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        if (!organizationId) {
            toast({ title: "Sessão necessária", description: "Entre na sua conta para sincronizar.", variant: "destructive" });
            return;
        }
        setSyncing(true);
        try {
            const res = await syncMercadoLivreItems(supabase as any, organizationId);
            toast({ title: "Sincronização iniciada", description: `Itens sincronizados: ${res?.synced ?? 0}` });
        } catch (e: any) {
            console.error("Erro ao sincronizar Mercado Livre:", e);
            toast({ title: "Falha na sincronização", description: e?.message || "", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    // Atualização inicial + assinatura realtime para refletir alterações automáticas
    useEffect(() => {
        if (!organizationId) return;
        // Carrega itens ao entrar na página
        loadItems();
        // Assina mudanças na tabela marketplace_items
        const { unsubscribe } = subscribeMercadoLivreItems(supabase as any, organizationId, (payload) => {
            setItems((prev) => {
                const evt = payload.eventType;
                const n = payload.new;
                const o = payload.old;
                if (evt === 'INSERT' && n) {
                    const exists = prev.some((r: any) => r.id === n.id);
                    return exists ? prev.map((r: any) => r.id === n.id ? n : r) : [n, ...prev];
                } else if (evt === 'UPDATE' && n) {
                    return prev.map((r: any) => r.id === n.id ? n : r);
                } else if (evt === 'DELETE' && o) {
                    return prev.filter((r: any) => r.id !== o.id);
                }
                return prev;
            });
        });
        return () => unsubscribe();
    }, [organizationId]);

    // Auto-sync em intervalos enquanto a página estiver aberta
    const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
    useEffect(() => {
        if (!organizationId) return;
        const id = setInterval(() => {
            if (!syncing && !loading) {
                handleSync();
            }
        }, AUTO_SYNC_INTERVAL_MS);
        return () => clearInterval(id);
    }, [organizationId, syncing, loading]);

    const parsedAds = items.map((row) => {
        const pics = Array.isArray(row?.pictures) ? row.pictures : [];
        const firstPic = Array.isArray(pics) && pics.length > 0 ? (typeof pics[0] === 'string' ? pics[0] : (pics[0]?.url || "/placeholder.svg")) : (row?.thumbnail || "/placeholder.svg");
        return {
            id: row?.marketplace_item_id || row?.id,
            title: row?.title || "Sem título",
            sku: row?.sku || "",
            marketplace: row?.marketplace_name || "Mercado Livre",
            price: typeof row?.price === 'number' ? row.price : (Number(row?.price) || 0),
            promoPrice: null,
            status: row?.status || "",
            visits: 0,
            questions: 0,
            sales: typeof row?.sold_quantity === 'number' ? row.sold_quantity : (Number(row?.sold_quantity) || 0),
            stock: typeof row?.available_quantity === 'number' ? row.available_quantity : (Number(row?.available_quantity) || 0),
            marketplaceId: row?.marketplace_item_id || "",
            image: firstPic || "/placeholder.svg",
            shipping: [],
            quality: 0,
            margin: 0,
        };
    });

    const filteredAds = parsedAds
        .filter(ad => {
            if (activeTab === "ativos") return ad.status?.toLowerCase() === "active";
            if (activeTab === "pausados") return ad.status?.toLowerCase() === "paused";
            return true;
        })
        .filter(ad => {
            const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.marketplaceId.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSearch;
        });

    const getMarketplaceColor = (marketplace: string) => {
        switch (marketplace) {
            case "Mercado Livre":
                return "bg-yellow-500";
            default:
                return "bg-gray-500";
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        console.log("Copiado: ", text);
    };

    // Adiciona botão de Sincronizar junto aos controles
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
                                    <Button onClick={handleSync} disabled={syncing || loading} className="bg-novura-primary hover:bg-novura-primary/90">
                                        {syncing ? "Sincronizando..." : "Sincronizar"}
                                    </Button>
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
                                                                        <span className="text-gray-500">SKU:</span>
                                                                        <span className="font-medium">{ad.sku || '—'}</span>
                                                                    </div>
                                                                    <div className="flex items-center space-x-1">
                                                                        <span className="text-gray-500">ID:</span>
                                                                        <span className="font-medium">{ad.marketplaceId}</span>
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
                                                                <span className="font-bold text-lg text-gray-900">{ad.quality}</span>
                                                                <span className="text-xs text-gray-500">Qualidade</span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <DollarSign className="w-5 h-5 text-novura-primary" />
                                                                <span className="font-bold text-lg text-gray-900">{ad.margin}%</span>
                                                                <span className="text-xs text-gray-500">Margem</span>
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
