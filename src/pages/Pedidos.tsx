import { useState, useRef, useEffect, useLayoutEffect, startTransition, useCallback } from "react";
import { Search, Filter, Settings, FileText, Printer, Bot, TrendingUp, Zap, QrCode, Check, Calendar, Download, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Package, Truck, MinusCircle, CheckCircle2, Box, Scan, FileBadge, StickyNote, AudioWaveform, TextSelect, ListChecks, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox as CustomCheckbox } from "@/components/ui/checkbox";
// LoadingOverlay removido desta aba para evitar telas de carregamento ao trocar quadros
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { VincularPedidoModal } from "@/components/pedidos/VincularPedidoModal";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { usePrintingSettings } from "@/hooks/usePrintingSettings";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatDateTimeSP, formatDateSP, eventToSPEpochMs, calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import LoadingOverlay from "@/components/LoadingOverlay";
import { PedidoDetailsDrawer } from "@/components/pedidos/PedidoDetailsDrawer";
import { EmissaoNFDrawer } from "@/components/pedidos/EmissaoNFDrawer";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/use-toast";

function mapTipoEnvioLabel(v?: string) {
    const s = String(v || '').toLowerCase();
    if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'Full';
    if (s === 'flex' || s === 'self_service') return 'Flex';
    if (s === 'envios' || s === 'me2' || s === 'xd_drop_off' || s === 'cross_docking' || s === 'custom') return 'Envios';
    if (s === 'correios' || s === 'drop_off') return 'Correios';
    if (s === 'no_shipping') return 'Sem Envio';
    return s ? s : '—';
}

function isAbortLikeError(e: any): boolean {
    const m = String((e && ((e as any).message || (e as any).name)) || e || '').toLowerCase();
    return m.includes('abort') || m.includes('failed to fetch') || m.includes('err_aborted');
}

// Normaliza valores de tipo de envio vindos de diferentes fontes (view, API, tags)
function normalizeShippingType(input?: string | null): string {
    const s = String(input || '').toLowerCase();
    if (!s) return '';
    if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'full';
    if (s === 'flex' || s === 'self_service') return 'flex';
    if (s === 'envios' || s === 'me2' || s === 'xd_drop_off' || s === 'cross_docking' || s === 'custom') return 'envios';
    if (s === 'correios' || s === 'drop_off') return 'correios';
    if (s === 'no_shipping') return 'no_shipping';
    return s;
}

// Garante que o permalink tenha esquema http/https
function ensureHttpUrl(url?: string | null): string | null {
    if (!url) return null;
    const s = String(url).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return `https://${s}`;
}



// --- Mockup de PDF de Lista de Separação (Novo Componente) ---
const PickingListPDFMockup = ({ pedidos, settings, onPrint }: { pedidos: any[]; settings: any; onPrint?: () => void }) => {
    // Agrupa itens por SKU se a configuração estiver ativada
    const groupedItems: Record<string, { imagem?: string; nome?: string; sku?: string; quantidade: number }> = {};
    if (settings.groupByProduct) {
        pedidos.forEach(pedido => {
            pedido.itens.forEach(item => {
                if (groupedItems[item.sku]) {
                    groupedItems[item.sku].quantidade += item.quantidade;
                } else {
                    groupedItems[item.sku] = { ...item, quantidade: item.quantidade };
                }
            });
        });
    }

    const renderContent = () => {
        if (settings.groupByProduct) {
            return (
                <ul className="space-y-4">
                    {Object.values(groupedItems).map((item, itemIndex) => (
                        <li key={itemIndex} className="flex items-start space-x-4 border p-4 rounded-lg bg-gray-50">
                            <div className="w-16 h-16 flex-shrink-0">
                                <img src={item.imagem || "/placeholder.svg"} alt={item.nome || ''} className="w-full h-full object-cover rounded" loading="lazy" decoding="async" width="64" height="64" />
                            </div>
                            <div className="flex-1">
                                <p className="font-medium text-lg">{item.nome}</p>
                                <p className="text-sm text-gray-600">SKU: {item.sku || 'N/A'}</p>
                                {settings.includeOrderNumber && (
                                    <p className="text-xs text-gray-500 mt-1">Pedidos: {pedidos.map(p => `#${p.id}`).join(', ')}</p>
                                )}
                                <p className="text-xl font-bold mt-2">Qtd: {item.quantidade}</p>
                            </div>
                            {settings.includeBarcode && (
                                <div className="flex flex-col items-center justify-center p-2 rounded-md bg-white border border-gray-200">
                                    <QrCode className="w-8 h-8 text-gray-700" />
                                    <span className="text-xs mt-1">Bipar</span>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            );
        } else {
            return (
                pedidos.map((pedido, pedidoIndex) => (
                    <div key={pedido.id} className="mb-8">
                        <h3 className="text-xl font-semibold mb-4 border-b pb-2">
                            Pedido #{pedido.id} ({pedido.marketplace})
                        </h3>
                        <ul className="space-y-4">
                            {pedido.itens.map((item, itemIndex) => (
                                <li key={itemIndex} className="flex items-start space-x-4 border p-4 rounded-lg bg-gray-50">
                                    <div className="w-16 h-16 flex-shrink-0">
                                        <img src={item.imagem || "/placeholder.svg"} alt={item.nome} className="w-full h-full object-cover rounded" loading="lazy" decoding="async" width="64" height="64" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-medium text-lg">{item.nome}</p>
                                        <p className="text-sm text-gray-600">SKU: {item.sku || 'N/A'}</p>
                                        <p className="text-sm text-gray-600">ID na Plataforma: {pedido.idPlataforma}</p>
                                        <p className="text-sm font-bold mt-2">Qtd: {item.quantidade}</p>
                                    </div>
                                    {settings.includeBarcode && (
                                        <div className="flex flex-col items-center justify-center p-2 rounded-md bg-white border border-gray-200">
                                            <QrCode className="w-8 h-8 text-gray-700" />
                                            <span className="text-xs mt-1">Bipar</span>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))
            );
        }
    };

    
    return (
        <div className="h-full flex flex-col p-6 bg-gray-100 rounded-lg">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Visualização da Lista de Separação</h1>
                <Button onClick={onPrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimir
                </Button>
            </div>
            <div className="flex-1 p-8 overflow-y-auto bg-white rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-6">
                    <div className="text-right">
                        <p className="text-sm">Data: {new Date().toLocaleDateString('pt-BR')}</p>
                        <p className="text-sm">Hora: {new Date().toLocaleTimeString('pt-BR')}</p>
                    </div>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};


// --- Mockup de PDF de Etiqueta (Novo Componente) ---
const LabelPDFMockup = ({ settings, pedidos }: { settings: any; pedidos: any[] }) => {
    const renderLabelContent = (pedido) => {
        if (settings.labelSize === "10x15") {
            return (
                <div className="flex flex-col items-center justify-center p-4" style={{ width: '10cm', height: '15cm', border: '1px dashed #ccc', backgroundColor: '#f9f9f9', fontSize: '10px' }}>
                    <div className="text-sm font-bold">ETIQUETA DE ENVIO - {pedido.marketplace}</div>
                    <div className="mt-4 text-center">
                        <p className="font-semibold">Pedido: #{pedido.id}</p>
                        <p>Cliente: {pedido.cliente}</p>
                        <p>Endereço: Rua da Amostra, 123 - Cidade, Estado</p>
                        <div className="mt-2">
                            <QrCode size={60} />
                            <p className="text-xs">Rastreamento: {pedido.idPlataforma}</p>
                        </div>
                    </div>
                </div>
            );
        } else if (settings.labelSize === "A4") {
            return (
                <div className="flex flex-wrap p-4" style={{ width: '21cm', height: '29.7cm', border: '1px dashed #ccc', backgroundColor: '#f9f9f9', fontSize: '10px' }}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="m-2 p-2" style={{ width: '9.5cm', height: '13.5cm', border: '1px solid #ddd', fontSize: '9px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="font-bold text-xs">ETIQUETA {i + 1} - {pedido.marketplace}</div>
                            <div className="mt-1 text-center">
                                <p className="font-semibold">Pedido: #{pedido.id}</p>
                                <p>Cliente: {pedido.cliente}</p>
                                <p>Endereço: Rua da Amostra, 123 - Cidade, Estado</p>
                                <div className="mt-1">
                                    <QrCode size={50} />
                                    <p className="text-xs">Rastreamento: {pedido.idPlataforma}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            );
        }
    };

    return (
        <div className="h-full flex flex-col p-6 bg-gray-100 rounded-lg">
            <h1 className="text-2xl font-bold mb-6">Visualização da Etiqueta</h1>
            <div className="flex-1 p-8 overflow-y-auto bg-white rounded-lg shadow-lg flex justify-center items-center">
                {pedidos.length > 0 ? (
                    renderLabelContent(pedidos[0])
                ) : (
                    <p className="text-gray-500">Selecione um pedido para visualizar a etiqueta.</p>
                )}
            </div>
        </div>
    );
};


// --- Funções para gerar PDF "funcionais" ---
const generatePdfBlob = (content, orientation = 'P') => {
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Documento para Impressão</title>
            <style>
                @page { size: A4; margin: 20mm; }
                @media print { html, body { width: 210mm; height: 297mm; } }
                body { font-family: sans-serif; font-size: 12px; line-height: 1.5; }
                .page { page-break-after: always; padding: 20mm; }
                .picking-list h1 { text-align: center; }
                .picking-list .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
                .picking-list .item { display: flex; align-items: center; border: 1px solid #eee; padding: 10px; margin-bottom: 10px; }
                .picking-list .item img { width: 60px; height: 60px; margin-right: 15px; }
                .picking-list .item .details { flex-grow: 1; }
                .picking-list .item .quantity { font-size: 1.2em; font-weight: bold; }
                .label { display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid #000; padding: 10px; margin: 10px; }
                .label.size-10x15 { width: 9.5cm; height: 14.5cm; }
                .label.size-A4 { width: 9.5cm; height: 13.5cm; margin: 5mm; }
                .label .barcode { text-align: center; margin-top: 10px; }
            </style>
        </head>
        <body>
            ${content}
        </body>
        </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    return URL.createObjectURL(blob);
};

const generateFunctionalPickingListPDF = (pedidos, settings) => {
    let content = '';
    if (settings.groupByProduct) {
        const groupedItems: Record<string, { nome?: string; sku?: string; quantidade: number; pedidos: Set<string> }> = {};
        pedidos.forEach(p => p.itens.forEach(item => {
            if (!groupedItems[item.sku]) {
                groupedItems[item.sku] = { ...item, quantidade: 0, pedidos: new Set() };
            }
            groupedItems[item.sku].quantidade += item.quantidade;
            groupedItems[item.sku].pedidos.add(p.id);
        }));

        content += `
            <div class="page picking-list">
                <h1>Lista de Separação Agrupada</h1>
                <div class="header">
                    <span>Data: ${new Date().toLocaleDateString()}</span>
                    <span>Total de Itens: ${Object.values(groupedItems).reduce((sum, item) => sum + item.quantidade, 0)}</span>
                </div>
                ${Object.values(groupedItems).map(item => `
                    <div class="item">
                        <div class="details">
                            <strong>${item.nome}</strong><br>
                            <small>SKU: ${item.sku}</small>
                            ${settings.includeOrderNumber ? `<br><small>Pedidos: ${Array.from(item.pedidos).map(id => `#${id}`).join(', ')}</small>` : ''}
                        </div>
                        <div class="quantity">Qtd: ${item.quantidade}</div>
                        ${settings.includeBarcode ? `<div class="barcode">COD BARRA</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        content = pedidos.map(pedido => `
            <div class="page picking-list">
                <h1>Lista de Separação do Pedido #${pedido.id}</h1>
                <div class="header">
                    <span>Marketplace: ${pedido.marketplace}</span>
                    <span>Cliente: ${pedido.cliente}</span>
                </div>
                ${pedido.itens.map(item => `
                    <div class="item">
                        <div class="details">
                            <strong>${item.nome}</strong><br>
                            <small>SKU: ${item.sku}</small>
                        </div>
                        <div class="quantity">Qtd: ${item.quantidade}</div>
                        ${settings.includeBarcode ? `<div class="barcode">COD BARRA</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    return generatePdfBlob(content);
};

const generateFunctionalLabelPDF = (pedidos, settings) => {
    const labelClass = settings.labelSize === "10x15" ? "size-10x15" : "size-A4";
    const labels = pedidos.map(pedido => {
        const numLabels = settings.separateLabelPerItem ? pedido.quantidadeTotal : 1;
        let labelHtml = '';
        for (let i = 0; i < numLabels; i++) {
            labelHtml += `
                <div class="label ${labelClass}">
                    <strong>Etiqueta de Envio</strong>
                    <div style="margin-top: 5px;">Pedido: #${pedido.id}</div>
                    <div style="margin-top: 5px;">Cliente: ${pedido.cliente}</div>
                    <div style="margin-top: 5px;">ID Plataforma: ${pedido.idPlataforma}</div>
                    <div style="margin-top: 5px;">Item: ${pedido.itens[0]?.nome}</div>
                    <div class="barcode">CÓDIGO DE BARRAS</div>
                </div>
            `;
        }
        return labelHtml;
    }).join('');

    return generatePdfBlob(labels);
};




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
    const [isEmitting, setIsEmitting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncMarketplace, setSyncMarketplace] = useState<'mercado_livre' | 'shopee'>('mercado_livre');
    const [shopeeShopOptions, setShopeeShopOptions] = useState<Array<{ id: string; shop_id: number; label: string }>>([]);
    const [selectedShopeeShopId, setSelectedShopeeShopId] = useState<number | null>(null);
    const [emissionProgress, setEmissionProgress] = useState(0);
    const [emittedCount, setEmittedCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [isEmissaoDrawerOpen, setIsEmissaoDrawerOpen] = useState(false);
    const [pedidoIdParaEmissao, setPedidoIdParaEmissao] = useState<string | null>(null);
    const [bulkIdsQueue, setBulkIdsQueue] = useState<string[]>([]);
    const [emissaoRestartNonce, setEmissaoRestartNonce] = useState<number>(0);
    const [quickFilter, setQuickFilter] = useState("Todos");
    const [scannerTab, setScannerTab] = useState("nao-impressos");
    const [scannedSku, setScannedSku] = useState("");
    const [nfeAuthorizedByPedidoId, setNfeAuthorizedByPedidoId] = useState<Record<string, boolean>>({});
    const [nfeFocusStatusByPedidoId, setNfeFocusStatusByPedidoId] = useState<Record<string, string>>({});
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
    const [marketplaceFilter, setMarketplaceFilter] = useState<'all' | 'mercado-livre'>('all');
    const [shippingTypeFilter, setShippingTypeFilter] = useState<'all' | 'full' | 'flex' | 'envios' | 'correios' | 'no_shipping'>('all');
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
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const dragStartIndexRef = useRef<number | null>(null);
    const [emitEnvironment, setEmitEnvironment] = useState<'homologacao' | 'producao'>(() => {
        try {
            const v = localStorage.getItem('nfe_environment');
            return v === 'producao' ? 'producao' : 'homologacao';
        } catch {
            return 'homologacao';
        }
    });

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
    const loadGlobalStatusCounts = async () => {
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
            const marketplaceOk = (p: any) => marketplaceFilter === 'all' ? true : String(p.marketplace || '').toLowerCase().includes('mercado');
            const shippingOk = (p: any) => shippingTypeFilter === 'all' ? true : normalizeShippingType(String(p.tipoEnvio ?? '')) === shippingTypeFilter;
            const base = pedidos.filter(p => inDate(p) && matchesSearch(p) && marketplaceOk(p) && shippingOk(p));
            const hasStatus = (p: any, arr: string[]) => arr.includes(String(p.status_interno || ''));
            const cancelado = base.filter(p => hasStatus(p, ['Cancelado', 'Devolução', 'Devolucao'])).length;
            const enviado = base.filter(p => hasStatus(p, ['Enviado'])).length;
            const aVincular = base.filter(p => hasStatus(p, ['A vincular', 'A Vincular', 'A VINCULAR']) || Boolean(p.has_unlinked_items)).length;
            const emissao = base.filter(p => hasStatus(p, ['Emissao NF', 'Emissão NF', 'EMISSÃO NF'])).length;
            const impressao = base.filter(p => hasStatus(p, ['Impressao', 'Impressão', 'IMPRESSÃO'])).length;
            const aguardando = base.filter(p => hasStatus(p, ['Aguardando Coleta', 'Aguardando coleta', 'AGUARDANDO COLETA'])).length;
            const todos = base.length;
            setStatusCountsGlobal({ cancelado, enviado, 'a-vincular': aVincular, 'emissao-nf': emissao, impressao, 'aguardando-coleta': aguardando, todos });
            setCountsReady(true);
        } catch (_) {
            setStatusCountsGlobal(null);
            setCountsReady(false);
        }
    };

    // Atualizar contagens globais quando filtros mudarem, somente após primeira listagem
    useEffect(() => {}, [dateRange, searchTerm, marketplaceFilter, shippingTypeFilter]);

    useEffect(() => {}, [activeStatus]);

    useEffect(() => {
        try {
            const channel = (supabase as any).channel('presented_new_changes');
            channel
                .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_orders_presented_new' }, (payload: any) => {
                    const o: any = payload?.new || payload?.old;
                    if (!o) return;
                    const qtyAgg = (typeof o?.items_total_quantity === 'number' ? o.items_total_quantity : Number(o?.items_total_quantity)) || 1;
                    const amtAgg = (typeof o?.items_total_amount === 'number' ? o.items_total_amount : Number(o?.items_total_amount)) || 0;
                    const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
                    const varLabel = Array.isArray(o?.variation_color_names) ? (o.variation_color_names as any[]).filter(Boolean).join(' • ') : String(o?.variation_color_names || '');
                    const items = [{
                        id: `${o.marketplace_order_id || o.id}-ITEM-1`,
                        nome: o.first_item_title || 'Item',
                        sku: o.first_item_sku || null,
                        quantidade: qtyAgg,
                        valor: unitPriceAgg,
                        bipado: false,
                        vinculado: !!o.first_item_sku,
                        imagem: "/placeholder.svg",
                        marketplace: o.marketplace,
                        marketplaceItemId: o.first_item_id || null,
                        variationId: (typeof o?.first_item_variation_id === 'number' || typeof o?.first_item_variation_id === 'string') ? o.first_item_variation_id : '',
                        permalink: o.first_item_permalink || null,
                        variationLabel: varLabel,
                    }];
                    const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
                    const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;
                    const valorRecebidoFrete = toNum(o?.payment_shipping_cost);
                    const saleFeeOrderItems = (typeof o?.items_total_sale_fee === 'number' ? o.items_total_sale_fee : Number(o?.items_total_sale_fee)) || 0;
                    const taxaMarketplace = saleFeeOrderItems;
                    const liquidoCalculado = (items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0) || orderTotal) + valorRecebidoFrete - taxaMarketplace;
                    const labelInfo = {
                        cached: Boolean(o?.label_cached || o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64),
                        response_type: (o?.label_response_type || (o?.label_pdf_base64 ? 'pdf' : (o?.label_zpl2_base64 ? 'zpl2' : null))) as string | null,
                        fetched_at: (o?.label_fetched_at || null) as string | null,
                        size_bytes: (typeof o?.label_size_bytes === 'number' ? o.label_size_bytes : Number(o?.label_size_bytes)) || null,
                        shipment_ids: [],
                        content_base64: o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64 || null,
                        content_type: o?.label_content_type || (o?.label_pdf_base64 ? 'application/pdf' : (o?.label_zpl2_base64 ? 'text/plain' : null)),
                        pdf_base64: o?.label_pdf_base64 || null,
                        zpl2_base64: o?.label_zpl2_base64 || null,
                    } as const;
                    const linksArr: any[] = Array.isArray((o as any)?.linked_products) ? (o as any).linked_products : [];
                    const getVid = (v: any) => { const s = String(v ?? '').trim(); return s === '0' ? '' : s; };
                    const cleanId = (s: any) => { const str = String(s || ''); const mm = str.match(/(\d+)/); return mm ? String(mm[1]) : str; };
                    const pl = String(o?.first_item_permalink || '');
                    const m = pl.match(/ML[A-Z]-?(\d+)/i);
                    const altId = m ? String(m[1]) : '';
                    const firstId = cleanId(String(o?.first_item_id || '')) || altId;
                    const firstVid = getVid(o?.first_item_variation_id);
                    const match = linksArr.find((l: any) => cleanId(l?.marketplace_item_id) === firstId && getVid(l?.variation_id) === firstVid) || linksArr.find((l: any) => cleanId(l?.marketplace_item_id) === firstId) || linksArr[0] || null;
                    const skuLinked = match && match.sku ? String(match.sku) : null;
                    const updated = {
                        id: o.id,
                        marketplace_order_id: o.marketplace_order_id || null,
                        marketplace: o.marketplace,
                        produto: items[0]?.nome || "",
                        sku: items[0]?.sku || null,
                        permalink: o.first_item_permalink || null,
                        cliente: o.first_name_buyer || o.customer_name || '',
                        valor: orderTotal,
                        data: o.created_at,
                        status: (String(o?.shipment_status || '').toLowerCase() === 'delivered' ? 'Entregue' : (o.status_interno ?? o.status ?? 'Pendente')),
                        status_interno: o?.status_interno ?? null,
                        has_unlinked_items: Boolean(o?.has_unlinked_items),
                        shipment_status: o?.shipment_status || null,
                        slaDespacho: {
                            status: o?.shipment_sla_status ?? null,
                            service: o?.shipment_sla_service ?? null,
                            expected_date: o?.estimated_delivery_limit_at ?? o?.shipment_sla_expected_date ?? null,
                            last_updated: o?.shipment_sla_last_updated ?? null,
                        },
                        variationColorNames: varLabel,
                        atrasos: Array.isArray(o?.shipment_delays) ? o.shipment_delays : null,
                        dataPagamento: o?.payment_date_approved || o?.payment_date_created || o?.created_at || null,
                        payment_status: o?.payment_status || null,
                        payment_date_approved: o?.payment_date_approved || null,
                        tipoEnvio: normalizeShippingType(o?.shipping_type),
                        idPlataforma: (o as any)?.pack_id || o.pack_id || "",
                        shippingCity: o?.shipping_city_name || null,
                        shippingState: o?.shipping_state_name || null,
                        shippingUF: o?.shipping_state_uf || null,
                        quantidadeTotal: items.reduce((sum: number, it: any) => sum + (it.quantidade || 0), 0),
                        imagem: (items[0]?.imagem || "/placeholder.svg"),
                        itens: items,
                        linked_products: (o as any)?.linked_products || null,
                        financeiro: {
                            valorPedido: items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0) || orderTotal,
                            freteRecebido: valorRecebidoFrete,
                            freteRecebidoLiquido: valorRecebidoFrete,
                            taxaFrete: 0,
                            taxaMarketplace: taxaMarketplace,
                            saleFee: saleFeeOrderItems,
                            feesPayments: 0,
                            shippingFeeBuyer: 0,
                            envioMetodo: o?.shipping_method_name || null,
                            envioTags: [],
                            freteDiferenca: valorRecebidoFrete - 0,
                            cupom: 0,
                            impostos: 0,
                            liquido: liquidoCalculado,
                            margem: 0,
                            pagamentos: [],
                            envios: [],
                        },
                        impressoEtiqueta: Boolean(o?.printed_label),
                        impressoLista: false,
                        label: labelInfo,
                        linkedSku: skuLinked,
                    };
                    if (payload?.eventType === 'DELETE') {
                        startTransition(() => setPedidos(prev => prev.filter(p => p.id !== o.id)));
                    } else {
                        startTransition(() => setPedidos(prev => {
                            const idx = prev.findIndex(p => p.id === o.id);
                            const next = [...prev];
                            if (idx >= 0) next[idx] = updated; else next.unshift(updated);
                            try { const key = `pedidos_cache_${organizationId || ''}`; localStorage.setItem(key, JSON.stringify(next)); } catch {}
                            return next;
                        }));
                    }
                    loadGlobalStatusCounts();
                    const packId = (payload && payload.new && (payload.new as any).pack_id) ?? null;
                    const orderId = (payload && payload.new && (payload.new as any).id) ?? null;
                    if (ensureDebounceRef.current) { clearTimeout(ensureDebounceRef.current); ensureDebounceRef.current = null; }
                    ensureDebounceRef.current = window.setTimeout(async () => {
                        try {
                            if (packId !== null && (typeof packId === 'number' || typeof packId === 'string')) {
                                await (supabase as any).rpc('ensure_inventory_by_pack_id', { p_pack_id: Number(packId) });
                            } else if (orderId) {
                                await (supabase as any).rpc('ensure_inventory_for_order', { p_order_id: orderId });
                            }
                        } catch {}
                        ensureDebounceRef.current = null;
                    }, 500);
                })
                .subscribe();
            return () => {
                try { (supabase as any).removeChannel(channel); } catch {}
            };
        } catch {}
    }, [organizationId, marketplaceFilter, shippingTypeFilter, dateRange, searchTerm]);

    useEffect(() => {}, []);

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

    const loadPedidos = async (opts?: { background?: boolean }) => {
        const background = Boolean(opts?.background);
        if (!background) setIsLoading(true);
        try {
            if (!user && !organizationId) {
                setPedidos([]);
                return;
            }

            

            // Consulta inicial otimizada com paginação no servidor
            const ascending = sortDir === 'asc';
            const start = Math.max(0, (currentPage - 1) * pageSize);
            const end = Math.max(start, start + pageSize - 1);

            // Resolver organização para escopo da consulta
            let orgIdResolved: string | null = organizationId ?? null;
            if (!orgIdResolved) {
                try {
                    const { data: rpcOrg } = await (supabase as any).rpc('get_user_organization_id', { p_user_id: user.id });
                    orgIdResolved = Array.isArray(rpcOrg) ? (rpcOrg?.[0] as string | null) : (rpcOrg as string | null);
                } catch (orgErr) {
                    const m = String((orgErr as any)?.message || (orgErr as any)?.name || '').toLowerCase();
                    if (!m.includes('abort') && !m.includes('aborted')) {
                        console.warn('[Pedidos] Falha ao obter organization_id do usuário:', orgErr);
                    }
                }
            }

            // Filtros de data e busca
            const cacheKey = `pedidos_cache_${organizationId || ''}`;
            if (!background) {
                try {
                    const raw = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
                    if (raw) {
                        const cached = JSON.parse(raw);
                        if (Array.isArray(cached)) { startTransition(() => setPedidos(cached)); setListReady(true); }
                    }
                } catch {}
            }

            let q: any = (supabase as any)
                .from("marketplace_orders_presented_new")
                    .select(`
                        id,
                        pack_id,
                        marketplace_order_id,
                        customer_name,
                        first_name_buyer,
                        order_total,
                        status,
                        status_interno,
                        created_at,
                        marketplace,
                        shipping_type,
                        payment_status,
                        payment_date_created,
                        payment_date_approved,
                        items_total_quantity,
                        items_total_amount,
                        items_total_sale_fee,
                        first_item_id,
                        first_item_title,
                        first_item_permalink,
                        first_item_sku,
                        first_item_variation_id,
                        variation_color_names,
                        has_unlinked_items,
                        unlinked_items_count,
                        shipment_status,
                        shipment_substatus,
                        shipping_method_name,
                        shipment_sla_status,
                        shipment_sla_service,
                        estimated_delivery_limit_at,
                        shipment_sla_expected_date,
                        shipment_sla_last_updated,
                        shipment_delays,
                        label_cached,
                        label_response_type,
                        label_fetched_at,
                        label_size_bytes,
                        label_content_base64,
                        label_content_type,
                        label_pdf_base64,
                        label_zpl2_base64,
                        printed_label,
                        printed_schedule,
                        linked_products
                    `, { count: 'exact' })
                ;

            if (orgIdResolved) {
                q = (q as any).eq('organizations_id', orgIdResolved);
            }

            // Marketplace (por padrão 'Todos')
            if (marketplaceFilter === 'mercado-livre') {
                q = (q as any).ilike('marketplace', '%Mercado%');
            }

            if (false) {}



            if (false) {}

            if (false) {}

            if (false) {}

            q = q;

            const { data, count, error } = await q;

            if (error) throw error;

            const rows: any[] = Array.isArray(data) ? data : [];
            setTotalPedidosCount(null);

            // Renderização imediata: construir uma lista leve apenas com dados agregados da view
            const lightParsed = rows.map((o: any) => {
                const qtyAgg = (typeof o?.items_total_quantity === 'number' ? o.items_total_quantity : Number(o?.items_total_quantity)) || 1;
                const amtAgg = (typeof o?.items_total_amount === 'number' ? o.items_total_amount : Number(o?.items_total_amount)) || 0;
                const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
                const varLabel = Array.isArray(o?.variation_color_names)
                    ? (o.variation_color_names as any[]).filter(Boolean).join(' • ')
                    : String(o?.variation_color_names || '');
                const items = [{
                    id: `${o.marketplace_order_id || o.id}-ITEM-1`,
                    nome: o.first_item_title || 'Item',
                    sku: o.first_item_sku || null,
                    quantidade: qtyAgg,
                    valor: unitPriceAgg,
                    bipado: false,
                    vinculado: !!o.first_item_sku,
                    imagem: "/placeholder.svg",
                    marketplace: o.marketplace,
                    marketplaceItemId: o.first_item_id || null,
                    variationId: (typeof o?.first_item_variation_id === 'number' || typeof o?.first_item_variation_id === 'string') ? o.first_item_variation_id : '',
                    permalink: o.first_item_permalink || null,
                    variationLabel: varLabel,
                }];

                const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;
                const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
                const valorRecebidoFrete = toNum(o?.payment_shipping_cost);
                const saleFeeOrderItems = (typeof o?.items_total_sale_fee === 'number' ? o.items_total_sale_fee : Number(o?.items_total_sale_fee)) || 0;
                const taxaMarketplace = saleFeeOrderItems; // usar agregado inicialmente

                const shipmentStatusLower = String(o?.shipment_status || '').toLowerCase();
                const shipmentSubstatusLower = String(o?.shipment_substatus || '').toLowerCase();
                const paymentStatusLower = String(o?.payment_status || '').toLowerCase();
                const statusUI = (shipmentStatusLower === 'delivered' ? 'Entregue' : (o.status_interno ?? o.status ?? 'Pendente'));

                const liquidoCalculado = (items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0) || orderTotal) + valorRecebidoFrete - taxaMarketplace;

                const labelInfo = {
                    cached: Boolean(o?.label_cached || o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64),
                    response_type: (o?.label_response_type || (o?.label_pdf_base64 ? 'pdf' : (o?.label_zpl2_base64 ? 'zpl2' : null))) as string | null,
                    fetched_at: (o?.label_fetched_at || null) as string | null,
                    size_bytes: (typeof o?.label_size_bytes === 'number' ? o.label_size_bytes : Number(o?.label_size_bytes)) || null,
                    shipment_ids: [],
                    content_base64: o?.label_content_base64 || o?.label_pdf_base64 || o?.label_zpl2_base64 || null,
                    content_type: o?.label_content_type || (o?.label_pdf_base64 ? 'application/pdf' : (o?.label_zpl2_base64 ? 'text/plain' : null)),
                    pdf_base64: o?.label_pdf_base64 || null,
                    zpl2_base64: o?.label_zpl2_base64 || null,
                } as const;

                const linkedProductsArr: any[] = Array.isArray((o as any)?.linked_products) ? (o as any).linked_products : [];
                const getVid = (v: any) => { const s = String(v ?? '').trim(); return s === '0' ? '' : s; };
                const cleanId = (s: any) => { const str = String(s || ''); const mm = str.match(/(\d+)/); return mm ? String(mm[1]) : str; };
                const pl = String(o?.first_item_permalink || '');
                const m = pl.match(/ML[A-Z]-?(\d+)/i);
                const altId = m ? String(m[1]) : '';
                const firstId = cleanId(String(o?.first_item_id || '')) || altId;
                const firstVid = getVid(o?.first_item_variation_id);
                const matchLink = linkedProductsArr.find((l: any) => cleanId(l?.marketplace_item_id) === firstId && getVid(l?.variation_id) === firstVid) || linkedProductsArr.find((l: any) => cleanId(l?.marketplace_item_id) === firstId) || linkedProductsArr[0] || null;
                const skuLinked = matchLink && matchLink.sku ? String(matchLink.sku) : null;

                return {
                    id: o.id,
                    marketplace_order_id: o.marketplace_order_id || null,
                    marketplace: o.marketplace,
                    produto: items[0]?.nome || "",
                    sku: items[0]?.sku || null,
                    permalink: o.first_item_permalink || null,
                    cliente: o.first_name_buyer || o.customer_name || '',
                    valor: orderTotal,
                    data: o.created_at,
                    status: statusUI,
                    status_interno: o?.status_interno ?? null,
                    has_unlinked_items: Boolean(o?.has_unlinked_items),
                    shipment_status: o?.shipment_status || null,
                    slaDespacho: {
                        status: o?.shipment_sla_status ?? null,
                        service: o?.shipment_sla_service ?? null,
                        expected_date: o?.estimated_delivery_limit_at ?? o?.shipment_sla_expected_date ?? null,
                        last_updated: o?.shipment_sla_last_updated ?? null,
                    },
                    variationColorNames: varLabel,
                    atrasos: Array.isArray(o?.shipment_delays) ? o.shipment_delays : null,
                    dataPagamento: o?.payment_date_approved || o?.payment_date_created || o?.created_at || null,
                    payment_status: o?.payment_status || null,
                    payment_date_approved: o?.payment_date_approved || null,
                    tipoEnvio: normalizeShippingType(o?.shipping_type),
                    idPlataforma: (o as any)?.pack_id || o.pack_id || "",
                    shippingCity: o?.shipping_city_name || null,
                    shippingState: o?.shipping_state_name || null,
                    shippingUF: o?.shipping_state_uf || null,
                    quantidadeTotal: items.reduce((sum: number, it: any) => sum + (it.quantidade || 0), 0),
                    imagem: (items[0]?.imagem || "/placeholder.svg"),
                    itens: items,
                    linked_products: (o as any)?.linked_products || null,
                    financeiro: {
                        valorPedido: items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0) || orderTotal,
                        freteRecebido: valorRecebidoFrete,
                        freteRecebidoLiquido: valorRecebidoFrete,
                        taxaFrete: 0,
                        taxaMarketplace: taxaMarketplace,
                        saleFee: saleFeeOrderItems,
                        feesPayments: 0,
                        shippingFeeBuyer: 0,
                        envioMetodo: o?.shipping_method_name || null,
                        envioTags: [],
                        freteDiferenca: valorRecebidoFrete - 0,
                        cupom: 0,
                        impostos: 0,
                        liquido: liquidoCalculado,
                        margem: 0,
                        pagamentos: [],
                        envios: [],
                    },
                    impressoEtiqueta: Boolean(o?.printed_label),
                    impressoLista: false,
                    label: labelInfo,
                    linkedSku: skuLinked,
                };
            });

            const runId = ++loadRunIdRef.current;
            startTransition(() => setPedidos(lightParsed));
            try { if (typeof window !== 'undefined') localStorage.setItem(cacheKey, JSON.stringify(lightParsed)); } catch {}
            setListReady(true);

            
        } catch (err) {
            if (!isAbortLikeError(err)) {
                console.error("Erro ao buscar pedidos:", err);
                setPedidos([]);
            }
        } finally {
            if (!background) setIsLoading(false);
            try { setTimeout(() => { loadGlobalStatusCounts(); }, 0); } catch {}
        }
    };

    

    // Removida a sincronização automática; sincronizar apenas ao clicar no botão

    // Não atualizar ao alternar quadro para evitar remoções e telas de recarga
    
    const refreshNfeAuthorizedMapForList = useCallback(async () => {
        try {
            if (!organizationId) return;
            const pedidosAtivos = pedidos.filter(p => p && p.status_interno === 'Emissao NF' && p.marketplace_order_id);
            if (pedidosAtivos.length === 0) { setNfeAuthorizedByPedidoId({}); setNfeFocusStatusByPedidoId({}); return; }
            const idsToCheck = pedidosAtivos.map(p => String(p.marketplace_order_id));
            let companyId: string | null = null;
            {
                const { data: companiesForOrg } = await (supabase as any)
                    .from('companies')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .order('is_active', { ascending: false })
                    .order('created_at', { ascending: true })
                    .limit(1);
                companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
            }
            if (!companyId) return;
            const { data: nfRows } = await (supabase as any)
                .from('notas_fiscais')
                .select('marketplace_order_id, status_focus, emissao_ambiente')
                .eq('company_id', companyId)
                .in('marketplace_order_id', idsToCheck);
            const envSel = emitEnvironment;
            const byMarketId: Record<string, boolean> = {};
            const byMarketStatus: Record<string, string> = {};
            (Array.isArray(nfRows) ? nfRows : []).forEach((r: any) => {
                const mk = String(r?.marketplace_order_id || '');
                const st = String(r?.status_focus || '').toLowerCase();
                const amb = String(r?.emissao_ambiente || '').toLowerCase();
                if (!mk) return;
                const okAmb = amb ? (envSel === 'producao' ? amb === 'producao' : amb === 'homologacao') : true;
                if (st === 'autorizado' && okAmb) byMarketId[mk] = true;
                if (okAmb) byMarketStatus[mk] = st;
            });
            const nextMap: Record<string, boolean> = {};
            const nextStatusMap: Record<string, string> = {};
            for (const p of pedidosAtivos) {
                const mk = String(p.marketplace_order_id);
                nextMap[String(p.id)] = byMarketId[mk] === true;
                nextStatusMap[String(p.id)] = byMarketStatus[mk] || '';
            }
            setNfeAuthorizedByPedidoId(nextMap);
            setNfeFocusStatusByPedidoId(nextStatusMap);
        } catch {}
    }, [organizationId, pedidos, emitEnvironment, supabase]);

    useEffect(() => {
        if (activeStatus === 'emissao-nf') {
            refreshNfeAuthorizedMapForList();
        }
    }, [activeStatus, refreshNfeAuthorizedMapForList]);

    

    const mapStatusFocusToBadge = (status: string | undefined): { label: string; className: string } => {
        const stLower = String(status || '').toLowerCase();
        switch (stLower) {
            case 'autorizado':
            case 'autorizada':
                return { label: 'Autorizada', className: 'bg-green-600 text-white' };
            case 'pendente':
                return { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 border border-yellow-200' };
            case 'cancelado':
            case 'cancelada':
                return { label: 'Cancelada', className: 'bg-red-100 text-red-800 border border-red-200' };
            case 'rejeitado':
            case 'rejeitada':
                return { label: 'Rejeitada', className: 'bg-red-100 text-red-800 border border-red-200' };
            case 'denegado':
            case 'denegada':
                return { label: 'Denegada', className: 'bg-red-100 text-red-800 border border-red-200' };
            case 'erro':
            case 'error':
                return { label: 'Erro', className: 'bg-red-100 text-red-800 border border-red-200' };
            default:
                return { label: status || 'Indefinido', className: 'bg-gray-100 text-gray-800 border border-gray-200' };
        }
    };

    const handleSyncNfeForPedido = async (pedido: any) => {
        try {
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) return;
            if (!organizationId) return;
            let companyId: string | null = null;
            {
                const { data: companiesForOrg } = await (supabase as any)
                    .from('companies')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .order('is_active', { ascending: false })
                    .order('created_at', { ascending: true })
                    .limit(1);
                companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
            }
            if (!companyId) return;
            const envSel = emitEnvironment;
            const headers: Record<string, string> = {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${token}`,
            };
            const { error } = await (supabase as any).functions.invoke('focus-nfe-sync', {
                body: { organizationId, companyId, orderIds: [String(pedido.id)], environment: envSel },
                headers,
            } as any);
            if (error) return;
            await refreshNfeAuthorizedMapForList();
        } catch {}
    };

    const handleEnviarNfeForPedido = async (pedido: any) => {
        try {
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão inválida ou expirada.');
            if (!organizationId) throw new Error('Organização não encontrada.');
            let companyId: string | null = null;
            {
                const { data: companiesForOrg } = await (supabase as any)
                    .from('companies')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .order('is_active', { ascending: false })
                    .order('created_at', { ascending: true })
                    .limit(1);
                companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
            }
            if (!companyId) throw new Error('Nenhuma empresa ativa encontrada.');
            const { data: nfSel, error: nfErr } = await (supabase as any)
                .from('notas_fiscais')
                .select('id, nfe_key')
                .eq('company_id', companyId)
                .eq('marketplace_order_id', String(pedido.marketplace_order_id || ''))
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (nfErr || !nfSel) throw new Error(nfErr?.message || 'Nota fiscal não encontrada para este pedido.');
            const headers: Record<string, string> = {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${token}`,
            };
            const { data, error } = await (supabase as any).functions.invoke<any>('mercado-livre-submit-xml', {
                body: {
                    organizationId,
                    companyId,
                    notaFiscalId: (nfSel as any)?.id,
                },
                headers,
            } as any);
            if (error || (data && data.error)) {
                throw new Error(error?.message || data?.error || "Falha ao enviar XML");
            }
            const status = String(data?.status || 'sent');
            toast({ title: "Envio de XML", description: `XML enviado ao Mercado Livre (${status}).` });
        } catch (e: any) {
            toast({ title: "Erro no envio", description: e?.message || String(e), variant: "destructive" });
        }
    };

    const handleSyncOrders = async () => {
        try {
            setIsSyncing(true);
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão expirada ou ausente. Faça login novamente.');

            const orgId = organizationId;

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId: orgId }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
                throw new Error(msg);
            }
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedidos:', e);
        } finally {
            setIsSyncing(false);
            // Limpa seleções após sincronização
            setSelectedPedidos([]);
            setSelectedPedidosEmissao([]);
            setSelectedPedidosImpressao([]);
            setSelectedPedidosEnviado([]);
        }
    };

    const loadShopeeShops = async () => {
        try {
            if (!organizationId) return;
            const { data } = await (supabase as any)
                .from('marketplace_integrations')
                .select('id, organizations_id, marketplace_name, config, meli_user_id')
                .eq('marketplace_name', 'Shopee')
                .eq('organizations_id', organizationId);
            const opts: Array<{ id: string; shop_id: number; label: string }> = Array.isArray(data) ? data.map((row: any) => {
                const cfg = row?.config || {};
                const sid = Number(cfg?.shopee_shop_id || row?.meli_user_id || 0);
                const lbl = String(cfg?.shop_name || `Shop ${sid || ''}`).trim();
                return { id: String(row.id), shop_id: sid, label: lbl || String(sid) };
            }).filter((x: any) => Number(x.shop_id) > 0) : [];
            setShopeeShopOptions(opts);
            if (opts.length > 0 && !selectedShopeeShopId) setSelectedShopeeShopId(Number(opts[0].shop_id));
        } catch {}
    };

    const handleSyncShopeeOrders = async () => {
        try {
            setIsSyncing(true);
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão expirada ou ausente. Faça login novamente.');
            const orgId = organizationId;
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId: orgId, shop_id: selectedShopeeShopId }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
                throw new Error(msg);
            }
            await loadPedidos();
            setIsSyncModalOpen(false);
        } catch (e) {
            console.error('Falha ao sincronizar pedidos Shopee:', e);
        } finally {
            setIsSyncing(false);
        }
    };

    // Sincronizar apenas pedidos selecionados via função mercado-livre-sync-orders com order_ids
    const handleSyncSelectedOrders = async () => {
        try {
            // Derivar a lista de IDs selecionados conforme o quadro atual
            const selectedIds = (
                activeStatus === 'todos' ? selectedPedidos :
                activeStatus === 'emissao-nf' ? selectedPedidosEmissao :
                activeStatus === 'impressao' ? selectedPedidosImpressao :
                []
            ).map((id) => String(id)).filter(Boolean);

            // Filtrar para apenas pedidos de Mercado Livre e ignorar placeholders
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
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão expirada ou ausente. Faça login novamente.');

            const orgId = organizationId;

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId: orgId, order_ids: selectedOrderIds }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
                throw new Error(msg);
            }
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedidos selecionados:', e);
        } finally {
            setIsSyncing(false);
        }
    };

    // Sincronizar um pedido via ID interno (UUID de orders.id)
    const handleSyncOrderByInternalId = async (internalOrderId?: string) => {
        try {
            const id = String(internalOrderId || '').trim();
            if (!id) return;
            setIsSyncing(true);

            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão expirada ou ausente. Faça login novamente.');

            // Buscar o marketplace_order_id a partir do ID interno
            const { data: row, error: rowErr } = await (supabase as any)
                .from('marketplace_orders_presented_new')
                .select('marketplace_order_id, marketplace')
                .eq('id', id)
                .limit(1)
                .single();
            if (rowErr || !row) throw new Error(rowErr?.message || 'Pedido não encontrado');

            const marketplaceName = String(row.marketplace || '').toLowerCase();
            if (!marketplaceName.includes('mercado')) throw new Error('Pedido não é do Mercado Livre');

            const mlOrderId = String(row.marketplace_order_id || '').trim();
            if (!/^\d+$/.test(mlOrderId)) throw new Error('Pedido sem marketplace_order_id válido');

            // Organização do usuário
            const orgId = organizationId;

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId: orgId, order_ids: [mlOrderId] }),
            });
            const json = await resp.json().catch(() => ({}));
            if (!resp.ok) {
                const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
                throw new Error(msg);
            }
            await loadPedidos();
        } catch (e) {
            console.error('Falha ao sincronizar pedido por ID interno:', e);
        } finally {
            setIsSyncing(false);
        }
    };


    
    // Definição das colunas da tabela (valores padrão)
    const [columns, setColumns] = useState([
        { id: "produto", name: "Produto", enabled: true, alwaysVisible: true, render: (pedido: any) => (
            <div className="flex flex-col space-y-1">
                {pedido.itens?.map((it: any, idx: number) => (
                    <div key={idx} className="flex items-center space-x-1 min-h-8 py-0.5">
                        <img
                            src={((idx === 0 ? (pedido.imagem || it?.imagem) : it?.imagem) || '/placeholder.svg')}
                            alt={(idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto'))}
                            className="w-10 h-10 rounded-lg object-cover"
                            loading="lazy"
                            decoding="async"
                            width="40"
                            height="40"
                        />
                        <div className="min-w-0 flex-none w-[82%]">
                            <div className={`text-sm font-medium text-gray-900 ${pedido.quantidadeTotal >= 2 ? 'font-bold' : ''}`}>
                                {(() => {
                                    const rawTitle: string = idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto');
                                    const displayTitle: string = rawTitle.length > 40 ? rawTitle.slice(0, 40) + '..' : rawTitle;
                                    const link: string | null = (
                                        idx === 0
                                            ? (pedido?.permalink || pedido?.first_item_permalink || it?.permalink || null)
                                            : (it?.permalink || pedido?.first_item_permalink || null)
                                    );
                                    if (link) {
                                        return (
                                            <a
                                                href={ensureHttpUrl(link)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            className="text-gray-900 hover:text-purple-600 group-hover:text-purple-600 cursor-pointer transition-colors block truncate"
                                                title={rawTitle}
                                            >
                                                {displayTitle}
                                            </a>
                                        );
                                    }
                                    return (
                                        <span className="block truncate" title={rawTitle}>
                                            {displayTitle}
                                        </span>
                                    );
                                })()}
                            </div>
                            {pedido.linkedSku && (
                                <div className="text-xs text-gray-500">SKU: {pedido.linkedSku}</div>
                            )}
                            {(it?.variationLabel || (idx === 0 ? pedido.variationColorNames : '')) && (
                                <div className="text-xs text-gray-500">{it?.variationLabel || pedido.variationColorNames}</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )},
        { id: "itens", name: "Itens", enabled: true, alwaysVisible: true, render: (pedido) => (
            <div className="flex flex-col items-center space-y-1">
                {pedido.itens?.map((item: any, index: number) => (
                    <div key={index} className="min-h-10 py-0.5 flex items-center justify-center w-full">
                        <span
                            className={`inline-flex items-center justify-center h-6 min-w-6 rounded-md px-2 text-sm md:text-base border ${pedido.quantidadeTotal >= 2 ? 'text-purple-600 border-purple-600 bg-purple-600/10' : 'text-gray-700 border-gray-300'}`}
                            title={`Qtd: ${item.quantidade}`}
                        >
                            {item.quantidade}
                        </span>
                    </div>
                ))}
            </div>
        )},
        { id: "cliente", name: "Cliente", enabled: false, render: (pedido) => {
            const name = String(pedido?.first_name_buyer || pedido?.cliente || "");
            const truncated = name.length > 20? name.slice(0, 20) + "…" : name;
            return (<span className="text-gray-900 block truncate">{truncated}</span>);
        }},
        { id: "valor", name: "Valor do Pedido", enabled: true, render: (pedido) => (
            <span className="text-gray-900 font-semibold">{pedido.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        )},
        { id: "tipoEnvio", name: "Tipo de Envio", enabled: true, alwaysVisible: true, render: (pedido) => {
            const shipmentStatus = String(pedido?.shipment_status || '').toLowerCase();
            const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup'];
            const isOrderCancelledOrReturned = (
                pedido?.status_interno === 'Cancelado' ||
                pedido?.status_interno === 'Devolução'
            );
            const allowedBoards = ['a-vincular','emissao-nf','impressao','aguardando-coleta'];
            const allowedLabels = new Set(['A vincular','Emissao NF','Impressao','Aguardando Coleta']);
            const computedLabel = String(pedido?.status_interno || 'Pendente');
            const isAllowedByBoard = allowedBoards.includes(activeStatus) || (activeStatus === 'todos' && allowedLabels.has(computedLabel));
            const showSLA = isAllowedByBoard && !deliveredStatuses.includes(shipmentStatus) && !isOrderCancelledOrReturned && pedido?.slaDespacho?.expected_date;
            let countdown: JSX.Element | null = null;
            if (showSLA) {
                const expected = new Date(pedido.slaDespacho.expected_date);
                const now = new Date();
                const diffMs = expected.getTime() - now.getTime();
                const expired = diffMs <= 0;
                const totalMinutes = Math.max(0, Math.floor(diffMs / 60000));
                const days = Math.floor(totalMinutes / (60 * 24));
                const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
                const minutes = totalMinutes % 60;
                const color = expired ? 'text-red-600' : 'text-purple-600';
                const cdText = `ENVIE EM: ${days}d ${hours}h ${minutes}m`;
                const cdLen = cdText.length;
                const cdSize = cdLen > 30 ? 'text-[10px]': (cdLen > 15 ? 'text-[9px]' : 'text-[10px]');
                countdown = (
                    <span className={`${cdSize} leading-[1rem] font-medium whitespace-nowrap ${color}`}>
                        {cdText}
                    </span>
                );
            }
            return (
                <div className="flex flex-col items-center justify-center gap-1 text-center">
                    {(() => {
                        const lbl = mapTipoEnvioLabel(pedido.tipoEnvio);
                        const len = lbl.length;
                        const size = len > 12 ? 'text-[8px]' : (len > 10 ? 'text-[9px]' : 'text-[10px]');
                        return (
                            <Badge className={`uppercase bg-purple-600 text-white hover:bg-purple-700 h-5 px-2 w-[92px] ${size} leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                                {lbl}
                            </Badge>
                        );
                    })()}
                    {countdown}
                </div>
            );
        }},
        
        
        { id: "marketplace", name: "Marketplace", enabled: true, render: (pedido) => (
            <div className="flex flex-col leading-tight">
                <span className="text-gray-900 text-sm">{pedido.marketplace}</span>
                <span className="text-xs text-gray-500 break-all">{String(pedido.idPlataforma || '')}</span>
            </div>
        )},
        { id: "status", name: "Status", enabled: true, alwaysVisible: true, render: (pedido) => {
            const boardLabel = String(pedido?.status || 'Pendente');
            const displayLabel = boardLabel === 'Aguardando Coleta' ? 'Coleta' : boardLabel;
            const badgeClass = getStatusColor(boardLabel);
            return (
                <div className="flex flex-col items-center space-y-2 text-center">
                    <Badge className={`uppercase ${badgeClass} h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                        {displayLabel}
                    </Badge>
                    {activeStatus === 'enviado' && String(pedido?.shipment_status || '').toLowerCase() === 'delivered' && (
                        <Badge className={`uppercase bg-green-600 hover:bg-green-700 text-white h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                            Entregue
                        </Badge>
                    )}
                    {activeStatus === "impressao" && (
                        <div className="flex items-center space-x-2 mt-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <StickyNote className={`h-4 w-4 ${pedido.impressoLista ? 'text-primary' : 'text-gray-300'}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{pedido.impressoLista ? 'Lista de Separação Impressa' : 'Lista de Separação não impressa'}</p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <FileBadge className={`h-4 w-4 ${pedido.impressoEtiqueta ? 'text-primary' : 'text-gray-300'}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{pedido.impressoEtiqueta ? 'Etiqueta Impressa' : 'Etiqueta não impressa'}</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}
                    {activeStatus === 'emissao-nf' && (() => {
                        const st = nfeFocusStatusByPedidoId[String(pedido.id)];
                        const b = mapStatusFocusToBadge(st);
                        return st ? (
                            <Badge className={`uppercase ${b.className} h-5 px-2 w-[92px] text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md truncate`}>
                                {b.label}
                            </Badge>
                        ) : null;
                    })()}
                </div>
            );
        }},
        
        
        
        
    ]);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Pendente":
            case "A vincular":
                return "bg-yellow-500 hover:bg-yellow-500 text-white";
            case "Emissao NF":
                return "bg-orange-500 hover:bg-orange-500 text-white";
            case "NF Emitida":
            case "Impressao":
                return "bg-purple-600 hover:bg-purple-700 text-white";
            case "Aguardando Coleta":
                return "bg-blue-500 hover:bg-blue-500 text-white";
            case "Enviado":
                return "bg-green-500 hover:bg-green-500 text-white";
            case "Entregue":
                return "bg-green-600 hover:bg-green-600 text-white";
            case "Cancelado":
                return "bg-red-500 hover:bg-red-500 text-white";
            case "Devolvido":
                return "bg-gray-500 hover:bg-gray-500 text-white";
            case "Devolução":
                return "bg-gray-500 hover:bg-gray-500 text-white";
            default:
                return "bg-gray-500 hover:bg-gray-500 text-white";
        }
    };

    const formatShipmentStatus = (status?: string) => {
        const s = String(status || '').trim();
        if (!s) return '';
        const key = s.toLowerCase();
        const map: Record<string, string> = {
            'pending': 'pendente',
            'ready_to_print': 'pronto para imprimir',
            'printed': 'etiqueta impressa',
            'ready_to_ship': 'enviar',
            'handling': 'em preparação',
            'shipped': 'enviado',
            'in_transit': 'em trânsito',
            'delivery_in_progress': 'em entrega',
            'out_for_delivery': 'saiu para entrega',
            'on_route': 'a caminho',
            'handed_to_carrier': 'entregue à transportadora',
            'delivered': 'entregue',
            'receiver_received': 'recebido pelo destinatário',
            'ready_to_pickup': 'pronto para retirada',
            'not_delivered': 'não entregue',
            'returned': 'devolvido',
            'canceled': 'cancelado',
            'cancelled': 'cancelado',
            'collected': 'coletado',
            'processing': 'processando',
        };
        return map[key] || s.replace(/_/g, ' ');
    };

    const getShipmentStatusColor = (status: string) => {
        const s = String(status || '').toLowerCase();
        switch (s) {
            case 'pending':
            case 'ready_to_print':
                return 'bg-yellow-500 hover:bg-yellow-500 text-white';
            case 'ready_to_ship':
                return 'bg-purple-600 hover:bg-purple-600 text-white';
            case 'in_transit':
            case 'shipped':
                return 'bg-blue-500 hover:bg-blue-500 text-white';
            case 'delivered':
                return 'bg-green-600 hover:bg-green-600 text-white';
            case 'not_delivered':
            case 'returned':
                return 'bg-purple-600 hover:bg-purple-600 text-white';
            case 'canceled':
            case 'cancelled':
                return 'bg-red-600 hover:bg-red-600 text-white';
            default:
                return 'bg-gray-500 hover:bg-gray-500 text-white';
        }
    };

    // Usando o novo hook de impressão
    const { printSettings, setPrintSettings, handleSavePrintSettings } = usePrintingSettings();

    // Lógica para processar as vinculações e mover o pedido de status
    const handleSaveVinculacoes = (vinculosOrPayload: any) => {
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

    const handleEmitirNfe = async (pedidosToEmit: any[]) => {
        if (!pedidosToEmit || pedidosToEmit.length === 0) return;
        setIsEmitting(true);
        setEmissionProgress(0);
        setEmittedCount(0);
        setFailedCount(0);
        try {
            const { data: sessionRes } = await supabase.auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error("Sessão expirada");
            let organizationId: string | null = null;
            {
                const { data: orgId } = await supabase.rpc('get_current_user_organization_id');
                organizationId = (Array.isArray(orgId) ? orgId?.[0] : orgId) || null;
            }
            if (!organizationId) throw new Error("Organização não encontrada");
            let companyId: string | null = null;
            {
                const { data: companiesForOrg } = await supabase
                    .from('companies')
                    .select('id')
                    .eq('organization_id', organizationId)
                    .order('is_active', { ascending: false })
                    .order('created_at', { ascending: true })
                    .limit(1);
                companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : null;
            }
            if (!companyId) throw new Error("Nenhuma empresa ativa encontrada");
            const headers: Record<string, string> = {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${token}`,
            };
            const orderIds = pedidosToEmit.map(p => p.id).filter(Boolean);
            let envSel: string = 'homologacao';
            try { envSel = localStorage.getItem('nfe_environment') || 'homologacao'; } catch {}
            const { data, error } = await supabase.functions.invoke<any>('focus-nfe-emit', {
                body: { organizationId, companyId, orderIds, environment: envSel },
                headers,
            } as any);
            if (error || (data && data.error)) throw new Error(error?.message || data?.error || "Falha na emissão");
            const results = Array.isArray(data?.results) ? data.results : [];
            let successCount = 0;
            let failCount = 0;
            const idsSucceeded: string[] = [];
            const idsFailed: string[] = [];
            results.forEach((r: any) => {
                if (r?.ok) { successCount++; idsSucceeded.push(r.orderId); } else { failCount++; idsFailed.push(r.orderId); }
            });
            setEmittedCount(successCount);
            setFailedCount(failCount);
            setEmissionProgress(100);
            if (successCount + failCount > 0) {
                setPedidos(prev => prev.map(p => {
                    if (idsSucceeded.includes(p.id)) return { ...p, status_interno: 'NF Emitida' };
                    if (idsFailed.includes(p.id)) return { ...p, subStatus: 'Falha na emissao' };
                    return p;
                }));
            }
        } catch {
            setFailedCount(pedidosToEmit.length);
            setEmissionProgress(100);
        } finally {
            setTimeout(() => setIsEmitting(false), 800);
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
            p.cliente?.toLowerCase?.().includes(term) ||
            (p.sku && p.sku.toLowerCase().includes(term)) ||
            (Array.isArray(p.itens) && p.itens.some((it: any) =>
                (it?.nome && String(it.nome).toLowerCase().includes(term)) ||
                (it?.product_name && String(it.product_name).toLowerCase().includes(term))
            ));
        return inDate && searchTermMatch;
    });

    let filteredPedidos = baseFiltered.filter(p => matchStatus(p, activeStatus));

    // Filtros adicionais por quadro (Marketplace e Tipo de Envio)
    if (activeStatus === 'impressao' || activeStatus === 'enviado') {
        if (marketplaceFilter === 'mercado-livre') {
            filteredPedidos = filteredPedidos.filter(p => String(p.marketplace || '').toLowerCase().includes('mercado'));
        }
        if (shippingTypeFilter !== 'all') {
            filteredPedidos = filteredPedidos.filter(p => normalizeShippingType(String(p.tipoEnvio ?? '')) === shippingTypeFilter);
        }
    }

    if (activeStatus === "emissao-nf") {
        if (quickFilter === "Falha na emissão") {
            filteredPedidos = filteredPedidos.filter(p => p.subStatus === "Falha na emissao");
        } else if (quickFilter === "Falha ao Enviar") {
            filteredPedidos = filteredPedidos.filter(p => p.subStatus === "Falha ao enviar");
        }
        filteredPedidos = filteredPedidos.filter(p => p.status_interno === 'Emissao NF');
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
        // Quando filtros locais afetam o conjunto (marketplace/tipo de envio), usar o total local
        const hasLocalFilterImpact = (marketplaceFilter !== 'all' || shippingTypeFilter !== 'all');
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
    }, [searchTerm, activeStatus, dateRange, quickFilter, sortKey, sortDir, marketplaceFilter, shippingTypeFilter]);

    useEffect(() => {}, [activeStatus]);

    useEffect(() => {}, [currentPage, pageSize]);

    useEffect(() => {}, [searchTerm, dateRange, quickFilter, sortKey, sortDir, marketplaceFilter, shippingTypeFilter]);

    // Carregar imediatamente ao entrar no módulo após preparar contagens globais
    useEffect(() => {
        loadPedidos();
    }, [organizationId]);

    useEffect(() => {
        try { loadGlobalStatusCounts(); } catch {}
    }, [pedidos, dateRange, searchTerm, marketplaceFilter, shippingTypeFilter]);

    useLayoutEffect(() => {
        const container = listContainerRef.current;
        const thead = theadRef.current;
        if (container && thead) {
            const cr = container.getBoundingClientRect();
            const tr = thead.getBoundingClientRect();
            const offset = Math.max(0, Math.round(tr.bottom - cr.top));
            setListTopOffset(offset);
        }
    }, [isLoading, activeStatus, sortKey, sortDir, marketplaceFilter, shippingTypeFilter]);


    // Garantir que a página atual seja válida quando total de páginas mudar
    useEffect(() => {
        const tf = totalPedidosCount ?? filteredPedidos.length;
        const newTotalPages = Math.max(1, Math.ceil(tf / pageSize));
        if (currentPage > newTotalPages) {
            setCurrentPage(newTotalPages);
        }
    }, [totalPedidosCount, filteredPedidos.length, pageSize, currentPage]);

    useEffect(() => {}, [activeStatus, filteredPedidos, processedConsume]);

    useEffect(() => {}, [activeStatus, filteredPedidos, processedReserve]);

    useEffect(() => {}, [filteredPedidos, processedRefund]);

    useEffect(() => {}, [activeStatus, filteredPedidos, processedEnsure]);

    
    
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
        if (target === 'a-vincular') return s === 'a vincular' || Boolean(p?.has_unlinked_items);
        if (target === 'cancelado') return s === 'cancelado' || s === 'devolucao';
        if (target === 'emissao-nf') return s === 'emissao nf';
        if (target === 'enviado') return s === 'enviado';
        const normalized = s.replace(/ /g, '-');
        return normalized === target;
    }

    const marketplaceOkLocal = (p: any) => (marketplaceFilter === 'all' ? true : String(p?.marketplace || '').toLowerCase().includes('mercado'));
    const shippingOkLocal = (p: any) => (shippingTypeFilter === 'all' ? true : normalizeShippingType(String(p?.tipoEnvio ?? '')) === shippingTypeFilter);
    const baseForCounts = baseFiltered.filter(p => marketplaceOkLocal(p) && shippingOkLocal(p));

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

            const cachedPdf = pedido?.label?.pdf_base64;
            if (!cachedPdf) return;

            const binStr = atob(String(cachedPdf));
            const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
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
                                        <Button className="h-10 px-4 rounded-xl bg-primary text-white shadow-lg disabled:opacity-50" disabled={isSyncing} onClick={() => { setIsSyncModalOpen(true); loadShopeeShops(); }}>
                                            <Zap className="w-4 h-4 mr-2" />
                                            {isSyncing ? 'Sincronizando...' : 'Sincronizar pedidos'}
                                        </Button>
                                    );
                                })()}
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 mb-8">
                                {statusBlocks.map((block) => (
                                    <Card
                                        key={block.id}
                                        className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-0 bg-white text-gray-900 overflow-hidden relative ${
                                            activeStatus === block.id ? "ring-2 ring-primary shadow-lg scale-105 bg-primary text-white" : ""
                                        }`}
                                        onClick={() => setActiveStatus(block.id)}
                                    >
                                        <CardContent className="p-4 text-center relative z-10">
                                            <div className="text-3xl font-bold mb-2">{block.count}</div>
                                            <div className="text-sm font-medium">{block.title}</div>
                                            <div className="text-xs opacity-80 mt-1">{block.description}</div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {activeStatus === "todos" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:w-1/4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {/* Ordenação: à esquerda do filtro de data */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                                >
                                                    {sortDir === 'asc' ? (
                                                        <ChevronUp className="w-4 h-4 mr-2" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 mr-2" />
                                                    )}
                                                    Ordenar
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    className={sortKey === 'sku' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('sku'); setSortDir('asc'); }}
                                                >
                                                    Sku
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={sortKey === 'items' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('items'); setSortDir('desc'); }}
                                                >
                                                    Total de itens
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('recent'); setSortDir('desc'); }}
                                                >
                                                    Mais recente
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    aria-label="Filtrar por data"
                                                    className={`group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange?.from && "text-gray-500"} ${isDatePopoverOpen ? 'gap-[1px]' : 'gap-0 group-hover:gap-[1px]'} justify-center`}
                                                >
                                                    <Calendar className="h-4 w-4" />
                                                    <span className={`overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out ${isDatePopoverOpen ? 'max-w-[140px] opacity-100' : 'group-hover:max-w-[140px] group-hover:opacity-100'}`}>
                                                        Filtrar por data
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={8}>
                                                <CalendarComponent
                                                    mode="range"
                                                    selected={tempDateRange}
                                                    onSelect={(range: any) => setTempDateRange(range)}
                                                    locale={ptBR}
                                                    initialFocus
                                                />
                                                <div className="p-2 border-t flex justify-end space-x-2">
                                                    <Button variant="ghost" className="text-gray-500" onClick={() => { setDateRange(undefined); setIsDatePopoverOpen(false); }}>Remover Filtro</Button>
                                                    <Button onClick={() => { setDateRange(tempDateRange); setIsDatePopoverOpen(false); }}>Aplicar</Button>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        <Button
                                            className="group h-12 px-4 rounded-2xl bg-primary shadow-lg text-white gap-0 group-hover:gap-2"
                                            onClick={handleExportCSV}
                                            aria-label="Exportar CSV"
                                        >
                                            <Download className="h-4 w-4" />
                                            <span className="overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out group-hover:max-w-[120px] group-hover:opacity-100">
                                                Exportar CSV
                                            </span>
                                        </Button>
                                        <Button variant="outline" className="group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 gap-0 group-hover:gap-2" onClick={(e) => {
                                                console.log('[Pedidos] Clique no botão Colunas');
                                                console.log('[Pedidos] Estados antes do clique:', { isFilterDrawerOpen, isColumnsDrawerOpen });
                                                e.stopPropagation();
                                                (e.currentTarget as HTMLButtonElement).blur();
                                                // Feche o drawer de filtros primeiro e abra o de colunas no próximo tick
                                                // Isso evita conflitos de overlay/estado quando os dois drawers alternam rapidamente
                                                setIsFilterDrawerOpen(false);
                                                setTimeout(() => {
                                                    console.log('[Pedidos] Abrindo Drawer de Colunas (setIsColumnsDrawerOpen(true))');
                                                    setIsColumnsDrawerOpen(true);
                                                }, 0);
                                                }} data-columns-trigger aria-label="Colunas">
                                            <Table className="h-4 w-4" />
                                            <span className="overflow-hidden whitespace-nowrap max-w-0 opacity-0 transition-all duration-300 ease-out group-hover:max-w-[80px] group-hover:opacity-100">
                                                Colunas
                                            </span>
                                        </Button>
                                        <div className="w-[150px]">
                                            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                                                <SelectTrigger className="h-12 rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/60">
                                                    <SelectValue placeholder="Itens por página" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="30">30 por página</SelectItem>
                                                    <SelectItem value="50">50 por página</SelectItem>
                                                    <SelectItem value="100">100 por página</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex items-center gap-2 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-9 w-9 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[56px] text-center">{safeCurrentPage}/{totalPages}</div>
                                            <Button
                                                variant="outline"
                                                className={`h-9 w-9 p-0 rounded-2xl ${safeCurrentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                aria-label="Próxima página"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <Dialog open={isSyncModalOpen} onOpenChange={setIsSyncModalOpen}>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Sincronizar pedidos</DialogTitle>
                                        <DialogDescription>Selecione o marketplace e a loja para sincronizar.</DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <Button variant={syncMarketplace === 'mercado_livre' ? 'default' : 'outline'} onClick={() => setSyncMarketplace('mercado_livre')}>Mercado Livre</Button>
                                            <Button variant={syncMarketplace === 'shopee' ? 'default' : 'outline'} onClick={() => setSyncMarketplace('shopee')}>Shopee</Button>
                                        </div>
                                        {syncMarketplace === 'mercado_livre' && (
                                            <div className="space-y-2">
                                                <Button className="w-full" disabled={isSyncing} onClick={() => { setIsSyncModalOpen(false); handleSyncOrders(); }}>Sincronizar todos pedidos</Button>
                                                <Button className="w-full" disabled={isSyncing || selectedCount === 0} onClick={() => { setIsSyncModalOpen(false); handleSyncSelectedOrders(); }}>{selectedCount > 0 ? `Sincronizar selecionados (${selectedCount})` : 'Sincronizar selecionados'}</Button>
                                                <Button className="w-full" disabled={isSyncing} onClick={() => { const id = window.prompt('Informe o ID interno (orders.id) para sincronizar:'); if (id) { setIsSyncModalOpen(false); handleSyncOrderByInternalId(id); } }}>Sincronizar por ID interno...</Button>
                                            </div>
                                        )}
                                        {syncMarketplace === 'shopee' && (
                                            <div className="space-y-3">
                                                <Select value={selectedShopeeShopId ? String(selectedShopeeShopId) : undefined} onValueChange={(v) => setSelectedShopeeShopId(Number(v))}>
                                                    <SelectTrigger className="w-full">
                                                        <SelectValue placeholder="Selecione a loja da Shopee" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {shopeeShopOptions.map((opt) => (
                                                            <SelectItem key={opt.id} value={String(opt.shop_id)}>{opt.label} ({opt.shop_id})</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button className="w-full" disabled={isSyncing || !selectedShopeeShopId} onClick={handleSyncShopeeOrders}>Sincronizar Shopee</Button>
                                            </div>
                                        )}
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsSyncModalOpen(false)}>Fechar</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>

                            {activeStatus === "emissao-nf" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:w-1/4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-[200px]">
                                            <Select value={quickFilter} onValueChange={setQuickFilter}>
                                                <SelectTrigger className="h-12 rounded-2xl bg-white shadow-lg ring-1 ring-gray-200/60">
                                                    <SelectValue placeholder="Filtro Rápido" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="Todos">Todos</SelectItem>
                                                    <SelectItem value="Falha na emissão">Falha na emissão</SelectItem>
                                                    <SelectItem value="Falha ao Enviar">Falha ao Enviar</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button className="h-12 px-6 rounded-2xl bg-primary shadow-lg" onClick={() => {
                                            const ids = filteredPedidos.map(p => p.id).filter(Boolean);
                                            if (ids.length === 0) return;
                                            setBulkIdsQueue(ids);
                                            setPedidoIdParaEmissao(ids[0]);
                                            setIsEmissaoDrawerOpen(true);
                                            setEmissaoRestartNonce(Date.now());
                                        }}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Emitir em Massa
                                        </Button>
                                        <Button className="h-12 px-6 rounded-2xl bg-primary shadow-lg" onClick={() => {
                                            const ids = filteredPedidos.filter(p => selectedPedidosEmissao.includes(p.id)).map(p => p.id).filter(Boolean);
                                            if (ids.length === 0) return;
                                            setBulkIdsQueue(ids);
                                            setPedidoIdParaEmissao(ids[0]);
                                            setIsEmissaoDrawerOpen(true);
                                            setEmissaoRestartNonce(Date.now());
                                        }}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Emitir Selecionados ({selectedPedidosEmissao.length})
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="rounded-2xl"
                                                    aria-label="Configurar ambiente de emissão"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    className={emitEnvironment === 'homologacao' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => {
                                                        e.preventDefault();
                                                        setEmitEnvironment('homologacao');
                                                        try { localStorage.setItem('nfe_environment', 'homologacao'); } catch {}
                                                    }}
                                                >
                                                    Ambiente: Homologação
                                                    {emitEnvironment === 'homologacao' && <Check className="w-4 h-4 ml-auto" />}
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={emitEnvironment === 'producao' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => {
                                                        e.preventDefault();
                                                        setEmitEnvironment('producao');
                                                        try { localStorage.setItem('nfe_environment', 'producao'); } catch {}
                                                    }}
                                                >
                                                    Ambiente: Produção
                                                    {emitEnvironment === 'producao' && <Check className="w-4 h-4 ml-auto" />}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        {emitEnvironment === 'homologacao' && (
                                            <Badge className="ml-1 bg-orange-100 text-orange-700 border border-orange-200">
                                                Homologação
                                            </Badge>
                                        )}
                                        <div className="flex items-center gap-0.5 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-10 w-8 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[40px] text-center">{safeCurrentPage}/{totalPages}</div>
                                            <Button
                                                variant="outline"
                                                className={`h-10 w-8 p-0 rounded-2xl ${safeCurrentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                aria-label="Próxima página"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {activeStatus === "impressao" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:w-1/4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4 flex-wrap">
                                        {/* Ordenação específica da aba Impressão */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                                >
                                                    {sortDir === 'asc' ? (
                                                        <ChevronUp className="w-4 h-4 mr-2" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 mr-2" />
                                                    )}
                                                    Ordenar
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    className={sortKey === 'shipping' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('shipping'); setSortDir('asc'); }}
                                                >
                                                    Tipo de envio
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={sortKey === 'sla' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('sla'); setSortDir('asc'); }}
                                                >
                                                    SLA próximo
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('recent'); setSortDir('desc'); }}
                                                >
                                                    Mais recente
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        {/* Filtro Marketplace */}
                                        <div className="w-[160px]">
                                            <Select value={marketplaceFilter} onValueChange={(v) => setMarketplaceFilter(v as any)}>
                                                <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
                                                    <span className={`text-sm ${marketplaceFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                                                        {marketplaceFilter !== 'all' ? (marketplaceFilter === 'mercado-livre' ? 'Mercado Livre' : '') : 'Marketplace'}
                                                    </span>
                                                    <span className="sr-only">
                                                        <SelectValue placeholder="Marketplace" />
                                                    </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="mercado-livre">Mercado Livre</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {/* Filtro Tipo de Envio */}
                                        <div className="w-[160px]">
                                            <Select value={shippingTypeFilter} onValueChange={(v) => setShippingTypeFilter(v as any)}>
                                                <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
                                                    <span className={`text-sm ${shippingTypeFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                                                    {shippingTypeFilter !== 'all' ? (
                                                        shippingTypeFilter === 'full' ? 'Full'
                                                        : shippingTypeFilter === 'flex' ? 'Flex'
                                                        : shippingTypeFilter === 'envios' ? 'Envios'
                                                        : shippingTypeFilter === 'correios' ? 'Correios'
                                                        : shippingTypeFilter === 'no_shipping' ? 'Sem envio'
                                                        : ''
                                                    ) : 'Tipo de Envio'}
                                                    </span>
                                                    <span className="sr-only">
                                                        <SelectValue placeholder="Tipo de envio" />
                                                    </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="full">Full</SelectItem>
                                                    <SelectItem value="flex">Flex</SelectItem>
                                                    <SelectItem value="envios">Envios</SelectItem>
                                                    <SelectItem value="correios">Correios</SelectItem>
                                                    <SelectItem value="no_shipping">Sem envio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <Button
                                            size="icon"
                                            className="h-12 w-12 rounded-2xl bg-primary text-white shadow-lg disabled:opacity-50 disabled:pointer-events-none"
                                            onClick={handlePrintPickingList}
                                            disabled={selectedPedidosImpressao.length === 0}
                                            aria-label={`Imprimir lista de separação (${selectedPedidosImpressao.length})`}
                                        >
                                            <ListChecks className="w-5 h-5" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            className="h-12 w-12 rounded-2xl bg-primary text-white shadow-lg disabled:opacity-50 disabled:pointer-events-none"
                                            onClick={handlePrintLabels}
                                            disabled={
                                                selectedPedidosImpressao.length === 0 ||
                                                !selectedPedidosImpressao.some(id => {
                                                    const p = pedidos.find(pp => pp.id === id);
                                                    const sub = String(p?.shipment_substatus || '').toLowerCase();
                                                    return sub === 'ready_to_print' || Boolean(p?.label?.pdf_base64);
                                                })
                                            }
                                            aria-label={`Imprimir etiquetas (${selectedPedidosImpressao.length})`}
                                        >
                                            <FileBadge className="w-5 h-5" />
                                        </Button>
                                        <Button size="icon" variant="outline" className="h-12 w-12 rounded-2xl bg-white text-gray-800 shadow-lg ring-1 ring-gray-200/60" onClick={() => setIsScannerOpen(true)} aria-label="Scanner">
                                            <Scan className="w-5 h-5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="rounded-2xl" onClick={() => setIsPrintConfigOpen(true)} aria-label="Configurações de impressão">
                                            <Settings className="w-4 h-4" />
                                        </Button>
                                        <div className="flex items-center gap-0.5 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-10 w-8 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[40px] text-center">{safeCurrentPage}/{totalPages}</div>
                                            <Button
                                                variant="outline"
                                                className={`h-10 w-8 p-0 rounded-2xl ${safeCurrentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                aria-label="Próxima página"
                                            >
                                                <ChevronRight className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeStatus === "enviado" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:w-1/4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {/* Ordenação para Enviado */}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                                >
                                                    {sortDir === 'asc' ? (
                                                        <ChevronUp className="w-4 h-4 mr-2" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 mr-2" />
                                                    )}
                                                    Ordenar
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    className={sortKey === 'shipping' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('shipping'); setSortDir('asc'); }}
                                                >
                                                    Tipo de envio
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('recent'); setSortDir('desc'); }}
                                                >
                                                    Mais recente
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        {/* Filtro Marketplace (aba Enviado) */}
                                        <div className="w-[140px]">
                                            <Select value={marketplaceFilter} onValueChange={(v) => setMarketplaceFilter(v as any)}>
                                                <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
                                                    <span className={`text-sm ${marketplaceFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                                                        {marketplaceFilter !== 'all' ? (marketplaceFilter === 'mercado-livre' ? 'Mercado Livre' : '') : 'Marketplace'}
                                                    </span>
                                                    <span className="sr-only">
                                                        <SelectValue placeholder="Marketplace" />
                                                    </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="mercado-livre">Mercado Livre</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {/* Filtro Tipo de Envio (aba Enviado) */}
                                        <div className="w-[140px]">
                                            <Select value={shippingTypeFilter} onValueChange={(v) => setShippingTypeFilter(v as any)}>
                                                <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
                                                    <span className={`text-sm ${shippingTypeFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                                                    {shippingTypeFilter !== 'all' ? (
                                                        shippingTypeFilter === 'full' ? 'Full'
                                                        : shippingTypeFilter === 'flex' ? 'Flex'
                                                        : shippingTypeFilter === 'envios' ? 'Envios'
                                                        : shippingTypeFilter === 'correios' ? 'Correios'
                                                        : shippingTypeFilter === 'no_shipping' ? 'Sem envio'
                                                        : ''
                                                    ) : 'Tipo de Envio'}
                                                    </span>
                                                    <span className="sr-only">
                                                        <SelectValue placeholder="Tipo de envio" />
                                                    </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="full">Full</SelectItem>
                                                    <SelectItem value="flex">Flex</SelectItem>
                                                    <SelectItem value="envios">Envios</SelectItem>
                                                    <SelectItem value="correios">Correios</SelectItem>
                                                    <SelectItem value="no_shipping">Sem envio</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeStatus === "cancelados" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:w-1/4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                                >
                                                    {sortDir === 'asc' ? (
                                                        <ChevronUp className="w-4 h-4 mr-2" />
                                                    ) : (
                                                        <ChevronDown className="w-4 h-4 mr-2" />
                                                    )}
                                                    Ordenar
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="start">
                                                <DropdownMenuItem
                                                    className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
                                                    onSelect={(e) => { e.preventDefault(); setSortKey('recent'); setSortDir('desc'); }}
                                                >
                                                    Mais recente
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <div className="w-[160px]">
                                            <Select value={marketplaceFilter} onValueChange={(v) => setMarketplaceFilter(v as any)}>
                                                <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
                                                    <span className={`text-sm ${marketplaceFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}> 
                                                        {marketplaceFilter !== 'all' ? (marketplaceFilter === 'mercado-livre' ? 'Mercado Livre' : '') : 'Marketplace'}
                                                    </span>
                                                    <span className="sr-only">
                                                        <SelectValue placeholder="Marketplace" />
                                                    </span>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">Todos</SelectItem>
                                                    <SelectItem value="mercado-livre">Mercado Livre</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={listContainerRef} className="rounded-2xl bg-white shadow-lg overflow-hidden relative">
                                {isLoading && (
                                    <LoadingOverlay fullscreen={false} topOffset={listTopOffset} message={"Carregando pedidos..."} />
                                )}
                                <div className="overflow-x-auto text-[clamp(12px,0.95vw,14px)]">
                                    <table className="min-w-full table-fixed divide-y divide-gray-200">
                                        <thead ref={theadRef} className="bg-gray-50">
                                            {(() => {
                                                const selectedCountHere = (
                                                    activeStatus === 'todos' ? selectedPedidos.length :
                                                    activeStatus === 'emissao-nf' ? selectedPedidosEmissao.length :
                                                    activeStatus === 'impressao' ? selectedPedidosImpressao.length :
                                                    activeStatus === 'enviado' ? selectedPedidosEnviado.length :
                                                    0
                                                );
                                                const enabledCols = columns.filter(col => col.enabled).length;
                                                const colSpan = enabledCols + 2; // checkbox + detalhes
                                                if (selectedCountHere > 0) {
                                                    return (
                                                        <tr>
                                                            <th className="w-16 px-6 py-3 text-left text-xs font-medium tracking-wider bg-purple-600">
                                                                {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado") && (
                                                                    <CustomCheckbox
                                                                        checked={
                                                                            (activeStatus === "todos" && selectedPedidos.length > 0 && selectedPedidos.length === filteredPedidos.length) ||
                                                                            (activeStatus === "emissao-nf" && selectedPedidosEmissao.length > 0 && selectedPedidosEmissao.length === filteredPedidos.length) ||
                                                                            (activeStatus === "impressao" && selectedPedidosImpressao.length > 0 && selectedPedidosImpressao.length === filteredPedidos.length) ||
                                                                            (activeStatus === "enviado" && selectedPedidosEnviado.length > 0 && selectedPedidosEnviado.length === filteredPedidos.length)
                                                                        }
                                                                        onChange={() => {
                                                                            if (activeStatus === "todos") handleSelectAll(selectedPedidos, setSelectedPedidos);
                                                                            if (activeStatus === "emissao-nf") handleSelectAll(selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                                            if (activeStatus === "impressao") handleSelectAll(selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                                            if (activeStatus === "enviado") handleSelectAll(selectedPedidosEnviado, setSelectedPedidosEnviado);
                                                                        }}
                                                                    />
                                                                )}
                                                            </th>
                                                            <th colSpan={enabledCols + 1} className="px-6 py-3 text-left text-sm font-semibold bg-purple-600 text-white">
                                                                {selectedCountHere} selecionado{selectedCountHere > 1 ? 's' : ''}
                                                            </th>
                                                        </tr>
                                                    );
                                                }
                                                return (
                                                    <tr>
                                                        <th className="w-[2%] px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                            {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado") && (
                                                                <div className="w-5 h-5 flex items-center justify-center">
                                                                <CustomCheckbox
                                                                    checked={
                                                                        (activeStatus === "todos" && selectedPedidos.length > 0 && selectedPedidos.length === filteredPedidos.length) ||
                                                                        (activeStatus === "emissao-nf" && selectedPedidosEmissao.length > 0 && selectedPedidosEmissao.length === filteredPedidos.length) ||
                                                                        (activeStatus === "impressao" && selectedPedidosImpressao.length > 0 && selectedPedidosImpressao.length === filteredPedidos.length) ||
                                                                        (activeStatus === "enviado" && selectedPedidosEnviado.length > 0 && selectedPedidosEnviado.length === filteredPedidos.length)
                                                                    }
                                                                    onChange={() => {
                                                                        if (activeStatus === "todos") handleSelectAll(selectedPedidos, setSelectedPedidos);
                                                                        if (activeStatus === "emissao-nf") handleSelectAll(selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                                        if (activeStatus === "impressao") handleSelectAll(selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                                        if (activeStatus === "enviado") handleSelectAll(selectedPedidosEnviado, setSelectedPedidosEnviado);
                                                                    }}
                                                                />
                                                                </div>
                                                            )}
                                                        </th>
                                                        {columns.filter(col => col.enabled).map(col => (
                                                                <th
                                                                    key={col.id}
                                                                    className={`py-1 text-[clamp(11px,0.9vw,13px)] font-medium text-gray-500 uppercase tracking-wider ${col.id === 'produto' ? 'text-left w-[25%] pr-0' : ''} ${col.id === 'itens' ? 'text-center w-[4%] pl-0 pr-0' : ''} ${col.id === 'cliente' ? 'text-center w-[15%] pr-0' : ''} ${col.id === 'valor' ? 'text-center w-[10%]' : ''} ${col.id === 'tipoEnvio' ? 'text-center w-[10%]' : ''} ${col.id === 'marketplace' ? 'text-center w-[10%]' : ''} ${col.id === 'status' ? 'text-center w-[10%]' : ''}`}
                                                                >
                                                                    {col.name}
                                                                </th>
                                                            ))}
                                                        <th className="py-1 text-[clamp(11px,0.9vw,13px)] text-center font-medium text-gray-500 uppercase tracking-wider w-[8%]">Detalhes</th>
                                                    </tr>
                                                );
                                            })()}
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {paginatedPedidos.length > 0 ? (
                                                paginatedPedidos.map((pedido) => {
                                                    const payLower = String(pedido?.payment_status || '').toLowerCase();
                                                    const isApprovedRow = payLower === 'approved' || payLower === 'paid' || payLower === 'settled' || Boolean(pedido?.payment_date_approved);
                                                    const isCancelledRow = payLower === 'cancelled';
                                                    const isRefundedRow = payLower === 'refunded';
                                                    const canVincular = activeStatus === 'a-vincular' ? true : (isApprovedRow && !isCancelledRow && !isRefundedRow);
                                                    const vincularTooltip = activeStatus === 'a-vincular'
                                                        ? 'Abrir vinculação'
                                                        : (!isApprovedRow
                                                            ? 'Pagamento ainda não aprovado'
                                                            : (isCancelledRow
                                                                ? 'Pagamento cancelado'
                                                                : (isRefundedRow ? 'Pagamento reembolsado' : 'Abrir vinculação')));
                                                    return (
                                                    <tr key={pedido.id} className="group hover:bg-gray-50 transition-colors">
                                                        <td className="w-[2%] px-2 py-1 whitespace-nowrap">
                                                            {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao" || activeStatus === "enviado") && (
                                                                <div className="w-5 h-5 flex items-center justify-center">
                                                                <CustomCheckbox
                                                                    checked={
                                                                        (activeStatus === "todos" && selectedPedidos.includes(pedido.id)) ||
                                                                        (activeStatus === "emissao-nf" && selectedPedidosEmissao.includes(pedido.id)) ||
                                                                        (activeStatus === "impressao" && selectedPedidosImpressao.includes(pedido.id)) ||
                                                                        (activeStatus === "enviado" && selectedPedidosEnviado.includes(pedido.id))
                                                                    }
                                                                    onChange={() => {
                                                                        if (activeStatus === "todos") handleCheckboxChange(pedido.id, selectedPedidos, setSelectedPedidos);
                                                                        if (activeStatus === "emissao-nf") handleCheckboxChange(pedido.id, selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                                        if (activeStatus === "impressao") handleCheckboxChange(pedido.id, selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                                        if (activeStatus === "enviado") handleCheckboxChange(pedido.id, selectedPedidosEnviado, setSelectedPedidosEnviado);
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                                </div>
                                                            )}
                                                        </td>
                                                        {columns.filter(col => col.enabled).map(col => (
                                                            <td
                                                                key={col.id}
                                                                className={`py-1 whitespace-nowrap text-sm text-gray-500 min-w-0 ${col.id === 'produto' ? 'text-left w-[25%] pr-0' : ''} ${col.id === 'itens' ? 'w-[4%] text-center pl-0 pr-0' : ''} ${col.id === 'cliente' ? 'w-[15%] text-center pr-0' : ''} ${col.id === 'valor' ? 'w-[10%] text-center' : ''} ${col.id === 'tipoEnvio' ? 'w-[10%] text-center' : ''} ${col.id === 'marketplace' ? 'w-[10%] text-center' : ''} ${col.id === 'status' ? 'w-[10%] text-center' : ''} ${pedido.quantidadeTotal >= 2 ? 'align-middle' : ''}`}
                                                            >
                                                                {col.render(pedido)}
                                                            </td>
                                                        ))}
                                                        <td className="py-1 w-[8%] whitespace-nowrap text-center text-sm font-medium">
                                                            {activeStatus === "a-vincular" ? (
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button
                                                                                variant="outline"
                                                                                className="h-8 px-4"
                                                                                disabled={!canVincular}
                                                                                onClick={(e) => { e.stopPropagation(); if (canVincular) handleVincularClick(pedido); }}
                                                                            >
                                                                                Vincular
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            <span>{vincularTooltip}</span>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            ) : activeStatus === "aguardando-coleta" ? (
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    variant="link"
                                                                                    className="h-8 w-8 p-0 text-purple-600"
                                                                                    onClick={(e) => { e.stopPropagation(); handleReprintLabel(pedido); }}
                                                                                    aria-label="Reimprimir"
                                                                                >
                                                                                    <FileBadge className="h-4 w-4" />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>
                                                                                <span>Reimprimir</span>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                    <Button variant="link" className="h-8 w-8 p-0 text-primary" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); handleOpenDetailsDrawer(pedido); }} data-details-trigger>
                                                                        <ChevronRight className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ) : activeStatus === "impressao" ? (
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    variant="link"
                                                                                    className="h-8 w-8 p-0"
                                                                                    onClick={(e) => { e.stopPropagation(); handleReprintLabel(pedido); }}
                                                                                    disabled={String(pedido?.shipment_substatus || '').toLowerCase() === 'buffered'}
                                                                                    aria-label="Reimprimir etiqueta"
                                                                                >
                                                                                    <FileBadge className={`h-4 w-4 ${pedido?.impressoEtiqueta ? 'text-purple-600' : 'text-gray-500'}`} />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>
                                                                                <span>Reimprimir</span>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                    <Button variant="link" className="h-8 w-8 p-0 text-primary" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); handleOpenDetailsDrawer(pedido); }} data-details-trigger>
                                                                        <ChevronRight className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {activeStatus === "emissao-nf" && !nfeAuthorizedByPedidoId[String(pedido.id)] && (
                                                                        <Button
                                                                            variant="outline"
                                                                            className="h-8 px-4"
                                                                            onClick={(e) => { e.stopPropagation(); setPedidoIdParaEmissao(pedido.id); setIsEmissaoDrawerOpen(true); setEmissaoRestartNonce(Date.now()); }}
                                                                        >
                                                                            Emitir
                                                                        </Button>
                                                                    )}
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="outline" className="h-8 px-3" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); }} data-details-trigger>
                                                                                Mais
                                                                                <ChevronDown className="h-4 w-4 ml-1" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleOpenDetailsDrawer(pedido);
                                                                                }}
                                                                            >
                                                                                Mostrar detalhes
                                                                            </DropdownMenuItem>
                                                                            {activeStatus === "emissao-nf" && (
                                                                                <DropdownMenuItem
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleSyncNfeForPedido(pedido);
                                                                                    }}
                                                                                >
                                                                                    Sincronizar NF-e
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                            {activeStatus === "emissao-nf" && nfeAuthorizedByPedidoId[String(pedido.id)] && (
                                                                                <DropdownMenuItem
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleEnviarNfeForPedido(pedido);
                                                                                    }}
                                                                                >
                                                                                    Enviar NFe
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                    );
                                                })
                                            ) : (
                                                <tr>
                                                    <td colSpan={columns.filter(col => col.enabled).length + 2} className="py-10 text-center text-gray-500">Nenhum pedido encontrado para este status.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="py-4 px-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3 text-sm text-gray-600">
                                    <div>
                                        Exibindo {showingFrom}-{showingTo} de {totalFiltered} pedido(s)
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            className="h-8 px-3 rounded-lg"
                                            disabled={safeCurrentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        >
                                            Anterior
                                        </Button>
                                        {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
                                            const page = i + 1;
                                            return (
                                                <Button
                                                    key={page}
                                                    variant={page === safeCurrentPage ? "default" : "outline"}
                                                    className={`h-8 w-9 p-0 rounded-lg ${page === safeCurrentPage ? 'bg-primary text-white' : ''}`}
                                                    onClick={() => setCurrentPage(page)}
                                                >
                                                    {page}
                                                </Button>
                                            );
                                        })}
                                        {totalPages > 10 && (
                                            <span className="px-2">...</span>
                                        )}
                                        {totalPages > 10 && (
                                            <Button
                                                variant={totalPages === safeCurrentPage ? "default" : "outline"}
                                                className={`h-8 w-12 p-0 rounded-lg ${totalPages === safeCurrentPage ? 'bg-primary text-white' : ''}`}
                                                onClick={() => setCurrentPage(totalPages)}
                                            >
                                                {totalPages}
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            className="h-8 px-3 rounded-lg"
                                            disabled={safeCurrentPage === totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        >
                                            Próximo
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>

                {/* Drawer de Detalhes do Pedido */}
                <PedidoDetailsDrawer pedido={selectedPedido} open={isDetailsDrawerOpen} onOpenChange={(open) => { setIsDetailsDrawerOpen(open); if (!open) { const btn = document.querySelector<HTMLButtonElement>('button[data-details-trigger]'); btn?.focus(); } }} />

                {/* Drawer de Emissão de NF-e */}
                <EmissaoNFDrawer
                    open={isEmissaoDrawerOpen}
                    onOpenChange={(open) => { setIsEmissaoDrawerOpen(open); if (!open) { setPedidoIdParaEmissao(null); } }}
                    pedidoId={pedidoIdParaEmissao}
                    onOpenDetails={(id) => {
                        const p = pedidos.find(pp => String(pp.id) === String(id));
                        if (p) handleOpenDetailsDrawer(p);
                    }}
                    autoAdvance={bulkIdsQueue.length > 0}
                    queueIndex={pedidoIdParaEmissao ? Math.max(0, bulkIdsQueue.findIndex(id => id === pedidoIdParaEmissao)) : undefined}
                    queueTotal={bulkIdsQueue.length || undefined}
                    restartNonce={emissaoRestartNonce}
                    onEmissaoConcluida={() => {
                        if (bulkIdsQueue.length > 1) {
                            const next = bulkIdsQueue.slice(1);
                            setBulkIdsQueue(next);
                            setPedidoIdParaEmissao(next[0]);
                        } else {
                            setIsEmissaoDrawerOpen(false);
                            setPedidoIdParaEmissao(null);
                            setBulkIdsQueue([]);
                        }
                        try { refreshNfeAuthorizedMapForList(); } catch {}
                    }}
                />

                {/* Drawer de Filtros */}
                <Drawer direction="right" open={isFilterDrawerOpen} onOpenChange={(open) => { console.log('[Pedidos] Filter Drawer onOpenChange:', open); setIsFilterDrawerOpen(open); }}>
                    <DrawerContent className="w-[30%] right-0">
                        <DrawerHeader>
                            <DrawerTitle>Filtros Avançados</DrawerTitle>
                            <DrawerDescription>Ajuste os filtros para encontrar pedidos específicos.</DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4">
                            <div className="space-y-4">
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Marketplace</span>
                                    <select className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50">
                                        <option>Todos</option>
                                        <option>Mercado Livre</option>
                                        <option>Amazon</option>
                                        <option>Shopee</option>
                                        <option>Magazine Luiza</option>
                                        <option>Americanas</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-sm font-medium text-gray-700">Período</span>
                                    <div className="mt-1 grid grid-cols-2 gap-2">
                                        <Input type="date" className="rounded-md" />
                                        <Input type="date" className="rounded-md" />
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div className="p-4 border-t flex justify-end">
                            <Button onClick={() => setIsFilterDrawerOpen(false)}>Aplicar Filtros</Button>
                        </div>
                    </DrawerContent>
                </Drawer>

                {/* Painel de Colunas (custom, sem vaul) */}
                {isColumnsDrawerOpen && (
                    <>
                        {/* Overlay */}
                        <div
                            className={`fixed inset-0 z-[50] bg-black/40 transition-opacity duration-200 ${columnsPanelAnimatedOpen ? 'opacity-100' : 'opacity-0'}`}
                            onClick={() => {
                                console.log('[Pedidos] Fechando painel de colunas via overlay');
                                setIsColumnsDrawerOpen(false);
                                const btn = document.querySelector<HTMLButtonElement>('button[data-columns-trigger]');
                                btn?.focus();
                            }}
                        />
                        {/* Aside */}
                        <aside
                            ref={columnsDrawerRef}
                            className={`fixed inset-y-0 right-0 z-[60] w-[30%] max-w-[560px] bg-white/95 backdrop-blur-md shadow-2xl flex flex-col border-l border-gray-100 transform transition-transform duration-300 ease-out ${columnsPanelAnimatedOpen ? 'translate-x-0' : 'translate-x-full'}`}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Gerenciar Colunas"
                        >
                            <div className="grid gap-2 p-6 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/70">
                                <h2 className="text-xl font-bold">Gerenciar Colunas</h2>
                                <p className="text-sm text-gray-600">Selecione e arraste para organizar as colunas da tabela.</p>
                            </div>
                            <div className="p-4 overflow-y-auto flex-1">
                                <div className="space-y-2">
                                    {columns.map((col, index) => (
                                        <div
                                            key={col.id}
                                            draggable
                                            onDragStart={(e) => {
                                                dragStartIndexRef.current = index;
                                                e.dataTransfer.effectAllowed = 'move';
                                                try { e.dataTransfer.setData('text/plain', String(index)); } catch {}
                                            }}
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                if (dragOverIndex !== index) setDragOverIndex(index);
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const from = dragStartIndexRef.current ?? parseInt(e.dataTransfer.getData('text/plain') || '-1', 10);
                                                const to = index;
                                                if (from === -1 || from === null || isNaN(from)) return;
                                                setColumns((prev) => {
                                                    const copy = [...prev];
                                                    const [item] = copy.splice(from, 1);
                                                    copy.splice(to, 0, item);
                                                    return copy;
                                                });
                                                setDragOverIndex(null);
                                                dragStartIndexRef.current = null;
                                            }}
                                            onDragEnd={() => { setDragOverIndex(null); dragStartIndexRef.current = null; }}
                                            className={`flex items-center justify-between p-2 rounded-md border bg-gray-50/80 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing ${dragOverIndex === index ? 'ring-2 ring-purple-300' : ''}`}
                                        >
                                            <div className="flex items-center space-x-2">
                                                {!col.alwaysVisible && (
                                                    <CustomCheckbox
                                                        checked={col.enabled}
                                                        onChange={(e) => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, enabled: !!(e.target as HTMLInputElement).checked } : c))}
                                                    />
                                                )}
                                                <span className="text-sm">{col.name}</span>
                                                {col.alwaysVisible && (
                                                    <Badge variant="secondary" className="text-xs">Obrigatória</Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-400 select-none">arraste</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 border-t flex justify-end">
                                <Button onClick={() => { console.log('[Pedidos] Fechando painel de colunas via botão Concluir'); setIsColumnsDrawerOpen(false); }}>Concluir</Button>
                            </div>
                        </aside>
                    </>
                )}

                {/* Modal de Vinculação de Pedido */}
                <VincularPedidoModal
                    isOpen={isVincularModalOpen}
                    onClose={() => setIsVincularModalOpen(false)}
                    onSave={handleSaveVinculacoes}
                    pedidoId={pedidoParaVincular?.id || ""}
                    anunciosParaVincular={anunciosParaVincular}
                />

                {/* Modal de Scanner (Bipagem) */}
                <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
                    <DialogContent className="sm:max-w-[80vw] h-[90vh] overflow-hidden flex flex-col p-0">
                        <DialogHeader className="p-6 border-b border-gray-200 flex-row items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <Scan className="w-6 h-6" />
                                <DialogTitle className="text-2xl">
                                    Checkout por produto
                                </DialogTitle>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Printer className="w-5 h-5 text-gray-500" />
                                <Select>
                                    <SelectTrigger className="w-[180px] h-10">
                                        <SelectValue placeholder="Impressora Ativa" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zebra">Zebra ZT410</SelectItem>
                                        <SelectItem value="elgin">Elgin L42 Pro</SelectItem>
                                        <SelectItem value="argox">Argox OS-214 Plus</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogDescription className="sr-only">Configurações e ações de bipagem e impressão.</DialogDescription>
                        </DialogHeader>
                        
                        <div className="flex-shrink-0 p-6 flex flex-col space-y-4">
                            <div className="flex space-x-2">
                                <div className="relative flex-grow">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <Input
                                        placeholder="Escanear ou Inserir SKU/Código..."
                                        className="h-12 w-full pl-10 pr-4 rounded-xl"
                                        value={scannedSku}
                                        onChange={(e) => setScannedSku(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleScan();
                                        }}
                                    />
                                </div>
                                <Button className="h-12 px-6 rounded-xl" onClick={handleScan}>
                                    <Search className="w-4 h-4 mr-2" />
                                    Buscar
                                </Button>
                            </div>
                        </div>

                        <div className="p-6 space-y-4 bg-gray-50 flex-1 min-h-0 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card>
                                    <CardContent className="p-4 space-y-4">
                                        <h3 className="text-lg font-semibold mb-2">Pedido Localizado</h3>
                                        {scannedPedido ? (
                                            <>
                                                <div className="flex flex-col space-y-1 text-sm text-gray-700">
                                                    <p><strong>Nº do Pedido:</strong> {scannedPedido.id}</p>
                                                    <p><strong>Marketplace:</strong> {scannedPedido.marketplace}</p>
                                                    <p><strong>Cliente:</strong> {scannedPedido.cliente}</p>
                                                    <p><strong>Tipo de Envio:</strong> {mapTipoEnvioLabel(scannedPedido.tipoEnvio)}</p>
                                                </div>
                                                <div className="space-y-3">
                                                    <h4 className="font-semibold pt-2 border-t">Itens do Pedido ({scannedPedido.itens.length})</h4>
                                                    {scannedPedido.itens.map((item: any, itemIndex: number) => (
                                                        <div key={itemIndex} className="flex items-center space-x-3 bg-gray-100 p-2 rounded-lg">
                                                            <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" loading="lazy" decoding="async" width="40" height="40" />
                                                            <div className="flex-1">
                                                                <div className="font-medium text-sm">{item.nome}</div>
                                                                <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <span className="text-sm font-bold">{item.bipado ? '1/1' : '0/1'}</span>
                                                                {item.bipado ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <X className="h-5 w-5 text-gray-400" />}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <p className="text-center text-gray-500">Nenhum pedido localizado ainda.</p>
                                        )}
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4 space-y-4">
                                        <h3 className="text-lg font-semibold mb-2">Produtos Bipados</h3>
                                        {scannedPedido?.itens.filter((item: any) => item.bipado).length > 0 ? (
                                            scannedPedido.itens.filter((item: any) => item.bipado).map((item: any, index: number) => (
                                                <div key={index} className="flex items-center space-x-3 bg-gray-100 p-2 rounded-lg">
                                                    <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" loading="lazy" decoding="async" width="40" height="40" />
                                                    <div className="flex-1">
                                                        <div className="font-medium text-sm">{item.nome}</div>
                                                        <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                                                    </div>
                                                    <div className="text-sm font-bold">1/1</div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-center text-gray-500">Nenhum produto bipado neste pedido.</p>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                        
                        <div className="flex-shrink-0 p-6 border-t border-gray-200">
                            <Tabs value={scannerTab} onValueChange={setScannerTab}>
                                <div className="flex items-center space-x-4 mb-4">
                                    <TabsList className="grid flex-1 grid-cols-2">
                                        <TabsTrigger value="nao-impressos">Não Impressos ({pedidosNaoImpressos.length})</TabsTrigger>
                                        <TabsTrigger value="impressos">Impressos ({pedidosImpressos.length})</TabsTrigger>
                                    </TabsList>
                                    <div className="relative w-1/2">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                        <Input placeholder="Buscar pedido..." className="h-10 rounded-lg pl-10" />
                                    </div>
                                </div>
                                <TabsContent value="nao-impressos" className="max-h-[250px] overflow-y-auto pr-2">
                                    <div className="space-y-3">
                                        {pedidosNaoImpressos.map((pedido, index) => (
                                            <Card key={index} className="bg-white hover:bg-gray-50 cursor-pointer">
                                                <CardContent className="p-3 flex items-center justify-between">
                                                    <div className="text-sm font-medium">Pedido #{pedido.id}</div>
                                                    <div className="text-xs text-gray-500">{pedido.marketplace} - {mapTipoEnvioLabel(pedido.tipoEnvio)}</div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </TabsContent>
                                <TabsContent value="impressos" className="max-h-[250px] overflow-y-auto pr-2">
                                    <div className="space-y-3">
                                        {pedidosImpressos.map((pedido, index) => (
                                            <Card key={index} className="bg-white hover:bg-gray-50 cursor-pointer">
                                                <CardContent className="p-3 flex items-center justify-between">
                                                    <div className="text-sm font-medium">Pedido #{pedido.id}</div>
                                                    <div className="text-xs text-gray-500">{pedido.marketplace} - {mapTipoEnvioLabel(pedido.tipoEnvio)}</div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                        <DialogFooter className="p-4 bg-gray-100 border-t border-gray-200">
                            <Button className="w-full h-12 text-lg font-semibold" onClick={handleCompleteBipagem}>
                                <Check className="w-5 h-5 mr-2" />
                                Completar Bipagem
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Modal de Confirmação de Conclusão */}
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

                {/* Modal de Configurações de Impressão (Atualizado) */}
                <Dialog open={isPrintConfigOpen} onOpenChange={setIsPrintConfigOpen}>
                    <DialogContent className="sm:max-w-[1200px] h-[90vh] p-0 flex">
                        <div className="w-1/4 p-6 border-r flex flex-col items-start">
                            <DialogHeader className="w-full">
                                <DialogTitle className="flex items-center space-x-2">
                                    <Settings className="w-5 h-5" />
                                    <span>Configurações</span>
                                </DialogTitle>
                                <DialogDescription>
                                    Ajuste as configurações de impressão.
                                </DialogDescription>
                            </DialogHeader>
                            <Tabs value={activePrintTab} onValueChange={setActivePrintTab} orientation="vertical" className="flex-1 w-full mt-4">
                                <TabsList className="flex flex-col items-start p-0 h-auto space-y-1 w-full">
                                    <TabsTrigger value="label" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-white">
                                        <FileBadge className="w-4 h-4 mr-2" />
                                        Etiqueta de Envio
                                    </TabsTrigger>
                                    <TabsTrigger value="picking-list" className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-white">
                                        <ListChecks className="w-4 h-4 mr-2" />
                                        Lista de Separação
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                        <div className="flex-1 flex flex-col h-full overflow-hidden">
                            <Tabs value={activePrintTab} onValueChange={setActivePrintTab} className="flex-1 flex flex-col h-full">
                                <div className="flex-1 p-6 grid grid-cols-2 gap-8 overflow-y-auto">
                                    <div className="col-span-1">
                                        <TabsContent value="label" className="mt-0">
                                            <section className="space-y-4">
                                                <h3 className="font-semibold text-lg flex items-center space-x-2">
                                                    <FileBadge className="h-5 w-5" />
                                                    <span>Etiqueta de Envio</span>
                                                </h3>
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="text-sm font-medium">Impressora de Etiquetas</label>
                                                        <Select value={printSettings.labelPrinter} onValueChange={(value) => setPrintSettings({...printSettings, labelPrinter: value})}>
                                                            <SelectTrigger className="w-full mt-1">
                                                                <SelectValue placeholder="Selecione a impressora" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="zebra">Zebra ZT410</SelectItem>
                                                                <SelectItem value="elgin">Elgin L42 Pro</SelectItem>
                                                                <SelectItem value="argox">Argox OS-214 Plus</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <label className="text-sm font-medium">Tamanho da Etiqueta</label>
                                                        <Select value={printSettings.labelSize} onValueChange={(value) => setPrintSettings({...printSettings, labelSize: value})}>
                                                            <SelectTrigger className="w-full mt-1">
                                                                <SelectValue placeholder="Selecione o tamanho" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="10x15">10x15 cm</SelectItem>
                                                                <SelectItem value="A4">A4 (com 4 etiquetas)</SelectItem>
                                                                <SelectItem value="10x10">10x10 cm</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <CustomCheckbox
                                                            checked={printSettings.separateLabelPerItem}
                                                            onChange={(e) => setPrintSettings({...printSettings, separateLabelPerItem: (e.target as HTMLInputElement).checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Imprimir uma etiqueta por item</span>
                                                    </label>
                                                </div>
                                            </section>
                                        </TabsContent>
                                        <TabsContent value="picking-list" className="mt-0">
                                            <section className="space-y-4">
                                                <h3 className="font-semibold text-lg flex items-center space-x-2">
                                                    <ListChecks className="h-5 w-5" />
                                                    <span>Lista de Separação</span>
                                                </h3>
                                                <div className="space-y-4">
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <CustomCheckbox
                                                            checked={printSettings.groupByProduct}
                                                            onChange={(e) => setPrintSettings({...printSettings, groupByProduct: (e.target as HTMLInputElement).checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Agrupar por produto (Picking List)</span>
                                                    </label>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <CustomCheckbox
                                                            checked={printSettings.includeBarcode}
                                                            onChange={(e) => setPrintSettings({...printSettings, includeBarcode: (e.target as HTMLInputElement).checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Incluir código de barras no SKU</span>
                                                    </label>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <CustomCheckbox
                                                            checked={printSettings.includeOrderNumber}
                                                            onChange={(e) => setPrintSettings({...printSettings, includeOrderNumber: (e.target as HTMLInputElement).checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Incluir número do pedido</span>
                                                    </label>
                                                </div>
                                            </section>
                                        </TabsContent>
                                    </div>
                                    <div className="col-span-1 border-l pl-8 h-full flex flex-col">
                                        <div className="flex-1 overflow-y-auto">
                                            {activePrintTab === 'label' ? (
                                                <LabelPDFMockup settings={printSettings} pedidos={pedidos.filter(p => selectedPedidosImpressao.includes(p.id))} />
                                            ) : (
                                                <PickingListPDFMockup settings={printSettings} pedidos={pedidos.filter(p => selectedPedidosImpressao.includes(p.id))} onPrint={handlePrintPickingList} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter className="p-4 border-t">
                                    <Button onClick={() => { handleSavePrintSettings(); setIsPrintConfigOpen(false); }}>Salvar Configurações</Button>
                                    <Button variant="outline" onClick={() => setIsPrintConfigOpen(false)}>Fechar</Button>
                                </DialogFooter>
                            </Tabs>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Drawer de Carregamento de Emissão de NF */}
                <Drawer open={isEmitting} onOpenChange={setIsEmitting}>
                    <DrawerContent className="w-[40%] mx-auto right-0 translate-x-[30%] p-6">
                        <DrawerHeader className="p-0 mb-4">
                            <DrawerTitle className="text-xl font-bold flex items-center space-x-2">
                                <FileText className="h-6 w-6 text-primary" />
                                <span>Processando Emissão de NF-e</span>
                            </DrawerTitle>
                            <DrawerDescription className="text-sm">
                                Suas notas fiscais estão sendo emitidas. Aguarde.
                            </DrawerDescription>
                        </DrawerHeader>
                        <div className="space-y-4">
                            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all duration-500 ease-in-out"
                                    style={{ width: `${emissionProgress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium text-gray-700">
                                <span>Progresso: {Math.round(emissionProgress)}%</span>
                                <span>{emittedCount + failedCount} de {pedidos.filter(p => p.status_interno === 'Emissao NF').length}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-center space-x-2">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    <div>
                                        <div className="text-sm font-semibold">Notas Emitidas</div>
                                        <div className="text-lg font-bold text-green-700">{emittedCount}</div>
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-center space-x-2">
                                    <MinusCircle className="h-5 w-5 text-red-600" />
                                    <div>
                                        <div className="text-sm font-semibold">Falhas</div>
                                        <div className="text-lg font-bold text-red-700">{failedCount}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </DrawerContent>
                </Drawer>
            </SidebarProvider>
        </TooltipProvider>
        );
}

export default Pedidos;
