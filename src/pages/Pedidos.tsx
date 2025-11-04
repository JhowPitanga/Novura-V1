import { useState, useRef, useEffect, startTransition } from "react";
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
import { PedidoDetailsDrawer } from "@/components/pedidos/PedidoDetailsDrawer";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Cache simples para requisições ao endpoint público de Items do Mercado Livre
const mlItemCache = new Map<string, any>();

function mapTipoEnvioLabel(v?: string) {
    const s = String(v || '').toLowerCase();
    if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'Full';
    if (s === 'flex' || s === 'self_service') return 'Flex';
    if (s === 'envios' || s === 'me2' || s === 'xd_drop_off' || s === 'cross_docking' || s === 'custom') return 'Envios';
    if (s === 'correios' || s === 'drop_off') return 'Correios';
    if (s === 'no_shipping') return 'Sem Envio';
    return s ? s : '—';
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


async function fetchMLItemDetails(itemId: string): Promise<any | null> {
    if (!itemId) return null;
    const key = itemId.toUpperCase();
    if (mlItemCache.has(key)) return mlItemCache.get(key);
    try {
        const resp = await fetch(`https://api.mercadolibre.com/items/${key}?include_attributes=all`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        mlItemCache.set(key, json);
        return json;
    } catch (e) {
        console.warn('Falha ao buscar item MLB', key, e);
        mlItemCache.set(key, null);
        return null;
    }
}

function resolveVariationImageUrl(itemJson: any, variationId?: number | string): string | null {
    if (!itemJson) return null;
    const pictures: any[] = Array.isArray(itemJson?.pictures) ? itemJson.pictures : [];
    // Se houver variação, tentar pegar picture_ids da variação correspondente
    if (variationId && Array.isArray(itemJson?.variations)) {
        const vId = typeof variationId === 'string' ? variationId : Number(variationId);
        const variation = itemJson.variations.find((v: any) => String(v?.id) === String(vId));
        if (variation && Array.isArray(variation.picture_ids) && variation.picture_ids.length > 0) {
            const picId = variation.picture_ids[0];
            const pic = pictures.find(p => p?.id === picId);
            if (pic?.url) return pic.url;
        }
    }
    // Fallback: primeira imagem do anúncio
    if (pictures.length > 0 && pictures[0]?.url) return pictures[0].url;
    // Último recurso: thumbnail
    if (itemJson?.thumbnail) return itemJson.thumbnail;
    return null;
}

async function enrichPedidosWithMLImages(parsedPedidos: any[], marketplaceByOrderId: Record<string, any>) {
    const pedidosClonados = parsedPedidos.map(p => ({ ...p, itens: p.itens.map((it: any) => ({ ...it })) }));
    // Coletar todos os MLBs e variações necessárias a partir dos dados brutos do pedido
    type Target = { item_id: string, variation_id?: string | number, apply: Array<{ pedidoIndex: number, itemIndex: number }> };
    const targetsByKey = new Map<string, Target>();
    const uniqueItemIds = new Set<string>();

    pedidosClonados.forEach((pedido, pIdx) => {
        const mq = marketplaceByOrderId?.[pedido.id] || marketplaceByOrderId?.[pedido.idPlataforma] || null;
        const orderDataRaw: any = mq?.data || {};
        const orderItemsRaw: any[] = Array.isArray(orderDataRaw?.order_items) ? orderDataRaw.order_items : [];
        for (let idx = 0; idx < pedido.itens.length; idx++) {
            const raw = orderItemsRaw[idx];
            const itemId: string | undefined = raw?.item?.id;
            const variationId: string | number | undefined = raw?.variation_id;
            if (!itemId) continue;
            const key = `${itemId}::${variationId ?? ''}`;
            uniqueItemIds.add(String(itemId));
            if (!targetsByKey.has(key)) {
                targetsByKey.set(key, { item_id: String(itemId), variation_id: variationId, apply: [] });
            }
            targetsByKey.get(key)!.apply.push({ pedidoIndex: pIdx, itemIndex: idx });
        }
    });

    if (uniqueItemIds.size === 0) {
        // Nada para resolver, apenas garanta placeholder nas imagens primárias
        pedidosClonados.forEach((pedido) => {
            pedido.imagem = pedido.itens?.[0]?.imagem || "/placeholder.svg";
        });
        return pedidosClonados;
    }

    // Buscar dados dos itens no backend (tabela marketplace_items) — evita chamadas à API pública do ML
    let itemRows: any[] = [];
    try {
        const { data: rows, error } = await (supabase as any)
            .from('marketplace_items')
            .select('marketplace_item_id, pictures, variations, data, marketplace_name')
            .eq('marketplace_name', 'Mercado Livre')
            .in('marketplace_item_id', Array.from(uniqueItemIds));
        if (error) throw error;
        itemRows = rows || [];
    } catch (err) {
        console.warn('Falha ao buscar marketplace_items para imagens:', err);
        // fallback: mantém placeholders
        pedidosClonados.forEach((pedido) => {
            pedido.imagem = pedido.itens?.[0]?.imagem || "/placeholder.svg";
        });
        return pedidosClonados;
    }

    const rowByItemId = new Map<string, any>();
    for (const r of itemRows) {
        if (r?.marketplace_item_id) rowByItemId.set(String(r.marketplace_item_id), r);
    }

    // Helper para resolver URL a partir do row armazenado
    const resolveFromRow = (row: any, variationId?: string | number): string | null => {
        if (!row) return null;
        const pictures: any[] = Array.isArray(row?.pictures) ? row.pictures : [];
        const variations: any[] = Array.isArray(row?.variations) ? row.variations : [];
        if (variationId && variations.length > 0) {
            const v = variations.find((vv: any) => String(vv?.id) === String(variationId));
            if (v && Array.isArray(v.picture_ids) && v.picture_ids.length > 0) {
                const picId = v.picture_ids[0];
                const pic = pictures.find((p: any) => String(p?.id) === String(picId));
                if (pic?.url) return pic.url;
                if (pic?.secure_url) return pic.secure_url;
            }
        }
        if (pictures.length > 0) {
            if (pictures[0]?.url) return pictures[0].url;
            if (pictures[0]?.secure_url) return pictures[0].secure_url;
        }
        const thumb = row?.data?.thumbnail || row?.data?.thumbnail_id || null;
        if (typeof thumb === 'string' && thumb.startsWith('http')) return thumb;
        return null;
    };

    // Aplicar URLs resolvidas aos itens dos pedidos
    for (const [, target] of targetsByKey) {
        const row = rowByItemId.get(String(target.item_id));
        const url = resolveFromRow(row, target.variation_id) || "/placeholder.svg";
        for (const ap of target.apply) {
            pedidosClonados[ap.pedidoIndex].itens[ap.itemIndex].imagem = url;
        }
    }

    // Ajustar imagem principal do pedido (primeiro item)
    for (const pedido of pedidosClonados) {
        pedido.imagem = pedido.itens?.[0]?.imagem || "/placeholder.svg";
    }
    return pedidosClonados;
}

// --- Mockup de PDF de Lista de Separação (Novo Componente) ---
const PickingListPDFMockup = ({ pedidos, settings, onPrint }: { pedidos: any[]; settings: any; onPrint?: () => void }) => {
    // Agrupa itens por SKU se a configuração estiver ativada
    const groupedItems = {};
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
                                <img src={item.imagem || "/placeholder.svg"} alt={item.nome} className="w-full h-full object-cover rounded" />
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
                                        <img src={item.imagem || "/placeholder.svg"} alt={item.nome} className="w-full h-full object-cover rounded" />
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
        const groupedItems = {};
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
    const [emissionProgress, setEmissionProgress] = useState(0);
    const [emittedCount, setEmittedCount] = useState(0);
    const [failedCount, setFailedCount] = useState(0);
    const [quickFilter, setQuickFilter] = useState("Todos");
    const [scannerTab, setScannerTab] = useState("nao-impressos");
    const [scannedSku, setScannedSku] = useState("");
    const [scannedPedido, setScannedPedido] = useState<any>(null);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [activePrintTab, setActivePrintTab] = useState("label");
    const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
    const [tempDateRange, setTempDateRange] = useState({ from: undefined, to: undefined });
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
    const [isLoading, setIsLoading] = useState(false);

    const { user, organizationId } = useAuth();

    // Estado para animar suavemente o painel de colunas ao abrir
    const [columnsPanelAnimatedOpen, setColumnsPanelAnimatedOpen] = useState(false);
    // Estado para destacar alvo durante drag-and-drop
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const dragStartIndexRef = useRef<number | null>(null);

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
            // Intervalo em SP: mesma lógica usada no filtro local
            const fromMs = dateRange.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
            const toMs = dateRange.to
                ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
                : (dateRange.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);
            const fromIso = typeof fromMs === 'number' ? new Date(fromMs).toISOString() : null;
            const toIso = typeof toMs === 'number' ? new Date(toMs).toISOString() : null;
            const term = (searchTerm || '').trim();
            const pattern = term ? `%${term}%` : null;

            // Helper para construir consulta base com filtros comuns
            const buildBase = () => {
                let qb: any = (supabase as any)
                    .from('marketplace_orders_presented')
                .select('id, shipment_status, shipment_substatus, first_item_sku, payment_status', { count: 'exact' })
                .eq('marketplace', 'Mercado Livre');
                if (fromIso) qb = (qb as any).or(`payment_date_approved.gte.${fromIso},created_at.gte.${fromIso}`);
                if (toIso) qb = (qb as any).or(`payment_date_approved.lte.${toIso},created_at.lte.${toIso}`);
                if (pattern) qb = (qb as any).or(`marketplace_order_id.ilike.${pattern},customer_name.ilike.${pattern},first_item_sku.ilike.${pattern},first_item_title.ilike.${pattern}`);
                // Considerar somente pagos (equivalente ao isRowPaid)
                qb = (qb as any).or('payment_status.eq.approved,payment_status.eq.paid,payment_status.eq.settled,payment_date_approved.not.is.null');
                return qb;
            };

            // Todos (pagos) com filtros aplicados
            const { count: totalPaid } = await buildBase();

            // A vincular: shipment pending ou sem SKU do primeiro item (aproximação)
            const { count: countAVincular } = await (buildBase() as any)
                .or('shipment_status.eq.pending,first_item_sku.is.null');

            // Aguardando Coleta: pronto para envio
            const { count: countAguardandoColeta } = await (buildBase() as any)
                .eq('shipment_status', 'ready_to_ship')
                .eq('shipment_substatus', 'printed');

            // Enviado: entregue
            const { count: countEnviado } = await (buildBase() as any)
                .eq('shipment_status', 'delivered');

            // Cancelados/Devolvidos: aproximação via payment_status e shipment_status
            const { count: countCancelados } = await (buildBase() as any)
                .or('payment_status.eq.canceled,payment_status.eq.cancelled,shipment_status.eq.canceled,shipment_status.eq.cancelled,payment_status.eq.refunded');

            setStatusCountsGlobal({
                'todos': typeof totalPaid === 'number' ? totalPaid : 0,
                'a-vincular': typeof countAVincular === 'number' ? countAVincular : 0,
                'aguardando-coleta': typeof countAguardandoColeta === 'number' ? countAguardandoColeta : 0,
                'enviado': typeof countEnviado === 'number' ? countEnviado : 0,
                'cancelado': typeof countCancelados === 'number' ? countCancelados : 0,
            });
        } catch (e) {
            console.warn('Falha ao carregar contagens globais:', e);
        }
    };

    // Atualizar contagens globais quando filtros mudarem
    useEffect(() => {
        loadGlobalStatusCounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange, searchTerm]);

    useEffect(() => {
        const onError = (e: ErrorEvent) => {
            console.error('[Pedidos] Erro não tratado ao abrir Drawer:', e.error || e.message, e.filename, e.lineno, e.colno);
        };
        const onUnhandledRejection = (e: PromiseRejectionEvent) => {
            console.error('[Pedidos] Promessa rejeitada sem tratamento:', e.reason);
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
            if (!user) {
                setPedidos([]);
                return;
            }

            // Descobrir a organização do usuário para cruzar com marketplace_orders
            let organizationId: string | null = null;
            try {
                const { data: orgRes } = await supabase.rpc('get_user_organization_id');
                if (orgRes) organizationId = String(orgRes);
            } catch (_) {}

            // Consulta inicial otimizada com paginação no servidor
            const ascending = sortDir === 'asc';
            const start = Math.max(0, (currentPage - 1) * pageSize);
            const end = Math.max(start, start + pageSize - 1);

            // Filtros de data e busca
            const fromMs = dateRange.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
            const toMs = dateRange.to
                ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
                : (dateRange.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);
            const fromIso = typeof fromMs === 'number' ? new Date(fromMs).toISOString() : null;
            const toIso = typeof toMs === 'number' ? new Date(toMs).toISOString() : null;
            const term = (searchTerm || '').trim();
            const pattern = term ? `%${term}%` : null;

            let q: any = (supabase as any)
                .from("marketplace_orders_presented")
                .select(`
                    id,
                    marketplace_order_id,
                    customer_name,
                    order_total,
                    status,
                    created_at,
                    marketplace,
                    shipping_type,
                    payment_status,
                    payment_marketplace_fee,
                    payment_shipping_cost,
                    payment_date_created,
                    payment_date_approved,
                    items_total_quantity,
                    items_total_amount,
                    items_total_sale_fee,
                    first_item_title,
                    first_item_permalink,
                    first_item_sku,
                    shipping_city_name,
                    shipping_state_name,
                    shipping_state_uf,
                    shipment_status,
                    shipment_substatus,
                    shipping_method_name,
                    shipment_sla_status,
                    shipment_sla_service,
                    shipment_sla_expected_date,
                    shipment_sla_last_updated,
                    shipment_delays,
                    label_cached,
                    label_response_type,
                    label_fetched_at,
                    label_size_bytes
                `, { count: 'exact' })
                ;

            // Marketplace (por padrão 'Todos')
            if (marketplaceFilter === 'mercado-livre') {
                q = q.eq('marketplace', 'Mercado Livre');
            }

            // Intervalo por created_at (aproximação do filtro de data)
            if (fromIso) q = q.gte('created_at', fromIso);
            if (toIso) q = q.lte('created_at', toIso);

            // Busca (multi-coluna)
            if (pattern) {
                q = (q as any).or(`marketplace_order_id.ilike.${pattern},customer_name.ilike.${pattern},first_item_sku.ilike.${pattern},first_item_title.ilike.${pattern}`);
            }

            // Não aplicar filtro por quadro no servidor; filtrar no cliente

            // Filtro por tipo de envio (aceita valores da view e normalizados)
            if (shippingTypeFilter !== 'all') {
                const map = shippingTypeFilter === 'full'
                    ? ['full', 'fulfillment', 'fbm']
                    : (shippingTypeFilter === 'flex'
                        ? ['flex', 'self_service']
                        : (shippingTypeFilter === 'envios'
                            ? ['envios', 'xd_drop_off', 'cross_docking', 'me2', 'custom']
                            : (shippingTypeFilter === 'correios'
                                ? ['correios', 'drop_off']
                                : ['no_shipping'])));
                q = (q as any).in('shipping_type', map);
            }

            // Ordenação conforme sortKey/sortDir
            if (sortKey === 'sku') {
                q = q.order('first_item_sku', { ascending });
            } else if (sortKey === 'items') {
                q = q.order('items_total_quantity', { ascending });
            } else if (sortKey === 'shipping') {
                q = q.order('shipping_type', { ascending });
            } else if (sortKey === 'sla') {
                q = q.order('shipment_sla_expected_date', { ascending, nullsFirst: false });
            } else {
                // 'recent' => prioriza pagamento aprovado depois criado
                q = q.order('payment_date_approved', { ascending, nullsFirst: false })
                     .order('created_at', { ascending });
            }

            // Não paginar no servidor; limitar lote inicial amplo
            q = q.limit(1000);

            const { data, count, error } = await q;

            if (error) throw error;

            // Filtrar pedidos pagos (não exibir não pagos)
            const isRowPaid = (o: any): boolean => {
                const st = String(o?.payment_status || '').toLowerCase();
                if (st === 'approved' || st === 'paid' || st === 'settled') return true;
                if (o?.payment_date_approved) return true;
                return false;
            };
            const paidRows: any[] = Array.isArray(data) ? data.filter(isRowPaid) : [];
            // Usar paginação local; não considerar paginação de servidor
            setTotalPedidosCount(null);

            // Renderização imediata: construir uma lista leve apenas com dados agregados da view
            const lightParsed = paidRows.map((o: any) => {
                const qtyAgg = (typeof o?.items_total_quantity === 'number' ? o.items_total_quantity : Number(o?.items_total_quantity)) || 1;
                const amtAgg = (typeof o?.items_total_amount === 'number' ? o.items_total_amount : Number(o?.items_total_amount)) || 0;
                const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
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
                    marketplaceItemId: null,
                    variationId: '',
                    permalink: o.first_item_permalink || null,
                }];

                const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;
                const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;
                const valorRecebidoFrete = toNum(o?.payment_shipping_cost);
                const saleFeeOrderItems = (typeof o?.items_total_sale_fee === 'number' ? o.items_total_sale_fee : Number(o?.items_total_sale_fee)) || 0;
                const taxaMarketplace = saleFeeOrderItems; // usar agregado inicialmente

                const shipmentStatusLower = String(o?.shipment_status || '').toLowerCase();
                let statusUI = o.status || 'Pendente';
                if (shipmentStatusLower === 'pending') {
                    statusUI = 'A vincular';
                } else if (shipmentStatusLower === 'ready_to_ship') {
                    statusUI = 'Aguardando Coleta';
                } else if (shipmentStatusLower === 'delivered') {
                    statusUI = 'Enviado';
                } else if (items.some((it: any) => !it.vinculado)) {
                    statusUI = 'A vincular';
                }

                const liquidoCalculado = (items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0) || orderTotal) + valorRecebidoFrete - taxaMarketplace;

                return {
                    id: o.marketplace_order_id || o.id,
                    marketplace: o.marketplace,
                    produto: items[0]?.nome || "",
                    sku: items[0]?.sku || null,
                    permalink: o.first_item_permalink || null,
                    cliente: o.customer_name || '',
                    valor: orderTotal,
                    data: o.created_at,
                    status: statusUI,
                    shipment_status: o?.shipment_status || null,
                    slaDespacho: {
                        status: o?.shipment_sla_status ?? null,
                        service: o?.shipment_sla_service ?? null,
                        expected_date: o?.shipment_sla_expected_date ?? null,
                        last_updated: o?.shipment_sla_last_updated ?? null,
                    },
                    atrasos: Array.isArray(o?.shipment_delays) ? o.shipment_delays : null,
                    dataPagamento: o?.payment_date_approved || o?.payment_date_created || o?.created_at || null,
                    tipoEnvio: normalizeShippingType(o?.shipping_type),
                    idPlataforma: o.marketplace_order_id || "",
                    shippingCity: o?.shipping_city_name || null,
                    shippingState: o?.shipping_state_name || null,
                    shippingUF: o?.shipping_state_uf || null,
                    quantidadeTotal: items.reduce((sum: number, it: any) => sum + (it.quantidade || 0), 0),
                    imagem: "/placeholder.svg",
                    itens: items,
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
                    impressoEtiqueta: false,
                    impressoLista: false,
                };
            });

            // Atualiza imediatamente para dar percepção de velocidade
            startTransition(() => setPedidos(lightParsed));

            // Buscar dados brutos do marketplace para pagamentos e envios (em segundo plano)
            const orderIds = Array.from(new Set(paidRows.map((o: any) => o.marketplace_order_id).filter(Boolean)));
            let marketplaceByOrderId: Record<string, any> = {};
            let shipmentsByOrderId: Record<string, any[]> = {};
            if (orderIds.length > 0) {
                try {
                    // 1) Tentativa com filtro por organização (quando disponível)
                    let mq1: any = (supabase as any)
                        .from('marketplace_orders_raw')
                        .select('marketplace_order_id, payments, shipments, data, marketplace_name, status, status_detail, date_created, buyer, labels')
                        .in('marketplace_order_id', orderIds);
                    if (organizationId) mq1 = (mq1 as any).eq('organizations_id', organizationId);
                    const { data: mqRows1, error: mqErr1 } = await mq1;
                    let rows: any[] | null = null;
                    if (!mqErr1 && Array.isArray(mqRows1) && mqRows1.length > 0) {
                        rows = mqRows1 as any[];
                    } else {
                        // 2) Fallback sem filtro de organização (aproveita políticas RLS existentes)
                        const { data: mqRows2, error: mqErr2 } = await (supabase as any)
                            .from('marketplace_orders_raw')
                            .select('marketplace_order_id, payments, shipments, data, marketplace_name, status, status_detail, date_created, buyer, labels')
                            .in('marketplace_order_id', orderIds);
                        if (!mqErr2 && Array.isArray(mqRows2)) rows = mqRows2 as any[];
                    }
                    if (rows) {
                        marketplaceByOrderId = rows.reduce((acc, row) => {
                            const k = row?.marketplace_order_id;
                            if (k) acc[k] = row;
                            return acc;
                        }, {} as Record<string, any>);
                    }
                    // 3) Buscar envios normalizados em marketplace_shipments
                    try {
                        let sh1: any = (supabase as any)
                            .from('marketplace_shipments')
                            .select('marketplace_order_id, marketplace_shipment_id, status, substatus, logistic_type, mode, shipping_mode, service_id, carrier, tracking_number, tracking_url, tracking_history, receiver_address, sender_address, costs, items, promise, tags, dimensions, data, date_created, last_updated, date_ready_to_ship, date_first_printed, last_synced_at, sla_status, sla_service, sla_expected_date, sla_last_updated, delays')
                            .eq('marketplace_name', 'Mercado Livre')
                            .in('marketplace_order_id', orderIds);
                        if (organizationId) sh1 = (sh1 as any).eq('organizations_id', organizationId);
                        const { data: shRows, error: shErr } = await sh1;
                        if (!shErr && Array.isArray(shRows)) {
                            shipmentsByOrderId = (shRows as any[]).reduce((acc, row) => {
                                const k = row?.marketplace_order_id;
                                if (!k) return acc;
                                if (!acc[k]) acc[k] = [];
                                acc[k].push(row);
                                return acc;
                            }, {} as Record<string, any[]>);
                        }
                    } catch (shCatch) {
                        console.warn('Falha ao buscar marketplace_shipments:', shCatch);
                    }
                    } catch (mqCatch) {
                        console.warn('Falha ao buscar marketplace_orders_presented:', mqCatch);
                    }
                }

                // Pré-busca: vínculos de anúncios -> produtos por item_id em todos os pedidos
                let linkByItemIdGlobal: Record<string, { product_id: string, sku: string, name: string, variation_id: string }> = {};
                try {
                    const uniqueItemIdsForLinks = new Set<string>();
                    for (const o of paidRows as any[]) {
                        const mq = o.marketplace_order_id ? marketplaceByOrderId[o.marketplace_order_id] : null;
                        const orderDataRaw: any = mq?.data || {};
                        const rawOrderItems: any[] = Array.isArray(orderDataRaw?.order_items) ? orderDataRaw.order_items : [];
                        for (const rit of rawOrderItems) {
                            const itemId = rit?.item?.id;
                            if (itemId) uniqueItemIdsForLinks.add(String(itemId));
                        }
                    }
                    if (uniqueItemIdsForLinks.size > 0) {
                        let q = supabase
                            .from('marketplace_item_product_links')
                            .select('marketplace_item_id, variation_id, product:products (id, sku, name)')
                            .eq('marketplace_name', 'Mercado Livre')
                            .in('marketplace_item_id', Array.from(uniqueItemIdsForLinks));
                        if (organizationId) q = (q as any).eq('organizations_id', organizationId);
                        const { data: linkRows, error: linkErr } = await q;
                        if (!linkErr && Array.isArray(linkRows)) {
                            for (const r of linkRows) {
                                const k = String(r?.marketplace_item_id || '');
                                const prod = r?.product;
                                if (k && prod) {
                                    linkByItemIdGlobal[k] = {
                                        product_id: String(prod.id),
                                        sku: String(prod.sku || ''),
                                        name: String(prod.name || ''),
                                        variation_id: String(r?.variation_id || ''),
                                    };
                                }
                            }
                        }
                    }
                } catch (linkCatch) {
                    console.warn('Falha ao pré-buscar vínculos de anúncios:', linkCatch);
                }

            const parsed = paidRows.map((o: any) => {
                // Dados do marketplace bruto
                const mq = o.marketplace_order_id ? marketplaceByOrderId[o.marketplace_order_id] : null;
                const payments: any[] = Array.isArray(mq?.payments) ? mq.payments : [];
                const shipmentsNormalized: any[] = Array.isArray(shipmentsByOrderId[o.marketplace_order_id]) ? shipmentsByOrderId[o.marketplace_order_id] : [];
                const shipments: any[] = shipmentsNormalized.length > 0
                    ? shipmentsNormalized
                    : (Array.isArray(mq?.shipments) ? mq.shipments : []);
                const orderDataRaw: any = mq?.data || {};
                const rawOrderItems: any[] = Array.isArray(orderDataRaw?.order_items) ? orderDataRaw.order_items : [];

                // Construção dos itens do pedido a partir do RAW; fallback para agregados da view
                let items: any[] = [];
                if (rawOrderItems.length > 0) {
                    items = rawOrderItems.map((rit: any, idx: number) => {
                        const itemId = rit?.item?.id ? String(rit.item.id) : null;
                        const mapped = itemId ? linkByItemIdGlobal[itemId] : undefined;
                        const resolvedSku = (
                            rit?.item?.seller_sku ?? rit?.seller_sku ?? rit?.sku ?? o.first_item_sku ?? (mapped?.sku || null)
                        );
                        const isLinked = !!(rit?.item?.seller_sku || rit?.seller_sku || rit?.sku || (mapped?.sku));
                        return {
                            id: `${o.marketplace_order_id || o.id}-ITEM-${idx + 1}`,
                            nome: rit?.item?.title ?? rit?.item?.name ?? rit?.title ?? o.first_item_title ?? 'Item',
                            sku: resolvedSku,
                            quantidade: (typeof rit?.quantity === 'number' ? rit.quantity : Number(rit?.quantity)) || 0,
                            valor: (typeof rit?.unit_price === 'number' ? rit.unit_price : Number(rit?.unit_price))
                                || (typeof rit?.full_unit_price === 'number' ? rit.full_unit_price : Number(rit?.full_unit_price))
                                || (typeof rit?.price === 'number' ? rit.price : Number(rit?.price))
                                || 0,
                            bipado: false,
                            vinculado: isLinked,
                            imagem: "/placeholder.svg",
                            marketplace: o.marketplace,
                            marketplaceItemId: itemId,
                            variationId: (rit?.variation_id !== undefined && rit?.variation_id !== null) ? String(rit.variation_id) : '',
                            // Fallback: usar o permalink do primeiro item quando disponível
                            permalink: ensureHttpUrl(o.first_item_permalink || null),
                        };
                    });
                } else {
                    const qtyAgg = (typeof o?.items_total_quantity === 'number' ? o.items_total_quantity : Number(o?.items_total_quantity)) || 1;
                    const amtAgg = (typeof o?.items_total_amount === 'number' ? o.items_total_amount : Number(o?.items_total_amount)) || 0;
                    const unitPriceAgg = qtyAgg > 0 ? amtAgg / qtyAgg : amtAgg;
                    items = [{
                        id: `${o.marketplace_order_id || o.id}-ITEM-1`,
                        nome: o.first_item_title || 'Item',
                        sku: o.first_item_sku || null,
                        quantidade: qtyAgg,
                        valor: unitPriceAgg,
                        bipado: false,
                        vinculado: !!o.first_item_sku,
                        imagem: "/placeholder.svg",
                        marketplace: o.marketplace,
                        marketplaceItemId: null,
                        variationId: '',
                        // Fallback: usar o permalink agregado do primeiro item
                        permalink: ensureHttpUrl(o.first_item_permalink || null),
                    }];
                }

                const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;

                // Helpers de número
                const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;

                // Receitas
                const valorBrutoItens = items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0);
                const valorRecebidoFrete = (
                    toNum(o?.payment_shipping_cost) ||
                    payments.reduce((sum, p) => sum + toNum(p?.shipping_cost), 0)
                );
                const cupom = payments.reduce((sum, p) => sum + toNum(p?.coupon_amount), 0);

                // Taxas da plataforma (quando disponível no pagamento)
                const feesFromPayments = toNum(o?.payment_marketplace_fee) || payments.reduce((sum, p) => sum + toNum((p?.marketplace_fee ?? p?.fee_amount ?? p?.fees_total)), 0);
                // sale_fee por item vindo do payload bruto do pedido ou agregado da view
                const saleFeeOrderItems = (
                    (typeof o?.items_total_sale_fee === 'number' ? o.items_total_sale_fee : Number(o?.items_total_sale_fee)) ||
                    (Array.isArray(orderDataRaw?.order_items)
                        ? orderDataRaw.order_items.reduce((sum: number, oi: any) => sum + toNum(oi?.sale_fee), 0)
                        : 0)
                );
                // Se o marketplace detalha tarifa de frete (pagador: comprador), normalmente aparece em fees dos pagamentos
                // Estimamos essa tarifa como o excedente sobre sale_fee e limitamos ao frete recebido para evitar dupla contagem
                const diffFees = Math.max(feesFromPayments - saleFeeOrderItems, 0);
                const shippingFeeBuyer = Math.min(diffFees, valorRecebidoFrete);
                // Comissão efetiva usada nos cálculos (sem a tarifa de frete do comprador)
                const taxaMarketplace = saleFeeOrderItems > 0
                    ? saleFeeOrderItems
                    : Math.max(feesFromPayments - shippingFeeBuyer, 0);

                // Custo real de frete (a partir de shipments)
                const shippingFromOrder = orderDataRaw?.shipping || null;
                const firstShipment = shipments?.[0] || shippingFromOrder || null;
                const freteCusto = firstShipment
                    ? (
                        toNum(firstShipment?.shipping_option?.cost) ||
                        toNum(firstShipment?.cost) ||
                        toNum(firstShipment?.base_cost) ||
                        toNum(firstShipment?.original_cost) ||
                        toNum(firstShipment?.cost_components?.total)
                      )
                    : 0;

                // Método de envio (ex.: flex, me2, fulfillment)
                const envioMetodo = (
                    firstShipment?.logistic_type ||
                    firstShipment?.shipping_mode ||
                    firstShipment?.mode ||
                    shippingFromOrder?.logistic_type ||
                    shippingFromOrder?.mode ||
                    null
                );
                const envioTags = Array.isArray(firstShipment?.tags)
                    ? firstShipment.tags
                    : (Array.isArray(shippingFromOrder?.tags) ? shippingFromOrder.tags : []);
                const freteRecebidoLiquido = valorRecebidoFrete - shippingFeeBuyer; // crédito de frete já descontando a tarifa repassada ao ML
                const freteDiferenca = freteRecebidoLiquido - freteCusto; // positivo: reembolso/recebimento líquido; negativo: custo adicional

                // --- Determinação de status visual (UI) ---
                const paymentStatuses: string[] = payments.map((p: any) => String(p?.status || '').toLowerCase()).filter(Boolean);
                const isPaymentCancelled = paymentStatuses.includes('cancelled') || String(orderDataRaw?.status || '').toLowerCase() === 'cancelled';
                const shippingStatuses: string[] = [
                    ...(Array.isArray(shipments)
                        ? shipments.flatMap((s: any) => [s?.status, s?.substatus].map((v) => String(v || '').toLowerCase()))
                        : []),
                    String(shippingFromOrder?.status || '').toLowerCase(),
                    String(shippingFromOrder?.substatus || '').toLowerCase(),
                    String(mq?.status || '').toLowerCase(),
                    String(mq?.status_detail || '').toLowerCase(),
                ].filter(Boolean);
                // Tornar detecção mais abrangente (alguns status variam: receiver_received, out_for_delivery, etc.)
                const shippedKeywords = [
                    'shipped',
                    'in_transit',
                    'handling',
                    'delivery_in_progress',
                    'not_delivered',
                    'to_be_agreed',
                    'out_for_delivery',
                    'on_route',
                    'handed_to_carrier',
                    'processing',
                    'collected',
                    'dispatch', // dispatched/dispatching
                ];
                const deliveredKeywords = [
                    'delivered',
                    'received',
                    'receiver_received',
                    'picked_up',
                    'ready_to_pickup',
                    'delivered_to_authorized',
                ];
                const readySet = new Set(['ready_to_ship', 'printed', 'ready_to_print']);
                const hasDeliveredHistory = Array.isArray(shipments) && shipments.some((s: any) => {
                    const hist = s?.status_history || s?.shipping_status_history || s?.history;
                    return !!(hist?.date_delivered || hist?.date_first_delivered || hist?.receiver_received || hist?.delivered_at);
                });
                const isDelivered = shippingStatuses.some((s) => deliveredKeywords.some(k => s.includes(k))) || hasDeliveredHistory;
                const isShipped = shippingStatuses.some((s) => shippedKeywords.some(k => s.includes(k)));
                const isReadyToShip = shippingStatuses.some((s) => readySet.has(s));
                const hasPendingShipment = shippingStatuses.includes('pending');
                const hasReadyToShip = shippingStatuses.includes('ready_to_ship');
                const hasReadyToPrint = shippingStatuses.includes('ready_to_print');
                const hasPrinted = shippingStatuses.includes('printed');

                // Nome do cliente a partir do marketplace (buyer first/last), com limite de 3 palavras; fallback ao nome da tabela orders
                const buyer = mq?.buyer || orderDataRaw?.buyer || {};
                const rawClienteNome = [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ').trim() || (o.customer_name || "");
                const clienteNome = rawClienteNome.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');

                // Data do pedido/pagamento: usar marketplace_orders.date_created (timestamptz, América/São Paulo) como fonte principal
                let dataPagamento: string | null = null;
                const pdApproved = o?.payment_date_approved ? new Date(o.payment_date_approved) : null;
                const pdCreated = o?.payment_date_created ? new Date(o.payment_date_created) : null;
                const createdAt = o?.created_at ? new Date(o.created_at) : null;
                const primaryDate = pdApproved || pdCreated || createdAt || null;
                if (primaryDate) dataPagamento = primaryDate.toISOString();
                if (!dataPagamento) {
                    const approvedPayments = payments
                        .filter((p: any) => String(p?.status || '').toLowerCase() === 'approved' && p?.date_approved)
                        .map((p: any) => new Date(p.date_approved));
                    const fallbackPaymentDates = payments
                        .map((p: any) => p?.date_approved || p?.date_created || p?.date_last_updated)
                        .filter(Boolean)
                        .map((d: any) => new Date(d));
                    const paymentDateObj = approvedPayments.length > 0
                        ? new Date(Math.min(...approvedPayments.map(d => d.getTime())))
                        : (fallbackPaymentDates.length > 0 ? new Date(Math.min(...fallbackPaymentDates.map(d => d.getTime()))) : null);
                    dataPagamento = paymentDateObj ? paymentDateObj.toISOString() : null;
                }

                // Regras de status para o quadro visual
                let statusUI = o.status || 'Pendente';
                const shipmentStatusLower = String(o?.shipment_status || firstShipment?.status || '').toLowerCase();
                const isPaymentRefunded = paymentStatuses.includes('refunded') || String(o?.payment_status || '').toLowerCase() === 'refunded';

                if (isPaymentRefunded) {
                    // Regra: cancelled + refunded => Cancelado | delivered/not_delivered + refunded => Devolução
                    if (shipmentStatusLower === 'cancelled' || shipmentStatusLower === 'canceled') {
                        statusUI = 'Cancelado';
                    } else if (shipmentStatusLower === 'delivered' || shipmentStatusLower === 'not_delivered') {
                        statusUI = 'Devolução';
                    }
                } else if (isPaymentCancelled) {
                    statusUI = 'Cancelado';
                } else if (hasPendingShipment) {
                    // Regra: shipment_status 'pending' => quadro "A vincular"
                    statusUI = 'A vincular';
                } else if (hasReadyToShip && hasReadyToPrint) {
                    // Regra: pronto para envio + pronto para imprimir => quadro "Impressão" (NF Emitida)
                    statusUI = 'NF Emitida';
                } else if (isDelivered || isShipped) {
                    // Pedidos recebidos (pelo comprador) ou entregues entram no quadro "Enviado"
                    statusUI = 'Enviado';
                } else if (hasPrinted) {
                    // Aba Aguardando Coleta mostra somente pedidos com etiqueta impressa (substatus 'printed')
                    statusUI = 'Aguardando Coleta';
                } else if (items.some((it: any) => !it.vinculado)) {
                    // Itens do pedido sem SKU vinculado => colocar na aba "A vincular"
                    statusUI = 'A vincular';
                }

                // Ajuste de financeiro para cancelados
                const liquidoCalculado = (valorBrutoItens || orderTotal) + freteRecebidoLiquido - taxaMarketplace - cupom;
                const liquidoFinal = (statusUI === 'Cancelado' || statusUI === 'Devolução') ? 0 : liquidoCalculado;
                const margemFinal = (statusUI === 'Cancelado' || statusUI === 'Devolução') ? 0 : 0;

                const marketplaceName = (
                    mq?.marketplace_name ||
                    o.marketplace ||
                    (String(o.marketplace_order_id || '').toUpperCase().startsWith('ML') ? 'Mercado Livre' : 'Desconhecido')
                );

                // Fallback local para tipo de envio quando ainda não populado em orders.shipping_type
                const classifyType = (sh: any): string | null => {
                    if (!sh) return null;
                    const lt = String(sh?.logistic_type || sh?.shipping_mode || sh?.mode || '').toLowerCase();
                    if (!lt) return null;
                    if (lt === 'fulfillment' || lt === 'fbm') return 'full';
                    if (lt === 'self_service') return 'flex';
                    if (lt === 'xd_drop_off' || lt === 'cross_docking') return 'envios';
                    if (lt === 'drop_off') return 'correios';
                    if (lt === 'me2' || lt === 'custom') return 'envios';
                    return null;
                };

                const tipoEnvioDerivado = (() => {
                    if (o?.shipping_type) return normalizeShippingType(o.shipping_type);
                    const t = classifyType(firstShipment);
                    if (t) return t;
                    const tags = Array.isArray(orderDataRaw?.tags) ? orderDataRaw.tags : [];
                    if (tags.includes('no_shipping')) return 'no_shipping';
                    return '';
                })();

                // Dados adicionais para impressão e filtragem
                const shipmentSubstatus = o?.shipment_substatus || (firstShipment?.substatus ?? null);
                const shipmentId = (firstShipment?.marketplace_shipment_id ?? firstShipment?.id) ?? null;
                const hasPrintedSubstatus = hasPrinted || (Array.isArray(shipments) && shipments.some((s: any) => String(s?.substatus || '').toLowerCase() === 'printed'));
                const hasFirstPrintedDate = Array.isArray(shipments) && shipments.some((s: any) => Boolean(s?.date_first_printed));
                const impressoEtiquetaComputed = Boolean(hasPrintedSubstatus || hasFirstPrintedDate);

                // Indicadores e conteúdo de etiqueta (cache)
                const rawLabels = (mq?.labels || null) as any;
                const hasPdf = Boolean(rawLabels?.pdf_base64);
                const hasZpl = Boolean(rawLabels?.zpl2_base64);
                const topContent = rawLabels?.content_base64 || (hasPdf ? rawLabels?.pdf_base64 : (hasZpl ? rawLabels?.zpl2_base64 : null));
                const topType = rawLabels?.content_type || (hasPdf ? 'application/pdf' : (hasZpl ? 'text/plain' : null));
                const labelInfo = {
                    cached: Boolean(o?.label_cached || topContent),
                    response_type: (o?.label_response_type || rawLabels?.response_type || (hasPdf ? 'pdf' : (hasZpl ? 'zpl2' : null))) as string | null,
                    fetched_at: (o?.label_fetched_at || rawLabels?.fetched_at || null) as string | null,
                    size_bytes: (typeof o?.label_size_bytes === 'number' ? o.label_size_bytes : Number(o?.label_size_bytes)) || (typeof rawLabels?.size_bytes === 'number' ? rawLabels.size_bytes : Number(rawLabels?.size_bytes)) || null,
                    shipment_ids: Array.isArray(rawLabels?.shipment_ids) ? rawLabels.shipment_ids.map((x: any) => String(x)) : [],
                    content_base64: topContent,
                    content_type: topType,
                } as const;

                return {
                    id: o.marketplace_order_id || o.id,
                    marketplace: marketplaceName,
                    produto: items[0]?.nome || "",
                    sku: items[0]?.sku || null,
                    cliente: clienteNome,
                    valor: orderTotal,
                    data: o.created_at,
                    status: statusUI,
                    shipment_status: o?.shipment_status || (firstShipment?.status ?? null),
                    shipment_substatus: shipmentSubstatus,
                    shipment_id: shipmentId,
                    // Permalink do primeiro item (para evitar desaparecimento do link)
                    permalink: ensureHttpUrl(o.first_item_permalink || null),
                    first_item_permalink: ensureHttpUrl(o.first_item_permalink || null),
                    // SLA de despacho e atrasos: prioriza colunas da view presented
                    slaDespacho: {
                        status: o?.shipment_sla_status ?? (firstShipment?.sla_status ?? null),
                        service: o?.shipment_sla_service ?? (firstShipment?.sla_service ?? null),
                        expected_date: o?.shipment_sla_expected_date ?? (firstShipment?.sla_expected_date ?? null),
                        last_updated: o?.shipment_sla_last_updated ?? (firstShipment?.sla_last_updated ?? null),
                    },
                    atrasos: Array.isArray(o?.shipment_delays) ? o.shipment_delays : (Array.isArray(firstShipment?.delays) ? firstShipment?.delays : null),
                    dataPagamento,
                    tipoEnvio: tipoEnvioDerivado,
                    idPlataforma: o.platform_id || o.marketplace_order_id || "",
                    shippingCity: o?.shipping_city_name || null,
                    shippingState: o?.shipping_state_name || null,
                    shippingUF: o?.shipping_state_uf || null,
                    quantidadeTotal: items.reduce((sum: number, it: any) => sum + (it.quantidade || 0), 0),
                    imagem: "/placeholder.svg",
                    itens: items,
                    financeiro: {
                        valorPedido: valorBrutoItens || orderTotal,
                        freteRecebido: valorRecebidoFrete,
                        freteRecebidoLiquido: freteRecebidoLiquido,
                        taxaFrete: freteCusto,
                        taxaMarketplace: taxaMarketplace,
                        saleFee: saleFeeOrderItems,
                        feesPayments: feesFromPayments,
                        shippingFeeBuyer,
                        envioMetodo,
                        envioTags,
                        freteDiferenca,
                        cupom: cupom,
                        impostos: 0, // Preparado para futura integração por regime tributário
                        liquido: liquidoFinal, // líquido da plataforma (estimado) ou 0 se cancelado
                        margem: margemFinal, // 0 se cancelado
                        pagamentos: payments,
                        envios: shipments,
                    },
                    impressoEtiqueta: impressoEtiquetaComputed,
                    impressoLista: false,
                    label: labelInfo,
                };
            });

            setPedidos(parsed);

            // Pós-processamento: enriquecer imagens dos itens com base no MLB e variação
            try {
                const withImages = await enrichPedidosWithMLImages(parsed, marketplaceByOrderId);
                setPedidos(withImages);
            } catch (imgErr) {
                console.warn('Falha ao enriquecer imagens MLB:', imgErr);
            }
        } catch (err) {
            console.error("Erro ao buscar pedidos:", err);
            setPedidos([]);
        } finally {
            if (!background) setIsLoading(false);
        }
    };

    // Carregar pedidos somente ao entrar no módulo
    useEffect(() => {
        loadPedidos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Removida a sincronização automática; sincronizar apenas ao clicar no botão

    // Não atualizar ao alternar quadro para evitar remoções e telas de recarga

    const handleSyncOrders = async () => {
        try {
            setIsSyncing(true);
            const { data: sessionRes } = await (supabase as any).auth.getSession();
            const token: string | undefined = sessionRes?.session?.access_token;
            if (!token) throw new Error('Sessão expirada ou ausente. Faça login novamente.');

            let organizationId: string | null = null;
            try {
                const { data: orgRes } = await supabase.rpc('get_user_organization_id');
                if (orgRes) organizationId = String(orgRes);
            } catch {}

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId }),
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

            let organizationId: string | null = null;
            try {
                const { data: orgRes } = await supabase.rpc('get_user_organization_id');
                if (orgRes) organizationId = String(orgRes);
            } catch {}

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId, order_ids: selectedOrderIds }),
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
            const { data: row, error: rowErr } = await supabase
                .from('marketplace_orders_presented')
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
            let organizationId: string | null = null;
            try {
                const { data: orgRes } = await supabase.rpc('get_user_organization_id');
                if (orgRes) organizationId = String(orgRes);
            } catch {}

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ organizationId, order_ids: [mlOrderId] }),
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
            <div className="flex flex-col space-y-2">
                {pedido.itens?.map((it: any, idx: number) => (
                    <div key={idx} className="flex items-center space-x-2 h-12">
                        <img
                            src={((idx === 0 ? (pedido.imagem || it?.imagem) : it?.imagem) || '/placeholder.svg')}
                            alt={(idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto'))}
                            className="w-10 h-10 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                            <div className={`text-sm font-medium text-gray-900 ${pedido.quantidadeTotal >= 2 ? 'font-bold' : ''}`}>
                                {(() => {
                                    const title: string = idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto');
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
                                                className="line-clamp-1 sm:line-clamp-2 lg:line-clamp-3 text-gray-900 hover:text-purple-600 group-hover:text-purple-600 hover:underline group-hover:underline underline-offset-2 cursor-pointer transition-colors"
                                                title={title}
                                            >
                                                {title}
                                            </a>
                                        );
                                    }
                                    return (
                                        <span className="line-clamp-1 sm:line-clamp-2 lg:line-clamp-3" title={title}>
                                            {title}
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="text-xs text-gray-500">SKU: {idx === 0 ? (pedido.sku ?? it?.sku ?? 'Não Vinculado') : (it?.sku ?? 'Não Vinculado')}</div>
                        </div>
                    </div>
                ))}
            </div>
        )},
        { id: "itens", name: "Itens", enabled: true, alwaysVisible: true, render: (pedido) => (
            <div className="flex flex-col space-y-2">
                {pedido.itens?.map((item: any, index: number) => (
                    <div key={index} className="h-12 flex items-center">
                        <span
                            className={`inline-flex items-center justify-center h-6 min-w-6 rounded-md px-2 text-xs md:text-sm border ${pedido.quantidadeTotal >= 2 ? 'text-[#800080] border-[#800080] bg-[#800080]/10' : 'text-gray-700 border-gray-300'}`}
                            title={`Qtd: ${item.quantidade}`}
                        >
                            {item.quantidade}
                        </span>
                    </div>
                ))}
            </div>
        )},
        { id: "cliente", name: "Cliente", enabled: true, render: (pedido) => {
            const name = String(pedido?.cliente || "");
            const truncated = name.length > 30 ? name.slice(0, 30) + "…" : name;
            return (<span className="text-gray-900 block truncate">{truncated}</span>);
        }},
        { id: "valor", name: "Valor do Pedido", enabled: true, render: (pedido) => (
            <span className="text-gray-900 font-semibold">{pedido.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        )},
        { id: "tipoEnvio", name: "Tipo de Envio", enabled: true, alwaysVisible: true, render: (pedido) => {
            const shipmentStatus = String(pedido?.shipment_status || '').toLowerCase();
            const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup'];
            const isOrderCancelledOrReturned = (
                pedido?.status === 'Cancelado' ||
                pedido?.status === 'Devolvido' ||
                pedido?.status === 'Devolução'
            );
            const showSLA = !deliveredStatuses.includes(shipmentStatus) && !isOrderCancelledOrReturned && pedido?.slaDespacho?.expected_date;
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
                countdown = (
                    <span className={`text-xs font-medium ${color}`}>
                        ENVIE EM: {days}d {hours}h {minutes}m
                    </span>
                );
            }
            return (
                <div className="flex flex-col gap-1">
                    <Badge className={`uppercase bg-purple-600 text-white hover:bg-purple-700 h-5 px-2 text-[10px] leading-[1rem] inline-flex items-center justify-center rounded-md`}>
                        {mapTipoEnvioLabel(pedido.tipoEnvio)}
                    </Badge>
                    {countdown}
                </div>
            );
        }},
        
        
        { id: "marketplace", name: "Marketplace", enabled: true, render: (pedido) => (<span className="text-gray-900">{pedido.marketplace}</span>)},
        { id: "idPlataforma", name: "ID da Plataforma", enabled: false, render: (pedido) => (pedido.idPlataforma)},
        { id: "status", name: "Status", enabled: true, alwaysVisible: true, render: (pedido) => {
            const expected = pedido?.slaDespacho?.expected_date ? new Date(pedido.slaDespacho.expected_date) : null;
            const expiredSLA = expected ? (new Date().getTime() >= new Date(expected).getTime()) : false;
            const shipmentStatusKey = String(pedido?.shipment_status || '').toLowerCase();
            const dispatchedStatuses = ['shipped','handed_to_carrier','collected','in_transit','on_route','out_for_delivery','delivery_in_progress'];
            const deliveredStatuses = ['delivered', 'receiver_received', 'picked_up', 'ready_to_pickup'];
            const isDispatched = dispatchedStatuses.includes(shipmentStatusKey);
            const isDelivered = deliveredStatuses.includes(shipmentStatusKey);
            const isOrderCancelledOrReturned = (
                pedido?.status === 'Cancelado' ||
                pedido?.status === 'Devolvido' ||
                pedido?.status === 'Devolução'
            );
            const hasDelays = expiredSLA && !isDispatched && !isDelivered && !isOrderCancelledOrReturned;
            const badgeClass = isOrderCancelledOrReturned
                ? getStatusColor(pedido.status)
                : (hasDelays
                    ? 'bg-red-500 hover:bg-red-500 text-white'
                    : (pedido?.shipment_status ? getShipmentStatusColor(pedido.shipment_status) : getStatusColor(pedido.status)));
            const labelText = isOrderCancelledOrReturned
                ? pedido.status
                : (hasDelays
                    ? 'ATRASADO'
                    : (pedido?.shipment_status ? formatShipmentStatus(pedido.shipment_status) : pedido.status));
            return (
                <div className="flex flex-col items-start space-y-2">
                    <Badge className={`uppercase ${badgeClass}`}>
                        {labelText}
                        {!hasDelays && pedido.subStatus && !pedido?.shipment_status && (
                            <span className="ml-2 text-xs font-normal text-white/80">({pedido.subStatus})</span>
                        )}
                    </Badge>
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
                return "bg-cyan-500 hover:bg-cyan-500 text-white";
            case "Aguardando Coleta":
                return "bg-blue-500 hover:bg-blue-500 text-white";
            case "Enviado":
                return "bg-green-500 hover:bg-green-500 text-white";
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
            'ready_to_ship': 'pronto para envio',
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
            case 'ready_to_ship':
                return 'bg-yellow-500 hover:bg-yellow-500 text-white';
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

    // Lógica de Emissão de NF-e (simulada)
    const handleEmitirNfe = (pedidosToEmit: any[]) => {
        if (pedidosToEmit.length === 0) return;

        setIsEmitting(true);
        setEmissionProgress(0);
        setEmittedCount(0);
        setFailedCount(0);

        const totalToEmit = pedidosToEmit.length;
        let successCount = 0;
        let failCount = 0;

        const interval = setInterval(() => {
            if (successCount + failCount >= totalToEmit) {
                clearInterval(interval);
                setTimeout(() => setIsEmitting(false), 1500);
                return;
            }

            const isSuccess = Math.random() > 0.3; // 70% de chance de sucesso
            const currentPedido = pedidosToEmit[successCount + failCount];

            setPedidos(prevPedidos => prevPedidos.map(p => {
                if (p.id === currentPedido.id) {
                    if (isSuccess) {
                        // Move para o próximo status
                        return { ...p, status: 'NF Emitida' };
                    } else {
                        // Simula uma falha
                        return { ...p, subStatus: 'Falha na emissao' };
                    }
                }
                return p;
            }));

            if (isSuccess) {
                successCount++;
                setEmittedCount(successCount);
            } else {
                failCount++;
                setFailedCount(failCount);
            }

            setEmissionProgress(((successCount + failCount) / totalToEmit) * 100);
        }, 500);
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

    // Impressão: somente pedidos ME2 não-Full com substatus 'ready_to_print'
    const pedidosImpressao = pedidos.filter(p => {
        const isNonFull = normalizeShippingType(String(p.tipoEnvio || '')).toLowerCase() !== 'full';
        const hasReadyToPrintSub = String(p?.shipment_substatus || '').toLowerCase() === 'ready_to_print' ||
            (Array.isArray(p?.financeiro?.envios) && p.financeiro.envios.some((s: any) => String(s?.substatus || '').toLowerCase() === 'ready_to_print'));
        return isNonFull && hasReadyToPrintSub;
    });
    const pedidosNaoImpressos = pedidosImpressao.filter(p => !p.impressoEtiqueta || !p.impressoLista);
    const pedidosImpressos = pedidosImpressao.filter(p => p.impressoEtiqueta && p.impressoLista);

    // Intervalo na timezone de São Paulo (dias do calendário em SP)
    const effectiveFromMs = dateRange.from ? calendarStartOfDaySPEpochMs(dateRange.from as Date) : undefined;
    const effectiveToMs = dateRange.to
        ? calendarEndOfDaySPEpochMs(dateRange.to as Date)
        : (dateRange.from ? calendarEndOfDaySPEpochMs(dateRange.from as Date) : undefined);

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

    let filteredPedidos = baseFiltered.filter(p => {
        if (activeStatus === "todos") return true;
        if (activeStatus === "impressao") {
            const isNonFull = normalizeShippingType(String(p.tipoEnvio || '')).toLowerCase() !== 'full';
            const hasReadyToPrintSub = String(p?.shipment_substatus || '').toLowerCase() === 'ready_to_print' ||
                (Array.isArray(p?.financeiro?.envios) && p.financeiro.envios.some((s: any) => String(s?.substatus || '').toLowerCase() === 'ready_to_print'));
            return isNonFull && hasReadyToPrintSub;
        }
        if (activeStatus === "aguardando-coleta") {
            const isNonFull = normalizeShippingType(String(p.tipoEnvio || '')).toLowerCase() !== 'full';
            const hasPrintedSub = String(p?.shipment_substatus || '').toLowerCase() === 'printed' ||
                (Array.isArray(p?.financeiro?.envios) && p.financeiro.envios.some((s: any) => String(s?.substatus || '').toLowerCase() === 'printed'));
            return isNonFull && hasPrintedSub;
        }
        if (activeStatus === "cancelado") {
            // Incluir devoluções na aba Cancelados
            return p.status === 'Cancelado' || p.status === 'Devolvido' || p.status === 'Devolução';
        }
        // Normalização padrão para outras abas
        const normalized = String(p.status || '').toLowerCase().replace(/ /g, '-');
        return normalized === activeStatus.toLowerCase();
    });

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

    // Garantir que a página atual seja válida quando total de páginas mudar
    useEffect(() => {
        const tf = totalPedidosCount ?? filteredPedidos.length;
        const newTotalPages = Math.max(1, Math.ceil(tf / pageSize));
        if (currentPage > newTotalPages) {
            setCurrentPage(newTotalPages);
        }
    }, [totalPedidosCount, filteredPedidos.length, pageSize, currentPage]);
    
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

    const statusBlocks = [
        { id: "todos", title: "Todos os Pedidos", count: (statusCountsGlobal?.['todos'] ?? (totalPedidosCount ?? baseFiltered.length)), description: "Sincronizados com marketplaces" },
        { id: "a-vincular", title: "A Vincular", count: (statusCountsGlobal?.['a-vincular'] ?? baseFiltered.filter(p => p.status === 'A vincular').length), description: "Pedidos sem vínculo de SKU" },
        { id: "emissao-nf", title: "Emissão de NFe", count: baseFiltered.filter(p => p.status === 'Emissao NF').length, description: "Aguardando emissão" },
        { id: "impressao", title: "Impressão", count: baseFiltered.filter(p => {
            const isNonFull = normalizeShippingType(String(p.tipoEnvio || '')).toLowerCase() !== 'full';
            const hasReadyToPrintSub = String(p?.shipment_substatus || '').toLowerCase() === 'ready_to_print' ||
                (Array.isArray(p?.financeiro?.envios) && p.financeiro.envios.some((s: any) => String(s?.substatus || '').toLowerCase() === 'ready_to_print'));
            return isNonFull && hasReadyToPrintSub;
        }).length, description: "NF e etiqueta" },
        { id: "aguardando-coleta", title: "Aguardando Coleta", count: (statusCountsGlobal?.['aguardando-coleta'] ?? baseFiltered.filter(p => {
            const isNonFull = normalizeShippingType(String(p.tipoEnvio || '')).toLowerCase() !== 'full';
            const hasPrintedSub = String(p?.shipment_substatus || '').toLowerCase() === 'printed' ||
                (Array.isArray(p?.financeiro?.envios) && p.financeiro.envios.some((s: any) => String(s?.substatus || '').toLowerCase() === 'printed'));
            return isNonFull && hasPrintedSub;
        }).length), description: "Prontos para envio" },
        { id: "enviado", title: "Enviado", count: (statusCountsGlobal?.['enviado'] ?? baseFiltered.filter(p => p.status === 'Enviado').length), description: "Pedidos em trânsito" },
        { id: "cancelado", title: "Cancelados", count: (statusCountsGlobal?.['cancelado'] ?? baseFiltered.filter(p => (p.status === 'Cancelado' || p.status === 'Devolução' || p.status === 'Devolvido')).length), description: "Pedidos cancelados/devolvidos" },
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

            // Coleta shipment_ids (preferindo marketplace_shipment_id) dos envios presentes
            const shipmentIds = Array.from(new Set(pedidosToPrint.flatMap((p: any) => {
                const envios = Array.isArray(p?.financeiro?.envios) ? p.financeiro.envios : [];
                const idsFromEnvios = envios.map((s: any) => s?.marketplace_shipment_id || s?.id).filter(Boolean);
                const fallbackId = p?.shipment_id ? [p.shipment_id] : [];
                return [...idsFromEnvios, ...fallbackId];
            }).map(String)));

            if (shipmentIds.length === 0) {
                console.warn('Nenhum shipment_id encontrado para impressão.');
                return;
            }

            // Seleção do tipo de resposta: ZPL2 para impressoras Zebra; caso contrário, PDF
            const printerName = String(printSettings?.printer || '').toLowerCase();
            const responseType = printerName.includes('zebra') ? 'zpl2' : 'pdf';

            // Sessão atual para Authorization
            const { data: sess } = await supabase.auth.getSession();
            const authHeader = sess?.session?.access_token ? `Bearer ${sess.session.access_token}` : undefined;
            const body = JSON.stringify({ organizationId, shipment_ids: shipmentIds, response_type: responseType });

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-shipment-labels`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    ...(authHeader ? { 'Authorization': authHeader } : {}),
                },
                body,
            });

            if (!resp.ok) {
                const txt = await resp.text();
                console.error('Falha ao buscar etiquetas ML:', resp.status, txt);
                return;
            }

            const data = await resp.json();
            const base64 = data?.content_base64;
            const contentType = data?.content_type || (responseType === 'pdf' ? 'application/pdf' : 'text/plain');
            if (!base64) {
                console.warn('Resposta sem conteúdo de etiqueta.');
                return;
            }
            const binStr = atob(base64);
            const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: contentType });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

            // Atualiza estado local para refletir etiqueta impressa
            setPedidos(prev => prev.map(p => selectedPedidosImpressao.includes(p.id) ? { ...p, impressoEtiqueta: true } : p));

            // Limpa seleções após ação
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

            // Coleta shipment_ids (preferindo marketplace_shipment_id) dos envios do pedido
            const envios = Array.isArray(pedido?.financeiro?.envios) ? pedido.financeiro.envios : [];
            const shipmentIds = Array.from(new Set([
                ...envios.map((s: any) => s?.marketplace_shipment_id || s?.id).filter(Boolean),
                ...(pedido?.shipment_id ? [pedido.shipment_id] : []),
            ].map(String)));

            if (shipmentIds.length === 0) {
                console.warn('Nenhum shipment_id encontrado para reimpressão.');
                return;
            }

            // Seleção do tipo de resposta: ZPL2 para impressoras Zebra; caso contrário, PDF
            const printerName = String(printSettings?.printer || '').toLowerCase();
            const responseType = printerName.includes('zebra') ? 'zpl2' : 'pdf';

            // Tentar usar etiqueta do cache local (marketplace_orders_raw.labels)
            const normalize = (arr: any[]): string[] => Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
            const sameSet = (a: string[], b: string[]) => {
                if (a.length !== b.length) return false;
                const sa = [...a].sort();
                const sb = [...b].sort();
                for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
                return true;
            };
            const lbl = pedido?.label || {};
            const lblIds = normalize(lbl?.shipment_ids || []);
            if (lbl?.cached && lbl?.content_base64 && lbl?.response_type === responseType && sameSet(lblIds, shipmentIds)) {
                const base64 = String(lbl.content_base64);
                const contentType = String(lbl.content_type || (responseType === 'pdf' ? 'application/pdf' : 'text/plain'));
                const binStr = atob(base64);
                const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
                const blob = new Blob([bytes], { type: contentType });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
                return;
            }

            // Sessão atual para Authorization
            const { data: sess } = await supabase.auth.getSession();
            const authHeader = sess?.session?.access_token ? `Bearer ${sess.session.access_token}` : undefined;
            const body = JSON.stringify({ organizationId, shipment_ids: shipmentIds, response_type: responseType });

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-shipment-labels`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'apikey': SUPABASE_PUBLISHABLE_KEY,
                    ...(authHeader ? { 'Authorization': authHeader } : {}),
                },
                body,
            });

            if (!resp.ok) {
                const txt = await resp.text();
                console.error('Falha ao reimprimir etiqueta ML:', resp.status, txt);
                return;
            }

            const data = await resp.json();
            const base64 = data?.content_base64;
            const contentType = data?.content_type || (responseType === 'pdf' ? 'application/pdf' : 'text/plain');
            if (!base64) {
                console.warn('Resposta sem conteúdo de etiqueta.');
                return;
            }
            const binStr = atob(base64);
            const bytes = new Uint8Array([...binStr].map((c) => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: contentType });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

            // Atualiza estado local para refletir etiqueta impressa
            setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, impressoEtiqueta: true } : p));
        } catch (err) {
            console.error('Erro ao reimprimir etiqueta ML:', err);
        }
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
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button className="h-10 px-4 rounded-xl bg-primary text-white shadow-lg disabled:opacity-50" disabled={isSyncing}>
                                                    <Zap className="w-4 h-4 mr-2" />
                                                    {isSyncing ? 'Sincronizando...' : 'Sincronizar pedidos'}
                                                    <ChevronDown className="w-4 h-4 ml-2" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSyncOrders(); }} disabled={isSyncing}>
                                                    Sincronizar todos pedidos
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleSyncSelectedOrders(); }} disabled={isSyncing || selectedCount === 0}>
                                                    {selectedCount > 0 ? `Sincronizar selecionados (${selectedCount})` : 'Sincronizar selecionados'}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onSelect={(e) => {
                                                    e.preventDefault();
                                                    const id = window.prompt('Informe o ID interno (orders.id) para sincronizar:');
                                                    if (id) handleSyncOrderByInternalId(id);
                                                }} disabled={isSyncing}>
                                                    Sincronizar por ID interno...
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
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
                                    <div className="relative w-full md:max-w-[420px]">
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
                                                    className={`group h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange.from && "text-gray-500"} ${isDatePopoverOpen ? 'gap-[1px]' : 'gap-0 group-hover:gap-[1px]'} justify-center`}
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
                                                    onSelect={setTempDateRange}
                                                    locale={ptBR}
                                                    initialFocus
                                                />
                                                <div className="p-2 border-t flex justify-end space-x-2">
                                                    <Button variant="ghost" className="text-gray-500" onClick={() => { setDateRange({ from: undefined, to: undefined }); setIsDatePopoverOpen(false); }}>Remover Filtro</Button>
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
                                        <div className="flex items-center gap-1 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-10 w-8 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[48px] text-center">{safeCurrentPage}/{totalPages}</div>
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

                            {activeStatus === "emissao-nf" && (
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
                                    <div className="relative w-full md:max-w-[420px]">
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
                                        <Button className="h-12 px-6 rounded-2xl bg-primary shadow-lg" onClick={() => handleEmitirNfe(filteredPedidos)}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Emitir em Massa
                                        </Button>
                                        <Button className="h-12 px-6 rounded-2xl bg-primary shadow-lg" onClick={() => handleEmitirNfe(filteredPedidos.filter(p => selectedPedidosEmissao.includes(p.id)))}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Emitir Selecionados ({selectedPedidosEmissao.length})
                                        </Button>
                                        <div className="flex items-center gap-2 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-12 w-9 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[56px] text-center">{safeCurrentPage}/{totalPages}</div>
                                            <Button
                                                variant="outline"
                                                className={`h-12 w-9 p-0 rounded-2xl ${safeCurrentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
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
                                    <div className="relative w-full md:max-w-[420px]">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente, SKU ou produto..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
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
                                        <div className="w-[132px]">
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
                                        <div className="w-[132px]">
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
                                            disabled={selectedPedidosImpressao.length === 0}
                                            aria-label={`Imprimir etiquetas (${selectedPedidosImpressao.length})`}
                                        >
                                            <FileBadge className="w-5 h-5" />
                                        </Button>
                                        <Button className="h-12 px-6 rounded-2xl bg-white text-gray-800 shadow-lg ring-1 ring-gray-200/60" onClick={() => setIsScannerOpen(true)}>
                                            <Scan className="w-4 h-4 mr-2" />
                                            Scanner
                                        </Button>
                                        <Button variant="outline" size="icon" className="rounded-2xl" onClick={() => setIsPrintConfigOpen(true)} aria-label="Configurações de impressão">
                                            <Settings className="w-4 h-4" />
                                        </Button>
                                        <div className="flex items-center gap-2 select-none">
                                            <Button
                                                variant="outline"
                                                className={`h-12 w-9 p-0 rounded-2xl ${safeCurrentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
                                                disabled={safeCurrentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                aria-label="Página anterior"
                                            >
                                                <ChevronLeft className="h-4 w-4" />
                                            </Button>
                                            <div className="text-sm font-medium w-[56px] text-center">{safeCurrentPage}/{totalPages}</div>
                                            <Button
                                                variant="outline"
                                                className={`h-12 w-9 p-0 rounded-2xl ${safeCurrentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
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
                                    <div className="relative w-full md:max-w-[420px]">
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

                            <div className="rounded-2xl bg-white shadow-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full table-fixed divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
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
                                                        <th className="w-12 px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                                                                    className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider ${col.id === 'produto' ? 'text-left min-w-[160px] sm:min-w-[200px] md:min-w-[240px] lg:min-w-[300px] xl:min-w-[360px]' : ''} ${col.id === 'itens' ? 'text-left w-24 md:w-28' : ''} ${col.id === 'cliente' ? 'text-left w-[140px] md:w-[200px] lg:w-[220px] pr-1' : ''} ${col.id === 'valor' ? 'text-right w-24 md:w-28' : ''} ${col.id === 'tipoEnvio' ? 'text-center w-[120px] md:w-[140px]' : ''} ${col.id === 'marketplace' ? 'text-left w-[110px] md:w-[120px]' : ''} ${col.id === 'idPlataforma' ? 'text-left w-[140px]' : ''} ${col.id === 'status' ? 'text-center w-[130px]' : ''}`}
                                                                >
                                                                    {col.name}
                                                                </th>
                                                            ))}
                                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes</th>
                                                    </tr>
                                                );
                                            })()}
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {paginatedPedidos.length > 0 ? (
                                                paginatedPedidos.map((pedido) => {
                                                    const paymentStatusesRow = ((pedido?.financeiro?.pagamentos || []) as any[]).map((p: any) => String(p?.status || '').toLowerCase());
                                                    const isApprovedRow = paymentStatusesRow.includes('approved');
                                                    const isCancelledRow = paymentStatusesRow.includes('cancelled');
                                                    const isRefundedRow = paymentStatusesRow.includes('refunded');
                                                    const canVincular = isApprovedRow && !isCancelledRow && !isRefundedRow;
                                                    const vincularTooltip = !isApprovedRow
                                                        ? 'Pagamento ainda não aprovado'
                                                        : (isCancelledRow
                                                            ? 'Pagamento cancelado'
                                                            : (isRefundedRow ? 'Pagamento reembolsado' : 'Abrir vinculação'));
                                                    return (
                                                    <tr key={pedido.id} className="group hover:bg-gray-50 transition-colors">
                                                        <td className="w-12 px-3 py-2 whitespace-nowrap">
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
                                                                className={`px-3 py-2 whitespace-nowrap text-sm text-gray-500 ${col.id === 'produto' ? 'min-w-[160px] sm:min-w-[200px] md:min-w-[240px] lg:min-w-[300px] xl:min-w-[360px]' : ''} ${col.id === 'itens' ? 'w-24 md:w-28' : ''} ${col.id === 'cliente' ? 'w-[140px] md:w-[200px] lg:w-[220px] pr-1' : ''} ${col.id === 'valor' ? 'w-24 md:w-28 text-right' : ''} ${col.id === 'tipoEnvio' ? 'w-[120px] md:w-[140px] text-center' : ''} ${col.id === 'marketplace' ? 'w-[110px] md:w-[120px]' : ''} ${col.id === 'idPlataforma' ? 'w-[140px]' : ''} ${col.id === 'status' ? 'w-[130px] text-center' : ''} ${pedido.quantidadeTotal >= 2 ? 'align-middle' : ''}`}
                                                            >
                                                                {col.render(pedido)}
                                                            </td>
                                                        ))}
                                                        <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
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
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <Button
                                                                        variant="outline"
                                                                        className="h-8 px-4"
                                                                        onClick={(e) => { e.stopPropagation(); handleReprintLabel(pedido); }}
                                                                    >
                                                                        Reimprimir
                                                                    </Button>
                                                                    <Button variant="outline" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); handleOpenDetailsDrawer(pedido); }} data-details-trigger>
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <Button variant="outline" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); handleOpenDetailsDrawer(pedido); }} data-details-trigger>
                                                                    <ChevronDown className="h-4 w-4" />
                                                                </Button>
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
                                                            <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" />
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
                                                    <img src={item.imagem} alt={item.nome} className="w-10 h-10 rounded object-cover" />
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
                <Drawer open={isEmitting} onOpenChange={setIsEmitting} className="z-[9999]">
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
                                <span>{emittedCount + failedCount} de {pedidos.filter(p => p.status === 'Emissao NF').length}</span>
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
