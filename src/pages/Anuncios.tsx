import { useState, useEffect } from "react";
import { Plus, Search, Filter, ExternalLink, Edit, Pause, Play, TrendingUp, Eye, BarChart, ShoppingCart, Percent, Copy, MoreHorizontal, DollarSign, ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GlobalHeader } from "@/components/GlobalHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { syncMercadoLivreItems } from "@/WebhooksAPI/marketplace/mercado-livre/items";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Menu de navegação será montado dinamicamente com base nos Marketplaces conectados

// Dados simulados de anúncios - serão substituídos por dados do Supabase
// const mockAds = [ /* removido: agora usamos dados reais do banco */ ];

// Dados para o gráfico de vendas (simulados)
// const salesChartData = [ /* removido: gráfico será alimentado futuramente */ ];

export default function Anuncios() {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeStatus, setActiveStatus] = useState<string>("todos");
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [marketplaceNavItems, setMarketplaceNavItems] = useState<{ title: string; path: string; description?: string; displayName?: string }[]>([]);
    const [selectedMarketplacePath, setSelectedMarketplacePath] = useState<string>("");
    const [sortKey, setSortKey] = useState<'sales' | 'visits' | 'price' | 'quality' | 'margin'>('sales');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const { organizationId } = useAuth();
    const { toast } = useToast();
    // Qualidade agora é obtida e persistida via Edge Function; usamos as colunas do banco

    const loadItems = async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            // Usar a view que inclui métricas para obter dados completos
            const { data, error } = await (supabase as any)
                .from('marketplace_items_with_metrics')
                .select('*')
                .eq('organizations_id', organizationId)
                .order('updated_at', { ascending: false })
                .limit(400);
            if (error) throw error;
            const rows = data || [];
            setItems(rows);
            console.log('Itens carregados com métricas:', rows.length);
        } catch (e: any) {
            console.error("Erro ao buscar anúncios:", e);
            // Fallback para tabela original se a view não existir ainda
            try {
                const { data, error } = await (supabase as any)
                    .from('marketplace_items')
                    .select('*')
                    .eq('organizations_id', organizationId)
                    .order('updated_at', { ascending: false })
                    .limit(400);
                if (error) throw error;
                const rows = data || [];
                setItems(rows);
                console.log('Fallback: Itens carregados da tabela original:', rows.length);
            } catch (fallbackError: any) {
                console.error("Erro no fallback:", fallbackError);
                toast({ title: "Falha ao carregar anúncios", description: fallbackError?.message || "", variant: "destructive" });
            }
        } finally {
            setLoading(false);
        }
    };

    const toDisplayMarketplaceName = (name: string): string => {
        if (!name) return name;
        const n = name.toLowerCase();
        if (n === 'mercado_livre' || n === 'mercadolivre' || n === 'mercado livre') return 'Mercado Livre';
        if (n === 'amazon') return 'Amazon';
        if (n === 'shopee') return 'Shopee';
        if (n === 'magalu' || n === 'magazineluiza' || n === 'magazine luiza' || n === 'magazine_luiza') return 'Magazine Luiza';
        // Capitaliza como fallback
        return name.charAt(0).toUpperCase() + name.slice(1);
    };

    const toSlug = (displayName: string): string => {
        return '/' + displayName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    const loadConnectedMarketplaces = async () => {
        if (!organizationId) return;
        try {
            const { data, error } = await (supabase as any)
                .from('marketplace_integrations')
                .select('marketplace_name')
                .eq('organizations_id', organizationId);
            if (error) throw error;
            const rows = (data || []) as Array<{ marketplace_name: string | null }>;
            const names = rows.map((r) => toDisplayMarketplaceName(String(r?.marketplace_name || ''))).filter(Boolean) as string[];
            const uniqueNames: string[] = Array.from(new Set<string>(names));
            const nav: { title: string; path: string; description?: string; displayName?: string }[] = uniqueNames.map((dn: string) => ({ title: dn, path: toSlug(dn), description: `Anúncios no ${dn}`, displayName: dn }));
            setMarketplaceNavItems(nav);
            // Se ainda não selecionado, define o primeiro marketplace disponível
            if (!selectedMarketplacePath || !nav.some(n => n.path === selectedMarketplacePath)) {
                setSelectedMarketplacePath(nav[0]?.path || '');
            }
        } catch (e) {
            console.warn('Falha ao carregar marketplaces conectados', e);
            // Fallback mínimo: sem itens
            setMarketplaceNavItems([]);
            setSelectedMarketplacePath('');
        }
    };

    const handleSync = async () => {
        if (!organizationId) {
            toast({ title: "Sessão necessária", description: "Entre na sua conta para sincronizar.", variant: "destructive" });
            return;
        }
        setSyncing(true);
        try {
            // 1. Sincronizar itens básicos
            const res = await syncMercadoLivreItems(supabase as any, organizationId);
            toast({ title: "Sincronização iniciada", description: `Itens sincronizados: ${res?.synced ?? 0}` });
            
            // 2. Atualizar métricas de qualidade
            try {
                console.log('Atualizando métricas de qualidade...');
                const { data: qualityData, error: qualityError } = await (supabase as any).functions.invoke(`mercado-livre-update-quality?organizationId=${encodeURIComponent(organizationId)}`);
                if (qualityError) console.warn('Função quality retornou erro:', qualityError);
                else console.log('Função quality ok:', qualityData);
            } catch (e) {
                console.warn('Falha ao atualizar qualidade via função:', e);
            }

            // 3. Atualizar métricas de reviews/opiniões
            try {
                console.log('Atualizando métricas de reviews...');
                const { data: reviewsData, error: reviewsError } = await (supabase as any).functions.invoke(`mercado-livre-update-reviews?organizationId=${encodeURIComponent(organizationId)}`);
                if (reviewsError) console.warn('Função reviews retornou erro:', reviewsError);
                else console.log('Função reviews ok:', reviewsData);
            } catch (e) {
                console.warn('Falha ao atualizar reviews via função:', e);
            }

            // 4. Atualizar métricas completas (nova função consolidada)
            try {
                console.log('Atualizando métricas completas...');
                const { data: metricsData, error: metricsError } = await (supabase as any).functions.invoke(`mercado-livre-update-metrics?organizationId=${encodeURIComponent(organizationId)}`);
                if (metricsError) console.warn('Função metrics retornou erro:', metricsError);
                else console.log('Função metrics ok:', metricsData);
            } catch (e) {
                console.warn('Falha ao atualizar métricas via função:', e);
            }

            // 5. Recarrega itens para refletir todas as atualizações
            await loadItems();
            
            toast({ 
                title: "Sincronização completa", 
                description: "Itens, qualidade e reviews atualizados com sucesso!" 
            });
            
        } catch (e: any) {
            console.error("Erro ao sincronizar Mercado Livre:", e);
            toast({ title: "Falha na sincronização", description: e?.message || "", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    // Atualização inicial + assinatura realtime (todos os marketplaces)
    useEffect(() => {
        if (!organizationId) return;
        // Carrega itens e marketplaces conectados
        loadItems();
        loadConnectedMarketplaces();
        // Assina mudanças na tabela marketplace_items para a organização
        const channel = (supabase as any)
            .channel(`marketplace_items_all_${organizationId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_items',
                filter: `organizations_id=eq.${organizationId}`,
            }, (payload: any) => {
                setItems((prev: any[]) => {
                    const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
                    const n = payload.new as any;
                    const o = payload.old as any;
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
            })
            // Também escuta mudanças na tabela de métricas
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'marketplace_metrics',
                filter: `organizations_id=eq.${organizationId}`,
            }, (payload: any) => {
                console.log('Métricas atualizadas:', payload);
                // Recarrega itens quando métricas são atualizadas para refletir mudanças
                loadItems();
            })
            .subscribe();
        return () => {
            try { (supabase as any).removeChannel(channel); } catch { /* ignore */ }
        };
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

    const translatePauseReason = (reason: string | null | undefined): string => {
        const r = String(reason || '').toLowerCase();
        if (!r) return 'Pausado pelo seller';
        if (r.includes('out_of_stock') || r.includes('no_stock') || r.includes('stock')) return 'Sem estoque';
        if (r.includes('under_review') || r.includes('review')) return 'Em análise';
        if (r.includes('waiting') || r.includes('payment')) return 'Pagamento pendente';
        if (r.includes('dispute')) return 'Em disputa';
        if (r.includes('violation') || r.includes('policy')) return 'Violação de política';
        if (r.includes('claim')) return 'Reclamações';
        if (r.includes('expired') || r.includes('out_of_date')) return 'Expirado';
        if (r.includes('closed_by_user') || r.includes('closed')) return 'Fechado pelo vendedor';
        if (r.includes('inactive')) return 'Inativo';
        if (r.includes('paused')) return 'Pausado pelo seller';
        return 'Pausado pelo seller';
    };

    // Divide título em duas linhas de até 30 caracteres cada (máx 60)
    const getTitleLines = (full: string): { line1: string; line2: string } => {
        const title = String(full || '').slice(0, 60).trim();
        if (title.length <= 30) return { line1: title, line2: '' };
        const firstPart = title.slice(0, 30);
        const lastSpace = firstPart.lastIndexOf(' ');
        const cut = lastSpace > 15 ? lastSpace : 30;
        const line1 = title.slice(0, cut).trim();
        const rest = title.slice(cut).trim();
        const line2 = rest.slice(0, 30).trim();
        return { line1, line2 };
    };

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
        // Preferir colunas persistidas pelo Edge Function
        const persistedScore = Number(row?.listing_quality);
        const persistedLevel = row?.quality_level ?? null;
        // Motivo de pausa (quando aplicável)
        let pauseReason: string | null = null;
        const dataRaw: any = row?.data;
        if (dataRaw && (dataRaw.sub_status !== undefined)) {
            if (Array.isArray(dataRaw.sub_status)) {
                const first = (dataRaw.sub_status as any[])[0];
                pauseReason = translatePauseReason(String(first));
            } else {
                pauseReason = translatePauseReason(String(dataRaw.sub_status));
            }
        } else if (Array.isArray(row?.tags)) {
            const tag = (row.tags as any[]).find((t) => {
                const s = String(t || '').toLowerCase();
                return s.includes('paused') || s.includes('under_review') || s.includes('out_of_stock');
            });
            if (tag) pauseReason = translatePauseReason(String(tag));
        }

        return {
            id: idVal,
            title: row?.title || "Sem título",
            sku: derivedSku,
            marketplace: toDisplayMarketplaceName(row?.marketplace_name || "Mercado Livre"),
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
            quality: !isNaN(persistedScore) && persistedScore >= 0 ? persistedScore : qualityVal,
            qualityLevel: persistedLevel,
            margin: Number(row?.margin) || 0,
            pauseReason,
        };
    });

    const selectedMarketplaceDisplay = marketplaceNavItems.find(i => i.path === selectedMarketplacePath)?.displayName || null;

    const filteredAds = parsedAds
        .filter(ad => {
            if (activeStatus === "ativos") return ad.status?.toLowerCase() === "active";
            if (activeStatus === "pausados") {
                const s = (ad.status || '').toLowerCase();
                return s === "paused" || s === "inactive";
            }
            return true;
        })
        .filter(ad => {
            if (!selectedMarketplaceDisplay) return true;
            return (ad.marketplace || '').toLowerCase() === selectedMarketplaceDisplay.toLowerCase();
        })
        .filter(ad => {
            const matchesSearch = ad.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ad.marketplaceId.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSearch;
        });

    const sortedAds = [...filteredAds].sort((a, b) => {
        const dir = sortDir === 'desc' ? -1 : 1;
        const av = Number(a?.[sortKey] ?? 0);
        const bv = Number(b?.[sortKey] ?? 0);
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
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

    const toggleItemStatus = async (ad: any, makeActive: boolean) => {
        if (!organizationId) {
            toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" });
            return;
        }
        const targetStatus = makeActive ? 'active' : 'paused';
        // Otimista: reflete no estado local
        setItems(prev => prev.map((r: any) => {
            const mlId = r?.marketplace_item_id || r?.id;
            if (String(mlId) === String(ad.marketplaceId)) {
                return { ...r, status: targetStatus };
            }
            return r;
        }));
        try {
            const { data, error } = await (supabase as any).functions.invoke('mercado-livre-update-item-status', {
                body: { organizationId, itemId: ad.marketplaceId, targetStatus },
            });
            if (error) throw error;
            toast({ title: makeActive ? 'Anúncio ativado' : 'Anúncio pausado' });
        } catch (e: any) {
            // Reverte caso falhe
            setItems(prev => prev.map((r: any) => {
                const mlId = r?.marketplace_item_id || r?.id;
                if (String(mlId) === String(ad.marketplaceId)) {
                    return { ...r, status: makeActive ? 'paused' : 'active' };
                }
                return r;
            }));
            toast({ title: 'Falha ao atualizar status', description: e?.message || '', variant: 'destructive' });
        }
    };

    const [confirmPauseFor, setConfirmPauseFor] = useState<string | null>(null);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());

    const toggleItemSelection = (itemId: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const toggleVariationsExpansion = (itemId: string) => {
        setExpandedVariations(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const formatVariationData = (variations: any[]) => {
        if (!Array.isArray(variations) || variations.length === 0) return [];
        
        return variations.map((variation, index) => {
            const attributes = Array.isArray(variation.attribute_combinations) ? variation.attribute_combinations : [];
            const types = attributes.map((attr: any) => ({
                name: attr.name || attr.id || 'Tipo',
                value: attr.value_name || attr.value || 'N/A'
            }));
            
            return {
                id: variation.id || `var-${index}`,
                sku: variation.seller_sku || variation.sku || 'N/A',
                available_quantity: variation.available_quantity || 0,
                types: types,
                price: variation.price || 0
            };
        });
    };

    // Adiciona botão de Sincronizar junto aos controles
    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-white">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />

                    <CleanNavigation
                        items={marketplaceNavItems}
                        basePath="/anuncios"
                        activePath={selectedMarketplacePath}
                        onNavigate={(path) => setSelectedMarketplacePath(path)}
                    />

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
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="text-novura-primary">
                                                {sortDir === 'asc' ? (
                                                    <ChevronUp className="w-4 h-4 mr-2 text-novura-primary" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 mr-2 text-novura-primary" />
                                                )}
                                                Ordenar
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                            <DropdownMenuItem className={sortKey === 'sales' ? 'text-novura-primary font-medium' : ''} onSelect={(e) => { e.preventDefault(); setSortKey('sales'); setSortDir('desc'); }}>Mais vendidos</DropdownMenuItem>
                                            <DropdownMenuItem className={sortKey === 'visits' ? 'text-novura-primary font-medium' : ''} onSelect={(e) => { e.preventDefault(); setSortKey('visits'); setSortDir('desc'); }}>Mais visitas</DropdownMenuItem>
                                            <DropdownMenuItem className={sortKey === 'price' ? 'text-novura-primary font-medium' : ''} onSelect={(e) => { e.preventDefault(); setSortKey('price'); setSortDir('desc'); }}>Maior preço</DropdownMenuItem>
                                            <DropdownMenuItem className={sortKey === 'quality' ? 'text-novura-primary font-medium' : ''} onSelect={(e) => { e.preventDefault(); setSortKey('quality'); setSortDir('desc'); }}>Maior qualidade</DropdownMenuItem>
                                            <DropdownMenuItem className={sortKey === 'margin' ? 'text-novura-primary font-medium' : ''} onSelect={(e) => { e.preventDefault(); setSortKey('margin'); setSortDir('desc'); }}>Maior margem</DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button variant="outline">Alterar em Massa</Button>
                                    <Button variant="outline">Gerar Relatório</Button>
                                    <Button onClick={handleSync} disabled={syncing || loading} className="bg-novura-primary hover:bg-novura-primary/90">
                                        {syncing ? "Sincronizando..." : "Sincronizar"}
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-4">
                                <CleanNavigation
                                    items={[
                                        { title: 'Todos', path: '/todos' },
                                        { title: 'Ativos', path: '/ativos' },
                                        { title: 'Pausados', path: '/pausados' },
                                    ]}
                                    basePath=""
                                    activePath={`/${activeStatus}`}
                                    onNavigate={(path) => setActiveStatus(path.replace('/', ''))}
                                />
                            </div>

                            <Card className="mt-6 border border-gray-200 shadow-sm">
                                <CardContent className="p-0">
                                    <div className="space-y-3">
                                        {sortedAds.length > 0 ? (
                                            sortedAds.map((ad) => {
                                                const variations = formatVariationData(items.find(item => item.id === ad.id)?.variations || []);
                                                const hasVariations = variations.length > 0;
                                                const isExpanded = expandedVariations.has(ad.id);
                                                
                                                return (
                                                <div key={ad.id} className="relative bg-white border border-gray-200 rounded-lg">
                                                    <div className="grid grid-cols-12 gap-4 items-center p-5">
                                                        
                                                        {/* Checkbox */}
                                                        <div className="col-span-1 flex justify-center">
                                                            <Checkbox
                                                                checked={selectedItems.has(ad.id)}
                                                                onCheckedChange={() => toggleItemSelection(ad.id)}
                                                            />
                                                        </div>
                                                        
                                                        {/* Coluna do Anúncio */}
                                                        <div className="flex items-start space-x-4 col-span-3">
                                                            <img
                                                                src={ad.image}
                                                                alt={ad.title}
                                                                className="w-24 h-24 rounded-lg object-cover bg-gray-100"
                                                            />
                                                            <div className="flex flex-col h-full justify-between min-w-0">
                                                                <div className="max-w-full">
                                                                    <div className="font-semibold text-base text-gray-900 truncate">{getTitleLines(ad.title).line1}</div>
                                                                    {getTitleLines(ad.title).line2 && (
                                                                        <div className="font-semibold text-base text-gray-900 truncate">{getTitleLines(ad.title).line2}</div>
                                                                    )}
                                                                </div>
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

                                                        {/* Coluna de Preço */}
                                                        <div className="flex flex-col items-start space-y-1 justify-center col-span-2">
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

                                                        {/* Coluna de Envio e Motivo */}
                                                        <div className="flex flex-col items-start space-y-2 justify-center col-span-2">
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
                                                            {(() => {
                                                                const s = (ad.status || '').toLowerCase();
                                                                if (s === 'paused' || s === 'inactive') {
                                                                    return (
                                                                        <span className="text-xs font-medium text-novura-primary mt-1">
                                                                            {ad.pauseReason || 'Pausado pelo seller'}
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>

                                                        {/* Coluna de Métricas */}
                                                        <div className="col-span-2">
                                                            <div className="grid grid-cols-2 gap-4 items-center">
                                                                <div className="flex items-center space-x-2">
                                                                    <BarChart className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{ad.visits}</div>
                                                                        <div className="text-xs text-gray-500">Visitas</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <ShoppingCart className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{ad.sales}</div>
                                                                        <div className="text-xs text-gray-500">Vendas</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <Percent className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{ad.quality}%</div>
                                                                        <div className="text-xs text-gray-500">Qualidade</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <DollarSign className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{ad.margin}%</div>
                                                                        <div className="text-xs text-gray-500">Margem</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Coluna de Controles (Switch, Medidor e Ações) */}
                                                        <div className="col-span-2">
                                                            <div className="flex items-center justify-center space-x-6">
                                                                {/* Switch de Status */}
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-xs text-gray-600 mb-1">{((ad.status || '').toLowerCase() === 'active') ? 'Ativo' : 'Inativo'}</span>
                                                                    <Popover open={confirmPauseFor === ad.id} onOpenChange={(open) => { if (!open) setConfirmPauseFor(null); }}>
                                                                        <PopoverTrigger asChild>
                                                                            <Switch
                                                                                checked={(ad.status || '').toLowerCase() === 'active'}
                                                                                onCheckedChange={(checked) => {
                                                                                    const isActive = (ad.status || '').toLowerCase() === 'active';
                                                                                    if (isActive && !checked) setConfirmPauseFor(ad.id); else toggleItemStatus(ad, checked);
                                                                                }}
                                                                                className="data-[state=checked]:bg-purple-600 data-[state=unchecked]:bg-gray-200"
                                                                            />
                                                                        </PopoverTrigger>
                                                                        <PopoverContent align="center" sideOffset={8} className="w-64 bg-white border shadow-md p-3 rounded-xl">
                                                                            <div className="text-sm font-medium text-gray-900">Pausar anúncio?</div>
                                                                            <div className="text-xs text-gray-600 mt-1">Isso pode impactar vendas. Confirme para pausar no Mercado Livre.</div>
                                                                            <div className="flex justify-end gap-2 mt-3">
                                                                                <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setConfirmPauseFor(null); }}>Cancelar</Button>
                                                                                <Button size="sm" className="bg-novura-primary hover:bg-novura-primary/90 rounded-full" onClick={async () => { setConfirmPauseFor(null); await toggleItemStatus(ad, false); }}>Confirmar</Button>
                                                                            </div>
                                                                        </PopoverContent>
                                                                    </Popover>
                                                                </div>

                                                                {/* Medidor de Qualidade */}
                                                                <div className="flex flex-col items-center">
                                                                    <svg width="60" height="40" viewBox="0 0 60 40">
                                                                        <path d={`M8,32 A24,24 0 0,1 52,32`} fill="none" stroke="#eee" strokeWidth="6" />
                                                                        {(() => {
                                                                            const val = Math.max(0, Math.min(100, Number(ad.quality) || 0));
                                                                            const r = 22; const c = Math.PI * r; const pct = val / 100; const dash = c * pct; const remain = c - dash;
                                                                            return <path d={`M8,32 A24,24 0 0,1 52,32`} fill="none" stroke="#7c3aed" strokeWidth="6" strokeDasharray={`${dash} ${remain}`} />;
                                                                        })()}
                                                                        <text x="30" y="28" textAnchor="middle" fontSize="10" fill="#111" fontWeight="700">{Math.max(0, Math.min(100, Number(ad.quality) || 0))}%</text>
                                                                    </svg>
                                                                    {ad.qualityLevel && (
                                                                        <div className="text-xs text-gray-600 -mt-1 text-center">{ad.qualityLevel}</div>
                                                                    )}
                                                                </div>

                                                                {/* Menu de Ações */}
                                                                <div>
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="text-novura-primary hover:text-novura-primary">
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
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Dropdown de Variações */}
                                                    {hasVariations && (
                                                        <div className="border-t border-gray-100 bg-gray-50">
                                                            <Collapsible open={isExpanded} onOpenChange={() => toggleVariationsExpansion(ad.id)}>
                                                                <CollapsibleTrigger asChild>
                                                                    <Button variant="ghost" className="w-full justify-between p-3 text-sm text-gray-600 hover:text-gray-900">
                                                                        <span>Variações ({variations.length})</span>
                                                                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                    </Button>
                                                                </CollapsibleTrigger>
                                                                <CollapsibleContent className="px-3 pb-3">
                                                                    <div className="space-y-2">
                                                                        {variations.map((variation, index) => (
                                                                            <div key={variation.id} className="bg-white rounded-lg p-3 border border-gray-200">
                                                                                <div className="grid grid-cols-4 gap-4 items-center text-xs">
                                                                                    <div>
                                                                                        <div className="text-gray-500 mb-1">SKU</div>
                                                                                        <div className="font-medium text-gray-900">{variation.sku}</div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="text-gray-500 mb-1">Tipos</div>
                                                                                        <div className="space-y-1">
                                                                                            {variation.types.map((type, typeIndex) => (
                                                                                                <div key={typeIndex} className="text-gray-900">
                                                                                                    <span className="font-medium">{type.name}:</span> {type.value}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="text-gray-500 mb-1">Estoque</div>
                                                                                        <div className={`font-medium ${variation.available_quantity < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                                                                                            {variation.available_quantity}
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="text-gray-500 mb-1">Preço</div>
                                                                                        <div className="font-medium text-gray-900">R$ {variation.price.toFixed(2)}</div>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </CollapsibleContent>
                                                            </Collapsible>
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })
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

