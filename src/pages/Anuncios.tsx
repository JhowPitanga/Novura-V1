import { useState, useEffect } from "react";
import { Plus, Search, Filter, ExternalLink, Edit, Pause, Play, TrendingUp, Eye, BarChart, ShoppingCart, Percent, Copy, MoreHorizontal, DollarSign, ChevronUp, ChevronDown, ChevronDown as ChevronDownIcon, Package, Zap } from "lucide-react";
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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
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
    const [activeTab, setActiveTab] = useState<string>("anuncios");
    const { organizationId } = useAuth();
    const { toast } = useToast();
    // Estado para métricas adicionais por item (quality_level e performance_data)
    const [metricsByItemId, setMetricsByItemId] = useState<Record<string, { quality_level?: string | null; performance_data?: any }>>({});
    const [listingTypeByItemId, setListingTypeByItemId] = useState<Record<string, string | null>>({});
    const [shippingTypesByItemId, setShippingTypesByItemId] = useState<Record<string, string[]>>({});
    const [listingPricesByItemId, setListingPricesByItemId] = useState<Record<string, any>>({});
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());

    // Helper para colorização do medidor por nível de qualidade
    const getQualityStrokeColor = (level?: string | null) => {
        const s = String(level || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        // Priorizar correspondências específicas para evitar colisões de substring
        if (s.includes('bas')) return '#EF4444'; // vermelho (básica)
        if (s.includes('satis')) return '#F59E0B'; // âmbar (satisfatória)
        if (s.includes('prof')) return '#7C3AED'; // roxo Novura (profissional)
        return '#6B7280'; // cinza (desconhecido)
    };

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

            // Buscar métricas (quality_level e performance_data) diretamente
            try {
                const { data: metricsRows, error: metricsError } = await (supabase as any)
                    .from('marketplace_metrics')
                    .select('marketplace_item_id, quality_level, performance_data')
                    .eq('organizations_id', organizationId)
                    .limit(1000);
                if (metricsError) {
                    console.error('Erro ao buscar métricas:', metricsError);
                } else {
                    const map: Record<string, any> = {};
                    (metricsRows || []).forEach((m: any) => {
                        const k = m?.marketplace_item_id || m?.item_id || m?.id;
                        if (!k) return;
                        map[k] = { quality_level: m?.quality_level ?? null, performance_data: m?.performance_data ?? null };
                    });
                    setMetricsByItemId(map);
                }
            } catch (metricsCatchErr) {
                console.error('Falha ao carregar métricas:', metricsCatchErr);
            }

            // Buscar tipos de publicação (listing_type_id) e custos (listing_prices) no contexto de preço
            try {
                const { data: pricesRows, error: pricesErr } = await (supabase as any)
                    .from('marketplace_item_prices')
                    .select('marketplace_item_id, sale_price_context, listing_prices')
                    .eq('organizations_id', organizationId)
                    .eq('marketplace_name', 'Mercado Livre')
                    .limit(1000);
                if (pricesErr) {
                    console.error('Erro ao buscar marketplace_item_prices:', pricesErr);
                } else {
                    const lmap: Record<string, string | null> = {};
                    const pmap: Record<string, any> = {};
                    (pricesRows || []).forEach((p: any) => {
                        const k = p?.marketplace_item_id || p?.id;
                        if (!k) return;
                        const ctx = p?.sale_price_context || {};
                        const lt = ctx?.listing_type_id || ctx?.listingTypeId || null;
                        lmap[k] = lt ? String(lt) : null;
                        pmap[k] = p?.listing_prices ?? null;
                    });
                    setListingTypeByItemId(lmap);
                    setListingPricesByItemId(pmap);
                }
            } catch (pricesCatchErr) {
                console.error('Falha ao carregar tipos de publicação:', pricesCatchErr);
            }

            // Buscar distribuição de estoque e tipos de envio
            try {
                const { data: distRows, error: distErr } = await (supabase as any)
                    .from('marketplace_stock_distribution')
                    .select('marketplace_item_id, shipping_type')
                    .eq('organizations_id', organizationId)
                    .eq('marketplace_name', 'Mercado Livre')
                    .limit(5000);
                if (distErr) {
                    console.error('Erro ao buscar marketplace_stock_distribution:', distErr);
                } else {
                    const smap: Record<string, Set<string>> = {};
                    (distRows || []).forEach((d: any) => {
                        const id = d?.marketplace_item_id;
                        const t = String(d?.shipping_type || '').toLowerCase();
                        if (!id || !t) return;
                        if (!smap[id]) smap[id] = new Set<string>();
                        smap[id].add(t);
                    });
                    const out: Record<string, string[]> = {};
                    Object.keys(smap).forEach(k => { out[k] = Array.from(smap[k]); });
                    setShippingTypesByItemId(out);
                }
            } catch (distCatchErr) {
                console.error('Falha ao carregar distribuição de estoque:', distCatchErr);
            }
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

                // Buscar métricas também no fallback
                try {
                    const { data: metricsRows, error: metricsError } = await (supabase as any)
                        .from('marketplace_metrics')
                        .select('marketplace_item_id, quality_level, performance_data')
                        .eq('organizations_id', organizationId)
                        .limit(1000);
                    if (metricsError) {
                        console.error('Erro ao buscar métricas (fallback):', metricsError);
                    } else {
                        const map: Record<string, any> = {};
                        (metricsRows || []).forEach((m: any) => {
                            const k = m?.marketplace_item_id || m?.item_id || m?.id;
                            if (!k) return;
                            map[k] = { quality_level: m?.quality_level ?? null, performance_data: m?.performance_data ?? null };
                        });
                        setMetricsByItemId(map);
                    }
                } catch (metricsCatchErr) {
                    console.error('Falha ao carregar métricas (fallback):', metricsCatchErr);
                }

                // Buscar tipos de publicação e custos também no fallback
                try {
                    const { data: pricesRows, error: pricesErr } = await (supabase as any)
                        .from('marketplace_item_prices')
                        .select('marketplace_item_id, sale_price_context, listing_prices')
                        .eq('organizations_id', organizationId)
                        .eq('marketplace_name', 'Mercado Livre')
                        .limit(1000);
                    if (pricesErr) {
                        console.error('Erro ao buscar marketplace_item_prices (fallback):', pricesErr);
                    } else {
                        const lmap: Record<string, string | null> = {};
                        const pmap: Record<string, any> = {};
                        (pricesRows || []).forEach((p: any) => {
                            const k = p?.marketplace_item_id || p?.id;
                            if (!k) return;
                            const ctx = p?.sale_price_context || {};
                            const lt = ctx?.listing_type_id || ctx?.listingTypeId || null;
                            lmap[k] = lt ? String(lt) : null;
                            pmap[k] = p?.listing_prices ?? null;
                        });
                        setListingTypeByItemId(lmap);
                        setListingPricesByItemId(pmap);
                    }
                } catch (pricesCatchErr) {
                    console.error('Falha ao carregar tipos de publicação (fallback):', pricesCatchErr);
                }

                // Buscar distribuição de estoque e tipos de envio (fallback)
                try {
                    const { data: distRows, error: distErr } = await (supabase as any)
                        .from('marketplace_stock_distribution')
                        .select('marketplace_item_id, shipping_type')
                        .eq('organizations_id', organizationId)
                        .eq('marketplace_name', 'Mercado Livre')
                        .limit(5000);
                    if (distErr) {
                        console.error('Erro ao buscar marketplace_stock_distribution (fallback):', distErr);
                    } else {
                        const smap: Record<string, Set<string>> = {};
                        (distRows || []).forEach((d: any) => {
                            const id = d?.marketplace_item_id;
                            const t = String(d?.shipping_type || '').toLowerCase();
                            if (!id || !t) return;
                            if (!smap[id]) smap[id] = new Set<string>();
                            smap[id].add(t);
                        });
                        const out: Record<string, string[]> = {};
                        Object.keys(smap).forEach(k => { out[k] = Array.from(smap[k]); });
                        setShippingTypesByItemId(out);
                    }
                } catch (distCatchErr) {
                    console.error('Falha ao carregar distribuição de estoque (fallback):', distCatchErr);
                }
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
            const startedAt = Date.now();
            const clientRid = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
            console.log('[anuncios.sync] start', { organizationId, clientRid });

            // Orquestração em uma única chamada
            const { data: orchestration, error: orchError } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
                body: { organizationId, clientRid }
            });
            console.log('[anuncios.sync] orchestrator result', { orchError, orchestration });
            if (orchError) {
                try {
                    console.warn('[anuncios.sync] orchestrator failed, trying direct sync-items diagnostics');
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

            const { data: orchestration, error: orchError } = await (supabase as any).functions.invoke('mercado-livre-orchestrate-sync', {
                body: { organizationId, clientRid, onlySelectedIds }
            });
            console.log('[anuncios.syncSelected] orchestrator result', { orchError, orchestration });
            if (orchError) throw orchError;

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
        // Preços e promoção
        const priceNum = typeof row?.price === 'number' ? row.price : (Number(row?.price) || 0);
        const originalPrice = Number(row?.original_price) || null;
        const hasPromo = !!originalPrice && originalPrice > priceNum;
        const promoPrice = hasPromo ? priceNum : null;
        // Envio: consolidado de marketplace_stock_distribution ou fallback do marketplace_items
        let shippingTags: string[] = [];
        const idVal = row?.marketplace_item_id || row?.id;
        if (idVal && Array.isArray(shippingTypesByItemId[idVal])) {
            shippingTags = (shippingTypesByItemId[idVal] || []).map((s) => String(s || '').toLowerCase());
        }
        if (!shippingTags.length) {
            const sd = row?.stock_distribution;
            const fromSd = Array.isArray(sd?.shipping_types) ? sd.shipping_types : [];
            shippingTags = fromSd.map((s: any) => String(s || '').toLowerCase());
        }
        const listingTypeIdForItem = listingTypeByItemId[idVal] || null;
        const publicationTypeLabel = toPublicationLabel(listingTypeIdForItem);
        const publicationCosts = extractCostsFromListingPrices(listingPricesByItemId[idVal]);
        const publicationFeeDetails = extractSaleFeeDetails(listingPricesByItemId[idVal]);
        // Mesclar performance_data e quality_level das métricas com colunas persistidas
        const metricsForItem = metricsByItemId[idVal] || {};
        const pd = metricsForItem?.performance_data;
        const scoreRaw = (pd && !isNaN(Number(pd?.score))) ? Number(pd.score) : null;
        const rawCandidates = [
            scoreRaw,
            pd?.quality_score,
            pd?.listing_quality_percentage,
            pd?.listing_quality,
            row?.listing_quality,
            row?.quality_score,
        ];
        let qualityPercent = 0;
        for (const v of rawCandidates) {
            const num = Number(v);
            if (!isNaN(num) && num >= 0) {
                qualityPercent = num <= 1 ? num * 100 : num;
                break;
            }
        }
        qualityPercent = Math.max(0, Math.min(100, qualityPercent));
        const persistedLevel = row?.quality_level ?? metricsForItem?.quality_level ?? null;
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
            shippingTags,
            quality: Math.round(qualityPercent),
            qualityLevel: persistedLevel,
            performanceData: pd,
            margin: Number(row?.margin) || 0,
            pauseReason,
            publicationType: publicationTypeLabel,
            publicationCosts,
            publicationFeeDetails,
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

    const isAllSelected = sortedAds.length > 0 && sortedAds.every(a => selectedItems.has(a.id));

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
            const types = attributes.map((attr: any) => ({
                name: attr.name || attr.id || 'Tipo',
                value: attr.value_name || attr.value || 'N/A'
            }));
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
            return {
                id: variation.id || `var-${index}`,
                sku: variation.seller_sku || variation.sku || 'N/A',
                available_quantity: variation.available_quantity || 0,
                types: types,
                price: variation.price || 0,
                image: imageUrl || fallbackImage,
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
                        <div className="px-6 pt-3 pb-6">
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
                                            <Button className="bg-novura-primary hover:bg-novura-primary/90">
                                                <Plus className="w-4 h-4 mr-2" />
                                                Novo Anúncio
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

                                    <div className="mt-2 flex items-center justify-between">
                                        <label className="flex items-center space-x-2">
                                            <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} />
                                            <span className="text-sm text-gray-700">Selecionar todos</span>
                                        </label>
                                        {selectedItems.size > 0 && (
                                            <span className="text-sm text-novura-primary">{selectedItems.size} selecionados</span>
                                        )}
                                    </div>

                                    <Card className="mt-6 border border-gray-200 shadow-sm">
                                        <CardContent className="p-0">
                                            <div className="space-y-3">
                                        {sortedAds.length > 0 ? (
                                            sortedAds.map((ad) => {
                                                const itemRow = items.find(item => String(item?.marketplace_item_id || item?.id) === String(ad.id));
                                                const variations = formatVariationData(itemRow?.variations || [], itemRow);
                                                const hasVariations = variations.length > 0;
                                                const isExpanded = expandedVariations.has(ad.id);
                                                
                                                return (
                                                <div key={ad.id} className="relative bg-white border border-gray-200 rounded-lg">
                                                    <div className="grid grid-cols-12 gap-4 items-center p-5">
                                                        
                                                        {/* Checkbox + Botão de Variações */}
                                                        <div className="col-span-1 flex flex-col items-start space-y-1 -ml-3">
                                                            <Checkbox
                                                                checked={selectedItems.has(ad.id)}
                                                                onCheckedChange={() => toggleItemSelection(ad.id)}
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
                                                        <div className="flex items-start space-x-4 col-span-3 -ml-3">
                                                            <img
                                                                src={ad.image}
                                                                alt={ad.title}
                                                                className="w-24 h-24 rounded-lg object-cover bg-gray-100"
                                                            />
                                                            <div className="flex flex-col h-full justify-between min-w-0">
                                                                <div className="max-w-full">
                                                                    <div className="font-semibold text-base text-gray-900 break-words whitespace-normal">{ad.title}</div>
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
                                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                                    {ad.shippingTags.map((tag, index) => {
                                                                        const t = String(tag || '').toLowerCase();
                                                                        const label = t.includes('full') ? 'Full' : t.includes('flex') ? 'Flex' : t.includes('ag') ? 'AG' : t.includes('correios') ? 'Correios' : (tag as string);
                                                                        return (
                                                                            <Badge key={index} className="font-medium text-[10px] px-1.5 py-0.5 bg-[#7C3AED] text-white">
                                                                                {t.includes('full') ? <Zap className="w-2.5 h-2.5 mr-1" /> : null}
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
                                                                <div className="flex items-center space-x-2">
                                                                    <Package className="w-4 h-4 text-novura-primary" />
                                                                    <div className="text-sm">
                                                                        <div className="font-bold text-gray-900">{ad.stock}</div>
                                                                        <div className="text-xs text-gray-500">Estoque</div>
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
                                                                    {ad.qualityLevel && (() => {
                                                                        const raw = String(ad.qualityLevel || '').toLowerCase();
                                                                        const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
                                                                        const labelColor = getQualityStrokeColor(ad.qualityLevel);
                                                                        return (
                                                                            <div
                                                                                className="mt-1 px-2 py-0.5 text-[10px] leading-4 border-2 rounded-full"
                                                                                style={{ borderColor: labelColor, color: labelColor }}
                                                                            >
                                                                                {label}
                                                                            </div>
                                                                        );
                                                                    })()}
                                                                </div>

                                                                {/* Switch de Status (após o medidor) */}
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
                                                    
                                                    {/* Variações (conteúdo expande abaixo do card; botão de toggle fica sob o checkbox) */}
                                                    {hasVariations && (
                                                        <div className="border-t border-gray-100 bg-gray-50">
                                                            <Collapsible open={isExpanded}>
                                                                <CollapsibleContent className="px-3 pb-3">
                                                                    <div className="space-y-2">
                                                                        {variations.map((variation, index) => (
                                                                            <div key={variation.id} className="bg-white rounded-lg p-3 border border-gray-200">
                                                                                {/* Usamos grid de 12 colunas para alinhar 'Estoque' ao bloco de métricas acima */}
                                                                                <div className="grid grid-cols-12 gap-4 items-center text-xs">
                                                                                    {/* Foto da variação, posicionada sob a coluna do anúncio */}
                                                                                    <div className="col-start-2 col-span-1 flex items-center justify-center">
                                                                                        <img src={variation.image} alt={`Variação ${variation.sku}`} className="w-12 h-12 rounded-md object-cover bg-gray-100" />
                                                                                    </div>
                                                                                    {/* SKU */}
                                                                                    <div className="col-start-3 col-span-2">
                                                                                        <div className="text-gray-500 mb-1">SKU</div>
                                                                                        <div className="font-medium text-gray-900">{variation.sku}</div>
                                                                                    </div>
                                                                                    {/* Tipos */}
                                                                                    <div className="col-start-5 col-span-3">
                                                                                        <div className="text-gray-500 mb-1">Tipos</div>
                                                                                        <div className="space-y-1">
                                                                                            {variation.types.map((type, typeIndex) => (
                                                                                                <div key={typeIndex} className="text-gray-900">
                                                                                                    <span className="font-medium">{type.name}:</span> {type.value}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                    {/* Estoque — alinhado sob o ícone de estoque (colunas 9-10 do card) */}
                                                                                    <div className="col-start-9 col-span-2">
                                                                                        <div className="text-gray-500 mb-1">Estoque</div>
                                                                                        <div className={`font-medium ${variation.available_quantity < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                                                                                            {variation.available_quantity}
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
                                        )}
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
                        </div>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
