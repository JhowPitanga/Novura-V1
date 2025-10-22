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
import { fetchMercadoLivreItems, subscribeMercadoLivreItems, syncMercadoLivreItems, fetchMercadoLivreQuality } from "@/WebhooksAPI/marketplace/mercado-livre/items";

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
    const [qualityById, setQualityById] = useState<Record<string, { score: number; level: string | null }>>({});

    const loadItems = async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const rows = await fetchMercadoLivreItems(supabase as any, organizationId);
            setItems(rows);
            // Fetch quality from Mercado Livre for current items
            const ids = rows.map((r: any) => r?.marketplace_item_id || r?.id).filter(Boolean);
            if (ids.length) {
                try {
                    const qual = await fetchMercadoLivreQuality(supabase as any, ids);
                    setQualityById(qual);
                    // Persistir no banco para uso futuro e relatórios
                    const nowIso = new Date().toISOString();
                    for (const [itmId, qObj] of Object.entries(qual)) {
                        try {
                            await (supabase as any)
                              .from('marketplace_items')
                              .update({ listing_quality: (qObj as any)?.score ?? null, quality_level: (qObj as any)?.level ?? null, last_quality_update: nowIso })
                              .eq('marketplace_item_id', itmId);
                        } catch {}
                    }
                } catch (e) {
                    console.warn('Falha ao buscar qualidade ML:', e);
                }
            }
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
        // SKU derivado de variations
        let derivedSku = row?.sku || "";
        if (!derivedSku && Array.isArray(row?.variations) && row.variations.length > 0) {
            const bySellerSku = row.variations.find((v: any) => v?.seller_sku);
            if (bySellerSku?.seller_sku) derivedSku = bySellerSku.seller_sku;
            else {
                const withAttr = row.variations.find((v: any) => Array.isArray(v?.attribute_combinations));
                const skuAttr = withAttr?.attribute_combinations?.find((a: any) => a?.id === 'SELLER_SKU' || a?.name?.toUpperCase() === 'SKU');
                if (skuAttr?.value_name) derivedSku = skuAttr.value_name;
            }
        }
        // Preços e promoção
        const priceNum = typeof row?.price === 'number' ? row.price : (Number(row?.price) || 0);
        const originalPrice = Number(row?.original_price) || null;
        const hasPromo = !!originalPrice && originalPrice > priceNum;
        const promoPrice = hasPromo ? priceNum : null;
        // Envio (do banco)
        const shippingMethods = Array.isArray(row?.shipping) ? row.shipping
          : Array.isArray(row?.shipping_methods) ? row.shipping_methods.map((m: any) => m?.name || m)
          : [];
        // Qualidade (estimativa)
        const qualityVal = typeof row?.quality === 'number' ? row.quality : (Number(row?.listing_quality) || Number(row?.quality_score) || 0);

        const idVal = row?.marketplace_item_id || row?.id;
        const qualityObj = qualityById[idVal] ?? null;

        return {
            id: idVal,
            title: row?.title || "Sem título",
            sku: derivedSku,
            marketplace: row?.marketplace_name || "Mercado Livre",
            price: priceNum,
            originalPrice: hasPromo ? originalPrice : null,
            promoPrice,
            status: row?.status || "",
            visits: Number(row?.visits) || 0,
            questions: Number(row?.questions) || 0,
            sales: typeof row?.sold_quantity === 'number' ? row?.sold_quantity : (Number(row?.sold_quantity) || 0),
            stock: typeof row?.available_quantity === 'number' ? row?.available_quantity : (Number(row?.available_quantity) || 0),
            marketplaceId: row?.marketplace_item_id || "",
            image: firstPic || "/placeholder.svg",
            shipping: shippingMethods,
            quality: qualityObj?.score ?? qualityVal,
            qualityLevel: qualityObj?.level ?? null,
            margin: Number(row?.margin) || 0,
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
                                                <div key={ad.id} className="relative grid grid-cols-5 gap-4 items-center p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow transform scale-[0.95] origin-top-left">
                                                    
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
                                                    <div className="flex flex-col items-start space-y-1 justify-center">
                                                        <div className="text-2xl font-bold text-gray-900">
                                                            R$ {ad.price.toFixed(2)}
                                                        </div>
                                                        {ad.promoPrice && (
                                                            <>
                                                                {ad.originalPrice && (
                                                                    <div className="text-sm text-gray-500 line-through">R$ {ad.originalPrice.toFixed(2)}</div>
                                                                )}
                                                                <div className="text-lg font-semibold text-green-600">Promo: R$ {ad.promoPrice.toFixed(2)}</div>
                                                            </>
                                                        )}
                                                    </div>

                                                    {/* Coluna de Envio */}
                                                    <div className="flex flex-col items-start space-y-2 justify-center">
                                                        <Badge className={`${getMarketplaceColor(ad.marketplace)} text-white text-xs px-2`}>
                                                            {ad.marketplace}
                                                        </Badge>
                                                        {ad.shipping && ad.shipping.length > 0 ? (
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {ad.shipping.map((method, index) => (
                                                                    <Badge key={index} variant="secondary" className="font-medium text-xs bg-gray-100 text-gray-700">
                                                                        {String(method)}
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-gray-500">N/A</span>
                                                        )}
                                                    </div>

                                                    {/* Coluna de Métricas (horizontal) */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center space-x-6">
                                                            <div className="flex items-center space-x-2">
                                                                <BarChart className="w-5 h-5 text-novura-primary" />
                                                                <div className="text-sm"><div className="font-bold text-gray-900">{ad.visits}</div><div className="text-xs text-gray-500">Visitas</div></div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <ShoppingCart className="w-5 h-5 text-novura-primary" />
                                                                <div className="text-sm"><div className="font-bold text-gray-900">{ad.sales}</div><div className="text-xs text-gray-500">Vendas</div></div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <Percent className="w-5 h-5 text-novura-primary" />
                                                                <div className="text-sm"><div className="font-bold text-gray-900">{ad.quality}%</div><div className="text-xs text-gray-500">Qualidade</div></div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <DollarSign className="w-5 h-5 text-novura-primary" />
                                                                <div className="text-sm"><div className="font-bold text-gray-900">{ad.margin}%</div><div className="text-xs text-gray-500">Margem</div></div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Coluna de Qualidade + Ações (canto direito) */}
                                                    <div className="flex items-center justify-end relative">
                                                        <div className="mr-4 flex flex-col items-center">
                                                            {/* Medidor simples */}
                                                            <svg width="80" height="50" viewBox="0 0 80 50">
                                                                <path d={`M10,40 A30,30 0 0,1 70,40`} fill="none" stroke="#eee" strokeWidth="8" />
                                                                {(() => {
                                                                    const val = Math.max(0, Math.min(100, Number(ad.quality) || 0));
                                                                    const r = 28; const c = Math.PI * r; const pct = val / 100; const dash = c * pct; const remain = c - dash;
                                                                    return <path d={`M10,40 A30,30 0 0,1 70,40`} fill="none" stroke="#7c3aed" strokeWidth="8" strokeDasharray={`${dash} ${remain}`} />;
                                                                })()}
                                                                <text x="40" y="35" textAnchor="middle" fontSize="12" fill="#111" fontWeight="700">{Math.max(0, Math.min(100, Number(ad.quality) || 0))}%</text>
                                                            </svg>
                                                            {ad.qualityLevel && (
                                                                <div className="text-xs text-gray-600 -mt-1 text-center">{ad.qualityLevel}</div>
                                                            )}
                                                        </div>
                                                        <div className="absolute right-2 top-2">
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

