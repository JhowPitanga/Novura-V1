import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
// LoadingOverlay removido desta aba para evitar telas de carregamento ao trocar quadros
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import LoadingOverlay from "@/components/LoadingOverlay";
import { AdvancedFiltersDrawer } from "@/components/orders/AdvancedFiltersDrawer";
import { AllOrdersFilterBar } from "@/components/orders/AllOrdersFilterBar";
import { CanceledFilterBar } from "@/components/orders/CanceledFilterBar";
import { ColumnsManagementPanel } from "@/components/orders/ColumnsManagementPanel";
import { LinkFilterBar } from "@/components/orders/LinkFilterBar";
import { LinkOrderModal } from "@/components/orders/LinkOrderModal";
import { NfeFilterBar } from "@/components/orders/NfeFilterBar";
import { OrderDetailsDrawer } from "@/components/orders/OrderDetailsDrawer";
import { OrderStatusCards } from "@/components/orders/OrderStatusCards";
import { OrderTableHeader } from "@/components/orders/OrderTableHeader";
import { OrderTablePagination } from "@/components/orders/OrderTablePagination";
import { OrderTableRow } from "@/components/orders/OrderTableRow";
import { PrintConfigModal } from "@/components/orders/PrintConfigModal";
import { PrintFilterBar } from "@/components/orders/PrintFilterBar";
import { ScannerCheckoutModal } from "@/components/orders/ScannerCheckoutModal";
import { ShippedFilterBar } from "@/components/orders/ShippedFilterBar";
import { SyncOrdersModal } from "@/components/orders/SyncOrdersModal";
import { createOrderColumns } from "@/components/orders/orderColumnDefs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePrintingSettings } from "@/hooks/usePrintingSettings";
import { supabase } from "@/integrations/supabase/client";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs, eventToSPEpochMs, formatDateTimeSP } from "@/lib/datetime";
import { arrangeShopeeShipment, emitNfeQueue, fetchAllOrders, fetchNfeStatusRows, fetchOrderByInternalId, fetchShopeeShops as fetchShopeeShopsSvc, getCompanyIdForOrg, markOrdersPrinted, parseOrderRow, resolveOrgId, submitXmlSend, syncMercadoLivreOrders, syncNfeForOrder, syncShopeeOrders, updateOrdersInternalStatus } from "@/services/orders.service";
import { isAbortLikeError, mapTipoEnvioLabel, normalizeMarketplaceId, normalizeShippingType } from "@/utils/orderUtils";
import { generateFunctionalPickingListPDF } from "@/utils/pdfGenerators";
import { DateRange } from "react-day-picker";




function Pedidos() {
    const [activeStatus, setActiveStatus] = useState("todos");
    const [selectedPedido, setSelectedPedido] = useState<any>(null);
    const [isDetailsDrawerOpen, setIsDetailsDrawerOpen] = useState(false);
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [isVincularModalOpen, setIsVincularModalOpen] = useState(false);
    const [anunciosParaVincular, setAnunciosParaVincular] = useState<any[]>([]);
    const [pedidoParaVincular, setPedidoParaVincular] = useState<any>(null);
    const [selectedPedidosEmissao, setSelectedPedidosEmissao] = useState<string[]>([]);
    const [selectedPedidosImpressao, setSelectedPedidosImpressao] = useState<string[]>([]);
    const [selectedPedidosEnviado, setSelectedPedidosEnviado] = useState<string[]>([]);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isPrintConfigOpen, setIsPrintConfigOpen] = useState(false);
    const [isPickingListModalOpen, setIsPickingListModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [pedidos, setPedidos] = useState<any[]>([]);

    const [isSyncing, setIsSyncing] = useState(false);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncMarketplace, setSyncMarketplace] = useState<'mercado_livre' | 'shopee'>('mercado_livre');
    const [shopeeShopOptions, setShopeeShopOptions] = useState<Array<{ id: string; shop_id: number; label: string }>>([]);
    const [selectedShopeeShopId, setSelectedShopeeShopId] = useState<number | null>(null);
    const [shopeeOrderSnInput, setShopeeOrderSnInput] = useState<string>("");
    const [shopeeDateFrom, setShopeeDateFrom] = useState<string>("");
    const [shopeeDateTo, setShopeeDateTo] = useState<string>("");

    const [nfBadgeFilter, setNfBadgeFilter] = useState<'emitir' | 'processando' | 'falha' | 'subir_xml'>('emitir');
    const [vincularBadgeFilter, setVincularBadgeFilter] = useState<'para_vincular' | 'sem_estoque'>('para_vincular');

    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const path = String(location?.pathname || '');
        if (path.startsWith('/pedidos/emissao_nfe')) {
            if (activeStatus !== 'emissao-nf') setActiveStatus('emissao-nf');
            if (path.endsWith('/emitir')) {
                if (nfBadgeFilter !== 'emitir') setNfBadgeFilter('emitir');
            } else if (path.endsWith('/processando')) {
                if (nfBadgeFilter !== 'processando') setNfBadgeFilter('processando');
            } else if (path.endsWith('/falha_emissao')) {
                if (nfBadgeFilter !== 'falha') setNfBadgeFilter('falha');
            } else if (path.endsWith('/subir_xml')) {
                if (nfBadgeFilter !== 'subir_xml') setNfBadgeFilter('subir_xml');
            } else {
                if (nfBadgeFilter !== 'emitir') setNfBadgeFilter('emitir');
            }
        }
    }, [location.pathname, activeStatus, nfBadgeFilter]);
    useEffect(() => {
        const sp = new URLSearchParams(location.search);
        const statusParam = sp.get('status') || '';
        const allowed = new Set(['todos', 'a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta', 'enviado']);
        if (allowed.has(statusParam) && activeStatus !== statusParam) {
            setActiveStatus(statusParam);
        }
    }, [location.search, activeStatus]);
    const [processingIdsLocal, setProcessingIdsLocal] = useState<string[]>([]);
    const processingIdsSet = useMemo(() => {
        const s = new Set<string>();
        for (const id of processingIdsLocal) s.add(String(id));
        return s;
    }, [processingIdsLocal]);
    const [scannerTab, setScannerTab] = useState("nao-impressos");
    const [scannedSku, setScannedSku] = useState("");
    const [nfeAuthorizedByPedidoId, setNfeAuthorizedByPedidoId] = useState<Record<string, boolean>>({});
    const [nfeFocusStatusByPedidoId, setNfeFocusStatusByPedidoId] = useState<Record<string, string>>({});
    const [nfeXmlPendingByPedidoId, setNfeXmlPendingByPedidoId] = useState<Record<string, boolean>>({});
    const [nfeErrorMessageByPedidoId, setNfeErrorMessageByPedidoId] = useState<Record<string, string>>({});
    const [scannedPedido, setScannedPedido] = useState<any>(null);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [activePrintTab, setActivePrintTab] = useState("label");
    const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(undefined);
    const [isColumnsDrawerOpen, setIsColumnsDrawerOpen] = useState(false);
    const [activeFilterStatus, setActiveFilterStatus] = useState("todos");
    const [selectedPedidos, setSelectedPedidos] = useState<string[]>([]);
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    const [pageSize, setPageSize] = useState<number>(30);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [sortKey, setSortKey] = useState<'recent' | 'sku' | 'items' | 'shipping' | 'sla'>('recent');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [totalPedidosCount, setTotalPedidosCount] = useState<number | null>(null);
    const [statusCountsGlobal, setStatusCountsGlobal] = useState<Record<string, number> | null>(null);
    const [marketplaceFilters, setMarketplaceFilters] = useState<Record<string, string>>({ impressao: 'all', enviado: 'all', cancelado: 'all' });
    const [shippingTypeFilters, setShippingTypeFilters] = useState<Record<string, 'all' | 'full' | 'flex' | 'envios' | 'correios' | 'no_shipping'>>({ impressao: 'all', enviado: 'all' });
    const columnsDrawerRef = useRef<HTMLDivElement | null>(null);
    const listContainerRef = useRef<HTMLDivElement | null>(null);
    const orgIdRef = useRef<string | null>(null);
    const loadRunIdRef = useRef<number>(0);
    const loadDebounceRef = useRef<number | null>(null);
    const ensureDebounceRef = useRef<number | null>(null);
    const theadRef = useRef<HTMLTableSectionElement | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const [countsReady, setCountsReady] = useState(false);
    const [listReady, setListReady] = useState(false);
    const [listTopOffset, setListTopOffset] = useState<number>(64);

    const { user, organizationId } = useAuth();

    const [processedConsume, setProcessedConsume] = useState<Record<string, boolean>>({});
    const [processedRefund, setProcessedRefund] = useState<Record<string, boolean>>({});
    const [processedReserve, setProcessedReserve] = useState<Record<string, boolean>>({});
    const [processedEnsure, setProcessedEnsure] = useState<Record<string, boolean>>({});

    // Estado para animar suavemente o painel de colunas ao abrir
    const [columnsPanelAnimatedOpen, setColumnsPanelAnimatedOpen] = useState(false);
    // Estado para destacar alvo durante drag-and-drop
    const [emitEnvironment, setEmitEnvironment] = useState<'homologacao' | 'producao'>(() => {
        try {
            const v = localStorage.getItem('nfe_environment');
            return v === 'producao' ? 'producao' : 'homologacao';
        } catch {
            return 'homologacao';
        }
    });
    const [xmlLoadingIds, setXmlLoadingIds] = useState<string[]>([]);
    const [arrangeLoadingIds, setArrangeLoadingIds] = useState<string[]>([]);
    const xmlLoadingSet = useMemo(() => new Set(xmlLoadingIds), [xmlLoadingIds]);
    const arrangeLoadingSet = useMemo(() => new Set(arrangeLoadingIds), [arrangeLoadingIds]);
    const companyIdRef = useRef<string | null>(null);
    useEffect(() => { companyIdRef.current = null; }, [organizationId]);
    const getCompanyId = useCallback(async (): Promise<string | null> => {
        if (companyIdRef.current) return companyIdRef.current;
        if (!organizationId) return null;
        companyIdRef.current = await getCompanyIdForOrg(organizationId);
        return companyIdRef.current;
    }, [organizationId]);

    useEffect(() => {
        if (isColumnsDrawerOpen) {
            const t = setTimeout(() => setColumnsPanelAnimatedOpen(true), 20);
            return () => clearTimeout(t);
        }
        setColumnsPanelAnimatedOpen(false);
    }, [isColumnsDrawerOpen]);

    // Logs para diagnosticar abertura de Drawer de Colunas/Filtros e possíveis erros globais
    useEffect(() => {
        console.log('[Pedidos] isColumnsDrawerOpen mudou:', isColumnsDrawerOpen);
        if (isColumnsDrawerOpen && columnsDrawerRef.current) {
            const rect = columnsDrawerRef.current.getBoundingClientRect();
            const styles = window.getComputedStyle(columnsDrawerRef.current);
            console.log('[Pedidos] Columns Drawer Content rect:', rect);
            console.log('[Pedidos] Columns Drawer Content styles:', {
                position: styles.position,
                zIndex: styles.zIndex,
                right: styles.right,
                left: styles.left,
                width: styles.width,
                display: styles.display,
                visibility: styles.visibility,
                transform: styles.transform,
                opacity: styles.opacity,
            });
        }
    }, [isColumnsDrawerOpen]);

    useEffect(() => {
        // noop: mantido para possível debug futuro
    }, [isFilterDrawerOpen]);

    // Ajustar sort padrão ao entrar na aba Impressão
    useEffect(() => {
        if (activeStatus === 'impressao') {
            setSortKey('shipping');
            setSortDir('asc');
        } else if (activeStatus === 'todos') {
            setSortKey('recent');
            setSortDir('desc');
        }
    }, [activeStatus]);

    // Limpar seleção automaticamente ao trocar de quadro/aba
    useEffect(() => {
        setSelectedPedidos([]);
        setSelectedPedidosEmissao([]);
        setSelectedPedidosImpressao([]);
        setSelectedPedidosEnviado([]);
    }, [activeStatus]);



    // Carregar contagens globais (independente da paginação) aplicando filtros de data e busca
    const loadGlobalStatusCounts = useCallback(async () => {
        try {
            setStatusCountsGlobal(null);
            setCountsReady(false);
            const effectiveFromMs = dateRange?.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
            const effectiveToMs = dateRange?.to ? calendarEndOfDaySPEpochMs(dateRange.to as Date) : (dateRange?.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);
            const term = (searchTerm || "").toLowerCase();
            const inDate = (p: any) => {
                const baseDateStr = p.dataPagamento || p.data;
                const eventMs = baseDateStr ? eventToSPEpochMs(baseDateStr) : null;
                return effectiveFromMs === undefined ? true : (eventMs !== null && eventMs >= effectiveFromMs && (effectiveToMs === undefined || eventMs <= effectiveToMs));
            };
            const matchesSearch = (p: any) => term === "" || p.id?.toLowerCase?.().includes(term) || p.cliente?.toLowerCase?.().includes(term) || (p.sku && p.sku.toLowerCase().includes(term)) || (Array.isArray(p.itens) && p.itens.some((it: any) => (it?.nome && String(it.nome).toLowerCase().includes(term)) || (it?.product_name && String(it.product_name).toLowerCase().includes(term))));
            const base = pedidos.filter(p => inDate(p) && matchesSearch(p));
            const hasStatus = (p: any, arr: string[]) => arr.includes(String(p.status_interno || ''));
            const cancelado = base.filter(p => hasStatus(p, ['Cancelado', 'Devolução', 'Devolucao'])).length;
            const enviado = base.filter(p => hasStatus(p, ['Enviado'])).length;
            const aVincular = base.filter(p => hasStatus(p, ['A vincular', 'A Vincular', 'A VINCULAR'])).length;
            const emissao = base.filter(p => hasStatus(p, ['Emissao NF', 'Emissão NF', 'EMISSÃO NF', 'Subir xml', 'subir xml'])).length;
            const impressao = base.filter(p => hasStatus(p, ['Impressao', 'Impressão', 'IMPRESSÃO'])).length;
            const aguardando = base.filter(p => hasStatus(p, ['Aguardando Coleta', 'Aguardando coleta', 'AGUARDANDO COLETA'])).length;
            const semEstoque = base.filter(p => String(p.status_interno || '') === 'Sem estoque').length;
            const todos = base.length;
            setStatusCountsGlobal({ cancelado, enviado, 'a-vincular': aVincular, 'emissao-nf': emissao, impressao, 'aguardando-coleta': aguardando, 'sem-estoque': semEstoque, todos });
            setCountsReady(true);
        } catch (_) {
            setStatusCountsGlobal(null);
            setCountsReady(false);
        }
    }, [pedidos, dateRange, searchTerm]);

    // Atualizar contagens globais quando filtros mudarem, somente após primeira listagem
    useEffect(() => { }, [dateRange, searchTerm]);

    useEffect(() => { }, [activeStatus]);

    useEffect(() => {
        try {
            const channel = (supabase as any).channel('presented_new_changes');
            channel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_orders_presented_new' }, (payload: any) => {
                    const o: any = payload?.new || payload?.old;
                    if (!o) return;
                    const updated = parseOrderRow(o);
                    if (payload?.eventType === 'DELETE') {
                        startTransition(() => setPedidos(prev => prev.filter(p => p.id !== o.id)));
                    } else {
                        startTransition(() => setPedidos(prev => {
                            const idx = prev.findIndex(p => p.id === o.id);
                            const next = [...prev];
                            if (idx >= 0) next[idx] = updated; else next.unshift(updated);
                            try { const key = `pedidos_cache_${organizationId || ''}`; localStorage.setItem(key, JSON.stringify(next)); } catch { }
                            return next;
                        }));
                    }
                    loadGlobalStatusCounts();
                    const packId = (payload && payload.new && (payload.new as any).pack_id) ?? null;
                    const orderId = (payload && payload.new && (payload.new as any).id) ?? null;
                    if (ensureDebounceRef.current) { clearTimeout(ensureDebounceRef.current); ensureDebounceRef.current = null; }
                })
                .subscribe();
            return () => {
                try { (supabase as any).removeChannel(channel); } catch { }
            };
        } catch { }
    }, [organizationId, loadGlobalStatusCounts]);

    useEffect(() => { }, []);

    useEffect(() => {
        const onError = (e: ErrorEvent) => {
            const msg = (e as any)?.error || (e as any)?.message || '';
            if (isAbortLikeError(msg)) return;
            console.error('[Pedidos] Erro não tratado ao abrir Drawer:', msg, e.filename, e.lineno, e.colno);
        };
        const onUnhandledRejection = (e: PromiseRejectionEvent) => {
            const reason = (e as any)?.reason;
            if (isAbortLikeError(reason)) return;
            console.error('[Pedidos] Promessa rejeitada sem tratamento:', reason);
        };
        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onUnhandledRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onUnhandledRejection);
        };
    }, []);

    const loadPedidos = useCallback(async (opts?: { background?: boolean }) => {
        const background = Boolean(opts?.background);
        if (!background) setIsLoading(true);
        try {
            if (!user && !organizationId) {
                setPedidos([]);
                setListReady(true);
                return;
            }



            // Resolver organização para escopo da consulta
            let orgIdResolved: string | null = organizationId ?? null;
            if (!orgIdResolved) {
                orgIdResolved = await resolveOrgId(user.id);
            }

            // Cache rápido para exibição imediata
            const cacheKey = `pedidos_cache_${organizationId || ''}`;
            if (!background) {
                try {
                    const raw = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
                    if (raw) {
                        const cached = JSON.parse(raw);
                        if (Array.isArray(cached)) { startTransition(() => setPedidos(cached)); setListReady(true); }
                    }
                } catch { }
            }

            if (!orgIdResolved) {
                setPedidos([]);
                setListReady(true);
                return;
            }

            const lightParsed = await fetchAllOrders(orgIdResolved);
            setTotalPedidosCount(null);

            const runId = ++loadRunIdRef.current;
            startTransition(() => setPedidos(lightParsed));
            try { if (typeof window !== 'undefined') localStorage.setItem(cacheKey, JSON.stringify(lightParsed)); } catch { }
            setListReady(true);


        } catch (err) {
            if (!isAbortLikeError(err)) {
                console.error("Erro ao buscar pedidos:", err);
                setPedidos([]);
                setListReady(true);
            }
        } finally {
            if (!background) setIsLoading(false);
            try { setTimeout(() => { loadGlobalStatusCounts(); }, 0); } catch { }
        }
    }, [organizationId, user, loadGlobalStatusCounts]);



    // Removida a sincronização automática; sincronizar apenas ao clicar no botão

    // Não atualizar ao alternar quadro para evitar remoções e telas de recarga

    const refreshNfeAuthorizedMapForList = useCallback(async () => {
        try {
            if (!organizationId) return;
            const pedidosAtivos = pedidos.filter(p => {
                const si = String(p?.status_interno || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
                return si === 'emissao nf' || si === 'subir xml' || si === 'falha na emissao';
            });
            if (pedidosAtivos.length === 0) { setNfeAuthorizedByPedidoId({}); setNfeFocusStatusByPedidoId({}); setNfeXmlPendingByPedidoId({}); setNfeErrorMessageByPedidoId({}); return; }
            const idsToCheck = pedidosAtivos.map(p => String(p.id));
            const mkIdsToCheck = pedidosAtivos
                .map(p => String((p as any)?.marketplace_order_id || (p as any)?.idPlataforma || ''))
                .filter((v) => !!v);
            const idByOrderId = new Map<string, string>();
            const idByMarketplaceId = new Map<string, string>();
            for (const p of pedidosAtivos) {
                const pid = String(p.id);
                idByOrderId.set(pid, pid);
                const mk = String((p as any)?.marketplace_order_id || (p as any)?.idPlataforma || '');
                if (mk) idByMarketplaceId.set(mk, pid);
            }
            const companyId = await getCompanyId();
            if (!companyId) return;
            const nfRows = await fetchNfeStatusRows(companyId, idsToCheck, mkIdsToCheck);
            const envSel = emitEnvironment;
            const byMarketId: Record<string, boolean> = {};
            const byMarketStatus: Record<string, string> = {};
            const byXmlPending: Record<string, boolean> = {};
            const byErrorMessage: Record<string, string> = {};
            (Array.isArray(nfRows) ? nfRows : []).forEach((r: any) => {
                const orderIdRaw = String(r?.order_id || '');
                const mkIdRaw = String(r?.marketplace_order_id || '');
                let pid: string | undefined = undefined;
                if (orderIdRaw && idByOrderId.has(orderIdRaw)) {
                    pid = idByOrderId.get(orderIdRaw);
                } else if (mkIdRaw && idByMarketplaceId.has(mkIdRaw)) {
                    pid = idByMarketplaceId.get(mkIdRaw);
                }
                const mk = String(pid || orderIdRaw || mkIdRaw || '');
                const st = String(r?.status_focus || '').toLowerCase();
                const amb = String(r?.emissao_ambiente || '').toLowerCase();
                const xmlHas = !!(r?.xml_base64 || r?.xml_url);
                const marketplace = String(r?.marketplace || '');
                const mlSub = String(r?.marketplace_submission_status || '').toLowerCase();
                if (!mk) return;
                const okAmb = amb ? (envSel === 'producao' ? amb === 'producao' : amb === 'homologacao') : true;
                if (st === 'autorizado' && okAmb) byMarketId[mk] = true;
                if (okAmb) byMarketStatus[mk] = st;
                if (okAmb) byXmlPending[mk] = (st === 'autorizado') && marketplace.toLowerCase().includes('mercado') && xmlHas && mlSub !== 'sent';
                if (r?.error_details) {
                    try {
                        let rawStr: string | null = null;
                        if (typeof r.error_details === 'string') {
                            const s = r.error_details as string;
                            const si = s.indexOf('{');
                            const sj = s.lastIndexOf('}');
                            if (si !== -1 && sj !== -1 && sj > si) {
                                const slice = s.slice(si, sj + 1);
                                rawStr = slice;
                            } else {
                                rawStr = s;
                            }
                        }
                        const ed = rawStr ? JSON.parse(rawStr) : r.error_details;
                        const raw = String(ed?.mensagem_sefaz || '');
                        const msg = raw ? raw.replace(/\s*\[.*$/s, '').trim() : '';
                        if (msg) byErrorMessage[mk] = msg;
                    } catch {
                        const s = String(r.error_details || '');
                        let extracted = '';
                        const m = s.match(/"mensagem_sefaz"\s*:\s*"([^"]+)"/);
                        if (m && m[1]) extracted = m[1];
                        const msg = extracted ? extracted.replace(/\s*\[.*$/s, '').trim() : '';
                        if (msg) byErrorMessage[mk] = msg;
                    }
                }
            });
            const nextMap: Record<string, boolean> = {};
            const nextStatusMap: Record<string, string> = {};
            const nextXmlMap: Record<string, boolean> = {};
            const nextErrMap: Record<string, string> = {};
            for (const p of pedidosAtivos) {
                const mk = String(p.id);
                nextMap[mk] = byMarketId[mk] === true;
                nextStatusMap[mk] = byMarketStatus[mk] || '';
                nextXmlMap[mk] = byXmlPending[mk] === true;
                if (byErrorMessage[mk]) nextErrMap[mk] = byErrorMessage[mk];
            }
            setNfeAuthorizedByPedidoId(nextMap);
            setNfeFocusStatusByPedidoId(nextStatusMap);
            setNfeXmlPendingByPedidoId(nextXmlMap);
            setNfeErrorMessageByPedidoId(nextErrMap);
        } catch { }
    }, [organizationId, pedidos, emitEnvironment]);

    useEffect(() => {
        if (activeStatus === 'emissao-nf') {
            refreshNfeAuthorizedMapForList();
        }
    }, [activeStatus, refreshNfeAuthorizedMapForList]);
    useEffect(() => {
        if (activeStatus === 'emissao-nf' && nfBadgeFilter === 'falha') {
            refreshNfeAuthorizedMapForList();
        }
    }, [nfBadgeFilter, activeStatus, refreshNfeAuthorizedMapForList]);



    const handleSyncNfeForPedido = async (pedido: any) => {
        try {
            if (!organizationId) return;
            const companyId = await getCompanyId();
            if (!companyId) return;
            await syncNfeForOrder(organizationId, companyId, String(pedido.id), emitEnvironment);
            await refreshNfeAuthorizedMapForList();
        } catch { }
    };

    const handleEnviarNfeForPedido = async (pedido: any) => {
        try {
            setXmlLoadingIds(prev => Array.from(new Set([...prev, String(pedido.id)])));
            if (!organizationId) throw new Error('Organização não encontrada.');
            const companyId = await getCompanyId();
            if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
            await submitXmlSend(organizationId, companyId, String(pedido.marketplace_order_id || ''));
            toast({ title: "XML enfileirado", description: "Envio agendado para processamento." });
        } catch (e: any) {
            toast({ title: "Erro no envio", description: e?.message || String(e), variant: "destructive" });
        } finally {
            setXmlLoadingIds(prev => prev.filter(id => id !== String(pedido.id)));
        }
    };

    const handleArrangeShipmentForPedido = async (pedido: any) => {
        try {
            setArrangeLoadingIds(prev => Array.from(new Set([...prev, String(pedido.id)])));
            if (!organizationId) throw new Error('Organização não encontrada.');
            const companyId = await getCompanyId();
            if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
            const mk = String(pedido?.marketplace || '').toLowerCase();
            if (!mk.includes('shopee')) throw new Error('Apenas pedidos Shopee suportados.');
            const orderSn = String(pedido?.marketplace_order_id || pedido?.idPlataforma || '');
            if (!orderSn) throw new Error('order_sn ausente.');
            await arrangeShopeeShipment(organizationId, companyId, orderSn);
            toast({ title: "Organização de envio", description: "Planejamento de coleta/dropoff registrado." });
        } catch (e: any) {
            toast({ title: "Erro ao organizar envio", description: e?.message || String(e), variant: "destructive" });
        } finally {
            setArrangeLoadingIds(prev => prev.filter(id => id !== String(pedido.id)));
        }
    };

    const handleGerarNovaNfeForPedido = async (pedido: any) => {
        try {
            if (!organizationId) throw new Error('Organização não encontrada.');
            const companyId = await getCompanyId();
            if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
            await emitNfeQueue(organizationId, companyId, [String(pedido.id)], emitEnvironment, { forceNewNumber: true, forceNewRef: true });
            navigate('/pedidos/emissao_nfe/processando');
        } catch {
            // noop
        }
    };

    const handleSyncOrders = async () => {
        try {
            setIsSyncing(true);
            await syncMercadoLivreOrders(organizationId!);
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedidos:', e);
        } finally {
            setIsSyncing(false);
            setSelectedPedidos([]);
            setSelectedPedidosEmissao([]);
            setSelectedPedidosImpressao([]);
            setSelectedPedidosEnviado([]);
        }
    };

    const loadShopeeShops = async () => {
        try {
            if (!organizationId) return;
            const opts = await fetchShopeeShopsSvc(organizationId);
            setShopeeShopOptions(opts);
            if (opts.length > 0 && !selectedShopeeShopId) setSelectedShopeeShopId(Number(opts[0].shop_id));
        } catch { }
    };

    const handleSyncShopeeOrders = async () => {
        try {
            setIsSyncing(true);
            const opts: { orderSnList?: string[]; timeFrom?: number; timeTo?: number } = {};
            const orderSnText = String(shopeeOrderSnInput || "").trim();
            if (orderSnText) {
                const orderSnList = orderSnText.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
                if (orderSnList.length > 0) opts.orderSnList = orderSnList;
            }
            if (shopeeDateFrom) {
                opts.timeFrom = Math.floor(calendarStartOfDaySPEpochMs(new Date(shopeeDateFrom)) / 1000);
            }
            if (shopeeDateTo) {
                opts.timeTo = Math.floor(calendarEndOfDaySPEpochMs(new Date(shopeeDateTo)) / 1000);
            }
            await syncShopeeOrders(organizationId!, selectedShopeeShopId, opts);
            await loadPedidos();
            setIsSyncModalOpen(false);
        } catch (e) {
            console.error('Falha ao sincronizar pedidos Shopee:', e);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncSelectedOrders = async () => {
        try {
            const selectedIds = (
                activeStatus === 'todos' ? selectedPedidos :
                    activeStatus === 'emissao-nf' ? selectedPedidosEmissao :
                        activeStatus === 'impressao' ? selectedPedidosImpressao :
                            []
            ).map((id) => String(id)).filter(Boolean);

            const selectedOrderIds = pedidos
                .filter((p: any) => selectedIds.includes(String(p.id)))
                .filter((p: any) => String(p.marketplace || '').toLowerCase().includes('mercado'))
                .map((p: any) => String(p.id))
                .filter((id: string) => !!id && id !== '2000010000000000');

            if (selectedOrderIds.length === 0) {
                console.warn('Nenhum pedido selecionado com marketplace válido para sincronização.');
                return;
            }

            setIsSyncing(true);
            await syncMercadoLivreOrders(organizationId!, selectedOrderIds);
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedidos selecionados:', e);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncOrderByInternalId = async (internalOrderId?: string) => {
        try {
            const id = String(internalOrderId || '').trim();
            if (!id) return;
            setIsSyncing(true);

            const { marketplace_order_id, marketplace } = await fetchOrderByInternalId(id);
            const marketplaceName = String(marketplace || '').toLowerCase();
            if (!marketplaceName.includes('mercado')) throw new Error('Pedido não é do Mercado Livre');

            const mlOrderId = String(marketplace_order_id || '').trim();
            if (!/^\d+$/.test(mlOrderId)) throw new Error('Pedido sem marketplace_order_id válido');

            await syncMercadoLivreOrders(organizationId!, [mlOrderId]);
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedido por ID interno:', e);
        } finally {
            setIsSyncing(false);
        }
    };



    // Definição das colunas da tabela (valores padrão)
    const [columns, setColumns] = useState(() => createOrderColumns({
        activeStatus,
        nfBadgeFilter,
        processingIdsSet: new Set<string>(),
        nfeErrorMessageByPedidoId: {},
        nfeFocusStatusByPedidoId: {},
    }));

    // Snapshot das colunas padrão para mesclar com preferências salvas
    const defaultColumnsRef = useRef<any[] | null>(null);
    if (!defaultColumnsRef.current) {
        defaultColumnsRef.current = [...columns];
    }

    // Mesclar preferências salvas (id + enabled + ordem) com as colunas padrão
    const mergeSavedWithDefaults = (saved: Array<{ id: string; enabled?: boolean }>) => {
        const defaults = defaultColumnsRef.current || [];
        const defaultMap = new Map<string, any>(defaults.map((c) => [c.id, c]));
        const seen = new Set<string>();
        const merged: any[] = [];

        // Ordem conforme salvo (apenas ids ainda existentes)
        for (const s of saved) {
            if (!defaultMap.has(s.id)) continue;
            const base = defaultMap.get(s.id);
            merged.push({ ...base, enabled: base.alwaysVisible ? true : !!s.enabled });
            seen.add(s.id);
        }
        // Adiciona novos defaults que não estavam salvos
        for (const d of defaults) {
            if (!seen.has(d.id)) merged.push({ ...d });
        }
        return merged;
    };

    // Carregar preferências do localStorage quando a organização mudar
    useEffect(() => {
        if (!organizationId) return;
        try {
            const key = `pedidos_columns_${organizationId}`;
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setColumns(mergeSavedWithDefaults(parsed));
            }
        } catch (e) {
            console.error('Erro ao carregar preferências de colunas do localStorage:', e);
        }
    }, [organizationId]);

    // Salvar preferências sempre que as colunas mudarem
    useEffect(() => {
        if (!organizationId) return;
        try {
            const key = `pedidos_columns_${organizationId}`;
            const minimal = columns.map(({ id, enabled }) => ({ id, enabled }));
            localStorage.setItem(key, JSON.stringify(minimal));
        } catch (e) {
            console.error('Erro ao salvar preferências de colunas no localStorage:', e);
        }
    }, [columns, organizationId]);

    // Atualizar render functions das colunas quando o contexto mudar
    useEffect(() => {
        const freshCols = createOrderColumns({ activeStatus, nfBadgeFilter, processingIdsSet, nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId });
        const freshMap = new Map(freshCols.map(c => [c.id, c]));
        defaultColumnsRef.current = freshCols;
        setColumns(prev => prev.map(col => {
            const fresh = freshMap.get(col.id);
            return fresh ? { ...col, render: fresh.render } : col;
        }));
    }, [activeStatus, nfBadgeFilter, processingIdsSet, nfeErrorMessageByPedidoId, nfeFocusStatusByPedidoId]);

    // Usando o novo hook de impressão
    const { printSettings, setPrintSettings, handleSavePrintSettings } = usePrintingSettings();

    // Lógica para processar as vinculações e mover o pedido de status
    const handleSaveVinculacoes = async (vinculosOrPayload: any) => {
        // Suporta o formato antigo (mapa) e novo (payload com linkedItems)
        const vinculos: { [anuncioId: string]: string } =
            vinculosOrPayload && Array.isArray(vinculosOrPayload.linkedItems)
                ? vinculosOrPayload.linkedItems.reduce((acc: any, li: any) => {
                    acc[li.anuncioId] = li.productId;
                    return acc;
                }, {})
                : (vinculosOrPayload || {});

        const pedidoAtualizado = pedidos.find(p => p.id === pedidoParaVincular.id);
        if (pedidoAtualizado) {
            const novosItens = pedidoAtualizado.itens.map((item: any) => {
                const produtoIdVinculado = vinculos[item.id];
                if (produtoIdVinculado) {
                    return { ...item, vinculado: true };
                }
                return item;
            });
            const todosItensVinculados = novosItens.every((item: any) => item.vinculado);
            const novosPedidos = pedidos.map(p => {
                if (p.id === pedidoAtualizado.id) {
                    if (todosItensVinculados) {
                        return { ...p, itens: novosItens, status: 'Emissao NF' };
                    }
                    return { ...p, itens: novosItens };
                }
                return p;
            });
            setPedidos(novosPedidos);
        }
    };

    const handleEmitirNfe = async (pedidosToEmit: any[], opts?: { forceNewNumber?: boolean; forceNewRef?: boolean }) => {
        if (!pedidosToEmit || pedidosToEmit.length === 0) return;
        try {
            if (!organizationId) throw new Error("Organização não encontrada");
            const companyId = await getCompanyId();
            if (!companyId) throw new Error("Nenhuma empresa ativa encontrada");
            const orderIds: string[] = pedidosToEmit.map(p => String(p.id)).filter(Boolean);
            let envSel: string = 'homologacao';
            try { envSel = localStorage.getItem('nfe_environment') || 'homologacao'; } catch { }
            await emitNfeQueue(organizationId, companyId, orderIds, envSel, {
                forceNewNumber: !!(opts && opts.forceNewNumber),
                forceNewRef: !!(opts && opts.forceNewRef),
            });
            try {
                await updateOrdersInternalStatus(orderIds, 'Processando NF');
            } catch { }
            navigate('/pedidos/emissao_nfe/processando');
        } catch {
            // silencioso para manter UX fluida
        }
    };

    const handleScan = () => {
        const found = pedidosImpressao.find(p =>
            p.itens.some((item: any) => item.sku === scannedSku)
        );

        if (found) {
            console.log(`SKU ${scannedSku} encontrado no pedido ${found.id}`);
            const updatedPedido = { ...found };
            const itemToBip = updatedPedido.itens.find((item: any) => item.sku === scannedSku);
            if (itemToBip) {
                itemToBip.bipado = true;
            }
            setScannedPedido(updatedPedido);
            setScannedSku(""); // Limpa o input
        } else {
            console.error(`SKU ${scannedSku} não encontrado em nenhum pedido de impressão.`);
            alert("SKU não encontrado! Tente novamente."); // Simula som de erro
        }
    };

    const handleCompleteBipagem = () => {
        // Lógica para mover os pedidos bipados para 'Aguardando Coleta'
        const pedidosParaAtualizar = pedidosImpressao.filter(p =>
            p.itens.every((item: any) => item.bipado)
        );

        if (pedidosParaAtualizar.length > 0) {
            setPedidos(pedidos.map(p => {
                if (pedidosParaAtualizar.some(pa => pa.id === p.id)) {
                    return { ...p, status: 'Aguardando Coleta' };
                }
                return p;
            }));
        }
        setIsCompleteModalOpen(true);
        setIsScannerOpen(false);
    };

    const handleExportCSV = () => {
        const headers = ["ID", "Marketplace", "Produto", "SKU", "Cliente", "Valor", "Data", "Status", "Tipo de Envio"];
        const data = filteredPedidos.map(p => [
            p.id,
            p.marketplace,
            p.produto,
            p.sku || "N/A",
            p.cliente,
            `R$ ${p.valor.toFixed(2)}`,
            (() => {
                const base = p.dataPagamento || p.data;
                if (!base) return "";
                try { return formatDateTimeSP(base); } catch { return String(base); }
            })(),
            p.status,
            mapTipoEnvioLabel(p.tipoEnvio)
        ]);

        const csvContent = [
            headers.join(";"),
            ...data.map(row => row.join(";"))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `pedidos_${new Date().toISOString().slice(0, 10)}.csv`);
        link.click();
    };

    const pedidosImpressao = pedidos.filter(p => matchStatus(p, 'impressao'));
    const pedidosNaoImpressos = pedidosImpressao.filter(p => !p.impressoEtiqueta || !p.impressoLista);
    const pedidosImpressos = pedidosImpressao.filter(p => p.impressoEtiqueta && p.impressoLista);

    // Intervalo na timezone de São Paulo (dias do calendário em SP)
    const effectiveFromMs = dateRange?.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
    const effectiveToMs = dateRange?.to
        ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
        : (dateRange?.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);

    const baseFiltered = pedidos.filter(p => {
        const baseDateStr = p.dataPagamento || p.data;
        const eventMs = baseDateStr ? eventToSPEpochMs(baseDateStr) : null;
        const inDate = effectiveFromMs === undefined
            ? true
            : (eventMs !== null && eventMs >= effectiveFromMs && (effectiveToMs === undefined || eventMs <= effectiveToMs));

        const term = (searchTerm || "").toLowerCase();
        const searchTermMatch = term === "" ||
            p.id?.toLowerCase?.().includes(term) ||
            String(p.marketplace_order_id || '').toLowerCase().includes(term) ||
            String(p.pack_id || '').toLowerCase().includes(term) ||
            p.cliente?.toLowerCase?.().includes(term) ||
            (p.sku && p.sku.toLowerCase().includes(term)) ||
            (Array.isArray(p.itens) && p.itens.some((it: any) =>
                (it?.nome && String(it.nome).toLowerCase().includes(term)) ||
                (it?.product_name && String(it.product_name).toLowerCase().includes(term)) ||
                String(it?.pack_id || '').toLowerCase().includes(term)
            ));
        return inDate && searchTermMatch;
    });

    let filteredPedidos = baseFiltered.filter(p => matchStatus(p, activeStatus));
    const activeMarketplaceFilter = marketplaceFilters[activeStatus] ?? 'all';
    const activeShippingTypeFilter = shippingTypeFilters[activeStatus] ?? 'all';

    const norm = (v: any) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const nfePedidosAll = pedidos.filter(p => p && (norm(p.status_interno) === 'emissao nf' || norm(p.status_interno) === 'falha na emissao' || norm(p.status_interno) === 'subir xml'));
    const badgeCountFalha = nfePedidosAll.filter(p => norm(p.status_interno) === 'falha na emissao').length;
    const badgeCountProcessando = pedidos.filter(p => norm(p.status_interno) === 'processando nf').length;
    const badgeCountEmitir = nfePedidosAll.filter(p => {
        const st = String(nfeFocusStatusByPedidoId[String(p.id)] || '').toLowerCase();
        return norm(p.status_interno) === 'emissao nf' &&
            norm(p.subStatus) !== 'falha na emissao' &&
            !processingIdsSet.has(p.id) &&
            st !== 'processando_autorizacao' &&
            st !== 'pendente' &&
            st !== 'erro_autorizacao' &&
            st !== 'rejeitado' &&
            st !== 'denegado';
    }).length;
    const badgeCountSubirXml = nfePedidosAll.filter(p => norm(p.status_interno) === 'subir xml').length;

    // Filtros adicionais por quadro (Marketplace e Tipo de Envio)
    if (activeStatus === 'impressao' || activeStatus === 'enviado' || activeStatus === 'cancelado') {
        if (activeMarketplaceFilter !== 'all') {
            filteredPedidos = filteredPedidos.filter(p => normalizeMarketplaceId(String(p.marketplace || '')) === activeMarketplaceFilter);
        }
        if (activeStatus !== 'cancelado' && activeShippingTypeFilter !== 'all') {
            filteredPedidos = filteredPedidos.filter(p => normalizeShippingType(String(p.tipoEnvio ?? '')) === activeShippingTypeFilter);
        }
    }

    if (activeStatus === "emissao-nf") {
        if (nfBadgeFilter === "falha") {
            filteredPedidos = baseFiltered.filter(p => norm(p.status_interno) === 'falha na emissao');
        } else if (nfBadgeFilter === "processando") {
            filteredPedidos = baseFiltered.filter(p => norm(p.status_interno) === 'processando nf');
        } else if (nfBadgeFilter === "subir_xml") {
            filteredPedidos = baseFiltered.filter(p => norm(p.status_interno) === 'subir xml');
        } else {
            filteredPedidos = filteredPedidos.filter(p => {
                const st = String(nfeFocusStatusByPedidoId[String(p.id)] || '').toLowerCase();
                return (norm(p.status_interno) === 'emissao nf') &&
                    norm(p.subStatus) !== "falha na emissao" &&
                    norm(p.subStatus) !== "falha ao enviar" &&
                    !processingIdsSet.has(p.id) &&
                    st !== "processando_autorizacao" &&
                    st !== "pendente" &&
                    st !== "erro_autorizacao" &&
                    st !== "rejeitado" &&
                    st !== "denegado";
            });
        }
    }

    if (activeStatus === "a-vincular") {
        if (vincularBadgeFilter === "sem_estoque") {
            filteredPedidos = baseFiltered.filter(p => norm(p.status_interno) === 'sem estoque');
        } else {
            filteredPedidos = baseFiltered.filter(p => norm(p.status_interno) === 'a vincular');
        }
    }

    // Ordenação antes da paginação
    const sortedPedidos = [...filteredPedidos].sort((a, b) => {
        const dir = sortDir === 'desc' ? -1 : 1;
        if (sortKey === 'sku') {
            const as = String(a?.sku ?? '').toLowerCase();
            const bs = String(b?.sku ?? '').toLowerCase();
            return as.localeCompare(bs) * dir;
        }
        if (sortKey === 'items') {
            const av = Number(a?.quantidadeTotal ?? 0);
            const bv = Number(b?.quantidadeTotal ?? 0);
            if (av === bv) return 0;
            return av > bv ? dir : -dir;
        }
        if (sortKey === 'shipping') {
            const order = ['full', 'flex', 'envios', 'correios', 'no_shipping', ''];
            const as = normalizeShippingType(String(a?.tipoEnvio ?? ''));
            const bs = normalizeShippingType(String(b?.tipoEnvio ?? ''));
            const ai = order.indexOf(as);
            const bi = order.indexOf(bs);
            if (ai === bi) return 0;
            return ai > bi ? dir : -dir;
        }
        if (sortKey === 'sla') {
            const aExp = a?.slaDespacho?.expected_date ? new Date(a.slaDespacho.expected_date).getTime() : Number.POSITIVE_INFINITY;
            const bExp = b?.slaDespacho?.expected_date ? new Date(b.slaDespacho.expected_date).getTime() : Number.POSITIVE_INFINITY;
            if (aExp === bExp) return 0;
            return aExp > bExp ? dir : -dir;
        }
        // 'recent' por padrão: usa dataPagamento ou data (ordenado por horário em SP)
        const ad = a?.dataPagamento || a?.data;
        const bd = b?.dataPagamento || b?.data;
        const at = ad ? (eventToSPEpochMs(ad) ?? 0) : 0;
        const bt = bd ? (eventToSPEpochMs(bd) ?? 0) : 0;
        if (at === bt) return 0;
        return at > bt ? dir : -dir;
    });

    // Paginação baseada na lista ordenada (suporta paginação no servidor)
    const isServerPaged = totalPedidosCount !== null;
    const totalFiltered = (() => {
        const hasLocalFilterImpact = (activeMarketplaceFilter !== 'all' || activeShippingTypeFilter !== 'all');
        if (!isServerPaged || hasLocalFilterImpact) return sortedPedidos.length;
        if (activeStatus === 'todos') return (totalPedidosCount ?? sortedPedidos.length);
        const gs = statusCountsGlobal?.[activeStatus];
        return typeof gs === 'number' ? gs : sortedPedidos.length;
    })();
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedPedidos = isServerPaged ? sortedPedidos : sortedPedidos.slice(startIndex, startIndex + pageSize);
    const showingFrom = totalFiltered === 0 ? 0 : startIndex + 1;
    const showingTo = Math.min(startIndex + paginatedPedidos.length, totalFiltered);

    // Resetar página ao mudar filtros principais
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeStatus, dateRange, nfBadgeFilter, vincularBadgeFilter, sortKey, sortDir, activeMarketplaceFilter, activeShippingTypeFilter]);

    useEffect(() => {
        if (activeStatus === 'a-vincular') setVincularBadgeFilter('para_vincular');
    }, [activeStatus]);

    useEffect(() => { }, [currentPage, pageSize]);

    useEffect(() => { }, [searchTerm, dateRange, nfBadgeFilter, sortKey, sortDir, activeMarketplaceFilter, activeShippingTypeFilter]);

    // Carregar imediatamente ao entrar no módulo após preparar contagens globais (evitar múltiplas chamadas)
    const initialLoadDoneRef = useRef(false);
    useEffect(() => {
        if (!initialLoadDoneRef.current) {
            loadPedidos();
            initialLoadDoneRef.current = true;
        }
    }, [organizationId, loadPedidos]);

    useEffect(() => {
        try { loadGlobalStatusCounts(); } catch { }
    }, [loadGlobalStatusCounts]);

    useLayoutEffect(() => {
        const container = listContainerRef.current;
        const thead = theadRef.current;
        if (container && thead) {
            const cr = container.getBoundingClientRect();
            const tr = thead.getBoundingClientRect();
            const offset = Math.max(0, Math.round(tr.bottom - cr.top));
            setListTopOffset(offset);
        }
    }, [isLoading, activeStatus, sortKey, sortDir, activeMarketplaceFilter, activeShippingTypeFilter]);


    // Garantir que a página atual seja válida quando total de páginas mudar
    useEffect(() => {
        const tf = totalPedidosCount ?? filteredPedidos.length;
        const newTotalPages = Math.max(1, Math.ceil(tf / pageSize));
        if (currentPage > newTotalPages) {
            setCurrentPage(newTotalPages);
        }
    }, [totalPedidosCount, filteredPedidos.length, pageSize, currentPage]);

    useEffect(() => { }, [activeStatus, filteredPedidos, processedConsume]);

    useEffect(() => { }, [activeStatus, filteredPedidos, processedReserve]);

    useEffect(() => { }, [filteredPedidos, processedRefund]);

    useEffect(() => { }, [activeStatus, filteredPedidos, processedEnsure]);




    const handleSelectAll = (list: string[], setList: (list: string[]) => void) => {
        if (list.length === filteredPedidos.length) {
            setList([]);
        } else {
            setList(filteredPedidos.map(pedido => pedido.id));
        }
    };

    const handleCheckboxChange = (orderId: string, list: string[], setList: (list: string[]) => void) => {
        if (list.includes(orderId)) {
            setList(list.filter(id => id !== orderId));
        } else {
            setList([...list, orderId]);
        }
    };

    // Seleção da página atual
    const paginatedIds = paginatedPedidos.map(p => p.id);
    const selectedListByStatus = (
        activeStatus === 'todos' ? selectedPedidos :
            activeStatus === 'emissao-nf' ? selectedPedidosEmissao :
                activeStatus === 'impressao' ? selectedPedidosImpressao :
                    activeStatus === 'enviado' ? selectedPedidosEnviado :
                        []
    );
    const setSelectedListByStatus = (
        activeStatus === 'todos' ? setSelectedPedidos :
            activeStatus === 'emissao-nf' ? setSelectedPedidosEmissao :
                activeStatus === 'impressao' ? setSelectedPedidosImpressao :
                    activeStatus === 'enviado' ? setSelectedPedidosEnviado :
                        null
    );
    const isPageFullySelected = paginatedIds.length > 0 && paginatedIds.every(id => selectedListByStatus.includes(id));
    const togglePageSelection = () => {
        if (!setSelectedListByStatus) return;
        if (isPageFullySelected) {
            setSelectedListByStatus(selectedListByStatus.filter(id => !paginatedIds.includes(id)));
        } else {
            const newSet = Array.from(new Set([...selectedListByStatus, ...paginatedIds]));
            setSelectedListByStatus(newSet);
        }
    };

    const handleOpenDetailsDrawer = (pedido: any) => {
        setSelectedPedido(pedido);
        setIsDetailsDrawerOpen(true);
    };

    const handleVincularClick = (pedido: any) => {
        // Exibir todos os itens do pedido no modal, permitindo revisar/alterar vínculos já existentes
        const anunciosDoPedido = Array.isArray(pedido.itens) ? pedido.itens : [];
        setAnunciosParaVincular(anunciosDoPedido);
        setPedidoParaVincular(pedido);
        setIsVincularModalOpen(true);
    };



    function matchStatus(p: any, id: string): boolean {
        if (id === 'todos') return true;
        const base = (p?.status_interno ?? p?.status ?? '').toString();
        const s = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const target = String(id || '').toLowerCase().trim();
        if (!s && target !== 'a-vincular') return false;
        if (target === 'impressao') return s === 'impressao';
        if (target === 'aguardando-coleta') return s === 'aguardando coleta';
        if (target === 'a-vincular') return s === 'a vincular';
        if (target === 'cancelado') return s === 'cancelado' || s === 'devolucao';
        if (target === 'emissao-nf') return s === 'emissao nf';
        if (target === 'enviado') return s === 'enviado';
        const normalized = s.replace(/ /g, '-');
        return normalized === target;
    }

    const marketplaceOkLocal = (p: any) => {
        return true;
    };
    const shippingOkLocal = (p: any) => true;
    const baseForCounts = baseFiltered;

    const isPedidoAtrasado = (p: any) => {
        const shipmentStatusLower = String(p?.shipment_status || '').toLowerCase();
        const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup', 'shipped', 'dropped_off'];
        const isOrderCancelledOrReturned = (p?.status_interno === 'Cancelado' || p?.status_interno === 'Devolução');
        if (deliveredStatuses.includes(shipmentStatusLower) || isOrderCancelledOrReturned || String(p?.status_interno || '') === 'Enviado') return false;
        const slaStatusLower = String(p?.slaDespacho?.status || '').toLowerCase();
        const ed = p?.slaDespacho?.expected_date;
        const expired = ed ? (new Date(ed).getTime() - new Date().getTime() <= 0) : false;
        return slaStatusLower === 'delayed' || expired;
    };
    const allowedTooltipBlocks = new Set(['a-vincular', 'emissao-nf', 'impressao', 'aguardando-coleta']);
    const hasDelayedByBlock = (blockId: string) => {
        if (!allowedTooltipBlocks.has(blockId)) return false;
        return listReady ? baseForCounts.some(p => matchStatus(p, blockId) && isPedidoAtrasado(p)) : false;
    };

    const statusBlocks = [
        { id: 'todos', title: 'Todos os Pedidos', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['todos'] === 'number') ? statusCountsGlobal['todos'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'todos')).length : 0)), description: 'Sincronizados com marketplaces' },
        { id: 'a-vincular', title: 'A Vincular', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['a-vincular'] === 'number') ? statusCountsGlobal['a-vincular'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'a-vincular')).length : 0)), description: 'Pedidos sem vínculo de SKU' },
        { id: 'emissao-nf', title: 'Emissão de NFe', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['emissao-nf'] === 'number') ? statusCountsGlobal['emissao-nf'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'emissao-nf')).length : 0)), description: 'Aguardando emissão' },
        { id: 'impressao', title: 'Impressão', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['impressao'] === 'number') ? statusCountsGlobal['impressao'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'impressao')).length : 0)), description: 'NF e etiqueta' },
        { id: 'aguardando-coleta', title: 'Coleta', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['aguardando-coleta'] === 'number') ? statusCountsGlobal['aguardando-coleta'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'aguardando-coleta')).length : 0)), description: 'Prontos para envio' },
        { id: 'enviado', title: 'Enviado', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['enviado'] === 'number') ? statusCountsGlobal['enviado'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'enviado')).length : 0)), description: 'Pedidos em trânsito' },
        { id: 'cancelado', title: 'Cancelados', count: ((countsReady && statusCountsGlobal && typeof statusCountsGlobal['cancelado'] === 'number') ? statusCountsGlobal['cancelado'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'cancelado')).length : 0)), description: 'Pedidos cancelados/devolvidos' },
    ];

    const handlePrintPickingList = () => {
        const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
        const pdfUrl = generateFunctionalPickingListPDF(pedidosToPrint, printSettings);
        window.open(pdfUrl, '_blank');
        // Limpa seleções após ação
        setSelectedPedidosImpressao([]);
        setSelectedPedidosEmissao([]);
        setSelectedPedidos([]);
        setSelectedPedidosEnviado([]);
    };

    const handlePrintLabels = async () => {
        try {
            const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
            if (pedidosToPrint.length === 0) return;

            const pdfs = pedidosToPrint.map(p => p?.label?.pdf_base64).filter(Boolean) as string[];
            if (pdfs.length === 0) return;

            for (const base64 of pdfs) {
                const binStr = atob(base64);
                const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            }
            try {
                const ids = pedidosToPrint.map((p: any) => p.id);
                await markOrdersPrinted(ids);
            } catch { }
            setSelectedPedidosImpressao([]);
            setSelectedPedidosEmissao([]);
            setSelectedPedidos([]);
            setSelectedPedidosEnviado([]);
        } catch (err) {
            console.error('Erro ao imprimir etiquetas ML:', err);
        }
    };

    // Reimprime a etiqueta para um único pedido na aba "Aguardando Coleta"
    const handleReprintLabel = async (pedido: any) => {
        try {
            if (!pedido) return;

            const cachedPdf: string | null = pedido?.label?.pdf_base64 || null;
            const cachedContent: string | null = pedido?.label?.content_base64 || null;
            const contentType: string | null = pedido?.label?.content_type || null;
            const fileUrl: string | null = null;

            if (fileUrl) {
                window.open(fileUrl, '_blank');
            } else if (cachedPdf) {
                const binStr = atob(String(cachedPdf));
                const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
                const blob = new Blob([bytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else if (cachedContent) {
                const binStr = atob(String(cachedContent));
                const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
                const blob = new Blob([bytes], { type: (contentType || 'application/pdf') });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else {
                toast({ title: "Etiqueta não encontrada", description: "Nenhuma etiqueta salva foi localizada para este pedido.", variant: "destructive" });
                return;
            }
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
            try {
                await markOrdersPrinted([pedido.id]);
            } catch { }
        } catch (err) {
            console.error('Erro ao reimprimir etiqueta ML:', err);
        }
    };

    const selectedCount = (
        activeStatus === 'todos' ? selectedPedidos.length :
            activeStatus === 'emissao-nf' ? selectedPedidosEmissao.length :
                activeStatus === 'impressao' ? selectedPedidosImpressao.length :
                    activeStatus === 'enviado' ? selectedPedidosEnviado.length :
                        0
    );

    const rowHandlers = {
        handleCheckboxChange,
        handleVincularClick,
        handleOpenDetailsDrawer,
        handleReprintLabel,
        handleEmitirNfe,
        handleEnviarNfeForPedido,
        handleSyncNfeForPedido,
        handleArrangeShipmentForPedido,
        addProcessingId: (id: string) => setProcessingIdsLocal(prev => Array.from(new Set([...prev, id]))),
        norm,
    };

    const rowSelection = {
        selectedPedidos,
        setSelectedPedidos,
        selectedPedidosEmissao,
        setSelectedPedidosEmissao,
        selectedPedidosImpressao,
        setSelectedPedidosImpressao,
        selectedPedidosEnviado,
        setSelectedPedidosEnviado,
    };

    const rowNfeState = {
        nfBadgeFilter,
        processingIdsSet,
        nfeAuthorizedByPedidoId,
        nfeFocusStatusByPedidoId,
        xmlLoadingSet,
        arrangeLoadingSet,
    };

    return (
        <TooltipProvider>
            <SidebarProvider>
                <div className="min-h-screen flex w-full bg-gray-50">
                    <AppSidebar />
                    <div className="flex-1 flex flex-col">
                        <GlobalHeader />
                        <main className="flex-1 overflow-auto p-6 relative">
                            <div className="flex items-center justify-between mb-8">
                                <h1 className="text-3xl font-bold text-gray-900">Gestão de Pedidos</h1>
                                {(() => {
                                    const selectedCount = (
                                        activeStatus === 'todos' ? selectedPedidos.length :
                                            activeStatus === 'emissao-nf' ? selectedPedidosEmissao.length :
                                                activeStatus === 'impressao' ? selectedPedidosImpressao.length :
                                                    activeStatus === 'enviado' ? selectedPedidosEnviado.length :
                                                        0
                                    );
                                    return (
                                        <div className="flex items-center gap-3">
                                            <Button className="h-10 px-4 rounded-xl bg-primary text-white shadow-lg disabled:opacity-50" disabled={isSyncing} onClick={() => { setIsSyncModalOpen(true); loadShopeeShops(); }}>
                                                <Zap className="w-4 h-4 mr-2" />
                                                {isSyncing ? 'Sincronizando...' : 'Sincronizar pedidos'}
                                            </Button>
                                        </div>
                                    );
                                })()}
                            </div>

                            <OrderStatusCards
                                statusBlocks={statusBlocks}
                                activeStatus={activeStatus}
                                onStatusChange={(id) => {
                                    setActiveStatus(id);
                                    if (id === 'emissao-nf') {
                                        navigate('/pedidos/emissao_nfe');
                                    } else {
                                        navigate('/pedidos');
                                    }
                                }}
                                hasDelayedByBlock={hasDelayedByBlock}
                            />

                            {activeStatus === "a-vincular" && (
                                <LinkFilterBar
                                    vincularBadgeFilter={vincularBadgeFilter}
                                    onVincularBadgeFilterChange={setVincularBadgeFilter}
                                    paraVincularCount={(countsReady && statusCountsGlobal && typeof statusCountsGlobal['a-vincular'] === 'number') ? statusCountsGlobal['a-vincular'] : (listReady ? baseForCounts.filter(p => matchStatus(p, 'a-vincular')).length : 0)}
                                    semEstoqueCount={(countsReady && statusCountsGlobal && typeof statusCountsGlobal['sem-estoque'] === 'number') ? statusCountsGlobal['sem-estoque'] : (listReady ? baseForCounts.filter(p => String(p?.status_interno || '') === 'Sem estoque').length : 0)}
                                />
                            )}

                            {activeStatus === "todos" && (
                                <AllOrdersFilterBar
                                    searchTerm={searchTerm}
                                    onSearchTermChange={setSearchTerm}
                                    sortKey={sortKey}
                                    sortDir={sortDir}
                                    onSortKeyChange={setSortKey}
                                    onSortDirChange={setSortDir}
                                    isDatePopoverOpen={isDatePopoverOpen}
                                    onDatePopoverOpenChange={setIsDatePopoverOpen}
                                    dateRange={dateRange}
                                    onDateRangeChange={setDateRange}
                                    tempDateRange={tempDateRange}
                                    onTempDateRangeChange={setTempDateRange}
                                    onExportCSV={handleExportCSV}
                                    isFilterDrawerOpen={isFilterDrawerOpen}
                                    onFilterDrawerOpenChange={setIsFilterDrawerOpen}
                                    onColumnsDrawerOpen={() => setIsColumnsDrawerOpen(true)}
                                    pageSize={pageSize}
                                    onPageSizeChange={setPageSize}
                                    currentPage={safeCurrentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            )}

                            <SyncOrdersModal
                                open={isSyncModalOpen}
                                onOpenChange={setIsSyncModalOpen}
                                syncMarketplace={syncMarketplace}
                                onSyncMarketplaceChange={setSyncMarketplace}
                                isSyncing={isSyncing}
                                selectedCount={selectedCount}
                                onSyncAll={handleSyncOrders}
                                onSyncSelected={handleSyncSelectedOrders}
                                onSyncByInternalId={handleSyncOrderByInternalId}
                                shopeeShopOptions={shopeeShopOptions}
                                selectedShopeeShopId={selectedShopeeShopId}
                                onSelectedShopeeShopIdChange={setSelectedShopeeShopId}
                                shopeeOrderSnInput={shopeeOrderSnInput}
                                onShopeeOrderSnInputChange={setShopeeOrderSnInput}
                                shopeeDateFrom={shopeeDateFrom}
                                onShopeeDateFromChange={setShopeeDateFrom}
                                shopeeDateTo={shopeeDateTo}
                                onShopeeDateToChange={setShopeeDateTo}
                                onSyncShopee={handleSyncShopeeOrders}
                            />

                            {activeStatus === "emissao-nf" && (
                                <NfeFilterBar
                                    nfBadgeFilter={nfBadgeFilter}
                                    onNfBadgeFilterChange={setNfBadgeFilter}
                                    onNavigate={navigate}
                                    badgeCounts={{ emitir: badgeCountEmitir, processando: badgeCountProcessando, falha: badgeCountFalha, subirXml: badgeCountSubirXml }}
                                    searchTerm={searchTerm}
                                    onSearchTermChange={setSearchTerm}
                                    filteredPedidos={filteredPedidos}
                                    selectedPedidosEmissao={selectedPedidosEmissao}
                                    onMassEmit={(toEmit) => {
                                        const ids = toEmit.map(p => p.id).filter(Boolean);
                                        if (ids.length === 0) return;
                                        setProcessingIdsLocal(Array.from(new Set([...processingIdsLocal, ...ids.map(String)])));
                                        handleEmitirNfe(toEmit);
                                    }}
                                    onSelectedEmit={(toEmit) => {
                                        const ids = toEmit.map(p => p.id).filter(Boolean);
                                        if (ids.length === 0) return;
                                        setProcessingIdsLocal(Array.from(new Set([...processingIdsLocal, ...ids.map(String)])));
                                        handleEmitirNfe(toEmit);
                                    }}
                                    emitEnvironment={emitEnvironment}
                                    onEmitEnvironmentChange={setEmitEnvironment}
                                    currentPage={safeCurrentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            )}

                            {activeStatus === "impressao" && (
                                <PrintFilterBar
                                    searchTerm={searchTerm}
                                    onSearchTermChange={setSearchTerm}
                                    sortKey={sortKey}
                                    sortDir={sortDir}
                                    onSortKeyChange={setSortKey}
                                    onSortDirChange={setSortDir}
                                    marketplaceFilter={marketplaceFilters['impressao']}
                                    onMarketplaceFilterChange={(v) => setMarketplaceFilters(s => ({ ...s, impressao: v as any }))}
                                    shippingTypeFilter={shippingTypeFilters['impressao']}
                                    onShippingTypeFilterChange={(v) => setShippingTypeFilters(s => ({ ...s, impressao: v as any }))}
                                    baseFiltered={baseFiltered}
                                    matchStatus={matchStatus}
                                    selectedPedidosImpressao={selectedPedidosImpressao}
                                    pedidos={pedidos}
                                    onPrintLabels={handlePrintLabels}
                                    currentPage={safeCurrentPage}
                                    totalPages={totalPages}
                                    onPageChange={setCurrentPage}
                                />
                            )}

                            {activeStatus === "enviado" && (
                                <ShippedFilterBar
                                    searchTerm={searchTerm}
                                    onSearchTermChange={setSearchTerm}
                                    sortKey={sortKey}
                                    sortDir={sortDir}
                                    onSortKeyChange={setSortKey}
                                    onSortDirChange={setSortDir}
                                    marketplaceFilter={marketplaceFilters['enviado']}
                                    onMarketplaceFilterChange={(v) => setMarketplaceFilters(s => ({ ...s, enviado: v as any }))}
                                    shippingTypeFilter={shippingTypeFilters['enviado']}
                                    onShippingTypeFilterChange={(v) => setShippingTypeFilters(s => ({ ...s, enviado: v as any }))}
                                    baseFiltered={baseFiltered}
                                    matchStatus={matchStatus}
                                />
                            )}

                            {activeStatus === "cancelados" && (
                                <CanceledFilterBar
                                    searchTerm={searchTerm}
                                    onSearchTermChange={setSearchTerm}
                                    sortKey={sortKey}
                                    sortDir={sortDir}
                                    onSortKeyChange={setSortKey}
                                    onSortDirChange={setSortDir}
                                    marketplaceFilter={marketplaceFilters['cancelado']}
                                    onMarketplaceFilterChange={(v) => setMarketplaceFilters(s => ({ ...s, cancelado: v as any }))}
                                />
                            )}

                            <div ref={listContainerRef} className="rounded-2xl bg-white shadow-lg overflow-hidden relative">
                                {isLoading && (
                                    <LoadingOverlay fullscreen={false} topOffset={listTopOffset} message={"Carregando pedidos..."} />
                                )}
                                <div className="overflow-x-auto text-[clamp(12px,0.95vw,14px)]">
                                    <table className="min-w-full table-fixed divide-y divide-gray-200">
                                        <OrderTableHeader
                                            ref={theadRef}
                                            activeStatus={activeStatus}
                                            columns={columns}
                                            selectedCount={
                                                activeStatus === 'todos' ? selectedPedidos.length :
                                                    activeStatus === 'emissao-nf' ? selectedPedidosEmissao.length :
                                                        activeStatus === 'impressao' ? selectedPedidosImpressao.length :
                                                            activeStatus === 'enviado' ? selectedPedidosEnviado.length :
                                                                0
                                            }
                                            filteredCount={filteredPedidos.length}
                                            isAllChecked={
                                                (activeStatus === "todos" && selectedPedidos.length > 0 && selectedPedidos.length === filteredPedidos.length) ||
                                                (activeStatus === "emissao-nf" && selectedPedidosEmissao.length > 0 && selectedPedidosEmissao.length === filteredPedidos.length) ||
                                                (activeStatus === "impressao" && selectedPedidosImpressao.length > 0 && selectedPedidosImpressao.length === filteredPedidos.length) ||
                                                (activeStatus === "enviado" && selectedPedidosEnviado.length > 0 && selectedPedidosEnviado.length === filteredPedidos.length)
                                            }
                                            isCheckboxDisabled={activeStatus === 'emissao-nf' && nfBadgeFilter === 'processando'}
                                            onSelectAll={() => {
                                                if (activeStatus === "todos") handleSelectAll(selectedPedidos, setSelectedPedidos);
                                                if (activeStatus === "emissao-nf") handleSelectAll(selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                if (activeStatus === "impressao") handleSelectAll(selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                if (activeStatus === "enviado") handleSelectAll(selectedPedidosEnviado, setSelectedPedidosEnviado);
                                            }}
                                        />
                                        <tbody className="bg-white divide-y-[2px] divide-gray-200">
                                            {paginatedPedidos.length > 0 ? (
                                                paginatedPedidos.map((pedido) => (
                                                    <OrderTableRow
                                                        key={pedido.id}
                                                        pedido={pedido}
                                                        activeStatus={activeStatus}
                                                        columns={columns}
                                                        handlers={rowHandlers}
                                                        selection={rowSelection}
                                                        nfeState={rowNfeState}
                                                    />
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={columns.filter(col => col.enabled).length + 2} className="py-10 text-center text-gray-500">Nenhum pedido encontrado para este status.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <OrderTablePagination
                                    currentPage={safeCurrentPage}
                                    totalPages={totalPages}
                                    showingFrom={showingFrom}
                                    showingTo={showingTo}
                                    totalFiltered={totalFiltered}
                                    onPageChange={setCurrentPage}
                                />
                            </div>
                        </main>
                    </div>
                </div>

                {/* Drawer de Detalhes do Pedido */}
                <OrderDetailsDrawer
                    pedido={selectedPedido}
                    open={isDetailsDrawerOpen}
                    onOpenChange={(open) => { setIsDetailsDrawerOpen(open); if (!open) { const btn = document.querySelector<HTMLButtonElement>('button[data-details-trigger]'); btn?.focus(); } }}
                    onArrangeShipment={(p) => handleArrangeShipmentForPedido(p)}
                />



                <AdvancedFiltersDrawer
                    open={isFilterDrawerOpen}
                    onOpenChange={setIsFilterDrawerOpen}
                />

                <ColumnsManagementPanel
                    open={isColumnsDrawerOpen}
                    onOpenChange={setIsColumnsDrawerOpen}
                    animatedOpen={columnsPanelAnimatedOpen}
                    columns={columns}
                    onColumnsChange={setColumns}
                    panelRef={columnsDrawerRef}
                />

                {/* Modal de Vinculação de Pedido */}
                <LinkOrderModal
                    isOpen={isVincularModalOpen}
                    onClose={() => setIsVincularModalOpen(false)}
                    onSave={handleSaveVinculacoes}
                    pedidoId={pedidoParaVincular?.id || ""}
                    anunciosParaVincular={anunciosParaVincular}
                />

                <ScannerCheckoutModal
                    open={isScannerOpen}
                    onOpenChange={setIsScannerOpen}
                    scannedSku={scannedSku}
                    onScannedSkuChange={setScannedSku}
                    onScan={handleScan}
                    scannedPedido={scannedPedido}
                    scannerTab={scannerTab}
                    onScannerTabChange={setScannerTab}
                    pedidosNaoImpressos={pedidosNaoImpressos}
                    pedidosImpressos={pedidosImpressos}
                    onCompleteBipagem={handleCompleteBipagem}
                />

                <Dialog open={isCompleteModalOpen} onOpenChange={setIsCompleteModalOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Bipagem Concluída!</DialogTitle>
                            <DialogDescription>
                                Os pedidos bipados foram enviados para a lista "Aguardando Coleta" e estão prontos para envio.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button onClick={() => setIsCompleteModalOpen(false)}>Entendido</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <PrintConfigModal
                    open={isPrintConfigOpen}
                    onOpenChange={setIsPrintConfigOpen}
                    activePrintTab={activePrintTab}
                    onActivePrintTabChange={setActivePrintTab}
                    printSettings={printSettings}
                    onPrintSettingsChange={setPrintSettings}
                    selectedPedidos={pedidos.filter(p => selectedPedidosImpressao.includes(p.id))}
                    onSave={handleSavePrintSettings}
                    onPrintPickingList={handlePrintPickingList}
                />


            </SidebarProvider>
        </TooltipProvider>
    );
}

export default Pedidos;
