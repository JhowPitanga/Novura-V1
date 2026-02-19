import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Search, Filter, ExternalLink, Edit, Pause, Play, TrendingUp, Eye, BarChart, ShoppingCart, Heart, Copy, MoreHorizontal, DollarSign, ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon, Package, Zap, Trash2, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { GlobalHeader } from "@/components/GlobalHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { syncMercadoLivreItems } from "@/WebhooksAPI/marketplace/mercado-livre/items";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useNavigate, useLocation } from "react-router-dom";

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
    const [activeTab, setActiveTab] = useState<string>("anuncios");
    const { organizationId } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const location = useLocation();
    // Estado para métricas adicionais por item (quality_level e performance_data)
    const [metricsByItemId, setMetricsByItemId] = useState<Record<string, { quality_level?: string | null; performance_data?: any }>>({});
    const [listingTypeByItemId, setListingTypeByItemId] = useState<Record<string, string | null>>({});
    const [shippingTypesByItemId, setShippingTypesByItemId] = useState<Record<string, string[]>>({});
    const [listingPricesByItemId, setListingPricesByItemId] = useState<Record<string, any>>({});
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());
    const [drafts, setDrafts] = useState<any[]>([]);
    const [stockModalOpen, setStockModalOpen] = useState<boolean>(false);
    const [stockEditForItemId, setStockEditForItemId] = useState<string | null>(null);
    const [stockEditVariations, setStockEditVariations] = useState<Array<{ id: string | number; sku: string; seller_stock_total: number }>>([]);
    const [stockEditsMap, setStockEditsMap] = useState<Record<string, number>>({});
    const [stockBulkValue, setStockBulkValue] = useState<string>("");
    const [stockUpdateLoading, setStockUpdateLoading] = useState<boolean>(false);
    const [deletePopoverOpenId, setDeletePopoverOpenId] = useState<string | null>(null);
    const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
    const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
    const [bulkDeleteDraftsOpen, setBulkDeleteDraftsOpen] = useState<boolean>(false);
    // Capacidades/flags de envio do seller (derivadas de shipping_preferences)
    const [shippingCaps, setShippingCaps] = useState<{ flex?: boolean; envios?: boolean; correios?: boolean; full?: boolean } | null>(null);
    const [hasIntegration, setHasIntegration] = useState<boolean>(false);
    const lastLoadedKeyRef = useRef<string | null>(null);
    const lastIntegrationLoadKeyRef = useRef<string | null>(null);
    

    // hasIntegration passa a ser configurado dentro de loadConnectedMarketplaces para evitar chamadas duplicadas

    useEffect(() => {
        const p = String(location.pathname || '');
        const m = p.match(/^\/anuncios\/(ativos|inativos|rascunhos)/);
        if (m && m[1]) setActiveStatus(m[1]);
    }, [location.pathname]);

    useEffect(() => {
        const loadDrafts = async () => {
            if (!organizationId) return;
            if (activeStatus !== 'rascunhos') return;
            try {
                const { data, error } = await (supabase as any)
                    .from('marketplace_drafts')
                    .select('*')
                    .eq('organizations_id', organizationId)
                    .order('updated_at', { ascending: false })
                    .limit(200);
                if (!error) setDrafts(data || []);
            } catch (e) {
                console.error('Erro ao buscar rascunhos:', e);
                setDrafts([]);
            }
        };
        loadDrafts();
    }, [organizationId, activeStatus]);

    // Helper para colorização do medidor por nível de qualidade
    const getQualityStrokeColor = (level?: any) => {
        if (typeof level === 'number') {
            if (level === 1) return '#EF4444';
            if (level === 2) return '#F59E0B';
            if (level === 3) return '#7C3AED';
            return '#6B7280';
        }
        const s = String(level || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (s === '1') return '#EF4444';
        if (s === '2') return '#F59E0B';
        if (s === '3') return '#7C3AED';
        if (s.includes('bas')) return '#EF4444';
        if (s.includes('satis')) return '#F59E0B';
        if (s.includes('prof')) return '#7C3AED';
        if (s === 'to_be_improved') return '#EF4444';
        if (s === 'qualified') return '#F59E0B';
        if (s === 'excellent') return '#7C3AED';
        return '#6B7280';
    };

    const getQualityLabel = (level?: any) => {
        if (typeof level === 'number') {
            if (level === 1) return 'Precisa de Melhoria';
            if (level === 2) return 'Qualificado';
            if (level === 3) return 'Excelente';
        }
        const s = String(level || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        if (s === '1') return 'Precisa de Melhoria';
        if (s === '2') return 'Qualificado';
        if (s === '3') return 'Excelente';
        if (s.includes('bas')) return 'Básico';
        if (s.includes('satis')) return 'Satisfatório';
        if (s.includes('prof')) return 'Profissional';
        if (s === 'to_be_improved') return 'Precisa de Melhoria';
        if (s === 'qualified') return 'Qualificado';
        if (s === 'excellent') return 'Excelente';
        return '';
    };

    const translateSuggestion = (text: string) => {
        const s = String(text || '').trim();
        const l = s.toLowerCase();
        const mImg = l.match(/add at least\s*(\d+)\s*images/);
        if (mImg) return `Adicionar pelo menos ${mImg[1]} imagens`;
        const mAttr = l.match(/add at least\s*(\d+)\s*attributes/);
        if (mAttr) return `Adicionar pelo menos ${mAttr[1]} atributos`;
        if (l.includes('add brand info')) return 'Adicionar informações de marca';
        if (l.includes('adopt suggested category')) return 'Adotar categoria sugerida';
        if (l.includes('add at least 1 attributes')) return 'Adicionar pelo menos 1 atributo';
        if (l.includes('add size chart')) return 'Adicionar tabela de medidas';
        if (l.includes('adopt the color or size variation')) return 'Adotar variações de cor ou tamanho';
        if (l.includes('add at least 100 characters or 1 image for desc')) return 'Adicionar ao menos 100 caracteres ou 1 imagem na descrição';
        if (l.includes('add characters for name to 25~100')) return 'Ajustar nome para 25 a 100 caracteres';
        if (l.includes('adopt suggested weight')) return 'Adotar peso sugerido';
        if (l.includes('add video')) return 'Adicionar vídeo';
        if (l.includes('add at least 3 attributes')) return 'Adicionar pelo menos 3 atributos';
        const tokens: Record<string, string> = {
            'add ': 'Adicionar ',
            'adopt ': 'Adotar ',
            'brand': 'marca',
            'info': 'informações',
            'category': 'categoria',
            'color': 'cor',
            'size': 'tamanho',
            'variation': 'variação',
            'weight': 'peso',
            'images': 'imagens',
            'attributes': 'atributos',
            'video': 'vídeo',
            'desc': 'descrição',
            'characters': 'caracteres',
            'name': 'nome',
            'chart': 'tabela'
        };
        let out = s;
        Object.keys(tokens).forEach(k => {
            out = out.replace(new RegExp(k, 'ig'), tokens[k]);
        });
        return out;
    };

    const getImprovementSuggestions = (pd: any): string[] => {
        const tasks = Array.isArray(pd?.unfinished_task) ? pd.unfinished_task : [];
        return tasks.map((t: any) => translateSuggestion(String(t?.suggestion || ''))).filter((x: string) => x && x.trim().length > 0);
    };

    const loadItems = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const selectedDisplay = marketplaceNavItems.find(i => i.path === selectedMarketplacePath)?.displayName || '';
            const useShopeeRaw = String(selectedDisplay).toLowerCase() === 'shopee';
            const { data, error } = useShopeeRaw
                ? await (supabase as any)
                    .from('marketplace_items_raw')
                    .select('*')
                    .eq('organizations_id', organizationId)
                    .eq('marketplace_name', 'Shopee')
                    .order('updated_at', { ascending: false })
                    .limit(400)
                : await (supabase as any)
                    .from('marketplace_items_unified')
                    .select('*')
                    .eq('organizations_id', organizationId)
                    .order('updated_at', { ascending: false })
                    .limit(400);
            if (error) throw error;
            const rows = data || [];
            setItems(rows);
            console.log('Itens carregados (unified):', rows.length);

            const lmap: Record<string, string | null> = {};
            const pmap: Record<string, any> = {};
            const smap: Record<string, string[]> = {};
            const mmap: Record<string, { quality_level?: string | null; performance_data?: any }> = {};
            (rows || []).forEach((r: any) => {
                const id = String(r?.marketplace_item_id || r?.id || '');
                if (!id) return;
                if (useShopeeRaw) {
                    lmap[id] = null;
                    if (Array.isArray(r?.shipping_types)) {
                        smap[id] = (r.shipping_types as any[])
                            .filter((t: any) => t && t.enabled === true)
                            .map((t: any) => {
                                const name = String(t?.logistic_name || '').toLowerCase();
                                if (name.includes('retire')) return 'Retire';
                                if (name.includes('padrão') || name.includes('padrao')) return 'Padrão';
                                return t?.logistic_name || '';
                            })
                            .filter((s: string) => s && s.trim().length > 0);
                    }
                    mmap[id] = { quality_level: (r?.performance_data?.quality_level ?? null), performance_data: r?.performance_data ?? null };
                } else {
                    const lt = r?.listing_type_id ? String(r.listing_type_id) : null;
                    lmap[id] = lt || null;
                    if (r?.listing_prices) pmap[id] = r.listing_prices;
                    const shippingTags = Array.isArray(r?.shipping_tags)
                        ? r.shipping_tags.map((t: any) => String(t || '').toLowerCase())
                        : [];
                    if (shippingTags.length) {
                        smap[id] = shippingTags;
                    }
                    mmap[id] = { quality_level: r?.quality_level ?? null, performance_data: r?.performance_data ?? null };
                }
            });
            setListingTypeByItemId(lmap);
            setListingPricesByItemId(pmap);
            setShippingTypesByItemId(smap);
            setMetricsByItemId(mmap);

            // shipping caps agora são carregados em loadConnectedMarketplaces para evitar chamadas duplicadas
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
                const lmap: Record<string, string | null> = {};
                const pmap: Record<string, any> = {};
                const smap: Record<string, string[]> = {};
                const mmap: Record<string, { quality_level?: string | null; performance_data?: any }> = {};
                (rows || []).forEach((r: any) => {
                    const id = String(r?.marketplace_item_id || r?.id || '');
                    if (!id) return;
                    const lt = r?.listing_type_id ? String(r.listing_type_id) : (r?.data?.listing_type_id ? String(r.data.listing_type_id) : null);
                    lmap[id] = lt || null;
                    if (r?.listing_prices) pmap[id] = r.listing_prices;
                    const shippingTypes = Array.isArray(r?.stock_distribution?.shipping_types)
                        ? r.stock_distribution.shipping_types
                        : (Array.isArray(r?.shipping_types) ? r.shipping_types : []);
                    if (shippingTypes && shippingTypes.length) {
                        smap[id] = shippingTypes.map((t: any) => String(t || '').toLowerCase());
                    }
                    mmap[id] = { quality_level: r?.quality_level ?? null, performance_data: r?.performance_data ?? null };
                });
                setListingTypeByItemId(lmap);
                setListingPricesByItemId(pmap);
                setShippingTypesByItemId(smap);
                setMetricsByItemId(mmap);

                try {
                    const { data: integRows, error: integErr } = await (supabase as any)
                        .from('marketplace_integrations')
                        .select('drop_off, xd_drop_off, self_service, marketplace_name')
                        .eq('organizations_id', organizationId)
                        .eq('marketplace_name', 'Mercado Livre');
                    if (!integErr) {
                        const caps = {} as { flex?: boolean; envios?: boolean; correios?: boolean; full?: boolean };
                        const rows2 = integRows || [];
                        rows2.forEach((r: any) => {
                            if (r?.self_service === true) caps.flex = true;
                            if (r?.xd_drop_off === true) caps.envios = true;
                            if (r?.drop_off === true) caps.correios = true;
                        });
                        const anyEnabled = !!(caps.flex || caps.envios || caps.correios || caps.full);
                        setShippingCaps(anyEnabled ? caps : null);
                    }
                } catch {}
            } catch (fallbackError: any) {
                console.error("Erro no fallback:", fallbackError);
                toast({ title: "Falha ao carregar anúncios", description: fallbackError?.message || "", variant: "destructive" });
            }
        } finally {
            setLoading(false);
        }
    }, [organizationId, marketplaceNavItems, selectedMarketplacePath, toast]);

    

    const toSlug = (displayName: string): string => {
        return '/' + displayName.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    const toPublicationLabel = (listingTypeId?: string | null): string | null => {
        const s = String(listingTypeId || '').toLowerCase();
        if (!s) return null;
        if (s.includes('gold_pro') || s === 'gold_pro' || s.includes('pro')) return 'Premium';
        if (s.includes('gold_special') || s === 'gold_special' || s === 'gold' || s.includes('gold')) return 'Clássico';
        if (s === 'silver') return 'Clássico';
        if (s === 'free') return 'Grátis';
        return 'Outro';
    };

    const extractCostsFromListingPrices = (lp: any) => {
        try {
            if (!lp) return null;
            const entry = Array.isArray(lp?.prices) ? lp.prices[0] : lp;
            const currency = entry?.currency_id || entry?.sale_fee?.currency_id || 'BRL';
            const commission = typeof entry?.sale_fee?.amount === 'number'
                ? entry.sale_fee.amount
                : (typeof entry?.sale_fee_amount === 'number' ? entry.sale_fee_amount
                : (typeof entry?.application_fee?.amount === 'number' ? entry.application_fee.amount : 0));
            const shippingCost = typeof entry?.shipping_cost?.amount === 'number'
                ? entry.shipping_cost.amount
                : (typeof entry?.logistics?.shipping_cost === 'number' ? entry.logistics.shipping_cost : 0);
            const tax = typeof entry?.taxes?.amount === 'number' ? entry.taxes.amount : 0;
            const total = [commission || 0, shippingCost || 0, tax || 0].reduce((a, b) => a + b, 0);
            return { currency: String(currency || 'BRL'), commission: commission || 0, shippingCost: shippingCost || 0, tax: tax || 0, total };
        } catch {
            return null;
        }
    };

    const extractSaleFeeDetails = (lp: any) => {
        try {
            if (!lp) return null;
            const entry = Array.isArray(lp?.prices) ? (lp.prices.find((p: any) => p?.sale_fee_details) || lp.prices[0]) : lp;
            const currency = entry?.currency_id || entry?.sale_fee?.currency_id || 'BRL';
            const details = entry?.sale_fee_details || entry?.sale_fee?.details || {};
            const percentage = typeof details?.percentage_fee === 'number'
                ? details.percentage_fee
                : (typeof details?.percentage === 'number' ? details.percentage : null);
            const fixedFee = typeof details?.fixed_fee === 'number'
                ? details.fixed_fee
                : (typeof details?.fixed_amount === 'number' ? details.fixed_amount
                : (typeof details?.fixed_fee?.amount === 'number' ? details.fixed_fee.amount : null));
            const grossAmount = typeof details?.gross_amount === 'number'
                ? details.gross_amount
                : (typeof details?.total === 'number' ? details.total
                : (typeof entry?.sale_fee?.amount === 'number' ? entry.sale_fee.amount : null));
            if (percentage == null && fixedFee == null && grossAmount == null) return null;
            return { currency: String(currency || 'BRL'), percentage, fixedFee, grossAmount };
        } catch {
            return null;
        }
    };

    const loadConnectedMarketplaces = useCallback(async () => {
        if (!organizationId) return;
        try {
            const key = String(organizationId || '');
            if (lastIntegrationLoadKeyRef.current === key && marketplaceNavItems.length > 0) {
                return;
            }
            lastIntegrationLoadKeyRef.current = key;
            const { data, error } = await (supabase as any)
                .from('marketplace_integrations')
                .select('marketplace_name, drop_off, xd_drop_off, self_service')
                .eq('organizations_id', organizationId);
            if (error) throw error;
            const rows = (data || []) as Array<{ marketplace_name: string | null, drop_off?: boolean, xd_drop_off?: boolean, self_service?: boolean }>;
            const names = rows.map((r) => String(r?.marketplace_name || '')).filter(Boolean) as string[];
            const uniqueNames: string[] = Array.from(new Set<string>(names));
            const nav: { title: string; path: string; description?: string; displayName?: string }[] = uniqueNames.map((dn: string) => ({ title: dn, path: toSlug(dn), description: `Anúncios no ${dn}`, displayName: dn }));
            setMarketplaceNavItems(nav);
            setHasIntegration(uniqueNames.length > 0);
            if (!selectedMarketplacePath || !nav.some(n => n.path === selectedMarketplacePath)) {
                setSelectedMarketplacePath(nav[0]?.path || '');
            }
            const mlRows = rows.filter(r => String(r?.marketplace_name || '').toLowerCase() === 'mercado livre');
            if (mlRows.length > 0) {
                const caps = {} as { flex?: boolean; envios?: boolean; correios?: boolean; full?: boolean };
                mlRows.forEach((r) => {
                    if (r?.self_service === true) caps.flex = true;
                    if (r?.xd_drop_off === true) caps.envios = true;
                    if (r?.drop_off === true) caps.correios = true;
                });
                const anyEnabled = !!(caps.flex || caps.envios || caps.correios || caps.full);
                setShippingCaps(anyEnabled ? caps : null);
            } else {
                setShippingCaps(null);
            }
        } catch (e) {
            console.warn('Falha ao carregar marketplaces conectados', e);
            setMarketplaceNavItems([]);
            setSelectedMarketplacePath('');
            setHasIntegration(false);
            setShippingCaps(null);
        }
    }, [organizationId]);

    const handleSync = async () => {
        if (!organizationId) {
            toast({ title: "Sessão necessária", description: "Entre na sua conta para sincronizar.", variant: "destructive" });
            return;
        }
        setSyncing(true);
        try {
            const startedAt = Date.now();
            const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            console.log('[anuncios.sync] start', { organizationId, clientRid });

            const marketplaceDisplay = marketplaceNavItems.find(i => i.path === selectedMarketplacePath)?.displayName || '';
            if (String(marketplaceDisplay).toLowerCase() === 'shopee') {
                const { data: result, error: fnErr } = await (supabase as any).functions.invoke('shopee-sync-items', {
                    body: { organizationId, page_size: 100, item_status: ['NORMAL'] }
                });
                console.log('[anuncios.sync] shopee result', { fnErr, result });
                if (fnErr) throw fnErr;
                const total = Array.isArray(result?.results) ? result.results.reduce((acc: number, r: any) => acc + Number(r?.updated || 0), 0) : 0;
                toast({ title: "Sincronização concluída", description: `Itens sincronizados: ${total}` });
            } else {
                const { data: orchestration, error: orchError } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
                    body: { organizationId, clientRid }
                });
                console.log('[anuncios.sync] orchestrator result', { orchError, orchestration });
                if (orchError) {
                    try {
                        const { data: diagData, error: diagErr } = await (supabase as any).functions.invoke('mercado-livre-sync-items', {
                            body: { organizationId, debug: true }
                        });
                        console.log('[anuncios.sync] direct sync-items diag', { diagErr, diagData });
                    } catch (diag) {
                        console.warn('[anuncios.sync] direct sync-items diag threw', diag);
                    }
                    throw orchError;
                }
                const synced = Number(orchestration?.sync?.synced ?? 0);
                toast({ title: "Sincronização concluída", description: `Itens sincronizados: ${synced}` });
            }

            // Recarrega itens para refletir todas as atualizações
            try {
                await loadItems();
            } catch (reloadErr: any) {
                console.warn('[anuncios.sync] reload items failed', reloadErr?.message || reloadErr);
            }
            
            toast({ 
                title: "Sincronização completa", 
                description: "Itens, qualidade e reviews atualizados com sucesso!" 
            });
            const elapsedMs = Date.now() - startedAt;
            console.log('[anuncios.sync] done', { clientRid, elapsedMs });
        } catch (e: any) {
            const msg = e?.message || String(e);
            const stack = e?.stack || null;
            const details = (() => { try { return JSON.stringify(e); } catch { return null; } })();
            console.error('[anuncios.sync] error', { message: msg, stack, details });
            toast({ title: "Falha na sincronização", description: msg || "Erro inesperado", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    const handleSyncSelected = async () => {
        if (!organizationId) {
            toast({ title: "Sessão necessária", description: "Entre na sua conta para sincronizar.", variant: "destructive" });
            return;
        }
        const selectedCount = selectedItems.size;
        if (selectedCount === 0) {
            toast({ title: "Nenhum anúncio selecionado", description: "Selecione anúncios para sincronizar.", variant: "default" });
            return;
        }
        setSyncing(true);
        try {
            const startedAt = Date.now();
            const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            const onlySelectedIds = Array.from(selectedItems);
            console.log('[anuncios.syncSelected] start', { organizationId, clientRid, onlySelectedIds });

            const marketplaceDisplay = marketplaceNavItems.find(i => i.path === selectedMarketplacePath)?.displayName || '';
            if (String(marketplaceDisplay).toLowerCase() === 'shopee') {
                const { data: result, error: fnErr } = await (supabase as any).functions.invoke('shopee-sync-items', {
                    body: { organizationId, item_id_list: onlySelectedIds }
                });
                console.log('[anuncios.syncSelected] shopee result', { fnErr, result });
                if (fnErr) throw fnErr;
            } else {
                const { data: orchestration, error: orchError } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
                    body: { organizationId, clientRid, onlySelectedIds }
                });
                console.log('[anuncios.syncSelected] orchestrator result', { orchError, orchestration });
                if (orchError) throw orchError;
            }

            toast({ title: "Sincronização concluída", description: `Selecionados sincronizados: ${selectedCount}` });
            try {
                await loadItems();
            } catch (reloadErr: any) {
                console.warn('[anuncios.syncSelected] reload items failed', reloadErr?.message || reloadErr);
            }
            const elapsedMs = Date.now() - startedAt;
            console.log('[anuncios.syncSelected] done', { clientRid, elapsedMs });
        } catch (e: any) {
            const msg = e?.message || String(e);
            console.error('[anuncios.syncSelected] error', msg);
            toast({ title: "Falha na sincronização", description: msg || "Erro inesperado", variant: "destructive" });
        } finally {
            setSyncing(false);
        }
    };

    // Assinatura realtime e carregamento inicial de marketplaces
    useEffect(() => {
        if (!organizationId) return;
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
                const evt = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
                const n = payload.new as any;
                const o = payload.old as any;
                const id = String(n?.marketplace_item_id || n?.item_id || o?.marketplace_item_id || o?.item_id || '');
                if (!id) return;
                setMetricsByItemId(prev => {
                    const next = { ...prev };
                    if (evt === 'DELETE') {
                        delete next[id];
                    } else {
                        next[id] = {
                            quality_level: n?.quality_level ?? next[id]?.quality_level ?? null,
                            performance_data: n?.performance_data ?? next[id]?.performance_data ?? null,
                        };
                    }
                    return next;
                });
            })
            .subscribe();
        return () => {
            try { (supabase as any).removeChannel(channel); } catch { /* ignore */ }
        };
    }, [organizationId]);

    // Carrega itens apenas quando marketplace selecionado estiver pronto (uma vez por combinação org+path)
    useEffect(() => {
        if (!organizationId) return;
        if (!selectedMarketplacePath) return;
        if (marketplaceNavItems.length === 0) return;
        const key = `${organizationId}|${selectedMarketplacePath}`;
        if (lastLoadedKeyRef.current === key && items.length > 0) return;
        lastLoadedKeyRef.current = key;
        loadItems();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [organizationId, selectedMarketplacePath, marketplaceNavItems]);

    // Removido auto-sync: sincronização apenas ao clicar no botão

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

    // Dicas de melhoria baseadas em performance_data e dados locais
    const extractPerformanceHints = (pd: any, ad: any): string[] => {
        const hints: string[] = [];
        try {
            if (pd && Array.isArray(pd?.missing_fields) && pd.missing_fields.length) {
                hints.push(`Preencher campos: ${pd.missing_fields.join(', ')}`);
            }
            const recs = Array.isArray(pd?.recommendations) ? pd.recommendations : [];
            recs.slice(0, 3).forEach((r: any) => {
                const t = typeof r === 'string' ? r : (r?.text || r?.title || r?.message || '');
                if (t) hints.push(t);
            });
            const actions = Array.isArray(pd?.actions) ? pd.actions : [];
            actions.slice(0, 3).forEach((a: any) => {
                const t = typeof a === 'string' ? a : (a?.text || a?.title || a?.message || '');
                if (t) hints.push(t);
            });
        } catch {}
        try {
            const titleLen = Number(ad?.titleLength) || 0;
            const pictures = Number(ad?.pictureCount) || 0;
            const hasVideo = !!ad?.hasVideo;
            const attrs = Number(ad?.attributeCount) || 0;
            const descLen = Number(ad?.descriptionLength) || 0;
            const freeShip = !!ad?.freeShipping;
            const qualityLevel = String(ad?.qualityLevel || '').toLowerCase();
            const quality = Number(ad?.quality) || 0;
            if (titleLen && titleLen < 45) hints.push('Aumente o título com palavras-chave e atributos.');
            if (pictures < 3) hints.push('Adicione mais fotos (mínimo 3) com diferentes ângulos.');
            if (!hasVideo) hints.push('Inclua um vídeo curto demonstrando o produto.');
            if (attrs < 4) hints.push('Preencha atributos importantes (cor, tamanho, marca, etc.).');
            if (!freeShip) hints.push('Considere oferecer frete grátis para aumentar conversão.');
            if (descLen < 200) hints.push('Amplie a descrição com benefícios e especificações.');
            if (quality < 80 || qualityLevel.includes('bás') || qualityLevel.includes('satis')) {
                hints.push('Siga as recomendações do ML para alcançar nível profissional.');
            }
        } catch {}
        const unique = Array.from(new Set(hints.filter(Boolean)));
        return unique.slice(0, 5);
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
        const mktLower = String(row?.marketplace_name || '').toLowerCase();
        const priceNum = typeof row?.price === 'number' ? row.price : (Number(row?.price) || 0);
        let originalPrice: number | null = null;
        let promoPrice: number | null = null;
        if (mktLower === 'shopee') {
            const pp = typeof (row as any)?.promotion_price === 'number' ? (row as any).promotion_price : null;
            promoPrice = pp;
            originalPrice = pp != null ? priceNum : null;
        } else {
            const op = Number((row as any)?.original_price) || null;
            const hasPromo = !!op && op > priceNum;
            originalPrice = hasPromo ? op : null;
            promoPrice = hasPromo ? priceNum : null;
        }
        let shippingTags: string[] = [];
        const idVal = row?.marketplace_item_id || row?.id;
        const tagsBase: string[] = [];
        if ((row as any)?.cap_full) tagsBase.push('full');
        if ((row as any)?.cap_flex) tagsBase.push('flex');
        if ((row as any)?.cap_envios) tagsBase.push('envios');
        if ((row as any)?.cap_correios) tagsBase.push('correios');
        shippingTags = Array.from(new Set(tagsBase));
        const shippingInfo = (row as any)?.data?.shipping || (row as any)?.shipping;
        const logisticType = String([
            shippingInfo?.logistic_type,
            shippingInfo?.mode,
            (row as any)?.logistic_type,
            (row as any)?.shipping_logistic_type,
            (row as any)?.data?.shipping?.logistic_type,
            (row as any)?.data?.shipping?.logistic?.type,
            (row as any)?.shipping?.logistic?.type,
        ].find((v: any) => v && String(v).trim().length > 0) || '').toLowerCase();
        {
            const rawTagsSource = Array.isArray(shippingInfo?.tags)
                ? shippingInfo.tags
                : (Array.isArray((row as any)?.data?.shipping?.tags)
                    ? (row as any)?.data?.shipping?.tags
                    : (Array.isArray((row as any)?.shipping?.tags)
                        ? (row as any)?.shipping?.tags
                        : []));
            const rawTags: string[] = (rawTagsSource as any[]).map((t: any) => String(t || '').toLowerCase());
            const set = new Set<string>([...shippingTags]);
            if (rawTags.includes('self_service_in')) set.add('flex');
            if (rawTags.includes('self_service_out') && logisticType !== 'self_service') set.delete('flex');
            shippingTags = Array.from(set);
        }
        // Normalizar tags de logística para o novo módulo (full/flex/envios/correios/no_shipping)
        const normalizeTag = (tag: string) => {
            const t = String(tag || '').toLowerCase();
            if (t.includes('full')) return 'full';
            if (t.includes('flex')) return 'flex';
            if (t.includes('correios') || t.includes('drop_off')) return 'correios';
            if (t.includes('envios') || t.includes('xd_drop_off') || t.includes('cross_docking') || t.includes('me2') || t.includes('custom')) return 'envios';
            if (t.includes('no_shipping')) return 'no_shipping';
            return t;
        };
        shippingTags = Array.from(new Set(shippingTags.map(normalizeTag)));
        shippingTags = shippingTags.filter((t) => !['mandatory_free_shipping','self_service_available','self_service_out'].includes(String(t)));
        // Filtrar pelos capabilities do seller quando disponíveis
        if (shippingCaps) {
            const has = (v?: boolean) => (v === undefined || v === true);
            const allow = (t: string) => {
                if (t === 'full') return has(shippingCaps.full);
                if (t === 'flex') return has(shippingCaps.flex);
                if (t === 'envios') return has(shippingCaps.envios);
                if (t === 'correios') return has(shippingCaps.correios);
                // Sem filtro para 'no_shipping'
                return true;
            };
            shippingTags = shippingTags.filter(allow);
        }
        if (mktLower === 'shopee') {
            const st = shippingTypesByItemId[idVal] || [];
            if (Array.isArray(st) && st.length) {
                shippingTags = Array.from(new Set(st));
            }
        }
        const listingTypeIdForItem = listingTypeByItemId[idVal] || null;
        const publicationTypeLabel = toPublicationLabel(listingTypeIdForItem);
        const publicationCosts = (() => {
            const currency = String((row as any)?.publication_currency || 'BRL');
            const commission = Number((row as any)?.total_fare || 0);
            const shippingCost = Number((row as any)?.publication_shipping_cost || 0);
            const total = commission + shippingCost;
            return { currency, commission, shippingCost, tax: 0, total };
        })();
        const publicationFeeDetails = {
            currency: String((row as any)?.publication_currency || 'BRL'),
            percentage: (row as any)?.percentage_fee ?? null,
            fixedFee: (row as any)?.fixed_fee ?? null,
            grossAmount: (row as any)?.gross_amount ?? null
        };
        // Mesclar performance_data e quality_level das métricas com colunas persistidas
        const metricsForItem = metricsByItemId[idVal] || {};
        const pd = metricsForItem?.performance_data;
        let qualityPercent = 0;
        let persistedLevel = row?.quality_level ?? metricsForItem?.quality_level ?? null;
        if (mktLower === 'shopee') {
            const rawLevel = pd?.quality_level ?? persistedLevel ?? null;
            const numLevel = typeof rawLevel === 'number' ? rawLevel : Number(rawLevel);
            persistedLevel = Number.isFinite(numLevel) ? numLevel : null;
            qualityPercent = numLevel === 1 ? 50 : (numLevel === 2 ? 76 : (numLevel === 3 ? 100 : 0));
        } else {
            const scoreRaw = (pd && !isNaN(Number(pd?.score))) ? Number(pd.score) : null;
            const rawCandidates = [
                scoreRaw,
                pd?.quality_score,
                pd?.listing_quality_percentage,
                pd?.listing_quality,
                row?.listing_quality,
                row?.quality_score,
            ];
            for (const v of rawCandidates) {
                const num = Number(v);
                if (!isNaN(num) && num >= 0) {
                    qualityPercent = num <= 1 ? num * 100 : num;
                    break;
                }
            }
            qualityPercent = Math.max(0, Math.min(100, qualityPercent));
        }
        // Motivo de pausa (quando aplicável)
        let pauseReason: string | null = null;
        const dataRaw: any = row?.data;
        if (dataRaw && (dataRaw.sub_status !== undefined) && mktLower !== 'shopee') {
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

        let visitsVal = Number(row?.visits_total ?? row?.visits ?? 0);
        let salesVal = typeof row?.sold_quantity === 'number' ? Number(row?.sold_quantity) : (Number(row?.sold_quantity) || 0);
        let likesVal = 0;
        let stockVal = typeof row?.available_quantity === 'number' ? Number(row?.available_quantity) : (Number(row?.available_quantity) || 0);
        if (mktLower === 'shopee') {
            const ip = (row as any)?.item_perfomance || {};
            visitsVal = Number(ip?.views || 0);
            salesVal = Number(ip?.sale || 0);
            likesVal = Number(ip?.liked_count || ip?.like_count || ip?.likes || 0);
            if (Array.isArray(row?.variations) && row.variations.length > 0) {
                stockVal = row.variations.reduce((acc: number, v: any) => {
                    const sellerInfoList = Array.isArray((v as any)?.stock_info_v2?.seller_stock) ? (v as any).stock_info_v2.seller_stock : null;
                    if (sellerInfoList) {
                        const sum = sellerInfoList.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                        return acc + sum;
                    }
                    const raw = (v as any)?.seller_stock;
                    if (typeof raw === 'number' && Number.isFinite(raw)) return acc + Number(raw);
                    if (Array.isArray(raw)) return acc + raw.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                    if (typeof (v as any)?.stock === 'object' && (v as any)?.stock) {
                        const sv = (v as any).stock;
                        if (typeof sv?.seller_stock === 'number' && Number.isFinite(sv?.seller_stock)) return acc + Number(sv.seller_stock);
                        if (Array.isArray(sv?.seller_stock)) return acc + sv.seller_stock.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                        if (Array.isArray(sv?.seller_stock_list)) return acc + sv.seller_stock_list.reduce((a: number, it: any) => a + (Number(it?.stock || 0) || 0), 0);
                    }
                    const availSummary = Number((v as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN);
                    const availableQty = Number.isFinite(availSummary) ? availSummary : (Number((v as any)?.available_quantity) || 0);
                    return acc + availableQty;
                }, 0);
            }
        }
        const conversionPct = visitsVal > 0 ? (salesVal / visitsVal) * 100 : 0;

        return {
            id: idVal,
            title: row?.title || "Sem título",
            sku: derivedSku,
            marketplace: String(row?.marketplace_name || "Mercado Livre"),
            price: priceNum,
            originalPrice: originalPrice,
            promoPrice,
            status: row?.status || "",
            visits: visitsVal,
            questions: Number(row?.questions_total ?? row?.questions ?? 0),
            sales: salesVal,
            likes: likesVal,
            stock: stockVal,
            marketplaceId: row?.marketplace_item_id || "",
            image: firstPic || "/placeholder.svg",
            shippingTags,
            quality: Math.round(qualityPercent),
            qualityLevel: persistedLevel,
            performanceData: pd,
            conversion: conversionPct,
            pauseReason,
            publicationType: publicationTypeLabel,
            publicationCosts,
            publicationFeeDetails,
            permalink: row?.permalink || null,
        };
    });

    const selectedMarketplaceDisplay = marketplaceNavItems.find(i => i.path === selectedMarketplacePath)?.displayName || null;
    const isShopeeSelected = String(selectedMarketplaceDisplay || '').toLowerCase() === 'shopee';

    const filteredAds = parsedAds
        .filter(ad => {
            if (activeStatus === "ativos") {
                const s = String(ad.status || '').toLowerCase();
                return isShopeeSelected ? s === "normal" : s === "active";
            }
            if (!isShopeeSelected && activeStatus === "inativos") {
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

    const isAllSelected = sortedAds.length > 0 && sortedAds.every(a => selectedItems.has(a.id));

    const toggleDraftSelection = (draftId: string) => {
        setSelectedDraftIds(prev => {
            const s = new Set(prev);
            if (s.has(draftId)) s.delete(draftId); else s.add(draftId);
            return s;
        });
    };
    const isAllDraftsSelected = drafts.length > 0 && drafts.every(d => selectedDraftIds.has(String(d.id)));
    const toggleSelectAllDrafts = () => {
        setSelectedDraftIds(prev => {
            const s = new Set(prev);
            const all = drafts.length > 0 && drafts.every(d => s.has(String(d.id)));
            if (all) drafts.forEach(d => s.delete(String(d.id))); else drafts.forEach(d => s.add(String(d.id)));
            return s;
        });
    };
    const handleDeleteSelectedDrafts = async () => {
        try {
            const ids = Array.from(selectedDraftIds);
            if (ids.length === 0) return;
            await (supabase as any)
                .from('marketplace_drafts')
                .delete()
                .eq('organizations_id', organizationId)
                .in('id', ids);
            setDrafts(prev => prev.filter(d => !ids.includes(String(d.id))));
            setSelectedDraftIds(new Set());
            toast({ title: 'Rascunhos excluídos', description: 'Os rascunhos selecionados foram removidos.' });
        } catch (e: any) {
            toast({ title: 'Falha ao excluir rascunhos', description: e?.message || String(e), variant: 'destructive' });
        }
    };

    const renderDrafts = () => {
        if (drafts.length === 0) {
            return <div className="p-6 text-sm text-gray-600">Nenhum rascunho encontrado.</div>;
        }
        return (
            <div>
                {drafts.map((d: any) => (
                    <div key={String(d.id)} className="relative bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Checkbox size="sm" indicatorStyle="square" checked={selectedDraftIds.has(String(d.id))} onCheckedChange={() => toggleDraftSelection(String(d.id))} />
                                <div className="text-sm text-gray-900 font-medium">{String(d.title || 'Sem título')}</div>
                                <div className="text-xs text-gray-600">{String(d.site_id || '')} · {String(d.marketplace_name || '')}</div>
                                <div className="text-xs text-gray-600">Atualizado: {new Date(String(d.updated_at)).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="sm" className="bg-novura-primary hover:bg-novura-primary/90" onClick={() => {
                                    navigate(`/anuncios/criar/?draft_id=${String(d.id)}`);
                                }}>Continuar cadastro</Button>
                                <Popover open={deletePopoverOpenId === String(d.id)} onOpenChange={(open) => setDeletePopoverOpenId(open ? String(d.id) : null)}>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700" aria-label="Excluir rascunho">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" sideOffset={8} className="w-64 bg-white border p-3 rounded-xl">
                                        <div className="text-sm text-gray-800 font-medium mb-2">Excluir rascunho?</div>
                                        <div className="text-xs text-gray-600 mb-3">Esta ação remove definitivamente o rascunho do banco de dados.</div>
                                        <div className="flex justify-end gap-2">
                                            <Button variant="outline" size="sm" onClick={() => setDeletePopoverOpenId(null)}>Cancelar</Button>
                                            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={async () => {
                                                try {
                                                    await (supabase as any)
                                                        .from('marketplace_drafts')
                                                        .delete()
                                                        .eq('id', d.id)
                                                        .eq('organizations_id', organizationId);
                                                    setDrafts((prev) => prev.filter((x: any) => String(x.id) !== String(d.id)));
                                                    setDeletePopoverOpenId(null);
                                                    toast({ title: 'Rascunho excluído', description: 'O rascunho foi removido com sucesso.' });
                                                } catch (e: any) {
                                                    toast({ title: 'Falha ao excluir rascunho', description: e?.message || String(e), variant: 'destructive' });
                                                }
                                            }}>Excluir</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const toggleSelectAll = () => {
        setSelectedItems(prev => {
            const newSet = new Set(prev);
            const visibleIds = sortedAds.map(a => a.id);
            const allSelected = visibleIds.length > 0 && visibleIds.every(id => newSet.has(id));
            if (allSelected) {
                visibleIds.forEach(id => newSet.delete(id));
            } else {
                visibleIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

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

    const formatVariationData = (variations: any[], itemRow?: any) => {
        if (!Array.isArray(variations) || variations.length === 0) return [];
        const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
        const fallbackImage = (Array.isArray(picsArr) && picsArr.length > 0)
            ? (typeof picsArr[0] === 'string' ? picsArr[0] : (picsArr[0]?.url || "/placeholder.svg"))
            : (itemRow?.thumbnail || "/placeholder.svg");
        return variations.map((variation, index) => {
            const attributes = Array.isArray(variation.attribute_combinations) ? variation.attribute_combinations : [];
            const types = (attributes.length > 0)
                ? attributes.map((attr: any) => ({
                    name: attr.name || attr.id || 'Tipo',
                    value: attr.value_name || attr.value || 'N/A'
                  }))
                : (() => {
                    const vname = String(variation?.model_name || variation?.name || '').trim();
                    return vname ? [{ name: 'Variação', value: vname }] : [];
                  })();
            let imageUrl: string | null = null;
            const pictureIds = Array.isArray(variation?.picture_ids) ? variation.picture_ids : (variation?.picture_id ? [variation.picture_id] : []);
            if (Array.isArray(pictureIds) && pictureIds.length > 0) {
                const pid = pictureIds[0];
                const match = picsArr.find((p: any) => {
                    if (typeof p === 'string') return false;
                    return String(p?.id || p?.picture_id) === String(pid);
                });
                if (typeof match === 'string') imageUrl = match;
                else imageUrl = match?.url || match?.secure_url || null;
            }
            if (!imageUrl) imageUrl = fallbackImage;
            const pi0 = Array.isArray((variation as any)?.price_info) ? (variation as any).price_info[0] : null;
            const cpCandidate = Number(pi0?.current_price ?? pi0?.inflated_price_of_current_price ?? (variation as any)?.current_price ?? NaN);
            const opCandidate = Number(pi0?.original_price ?? pi0?.inflated_price_of_original_price ?? (variation as any)?.original_price ?? NaN);
            const cp = Number.isFinite(cpCandidate) ? cpCandidate : undefined;
            const op = Number.isFinite(opCandidate) ? opCandidate : undefined;
            const priceFallback = typeof (variation as any)?.price === 'number' ? (variation as any).price : (Number((variation as any)?.price) || undefined);
            const availSummary = Number((variation as any)?.stock_info_v2?.summary_info?.total_available_stock ?? NaN);
            const availableQty = Number.isFinite(availSummary) ? availSummary : (Number((variation as any)?.available_quantity) || 0);
            let sellerTotal: number | null = null;
            const sellerInfoList = Array.isArray((variation as any)?.stock_info_v2?.seller_stock) ? (variation as any).stock_info_v2.seller_stock : null;
            if (sellerInfoList) {
                sellerTotal = sellerInfoList.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
            }
            const sellerStockRaw = (variation as any)?.seller_stock;
            if (typeof sellerStockRaw === 'number' && Number.isFinite(sellerStockRaw)) {
                sellerTotal = Number(sellerStockRaw);
            } else if (Array.isArray(sellerStockRaw)) {
                sellerTotal = sellerStockRaw.reduce((acc: number, it: any) => {
                    const val = typeof it === 'number' ? it : Number(it?.stock || 0);
                    return acc + (Number.isFinite(val) ? val : 0);
                }, 0);
            } else if (typeof (variation as any)?.stock === 'object' && (variation as any).stock) {
                const s = (variation as any).stock;
                if (typeof s?.seller_stock === 'number' && Number.isFinite(s?.seller_stock)) {
                    sellerTotal = Number(s.seller_stock);
                } else if (Array.isArray(s?.seller_stock)) {
                    sellerTotal = s.seller_stock.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
                } else if (Array.isArray(s?.seller_stock_list)) {
                    sellerTotal = s.seller_stock_list.reduce((acc: number, it: any) => acc + (Number(it?.stock || 0) || 0), 0);
                }
            }
            return {
                id: variation.model_id || variation.id || `var-${index}`,
                sku: variation.model_sku || variation.seller_sku || variation.sku || 'N/A',
                available_quantity: availableQty,
                seller_stock_total: Number.isFinite(Number(sellerTotal)) ? Number(sellerTotal) : availableQty,
                types,
                price: cp ?? op ?? priceFallback ?? 0,
                current_price: cp ?? (priceFallback ?? undefined),
                original_price: op,
                image: imageUrl || fallbackImage,
            };
        });
    };

    const duplicateAd = async (ad: any) => {
        try {
            if (!organizationId) { toast({ title: "Sessão necessária", description: "Entre na sua conta.", variant: "destructive" }); return; }
            const itemRow = items.find((item) => String(item?.marketplace_item_id || item?.id) === String(ad.id));
            if (!itemRow) { toast({ title: "Item não encontrado", description: "Não foi possível localizar o anúncio.", variant: "destructive" }); return; }
            const idVal = String(itemRow?.marketplace_item_id || itemRow?.id);
            const lt = listingTypeByItemId[idVal] || null;
            const picsArr = Array.isArray(itemRow?.pictures) ? itemRow.pictures : [];
            const pictureUrls: string[] = picsArr
                .map((p: any) => (typeof p === 'string' ? p : (p?.url || p?.secure_url || '')))
                .filter((u: string) => !!u);
            const attrs = Array.isArray(itemRow?.attributes) ? itemRow.attributes : [];
            const rawVars = Array.isArray(itemRow?.variations) ? itemRow.variations : [];
            const mappedVars = rawVars.map((v: any) => {
                const combos = Array.isArray(v?.attribute_combinations) ? v.attribute_combinations : [];
                const varAttrs = Array.isArray(v?.attributes) ? v.attributes : [];
                const qty = typeof v?.available_quantity === 'number' ? v.available_quantity : 0;
                const obj: any = { attribute_combinations: combos, available_quantity: qty };
                if (typeof v?.price === 'number') obj.price = v.price;
                if (varAttrs.length > 0) obj.attributes = varAttrs;
                const skuVal = v?.seller_sku ?? v?.sku ?? null;
                if (skuVal) obj.sku = skuVal;
                const picIds = Array.isArray(v?.picture_ids) ? v.picture_ids : (v?.picture_id ? [v.picture_id] : []);
                if (picIds.length > 0) {
                    const urls = picIds.map((pid: any) => {
                        const m = picsArr.find((p: any) => {
                            if (typeof p === 'string') return false;
                            return String(p?.id || p?.picture_id) === String(pid);
                        });
                        if (typeof m === 'string') return m;
                        return m?.url || m?.secure_url || '';
                    }).filter((u: string) => !!u);
                    if (urls.length > 0) obj.pictures = urls;
                }
                return obj;
            });
            const shippingRaw = (itemRow as any)?.data?.shipping || (itemRow as any)?.shipping || {};
            const dimsText = String((shippingRaw as any)?.dimensions || '');
            let dimsObj: any = undefined;
            let weightNum: number | undefined = undefined;
            if (dimsText) {
                const m = dimsText.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
                if (m) {
                    const l = Number(m[1]);
                    const h = Number(m[2]);
                    const w = Number(m[3]);
                    const g = Number(m[4]);
                    dimsObj = { length: isNaN(l) ? 0 : Math.round(l), height: isNaN(h) ? 0 : Math.round(h), width: isNaN(w) ? 0 : Math.round(w) };
                    weightNum = isNaN(g) ? undefined : Math.round(g);
                }
            }
            const ship: any = {};
            const modeRaw = (shippingRaw as any)?.mode ?? (shippingRaw as any)?.logistic_type ?? null;
            if (modeRaw) ship.mode = String(modeRaw);
            if (typeof (shippingRaw as any)?.local_pick_up !== 'undefined') ship.local_pick_up = !!(shippingRaw as any).local_pick_up;
            if (typeof (shippingRaw as any)?.free_shipping !== 'undefined') ship.free_shipping = !!(shippingRaw as any).free_shipping;
            if (dimsObj) ship.dimensions = dimsObj;
            if (typeof weightNum === 'number') ship.weight = weightNum;
            let descriptionText: string | undefined = undefined;
            try {
                const { data: descRow } = await (supabase as any)
                    .from('marketplace_item_descriptions')
                    .select('plain_text')
                    .eq('organizations_id', organizationId)
                    .eq('marketplace_name', 'Mercado Livre')
                    .eq('marketplace_item_id', idVal)
                    .limit(1)
                    .single();
                if (descRow && typeof (descRow as any)?.plain_text === 'string') descriptionText = String((descRow as any).plain_text);
            } catch {}
            const saleTerms = Array.isArray((itemRow as any)?.data?.sale_terms) ? (itemRow as any).data.sale_terms : (Array.isArray((itemRow as any)?.sale_terms) ? (itemRow as any).sale_terms : []);
            const priceNum = typeof itemRow?.price === 'number' ? itemRow.price : (Number(itemRow?.price) || 0);
            const availQty = typeof itemRow?.available_quantity === 'number' ? itemRow.available_quantity : (Number(itemRow?.available_quantity) || 0);
            const draft: any = {
                organizations_id: organizationId,
                marketplace_name: 'Mercado Livre',
                site_id: String(((itemRow as any)?.data?.site_id) || 'MLB'),
                title: itemRow?.title || null,
                category_id: itemRow?.category_id || null,
                condition: itemRow?.condition || undefined,
                attributes: attrs,
                variations: mappedVars,
                pictures: pictureUrls,
                price: priceNum,
                listing_type_id: lt || null,
                shipping: ship,
                sale_terms: saleTerms,
                description: descriptionText,
                available_quantity: availQty,
                last_step: 1,
                status: 'draft',
                api_cache: {}
            };
            const { data, error } = await (supabase as any)
                .from('marketplace_drafts')
                .insert(draft)
                .select('id')
                .single();
            if (error) { toast({ title: 'Falha ao duplicar', description: error?.message || '', variant: 'destructive' }); return; }
            const newId = String((data as any)?.id || '');
            if (newId) { toast({ title: 'Rascunho criado', description: 'Você pode editar o rascunho agora.' }); navigate(`/anuncios/criar/?draft_id=${newId}&step=6`); }
        } catch (e: any) {
            toast({ title: 'Erro ao duplicar', description: e?.message || String(e), variant: 'destructive' });
        }
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
                                onNavigate={(path) => { setSelectedMarketplacePath(path); navigate('/anuncios' + path); }}
                            />

                    <main className="flex-1 overflow-auto">
                        <div className="px-6 pt-3 pb-6">
                            {hasIntegration ? (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                <div className="flex items-center justify-between mb-6">
                                    <div className="border-b border-gray-200 w-full">
                                        <TabsList className="bg-transparent p-0 h-auto">
                                            <TabsTrigger 
                                                value="anuncios" 
                                                className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                            >
                                                Anúncios
                                            </TabsTrigger>
                                            <TabsTrigger 
                                                value="promocoes" 
                                                className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-novura-primary data-[state=active]:text-novura-primary hover:text-novura-primary rounded-none bg-transparent"
                                            >
                                                Promoções
                                            </TabsTrigger>
                                        </TabsList>
                                    </div>
                                </div>

                                        <TabsContent value="anuncios" className="mt-0">
                                    {stockModalOpen ? (
                                        <Dialog open={stockModalOpen} onOpenChange={(open) => { if (!open) { setStockModalOpen(false); setStockEditForItemId(null); setStockEditVariations([]); setStockEditsMap({}); setStockBulkValue(""); setStockUpdateLoading(false); } }}>
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
                                                        <Button
                                                            variant="outline"
                                                            onClick={() => {
                                                                const v = Number(stockBulkValue);
                                                                if (!Number.isFinite(v)) return;
                                                                setStockEditsMap(prev => {
                                                                    const next: Record<string, number> = { ...prev };
                                                                    stockEditVariations.forEach(it => { next[String(it.id)] = v; });
                                                                    return next;
                                                                });
                                                            }}
                                                        >
                                                            Aplicar a todos
                                                        </Button>
                                                    </div>
                                                    <div className="max-h-[50vh] overflow-y-auto pr-1">
                                                        <div className="space-y-3">
                                                            {stockEditVariations.map((v) => {
                                                                const key = String(v.id);
                                                                const current = typeof stockEditsMap[key] === 'number' ? stockEditsMap[key] : v.seller_stock_total;
                                                                return (
                                                                    <div key={key} className="grid grid-cols-12 items-center gap-3">
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
                                                                                value={current}
                                                                                onChange={(e) => {
                                                                                    const num = Number(e.target.value);
                                                                                    setStockEditsMap(prev => ({ ...prev, [key]: num }));
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                                <DialogFooter>
                                                    <Button variant="outline" onClick={() => { setStockModalOpen(false); setStockEditForItemId(null); setStockEditVariations([]); setStockEditsMap({}); setStockBulkValue(""); setStockUpdateLoading(false); }}>Cancelar</Button>
                                                    <Button
                                                        disabled={stockUpdateLoading}
                                                        onClick={async () => {
                                                            try {
                                                                setStockUpdateLoading(true);
                                                                if (!stockEditForItemId) return;
                                                                const itemIdNum = Number(stockEditForItemId);
                                                                if (!Number.isFinite(itemIdNum)) return;
                                                                const updates = Object.entries(stockEditsMap)
                                                                    .map(([modelIdStr, qty]) => ({ model_id: Number(modelIdStr), seller_stock: Number(qty) }))
                                                                    .filter(it => Number.isFinite(it.model_id) && Number.isFinite(it.seller_stock));
                                                                if (!updates.length) return;
                                                                const { data, error } = await (supabase as any).functions.invoke('shopee-update-stock', {
                                                                    body: { organizationId, item_id: itemIdNum, updates }
                                                                });
                                                                if (error) throw error;
                                                                setItems(prev => prev.map((r: any) => {
                                                                    const rid = String(r?.marketplace_item_id || r?.id);
                                                                    if (rid !== String(stockEditForItemId)) return r;
                                                                    const vars = Array.isArray(r?.variations) ? r.variations : [];
                                                                    const nextVars = vars.map((vv: any) => {
                                                                        const mid = String(vv?.model_id || vv?.id);
                                                                        const upd = updates.find(u => String(u.model_id) === mid);
                                                                        if (!upd) return vv;
                                                                        const ns = Number(upd.seller_stock);
                                                                        const sinfo = typeof vv?.stock_info_v2 === 'object' && vv.stock_info_v2 ? { ...vv.stock_info_v2 } : null;
                                                                        if (sinfo) {
                                                                            const list = Array.isArray(sinfo.seller_stock) ? [...sinfo.seller_stock] : [];
                                                                            if (list.length > 0) {
                                                                                const first = { ...list[0] };
                                                                                first.stock = ns;
                                                                                first.location_id = first.location_id || "BRZ";
                                                                                list[0] = first;
                                                                            } else {
                                                                                list.push({ stock: ns, if_saleable: true, location_id: "BRZ" });
                                                                            }
                                                                            sinfo.seller_stock = list;
                                                                            const summary = typeof sinfo.summary_info === 'object' && sinfo.summary_info ? { ...sinfo.summary_info } : {};
                                                                            summary.total_available_stock = ns;
                                                                            sinfo.summary_info = summary;
                                                                        }
                                                                        return { ...vv, seller_stock: ns, available_quantity: ns, stock_info_v2: sinfo || vv.stock_info_v2 };
                                                                    });
                                                                    return { ...r, variations: nextVars };
                                                                }));
                                                                setStockModalOpen(false);
                                                                setStockEditForItemId(null);
                                                                setStockEditVariations([]);
                                                                setStockEditsMap({});
                                                                setStockBulkValue("");
                                                                toast({ title: 'Estoque atualizado' });
                                                            } catch (e: any) {
                                                                toast({ title: 'Falha ao atualizar estoque', description: e?.message || String(e), variant: 'destructive' });
                                                            } finally {
                                                                setStockUpdateLoading(false);
                                                            }
                                                        }}
                                                    >
                                                        {stockUpdateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Atualizar"}
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    ) : null}
                                    {confirmDeleteItemId ? (
                                        <Dialog open={!!confirmDeleteItemId} onOpenChange={(open) => { if (!open) setConfirmDeleteItemId(null); }}>
                                            <DialogContent className="max-w-md">
                                                <DialogHeader>
                                                    <DialogTitle>Excluir anúncio?</DialogTitle>
                                                    <DialogDescription>Remove somente do banco de dados. Não impacta no Mercado Livre.</DialogDescription>
                                                </DialogHeader>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setConfirmDeleteItemId(null)}>Cancelar</Button>
                                                    <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={async () => {
                                                        try {
                                                            const ad = sortedAds.find(a => a.id === confirmDeleteItemId);
                                                            if (!ad) { setConfirmDeleteItemId(null); return; }
                                                            await (supabase as any)
                                                                .from('marketplace_items')
                                                                .delete()
                                                                .eq('organizations_id', organizationId)
                                                                .eq('marketplace_item_id', ad.marketplaceId);
                                                            setItems(prev => prev.filter((r: any) => String(r?.marketplace_item_id || r?.id) !== String(ad.marketplaceId)));
                                                            setConfirmDeleteItemId(null);
                                                            toast({ title: 'Anúncio excluído', description: 'Removido do banco de dados.' });
                                                        } catch (e: any) {
                                                            toast({ title: 'Falha ao excluir anúncio', description: e?.message || String(e), variant: 'destructive' });
                                                        }
                                                    }}>Excluir</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    ) : null}
                                    {bulkDeleteDraftsOpen && activeStatus === 'rascunhos' ? (
                                        <Dialog open={bulkDeleteDraftsOpen} onOpenChange={(open) => setBulkDeleteDraftsOpen(open)}>
                                            <DialogContent className="max-w-md">
                                                <DialogHeader>
                                                    <DialogTitle>Excluir rascunhos selecionados?</DialogTitle>
                                                    <DialogDescription>
                                                        {selectedDraftIds.size} selecionado(s). Esta ação remove definitivamente do banco de dados.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="sm" onClick={() => setBulkDeleteDraftsOpen(false)}>Cancelar</Button>
                                                    <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={async () => { await handleDeleteSelectedDrafts(); setBulkDeleteDraftsOpen(false); }}>Excluir</Button>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    ) : null}
                                    <div className="flex items-center justify-between mb-6">
                                        {stockModalOpen ? <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[40] pointer-events-none" /> : null}
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
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="outline" className="bg-white text-novura-primary border-gray-300">
                                                        Sincronizar
                                                        <ChevronDown className="w-4 h-4 ml-2 text-novura-primary" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSync(); }}>Sincronizar todos anúncios</DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSyncSelected(); }}>Sincronizar selecionados</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                            <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={() => navigate('/anuncios/criar/')}>
                                                <Plus className="w-4 h-4 mr-2" />
                                                Criar um anúncio
                                            </Button>
                                        </div>
                                    </div>

                                    
                                    <div className="mt-4">
                                        {(() => {
                                            const statusItems = isShopeeSelected
                                                ? [
                                                    { title: 'Todos', path: '/anuncios/todos' },
                                                    { title: 'Ativos', path: '/anuncios/ativos' },
                                                    { title: 'Rascunhos', path: '/anuncios/rascunhos' },
                                                  ]
                                                : [
                                                    { title: 'Todos', path: '/anuncios/todos' },
                                                    { title: 'Ativos', path: '/anuncios/ativos' },
                                                    { title: 'Inativos', path: '/anuncios/inativos' },
                                                    { title: 'Rascunhos', path: '/anuncios/rascunhos' },
                                                  ];
                                            return (
                                                <CleanNavigation
                                                    items={statusItems}
                                                    basePath=""
                                                    activePath={`/anuncios/${activeStatus}`}
                                                    onNavigate={(path) => { const seg = path.split('/').pop() || 'todos'; setActiveStatus(seg); navigate(path); }}
                                                />
                                            );
                                        })()}
                                    </div>

                                    <div className="mt-2 px-2 flex items-center justify-between">
                                        {activeStatus === 'rascunhos' ? (
                                            <>
                                                <label className="flex items-center space-x-2">
                                                    <Checkbox size="sm" indicatorStyle="square" checked={isAllDraftsSelected} onCheckedChange={toggleSelectAllDrafts} />
                                                    <span className="text-sm text-gray-700">Selecionar todos</span>
                                                </label>
                                                <div className="flex items-center gap-3">
                                                    {selectedDraftIds.size > 0 && (
                                                        <span className="text-sm text-novura-primary">{selectedDraftIds.size} selecionados</span>
                                                    )}
                                                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-transparent p-0 h-auto" disabled={selectedDraftIds.size === 0} onClick={() => setBulkDeleteDraftsOpen(true)}>Excluir selecionados</Button>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <label className="flex items-center space-x-2">
                                                    <Checkbox size="sm" indicatorStyle="square" checked={isAllSelected} onCheckedChange={toggleSelectAll} />
                                                    <span className="text-sm text-gray-700">Selecionar todos</span>
                                                </label>
                                                {selectedItems.size > 0 && (
                                                    <span className="text-sm text-novura-primary">{selectedItems.size} selecionados</span>
                                                )}
                                            </>
                                        )}
                                    </div>

                                    <Card className="mt-2 border border-gray-200 shadow-sm">
                                        <CardContent className="p-0">
                                            <div className="space-y-2">
                                                <div className="grid grid-cols-12 gap-x-2 items-center px-3 py-2 border-b border-gray-200">
                                                    <div className="col-span-1"></div>
                                                    <div className="col-span-3 text-xs font-medium text-gray-600">Produto(S)</div>
                                                    <div className="col-span-2 text-xs font-medium text-gray-600">Preço</div>
                                                    <div className="col-span-2 text-xs font-medium text-gray-600">Dados</div>
                                                    <div className="col-span-2 text-xs font-medium text-gray-600">Desempenho</div>
                                                    <div className="col-span-2 text-xs font-medium text-gray-600 text-right">Ações</div>
                                                </div>
                                            {activeStatus === 'rascunhos' ? (
                                                renderDrafts()
                                            ) : (
                                                sortedAds.length > 0 ? (
                                                sortedAds.map((ad) => {
                                                    const itemRow = items.find(item => String(item?.marketplace_item_id || item?.id) === String(ad.id));
                                                    const variations = formatVariationData(itemRow?.variations || [], itemRow);
                                                    const hasVariations = variations.length > 0;
                                                    const isExpanded = expandedVariations.has(ad.id);
                                                    const variationRange = (() => {
                                                        if (!hasVariations) return null;
                                                        const prices = variations
                                                            .map(v => {
                                                                const cp = typeof (v as any)?.current_price === 'number' ? (v as any).current_price : undefined;
                                                                const p = typeof (v as any)?.price === 'number' ? (v as any).price : undefined;
                                                                return typeof cp === 'number' ? cp : (typeof p === 'number' ? p : undefined);
                                                            })
                                                            .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
                                                        if (!prices.length) return null;
                                                        const min = Math.min(...prices);
                                                        const max = Math.max(...prices);
                                                        const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                                                        return min === max ? fmt(min) : `${fmt(min)} - ${fmt(max)}`;
                                                    })();

                                                    return (
                                                    <div key={ad.id} className="relative bg-white border border-gray-200 rounded-lg">
                                                        <div className="grid grid-cols-12 gap-y-3 gap-x-2 items-center p-3">
                                                            
                                                    {/* Coluna de seleção e variações (checkbox acima da seta) */}
                                                    <div className="col-span-1 flex flex-col items-start space-y-2 -ml-2">
                                                        {(() => {
                                                            const suggestions = getImprovementSuggestions(ad.performanceData);
                                                            if (!suggestions || suggestions.length === 0) return null;
                                                            const text = suggestions.join(' • ');
                                                            return (
                                                                <TooltipProvider delayDuration={0}>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <span className="relative inline-flex items-center justify-center cursor-pointer hover:scale-105 transition-transform mx-1">
                                                                                <span className="absolute inline-flex h-4 w-4 rounded-full bg-purple-600 opacity-75 animate-ping"></span>
                                                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-600 ring-2 ring-transparent hover:ring-purple-500"></span>
                                                                            </span>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="right" className="bg-purple-600 text-white border border-purple-600 w-[300px] min-h-[64px] whitespace-normal leading-snug text-center px-3 py-2">
                                                                            <div className="font-semibold">Recomendação Novura:</div>
                                                                            <div className="mt-1">{text}</div>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            );
                                                        })()}
                                                        <Checkbox
                                                            size="sm"
                                                            indicatorStyle="square"
                                                            checked={selectedItems.has(ad.id)}
                                                            onCheckedChange={() => toggleItemSelection(ad.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        {hasVariations && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => toggleVariationsExpansion(ad.id)}
                                                                className="h-6 w-6 p-0 self-start text-novura-primary rounded-full hover:bg-purple-50"
                                                            >
                                                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                            </Button>
                                                        )}
                                                    </div>
                                                        
                                                        {/* Coluna do Anúncio */}
                                                        <div className="flex items-start space-x-3 col-span-3 -ml-20">
                                                            <img
                                                                src={ad.image}
                                                                alt={ad.title}
                                                                className="w-16 h-16 rounded-lg object-cover bg-gray-100"
                                                            />
                                                            <div className="flex flex-col h-full justify-between min-w-0">
                                                                <div className="max-w-full">
                                                                    <div className="flex items-center">
                                                                        {ad.permalink ? (
                                                                            <a href={ad.permalink} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm text-gray-900 break-words whitespace-normal hover:text-novura-primary">{ad.title}</a>
                                                                        ) : (
                                                                            <div className="font-semibold text-sm text-gray-900 break-words whitespace-normal">{ad.title}</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="mt-2 text-xs text-gray-500">
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
                                                            {(() => {
                                                                const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                                                                if (variationRange) {
                                                                    return <div className="text-lg font-bold text-gray-900">{variationRange}</div>;
                                                                }
                                                                if (isShopeeSelected && ad.promoPrice && ad.originalPrice) {
                                                                    return (
                                                                        <>
                                                                            <div className="text-lg font-bold text-novura-primary">{fmt(ad.promoPrice)}</div>
                                                                            <div className="text-xs text-gray-500 line-through">{fmt(ad.originalPrice)}</div>
                                                                        </>
                                                                    );
                                                                }
                                                                if (isShopeeSelected && ad.promoPrice && !ad.originalPrice) {
                                                                    return <div className="text-lg font-bold text-novura-primary">{fmt(ad.promoPrice)}</div>;
                                                                }
                                                                return <div className="text-lg font-bold text-gray-900">{fmt(ad.price)}</div>;
                                                            })()}
                                                        </div>

                                                        {/* Coluna de Envio e Motivo */}
                                                        <div className="flex flex-col items-start space-y-2 justify-center col-span-2">
                                                            {ad.publicationType ? (
                                                                <TooltipProvider delayDuration={0}>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Badge variant="outline" className="text-xs px-2 border-[#7C3AED] text-[#7C3AED] cursor-help">
                                                                                {ad.publicationType}
                                                                            </Badge>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent className="rounded-lg bg-[#7C3AED] text-white border border-[#6D28D9] shadow-md w-64 min-h-24 p-3">
                                                                            {ad.publicationFeeDetails ? (
                                                                                <div className="text-xs leading-5">
                                                                                    {(() => {
                                                                                        const currency = ad.publicationFeeDetails?.currency || 'BRL';
                                                                                        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
                                                                                        const pct = ad.publicationFeeDetails?.percentage;
                                                                                        const fixed = ad.publicationFeeDetails?.fixedFee;
                                                                                        const gross = ad.publicationFeeDetails?.grossAmount;
                                                                                        const pctLabel = pct != null ? `${String(pct).replace('.', ',')}%` : null;
                                                                                        return (
                                                                                            <div className="space-y-1">
                                                                                                <div className="font-semibold">{ad.publicationType || 'Publicação'}</div>
                                                                                                <div>
                                                                                                    Tarifa de venda {pctLabel || '—'}{typeof fixed === 'number' && fixed > 0 ? ` + ${fmt.format(fixed)}` : ''}
                                                                                                </div>
                                                                                                <div className="font-medium">A pagar {gross != null ? fmt.format(gross) : fmt.format(0)}</div>
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            ) : ad.publicationCosts ? (
                                                                                <div className="text-xs leading-5">
                                                                                    {(() => {
                                                                                        const currency = ad.publicationCosts?.currency || 'BRL';
                                                                                        const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
                                                                                        return (
                                                                                            <div className="space-y-1">
                                                                                                <div className="font-semibold">Custos</div>
                                                                                                <div>Comissão: {fmt.format(ad.publicationCosts.commission || 0)}</div>
                                                                                                <div>Frete: {fmt.format(ad.publicationCosts.shippingCost || 0)}</div>
                                                                                                {ad.publicationCosts.tax ? <div>Taxas: {fmt.format(ad.publicationCosts.tax || 0)}</div> : null}
                                                                                                <div className="font-medium">Total: {fmt.format(ad.publicationCosts.total || 0)}</div>
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-xs">Sem dados de custos</div>
                                                                            )}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            ) : (
                                                                <Badge className={`${getMarketplaceColor(ad.marketplace)} text-white text-xs px-2`}>
                                                                    {ad.marketplace}
                                                                </Badge>
                                                            )}

                                                            {ad.shippingTags && ad.shippingTags.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1 mt-0.5">
                                                                    {ad.shippingTags.map((tag, index) => {
                                                                        const t = String(tag || '').toLowerCase();
                                                                        const label = (
                                                                            t === 'full' ? 'Full'
                                                                            : t === 'flex' ? 'Flex'
                                                                            : t === 'envios' ? 'Envios'
                                                                            : t === 'correios' ? 'Correios'
                                                                            : t === 'no_shipping' ? 'Sem envio'
                                                                            : (tag as string)
                                                                        );
                                                                        return (
                                                                            <Badge key={index} className="font-medium text-[9px] px-1 py-[1px] rounded-sm bg-[#7C3AED] text-white">
                                                                                {t === 'full' ? <Zap className="w-2 h-2 mr-0.5" /> : null}
                                                                                {label}
                                                                            </Badge>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <span className="text-sm text-gray-500">N/A</span>
                                                            )}

                                                            {(() => {
                                                                const s = (ad.status || '').toLowerCase();
                                                                if (s === 'paused' || s === 'inactive') {
                                                                    return (
                                                                        <span className="text-xs font-semibold mt-1" style={{ color: '#ff5917' }}>
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
                                                                <div className="flex items-center space-x-2 group">
                                                                    <Package className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900 flex items-center">
                                                                            <span>{ad.stock}</span>
                                                                            {isShopeeSelected ? (
                                                                                <button
                                                                                    className="ml-2 p-1 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                    onClick={() => {
                                                                                        try {
                                                                                            const itemRow = items.find((row) => String(row?.marketplace_item_id || row?.id) === String(ad.id));
                                                                                            if (!itemRow) { toast({ title: 'Item não encontrado', variant: 'destructive' }); return; }
                                                                                            const rawVars = Array.isArray(itemRow?.variations) ? itemRow.variations : [];
                                                                                            const mapped = formatVariationData(rawVars, itemRow)
                                                                                                .map((v: any) => ({ id: v.id, sku: v.sku, seller_stock_total: Number(v?.seller_stock_total || 0) }));
                                                                                            setStockEditVariations(mapped);
                                                                                            const initMap: Record<string, number> = {};
                                                                                            mapped.forEach((v) => { initMap[String(v.id)] = Number(v.seller_stock_total || 0); });
                                                                                            setStockEditsMap(initMap);
                                                                                            setStockEditForItemId(String(ad.id));
                                                                                            setStockBulkValue("");
                                                                                            setStockModalOpen(true);
                                                                                        } catch (e: any) {
                                                                                            toast({ title: 'Falha ao abrir edição de estoque', description: e?.message || String(e), variant: 'destructive' });
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <Pencil className="w-4 h-4 text-novura-primary" />
                                                                                </button>
                                                                            ) : null}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">Estoque</div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <Heart className="w-4 h-4 text-[#7C3AED]" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{Number(ad.likes || 0)}</div>
                                                                        <div className="text-xs text-gray-500">Curtidas</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Coluna de Controles (Switch, Medidor e Ações) */}
                                                        <div className="col-span-2">
                                                            <div className="flex items-center justify-center space-x-6">
                                                                {/* Medidor de Qualidade redesenhado */}
                                                                <div className="flex flex-col items-center">
                                                                    <svg width="84" height="56" viewBox="0 0 84 56">
                                                                        {/* trilho cinza */}
                                                                        <path d={`M12,46 A30,30 0 0,1 72,46`} fill="none" stroke="#E5E7EB" strokeWidth="8" strokeLinecap="round" />
                                                                        {(() => {
                                                                            const val = Math.max(0, Math.min(100, Number(ad.quality) || 0));
                                                                            const r = 30; // raio do arco
                                                                            const length = Math.PI * r; // comprimento do semicírculo
                                                                            const pct = val / 100;
                                                                            const dash = length * pct;
                                                                            const remain = length - dash;
                                                                            return (
                                                                                <path
                                                                                    d={`M12,46 A30,30 0 0,1 72,46`}
                                                                                    fill="none"
                                                                                    stroke={getQualityStrokeColor(ad.qualityLevel)}
                                                                                    strokeWidth="8"
                                                                                    strokeLinecap="round"
                                                                                    strokeDasharray={`${dash} ${remain}`}
                                                                                />
                                                                            );
                                                                        })()}
                                                                        <text x="42" y="35" textAnchor="middle" dominantBaseline="middle" fontSize="14" fill={getQualityStrokeColor(ad.qualityLevel)} fontWeight="700">
                                                                            {Math.max(0, Math.min(100, Number(ad.quality) || 0))}
                                                                        </text>
                                                                    </svg>
                                                                    {ad.qualityLevel !== null && ad.qualityLevel !== undefined && (() => {
                                                                        const label = getQualityLabel(ad.qualityLevel);
                                                                        const labelColor = getQualityStrokeColor(ad.qualityLevel);
                                                                        return label ? (
                                                                            <div className="mt-1 px-2 py-0.5 text-[10px] leading-4 border-2 rounded-full" style={{ borderColor: labelColor, color: labelColor }}>
                                                                                {label}
                                                                            </div>
                                                                        ) : null;
                                                                    })()}
                                                                </div>

                                                                {/* Switch de Status (após o medidor) */}
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-xs text-gray-600 mb-1">{(((ad.status || '').toLowerCase() === 'active') || (isShopeeSelected && (ad.status || '').toLowerCase() === 'normal')) ? 'Ativo' : 'Inativo'}</span>
                                                                    <Popover open={confirmPauseFor === ad.id} onOpenChange={(open) => { if (!open) setConfirmPauseFor(null); }}>
                                                                        <PopoverTrigger asChild>
                                                                            <Switch
                                                                                checked={(((ad.status || '').toLowerCase() === 'active') || (isShopeeSelected && (ad.status || '').toLowerCase() === 'normal'))}
                                                                                onCheckedChange={(checked) => {
                                                                                    const isActive = ((ad.status || '').toLowerCase() === 'active') || (isShopeeSelected && (ad.status || '').toLowerCase() === 'normal');
                                                                                    if (isActive && !checked) setConfirmPauseFor(ad.id); else toggleItemStatus(ad, checked);
                                                                                }}
                                                                                className="data-[state=checked]:bg-[#7C3AED] data-[state=unchecked]:bg-gray-200"
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

                                                                {/* Menu de Ações */}
                                                        <div>
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="text-novura-primary hover:text-novura-primary">
                                                                        <MoreHorizontal className="w-5 h-5" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent>
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); if (ad.permalink) { window.open(ad.permalink, '_blank'); } }}>
                                                                        <ExternalLink className="w-4 h-4 mr-2" /> Ver no Marketplace
                                                                    </DropdownMenuItem>
                                                                            <Drawer>
                                                                                <DrawerTrigger asChild>
                                                                                    <DropdownMenuItem onSelect={e => e.preventDefault()}>
                                                                                        <TrendingUp className="w-4 h-4 mr-2" /> Desempenho
                                                                                    </DropdownMenuItem>
                                                                                </DrawerTrigger>
                                                                                <DrawerContent>
                                                                                    <DrawerHeader>
                                                                                        <DrawerTitle>Desempenho do anúncio</DrawerTitle>
                                                                                        <DrawerDescription>Insights e recomendações para melhorar qualidade e conversão.</DrawerDescription>
                                                                                    </DrawerHeader>
                                                                                    <div className="px-6 pb-6 space-y-4">
                                                                                        <div className="grid grid-cols-2 gap-4">
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
                                                                                        </div>
                                                                                        <div>
                                                                                            <div className="text-xs font-medium text-gray-600 mb-2">Recomendações</div>
                                                                                            {(() => {
                                                                                                const hints = extractPerformanceHints(ad.performanceData, ad);
                                                                                                if (!hints || hints.length === 0) {
                                                                                                    return <div className="text-sm text-gray-500">Sem dados de desempenho disponíveis no momento.</div>;
                                                                                                }
                                                                                                return (
                                                                                                    <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                                                                                                        {hints.map((h, idx) => (
                                                                                                            <li key={idx}>{h}</li>
                                                                                                        ))}
                                                                                                    </ul>
                                                                                                );
                                                                                            })()}
                                                                                        </div>
                                                                                    </div>
                                                                                </DrawerContent>
                                                                            </Drawer>
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); duplicateAd(ad); }}>
                                                                        <Copy className="w-4 h-4 mr-2" /> Duplicar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); navigate(`/anuncios/edicao/${ad.marketplaceId}`); }}>
                                                                        <Edit className="w-4 h-4 mr-2" /> Editar
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmDeleteItemId(ad.id); }}>
                                                                        <Trash2 className="w-4 h-4 mr-2 text-red-600" /> Excluir
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </div>
                                                    </div>
                                                </div>
                                                    </div>
                                                    
                                                    {/* Variações (conteúdo expande abaixo do card; botão de toggle fica sob o checkbox) */}
                                                    {hasVariations && (
                                                        <div className="border-t border-gray-100 bg-gray-50">
                                                            <Collapsible open={isExpanded}>
                                                                <CollapsibleContent className="px-0,5 pb-3">
                                                                    <div className="space-y-1">
                                                                        {variations.map((variation, index) => (
                                                                            <div key={variation.id} className="bg-white rounded-lg p-2 border border-gray-200">
                                                                                {/* Usamos grid de 12 colunas para alinhar 'Estoque' ao bloco de métricas acima */}
                                                                                <div className="grid grid-cols-12 gap-4 items-center text-xs">
                                                                                    {/* Foto da variação, posicionada sob a coluna do anúncio */}
                                                                                    <div className="col-start-2 col-span-1 flex items-right justify-center">
                                                                                        <img src={variation.image} alt={`Variação ${variation.sku}`} className="w-12 h-12 rounded-md object-cover bg-gray-100" />
                                                                                    </div>
                                                                                    {/* SKU + Tipos abaixo */}
                                                                                    <div className="col-start-3 col-span-2">
                                                                                        <div className="text-gray-500 mb-1">SKU</div>
                                                                                        <div className="font-medium text-gray-900">{variation.sku}</div>
                                                                                        <div className="text-gray-500 mt-2 mb-1">Tipos</div>
                                                                                        <div className="space-y-1">
                                                                                            {variation.types.map((type, typeIndex) => (
                                                                                                <div key={typeIndex} className="text-gray-900">
                                                                                                    {type.value}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Preço — alinhado sob a coluna de preço (colunas 5-6 do card) */}
                                                                                    <div className="col-start-5 col-span-2">
                                                                                        <div className="text-gray-500 mb-1">Preço</div>
                                                                                        {(() => {
                                                                                            const cp = typeof (variation as any)?.current_price === 'number' ? (variation as any).current_price : undefined;
                                                                                            const op = typeof (variation as any)?.original_price === 'number' ? (variation as any).original_price : undefined;
                                                                                            const p = typeof (variation as any)?.price === 'number' ? (variation as any).price : undefined;
                                                                                            const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
                                                                                            if (typeof cp === 'number' && typeof op === 'number' && cp < op) {
                                                                                                return (
                                                                                                    <div className="flex items-baseline gap-2">
                                                                                                        <span className="text-gray-900 font-medium">{fmt(cp)}</span>
                                                                                                        <span className="text-gray-500 line-through">{fmt(op)}</span>
                                                                                                    </div>
                                                                                                );
                                                                                            }
                                                                                            if (typeof cp === 'number') return <div className="text-gray-900 font-medium">{fmt(cp)}</div>;
                                                                                            if (typeof p === 'number') return <div className="text-gray-900 font-medium">{fmt(p)}</div>;
                                                                                            return <div className="text-gray-900">—</div>;
                                                                                        })()}
                                                                                    </div>
                                                                                    {/* Estoque — alinhado sob o ícone de estoque (colunas 9-10 do card) */}
                                                                                    <div className="col-start-9 col-span-2">
                                                                                        <div className="text-gray-500 mb-1">Estoque</div>
                                                                                        <div className={`font-medium ${((variation as any)?.seller_stock_total ?? variation.available_quantity) < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                                                                                            {(variation as any)?.seller_stock_total ?? variation.available_quantity}
                                                                                        </div>
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
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                        <TabsContent value="promocoes" className="mt-0">
                            <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-600">
                                Em breve: gestão de promoções.
                            </div>
                                </TabsContent>
                            </Tabs>
                            ) : (
                                <div className="py-24 flex flex-col items-center justify-center">
                                    <div className="text-lg font-semibold text-gray-700">CONECTE UM APLICATIVO</div>
                                    <Button className="mt-4" onClick={() => navigate('/aplicativos')}>Ir para Aplicativos</Button>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
