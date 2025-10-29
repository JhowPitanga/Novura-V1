import { useState, useRef, useEffect } from "react";
import { Search, Filter, Settings, FileText, Printer, Bot, TrendingUp, Zap, QrCode, Check, Calendar, Download, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Package, Truck, MinusCircle, CheckCircle2, Box, Scan, FileBadge, StickyNote, AudioWaveform, TextSelect, ListChecks, Table } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Reorder } from "framer-motion";
import { PedidoDetailsDrawer } from "@/components/pedidos/PedidoDetailsDrawer";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Cache simples para requisições ao endpoint público de Items do Mercado Livre
const mlItemCache = new Map<string, any>();

function mapTipoEnvioLabel(v?: string) {
    const s = String(v || '').toLowerCase();
    if (s === 'full' || s === 'fulfillment' || s === 'fbm') return 'Full';
    if (s === 'flex' || s === 'self_service') return 'Flex';
    if (s === 'agencia' || s === 'me2' || s === 'drop_off' || s === 'xd_drop_off' || s === 'cross_docking') return 'Agência';
    if (s === 'no_shipping') return 'Sem Envio';
    return s ? s : '—';
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
        const { data: rows, error } = await supabase
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
const PickingListPDFMockup = ({ pedidos, settings, onPrint }) => {
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
const LabelPDFMockup = ({ settings, pedidos }) => {
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
    const [sortKey, setSortKey] = useState<'recent' | 'sku' | 'items'>('recent');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const { user } = useAuth();

    const loadPedidos = async () => {
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

            const { data, error } = await supabase
                .from("orders")
                .select(`
                    id,
                    marketplace_order_id,
                    customer_name,
                    order_total,
                    status,
                    created_at,
                    marketplace,
                    platform_id,
                    shipping_type,
                    order_items (
                        product_name,
                        quantity,
                        sku,
                        price_per_unit
                    )
                `);

            if (error) throw error;

            // Buscar dados brutos do marketplace para pagamentos e envios
            const orderIds = Array.from(new Set((data || []).map((o: any) => o.marketplace_order_id).filter(Boolean)));
            let marketplaceByOrderId: Record<string, any> = {};
            let shipmentsByOrderId: Record<string, any[]> = {};
            if (orderIds.length > 0) {
                try {
                    // 1) Tentativa com filtro por organização (quando disponível)
                    let mq1 = supabase
                        .from('marketplace_orders')
                        .select('marketplace_order_id, payments, shipments, data, marketplace_name, status, status_detail, date_created')
                        .in('marketplace_order_id', orderIds);
                    if (organizationId) mq1 = (mq1 as any).eq('organizations_id', organizationId);
                    const { data: mqRows1, error: mqErr1 } = await mq1;
                    let rows: any[] | null = null;
                    if (!mqErr1 && Array.isArray(mqRows1) && mqRows1.length > 0) {
                        rows = mqRows1 as any[];
                    } else {
                        // 2) Fallback sem filtro de organização (aproveita políticas RLS existentes)
                        const { data: mqRows2, error: mqErr2 } = await supabase
                            .from('marketplace_orders')
                            .select('marketplace_order_id, payments, shipments, data, marketplace_name, status, status_detail, date_created')
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
                        let sh1 = supabase
                            .from('marketplace_shipments')
                            .select('marketplace_order_id, status, substatus, logistic_type, mode, shipping_mode, service_id, carrier, tracking_number, tracking_url, tracking_history, receiver_address, sender_address, costs, items, promise, tags, dimensions, data, date_created, last_updated, date_ready_to_ship, date_first_printed, last_synced_at')
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
                    console.warn('Falha ao buscar marketplace_orders:', mqCatch);
                }
            }

            const parsed = (data || []).map((o: any) => {
                const items = (o.order_items || []).map((it: any, idx: number) => ({
                    id: `${o.id || o.marketplace_order_id}-ITEM-${idx + 1}`,
                    nome: it.product_name,
                    sku: it.sku || null,
                    quantidade: it.quantity || 0,
                    valor: typeof it.price_per_unit === 'number' ? it.price_per_unit : Number(it.price_per_unit) || 0,
                    bipado: false,
                    vinculado: !!it.sku,
                    imagem: "/placeholder.svg",
                    marketplace: o.marketplace,
                }));

                const orderTotal = typeof o.order_total === 'number' ? o.order_total : Number(o.order_total) || 0;

                // Dados do marketplace para cálculos financeiros (pagamentos/entregas)
                const mq = o.marketplace_order_id ? marketplaceByOrderId[o.marketplace_order_id] : null;
                const payments: any[] = Array.isArray(mq?.payments) ? mq.payments : [];
                const shipmentsNormalized: any[] = Array.isArray(shipmentsByOrderId[o.marketplace_order_id]) ? shipmentsByOrderId[o.marketplace_order_id] : [];
                const shipments: any[] = shipmentsNormalized.length > 0
                    ? shipmentsNormalized
                    : (Array.isArray(mq?.shipments) ? mq.shipments : []);
                const orderDataRaw: any = mq?.data || {};

                // Helpers de número
                const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;

                // Receitas
                const valorBrutoItens = items.reduce((sum: number, it: any) => sum + (toNum(it.valor) * (toNum(it.quantidade) || 0)), 0);
                const valorRecebidoFrete = payments.reduce((sum, p) => sum + toNum(p?.shipping_cost), 0);
                const cupom = payments.reduce((sum, p) => sum + toNum(p?.coupon_amount), 0);

                // Taxas da plataforma (quando disponível no pagamento)
                const feesFromPayments = payments.reduce((sum, p) => sum + toNum((p?.marketplace_fee ?? p?.fee_amount ?? p?.fees_total)), 0);
                // sale_fee por item vindo do payload bruto do pedido
                const saleFeeOrderItems = Array.isArray(orderDataRaw?.order_items)
                    ? orderDataRaw.order_items.reduce((sum: number, oi: any) => sum + toNum(oi?.sale_fee), 0)
                    : 0;
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

                // Nome do cliente a partir do marketplace (buyer first/last), com limite de 3 palavras; fallback ao nome da tabela orders
                const buyer = orderDataRaw?.buyer || {};
                const rawClienteNome = [buyer?.first_name, buyer?.last_name].filter(Boolean).join(' ').trim() || (o.customer_name || "");
                const clienteNome = rawClienteNome.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');

                // Data do pedido/pagamento: usar marketplace_orders.date_created (timestamptz, América/São Paulo) como fonte principal
                let dataPagamento: string | null = null;
                if (mq?.date_created) {
                    try {
                        const d = new Date(mq.date_created);
                        dataPagamento = d.toISOString();
                    } catch (_) {
                        dataPagamento = null;
                    }
                }
                // Fallback: inferir a partir dos pagamentos caso date_created não esteja disponível
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
                if (isPaymentCancelled) {
                    statusUI = 'Cancelado';
                } else if (isDelivered || isShipped) {
                    // Pedidos recebidos (pelo comprador) ou entregues entram no quadro "Enviado"
                    statusUI = 'Enviado';
                } else if (isReadyToShip) {
                    statusUI = 'Aguardando Coleta';
                }

                // Ajuste de financeiro para cancelados
                const liquidoCalculado = (valorBrutoItens || orderTotal) + freteRecebidoLiquido - taxaMarketplace - cupom;
                const liquidoFinal = (statusUI === 'Cancelado') ? 0 : liquidoCalculado;
                const margemFinal = (statusUI === 'Cancelado') ? 0 : 0;

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
                    if (lt === 'drop_off' || lt === 'xd_drop_off' || lt === 'cross_docking') return 'agencia';
                    if (lt === 'me2' || lt === 'custom') return 'agencia';
                    return null;
                };

                const tipoEnvioDerivado = (() => {
                    if (o?.shipping_type) return o.shipping_type;
                    const t = classifyType(firstShipment);
                    if (t) return t;
                    const tags = Array.isArray(orderDataRaw?.tags) ? orderDataRaw.tags : [];
                    if (tags.includes('no_shipping')) return 'no_shipping';
                    return '';
                })();

                return {
                    id: o.marketplace_order_id || o.id,
                    marketplace: marketplaceName,
                    produto: items[0]?.nome || "",
                    sku: items[0]?.sku || null,
                    cliente: clienteNome,
                    valor: orderTotal,
                    data: o.created_at,
                    status: statusUI,
                    dataPagamento,
                    tipoEnvio: tipoEnvioDerivado,
                    idPlataforma: o.platform_id || o.marketplace_order_id || "",
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
                    impressoEtiqueta: false,
                    impressoLista: false,
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
        }
    };

    useEffect(() => {
        loadPedidos();
    }, [user]);

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
        }
    };


    // Definição das colunas da tabela
    const [columns, setColumns] = useState([
        { id: "produto", name: "Produto", enabled: true, alwaysVisible: true, render: (pedido) => (
            <div className="flex flex-col space-y-2">
                {pedido.itens?.map((it: any, idx: number) => (
                    <div key={idx} className="flex items-center space-x-3 h-12">
                        <img
                            src={((idx === 0 ? (pedido.imagem || it?.imagem) : it?.imagem) || '/placeholder.svg')}
                            alt={(idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto'))}
                            className="w-10 h-10 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                            <div className={`text-sm font-medium text-gray-900 ${pedido.quantidadeTotal >= 2 ? 'font-bold' : ''}`}>
                                <span className="line-clamp-1">
                                    {idx === 0 ? (pedido.produto || it?.nome || 'Produto') : (it?.nome || 'Produto')}
                                </span>
                            </div>
                            <div className="text-xs text-gray-500">SKU: {idx === 0 ? (pedido.sku ?? it?.sku ?? 'Não Vinculado') : (it?.sku ?? 'Não Vinculado')}</div>
                        </div>
                    </div>
                ))}
            </div>
        )},
        { id: "itens", name: "Itens", enabled: true, render: (pedido) => (
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
        { id: "cliente", name: "Cliente", enabled: true, render: (pedido) => (<span className="text-gray-900">{pedido.cliente}</span>)},
        { id: "valor", name: "Valor do Pedido", enabled: true, render: (pedido) => (pedido.valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))},
        { id: "tipoEnvio", name: "Tipo de Envio", enabled: true, render: (pedido) => (
            <Badge className={`uppercase bg-purple-600 text-white hover:bg-purple-700`}>
                {mapTipoEnvioLabel(pedido.tipoEnvio)}
            </Badge>
        )},
        
        { id: "marketplace", name: "Marketplace", enabled: true, render: (pedido) => (<span className="text-gray-900">{pedido.marketplace}</span>)},
        { id: "idPlataforma", name: "ID da Plataforma", enabled: false, render: (pedido) => (pedido.idPlataforma)},
        { id: "status", name: "Status", enabled: true, alwaysVisible: true, render: (pedido) => (
            <div className="flex flex-col items-start space-y-2">
                <Badge className={`uppercase ${getStatusColor(pedido.status)}`}>
                    {pedido.status}
                    {pedido.subStatus && (
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
        )},
        
        
        
        
    ]);

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
                return "bg-purple-500 hover:bg-purple-500 text-white";
            default:
                return "bg-gray-500 hover:bg-gray-500 text-white";
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

    const pedidosImpressao = pedidos.filter(p => p.status === 'NF Emitida');
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
        const statusMatch = activeStatus === "todos" || (activeStatus === "impressao" ? p.status === 'NF Emitida' : p.status.toLowerCase().replace(/ /g, '-') === activeStatus.toLowerCase());
        return statusMatch;
    });

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
        // 'recent' por padrão: usa dataPagamento ou data (ordenado por horário em SP)
        const ad = a?.dataPagamento || a?.data;
        const bd = b?.dataPagamento || b?.data;
        const at = ad ? (eventToSPEpochMs(ad) ?? 0) : 0;
        const bt = bd ? (eventToSPEpochMs(bd) ?? 0) : 0;
        if (at === bt) return 0;
        return at > bt ? dir : -dir;
    });

    // Paginação baseada na lista ordenada
    const totalFiltered = sortedPedidos.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
    const startIndex = (safeCurrentPage - 1) * pageSize;
    const paginatedPedidos = sortedPedidos.slice(startIndex, startIndex + pageSize);
    const showingFrom = totalFiltered === 0 ? 0 : startIndex + 1;
    const showingTo = Math.min(startIndex + paginatedPedidos.length, totalFiltered);

    // Resetar página ao mudar filtros principais
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeStatus, dateRange, quickFilter, sortKey, sortDir]);

    // Garantir que a página atual seja válida quando total de páginas mudar
    useEffect(() => {
        const newTotalPages = Math.max(1, Math.ceil(filteredPedidos.length / pageSize));
        if (currentPage > newTotalPages) {
            setCurrentPage(newTotalPages);
        }
    }, [filteredPedidos.length, pageSize, currentPage]);
    
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

    const handleOpenDetailsDrawer = (pedido: any) => {
        setSelectedPedido(pedido);
        setIsDetailsDrawerOpen(true);
    };

    const handleVincularClick = (pedido: any) => {
        const anunciosNaoVinculados = pedido.itens.filter((item: any) => !item.vinculado);
        setAnunciosParaVincular(anunciosNaoVinculados);
        setPedidoParaVincular(pedido);
        setIsVincularModalOpen(true);
    };

    const statusBlocks = [
        { id: "todos", title: "Todos os Pedidos", count: baseFiltered.length, description: "Sincronizados com marketplaces" },
        { id: "a-vincular", title: "A Vincular", count: baseFiltered.filter(p => p.status === 'A vincular').length, description: "Pedidos sem vínculo de SKU" },
        { id: "emissao-nf", title: "Emissão de NF", count: baseFiltered.filter(p => p.status === 'Emissao NF').length, description: "Aguardando emissão" },
        { id: "impressao", title: "Impressão", count: baseFiltered.filter(p => p.status === 'NF Emitida').length, description: "NF e etiqueta" },
        { id: "aguardando-coleta", title: "Aguardando Coleta", count: baseFiltered.filter(p => p.status === 'Aguardando Coleta').length, description: "Prontos para envio" },
        { id: "enviado", title: "Enviado", count: baseFiltered.filter(p => p.status === 'Enviado').length, description: "Pedidos em trânsito" },
        { id: "cancelado", title: "Cancelados", count: baseFiltered.filter(p => p.status === 'Cancelado').length, description: "Pedidos cancelados/devolvidos" },
    ];

    const handlePrintPickingList = () => {
        const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
        const pdfUrl = generateFunctionalPickingListPDF(pedidosToPrint, printSettings);
        window.open(pdfUrl, '_blank');
    };

    const handlePrintLabels = () => {
        const pedidosToPrint = pedidos.filter(p => selectedPedidosImpressao.includes(p.id));
        const pdfUrl = generateFunctionalLabelPDF(pedidosToPrint, printSettings);
        window.open(pdfUrl, '_blank');
    };

    return (
        <TooltipProvider>
            <SidebarProvider>
                <div className="min-h-screen flex w-full bg-gray-50">
                    <AppSidebar />
                    <div className="flex-1 flex flex-col">
                        <GlobalHeader />
                        <main className="flex-1 overflow-auto p-6">
                            <div className="flex items-center justify-between mb-8">
                                <h1 className="text-3xl font-bold text-gray-900">Gestão de Pedidos</h1>
                                <Button className="h-10 px-4 rounded-xl bg-primary text-white shadow-lg disabled:opacity-50" onClick={handleSyncOrders} disabled={isSyncing}>
                                    <Zap className="w-4 h-4 mr-2" />
                                    {isSyncing ? 'Sincronizando...' : 'Sincronizar pedidos'}
                                </Button>
                            </div>

                            <div className="grid grid-cols-7 gap-4 mb-8">
                                {statusBlocks.map((block) => (
                                    <Card
                                        key={block.id}
                                        className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-0 bg-white text-gray-900 overflow-hidden relative ${
                                            activeStatus === block.id ? "ring-2 ring-primary shadow-lg scale-105 bg-primary text-white" : ""
                                        }`}
                                        onClick={() => setActiveStatus(block.id)}
                                    >
                                        <CardContent className="p-6 text-center relative z-10">
                                            <div className="text-3xl font-bold mb-2">{block.count}</div>
                                            <div className="text-sm font-medium">{block.title}</div>
                                            <div className="text-xs opacity-80 mt-1">{block.description}</div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>

                            {activeStatus === "todos" && (
                                <div className="flex items-center justify-between mb-6 w-full">
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
                                                    className={`h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange.from && "text-gray-500"}`}
                                                >
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    {dateRange.from ? 
                                                        dateRange.to ? 
                                                            `${formatDateSP(dateRange.from)} - ${formatDateSP(dateRange.to)}`
                                                            : formatDateSP(dateRange.from)
                                                    : "Filtrar por Data"}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0">
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
                                        <Button className="h-12 px-6 rounded-2xl bg-primary shadow-lg" onClick={handleExportCSV}>
                                            <Download className="w-4 h-4 mr-2" />
                                            Exportar CSV
                                        </Button>
                                        <Button variant="outline" className="h-12 px-6 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); setIsFilterDrawerOpen(false); setIsColumnsDrawerOpen(true); }} data-columns-trigger>
                                            <Table className="w-4 h-4 mr-2" />
                                            Colunas
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

                            {activeStatus === "emissao-nf" && (
                                <div className="flex items-center justify-between mb-6 w-full">
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
                                <div className="flex items-center justify-between mb-6 w-full">
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
                                        <Button
                                            className="h-12 px-6 rounded-2xl bg-primary text-white shadow-lg disabled:opacity-50 disabled:pointer-events-none"
                                            onClick={handlePrintPickingList}
                                            disabled={selectedPedidosImpressao.length === 0}
                                        >
                                            <ListChecks className="w-4 h-4 mr-2" />
                                            Lista de Separação ({selectedPedidosImpressao.length})
                                        </Button>
                                        <Button
                                            className="h-12 px-6 rounded-2xl bg-primary text-white shadow-lg disabled:opacity-50 disabled:pointer-events-none"
                                            onClick={handlePrintLabels}
                                            disabled={selectedPedidosImpressao.length === 0}
                                        >
                                            <FileBadge className="w-4 h-4 mr-2" />
                                            Etiquetas ({selectedPedidosImpressao.length})
                                        </Button>
                                        <Button className="h-12 px-6 rounded-2xl bg-white text-gray-800 shadow-lg ring-1 ring-gray-200/60" onClick={() => setIsScannerOpen(true)}>
                                            <Scan className="w-4 h-4 mr-2" />
                                            Scanner
                                        </Button>
                                        <Button className="h-12 px-6 rounded-2xl bg-white text-gray-800 shadow-lg ring-1 ring-gray-200/60" onClick={() => setIsPrintConfigOpen(true)}>
                                            <Settings className="w-4 h-4 mr-2" />
                                            Configurações
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

                            <div className="rounded-2xl bg-white shadow-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full table-fixed divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="w-16 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao") && (
                                                        <Checkbox
                                                            checked={
                                                                (activeStatus === "todos" && selectedPedidos.length > 0 && selectedPedidos.length === filteredPedidos.length) ||
                                                                (activeStatus === "emissao-nf" && selectedPedidosEmissao.length > 0 && selectedPedidosEmissao.length === filteredPedidos.length) ||
                                                                (activeStatus === "impressao" && selectedPedidosImpressao.length > 0 && selectedPedidosImpressao.length === filteredPedidos.length)
                                                            }
                                                            onCheckedChange={() => {
                                                                if (activeStatus === "todos") handleSelectAll(selectedPedidos, setSelectedPedidos);
                                                                if (activeStatus === "emissao-nf") handleSelectAll(selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                                if (activeStatus === "impressao") handleSelectAll(selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                            }}
                                                        />
                                                    )}
                                                </th>
                                                {columns.filter(col => col.enabled).map(col => (
                                                        <th
                                                            key={col.id}
                                                            className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.id === 'produto' ? 'min-w-[220px] md:min-w-[300px] lg:min-w-[380px]' : ''} ${col.id === 'itens' ? 'w-28 md:w-32' : ''}`}
                                                        >
                                                            {col.name}
                                                        </th>
                                                    ))}
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Detalhes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {paginatedPedidos.length > 0 ? (
                                                paginatedPedidos.map((pedido) => (
                                                    <tr key={pedido.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="w-16 px-6 py-4 whitespace-nowrap">
                                                            {(activeStatus === "todos" || activeStatus === "emissao-nf" || activeStatus === "impressao") && (
                                                                <Checkbox
                                                                    checked={
                                                                        (activeStatus === "todos" && selectedPedidos.includes(pedido.id)) ||
                                                                        (activeStatus === "emissao-nf" && selectedPedidosEmissao.includes(pedido.id)) ||
                                                                        (activeStatus === "impressao" && selectedPedidosImpressao.includes(pedido.id))
                                                                    }
                                                                    onCheckedChange={() => {
                                                                        if (activeStatus === "todos") handleCheckboxChange(pedido.id, selectedPedidos, setSelectedPedidos);
                                                                        if (activeStatus === "emissao-nf") handleCheckboxChange(pedido.id, selectedPedidosEmissao, setSelectedPedidosEmissao);
                                                                        if (activeStatus === "impressao") handleCheckboxChange(pedido.id, selectedPedidosImpressao, setSelectedPedidosImpressao);
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            )}
                                                        </td>
                                                        {columns.filter(col => col.enabled).map(col => (
                                                            <td
                                                                key={col.id}
                                                                className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${col.id === 'produto' ? 'min-w-[220px] md:min-w-[300px] lg:min-w-[380px]' : ''} ${col.id === 'itens' ? 'w-28 md:w-32' : ''} ${pedido.quantidadeTotal >= 2 ? 'align-middle' : ''}`}
                                                            >
                                                                {col.render(pedido)}
                                                            </td>
                                                        ))}
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            {activeStatus === "a-vincular" ? (
                                                                <Button variant="outline" className="h-8 px-4" onClick={(e) => { e.stopPropagation(); handleVincularClick(pedido); }}>
                                                                    Vincular
                                                                </Button>
                                                            ) : (
                                                                <Button variant="outline" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); (e.currentTarget as HTMLButtonElement).blur(); handleOpenDetailsDrawer(pedido); }} data-details-trigger>
                                                                    <ChevronDown className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
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
                                        Exibindo {showingFrom}-{showingTo} de {filteredPedidos.length} pedido(s)
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
                <Drawer direction="right" open={isFilterDrawerOpen} onOpenChange={setIsFilterDrawerOpen}>
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

                {/* Drawer de Colunas */}
                <Drawer direction="right" open={isColumnsDrawerOpen} onOpenChange={(open) => { setIsColumnsDrawerOpen(open); if (!open) { const btn = document.querySelector<HTMLButtonElement>('button[data-columns-trigger]'); btn?.focus(); } }} shouldScaleBackground={false}>
                    <DrawerContent className="w-[30%] right-0">
                        <DrawerHeader>
                            <DrawerTitle>Gerenciar Colunas</DrawerTitle>
                            <DrawerDescription>Selecione e reorganize as colunas da tabela.</DrawerDescription>
                        </DrawerHeader>
                        <div className="p-4">
                            <Reorder.Group axis="y" values={columns} onReorder={setColumns} className="space-y-2">
                                {columns.map(col => (
                                    <Reorder.Item key={col.id} value={col}>
                                        <div className="flex items-center space-x-2 p-2 rounded-md border bg-gray-50 cursor-grab">
                                            <div className="flex-1 flex items-center space-x-2">
                                                {!col.alwaysVisible && (
                                                    <Checkbox
                                                        checked={col.enabled}
                                                        onCheckedChange={(checked) => setColumns(prev => prev.map(c => c.id === col.id ? { ...c, enabled: !!checked } : c))}
                                                    />
                                                )}
                                                <span className="text-sm">{col.name}</span>
                                                {col.alwaysVisible && (
                                                    <Badge variant="secondary" className="text-xs">Obrigatória</Badge>
                                                )}
                                            </div>
                                            <div className="text-gray-400">
                                                <ListChecks className="w-4 h-4" />
                                            </div>
                                        </div>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                        </div>
                        <div className="p-4 border-t flex justify-end">
                            <Button onClick={() => setIsColumnsDrawerOpen(false)}>Concluir</Button>
                        </div>
                    </DrawerContent>
                </Drawer>

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
                                                        <Checkbox
                                                            checked={printSettings.separateLabelPerItem}
                                                            onCheckedChange={(checked) => setPrintSettings({...printSettings, separateLabelPerItem: checked})}
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
                                                        <Checkbox
                                                            checked={printSettings.groupByProduct}
                                                            onCheckedChange={(checked) => setPrintSettings({...printSettings, groupByProduct: checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Agrupar por produto (Picking List)</span>
                                                    </label>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <Checkbox
                                                            checked={printSettings.includeBarcode}
                                                            onCheckedChange={(checked) => setPrintSettings({...printSettings, includeBarcode: checked})}
                                                        />
                                                        <span className="text-sm text-gray-700">Incluir código de barras no SKU</span>
                                                    </label>
                                                    <label className="flex items-center space-x-2 cursor-pointer">
                                                        <Checkbox
                                                            checked={printSettings.includeOrderNumber}
                                                            onCheckedChange={(checked) => setPrintSettings({...printSettings, includeOrderNumber: checked})}
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
