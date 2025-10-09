import { useState, useRef } from "react";
import { Search, Filter, Settings, FileText, Printer, Bot, TrendingUp, Zap, QrCode, Check, Calendar, Download, X, ChevronDown, ChevronUp, Package, Truck, MinusCircle, CheckCircle2, Box, Scan, FileBadge, StickyNote, AudioWaveform, TextSelect, ListChecks, Table } from "lucide-react";
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
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Reorder } from "framer-motion";
import { PedidoDetailsDrawer } from "@/components/pedidos/PedidoDetailsDrawer";

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


// --- Dados Mock (Temporário) ---
const mockPedidos = [
    { id: "PED001", marketplace: "Mercado Livre", produto: "iPhone 15 Pro Max 256GB", sku: "IPH15PM-256", cliente: "João Silva Santos", valor: 8999.99, data: "2024-01-15", status: "Pendente", tipoEnvio: "ML Envios", idPlataforma: "MLB123456789", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A1", nome: "iPhone 15 Pro Max 256GB", sku: "IPH15PM-256", quantidade: 1, valor: 8999.99, vinculado: true, marketplace: "Mercado Livre" }], financeiro: { valorPedido: 8999.99, taxaFrete: 75.00, taxaMarketplace: 1200.00, cupom: 50.00, impostos: 150.00, liquido: 7674.99, margem: 20 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED002", marketplace: "Amazon", produto: "MacBook Air M3 16GB 512GB", sku: null, cliente: "Maria Santos Costa", valor: 12999.99, data: "2024-01-15", status: "A vincular", tipoEnvio: "Amazon Prime", idPlataforma: "AMZ987654321", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A2", nome: "MacBook Air M3 16GB 512GB", sku: null, quantidade: 1, valor: 12999.99, vinculado: false, marketplace: "Amazon" }], financeiro: { valorPedido: 12999.99, taxaFrete: 80.00, taxaMarketplace: 1500.00, cupom: 0.00, impostos: 200.00, liquido: 11219.99, margem: 18 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED003", marketplace: "Shopee", produto: "Samsung Galaxy S24 Ultra", sku: "SGS24U-256", cliente: "Carlos Oliveira", valor: 6999.99, data: "2024-01-14", status: "Emissao NF", tipoEnvio: "Shopee Xpress", idPlataforma: "SHP789123456", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A3", nome: "Samsung Galaxy S24 Ultra", sku: "SGS24U-256", quantidade: 1, valor: 6999.99, vinculado: true, marketplace: "Shopee" }], financeiro: { valorPedido: 6999.99, taxaFrete: 50.00, taxaMarketplace: 900.00, cupom: 20.00, impostos: 100.00, liquido: 5929.99, margem: 22 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED004", marketplace: "Magazine Luiza", produto: "Nintendo Switch OLED", sku: "NSW-OLED", cliente: "Ana Paula Lima", valor: 2299.99, data: "2024-01-14", status: "NF Emitida", tipoEnvio: "Magalu Entrega", idPlataforma: "MAG456789123", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A4", nome: "Nintendo Switch OLED", sku: "NSW-OLED", quantidade: 1, valor: 2299.99, bipado: false, imagem: "/placeholder.svg" }], financeiro: { valorPedido: 2299.99, taxaFrete: 30.00, taxaMarketplace: 350.00, cupom: 0.00, impostos: 50.00, liquido: 1869.99, margem: 15 }, impressoEtiqueta: true, impressoLista: true },
    { id: "PED005", marketplace: "Americanas", produto: "iPad Air 5ª Geração", sku: "IPAD-AIR5", cliente: "Roberto Ferreira", valor: 4199.99, data: "2024-01-13", status: "Aguardando Coleta", tipoEnvio: "B2W Entrega", idPlataforma: "AME321654987", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A5", nome: "iPad Air 5ª Geração", sku: "IPAD-AIR5", quantidade: 1, valor: 4199.99, vinculado: true, marketplace: "Americanas" }], financeiro: { valorPedido: 4199.99, taxaFrete: 40.00, taxaMarketplace: 500.00, cupom: 0.00, impostos: 80.00, liquido: 3579.99, margem: 18 }, impressoEtiqueta: true, impressoLista: false },
    { id: "PED006", marketplace: "Shopee", produto: "Fone Bluetooth", sku: "FB-001", cliente: "Mariana Costa", valor: 150.00, data: "2024-01-12", status: "Enviado", tipoEnvio: "Shopee Xpress", idPlataforma: "SHP999888777", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A6", nome: "Fone Bluetooth", sku: "FB-001", quantidade: 1, valor: 150.00, vinculado: true, marketplace: "Shopee" }], financeiro: { valorPedido: 150.00, taxaFrete: 10.00, taxaMarketplace: 20.00, cupom: 0.00, impostos: 5.00, liquido: 115.00, margem: 30 }, impressoEtiqueta: true, impressoLista: true },
    { id: "PED007", marketplace: "Mercado Livre", produto: "Produto Cancelado", sku: "PC-001", cliente: "Cliente Cancelado", valor: 200.00, data: "2024-01-08", status: "Cancelado", tipoEnvio: "ML Envios", idPlataforma: "CAN123456789", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A7", nome: "Produto Cancelado", sku: "PC-001", quantidade: 1, valor: 200.00, vinculado: true, marketplace: "Mercado Livre" }], financeiro: { valorPedido: 200.00, taxaFrete: 0.00, taxaMarketplace: 25.00, cupom: 0.00, impostos: 10.00, liquido: 165.00, margem: 15 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED008", marketplace: "Mercado Livre", produto: "Smartphone e Fone", sku: null, cliente: "Julia Mendes", valor: 3500.00, data: "2024-01-16", status: "A vincular", tipoEnvio: "ML Envios Flex", idPlataforma: "MLB998877665", quantidadeTotal: 2, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A8", nome: "Smartphone X", sku: null, quantidade: 1, valor: 3000.00, vinculado: false, marketplace: "Mercado Livre" }, { id: "ITEM-A9", nome: "Fone Bluetooth Y", sku: null, quantidade: 1, valor: 500.00, vinculado: false, marketplace: "Mercado Livre" }], financeiro: { valorPedido: 3500.00, taxaFrete: 45.00, taxaMarketplace: 450.00, cupom: 0.00, impostos: 100.00, liquido: 2905.00, margem: 25 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED009", marketplace: "Shopee", produto: "Produto Com Falha", sku: "FAIL-001", cliente: "Cliente Com Falha", valor: 1000.00, data: "2024-01-16", status: "Emissao NF", subStatus: "Falha na emissao", tipoEnvio: "Shopee Xpress", idPlataforma: "SHP111222333", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A10", nome: "Produto Com Falha", sku: "FAIL-001", quantidade: 1, valor: 1000.00, vinculado: true, marketplace: "Shopee" }], financeiro: { valorPedido: 1000.00, taxaFrete: 15.00, taxaMarketplace: 130.00, cupom: 0.00, impostos: 30.00, liquido: 825.00, margem: 10 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED010", marketplace: "Amazon", produto: "Produto Com Falha no Envio", sku: "FAIL-002", cliente: "Cliente Com Falha", valor: 1500.00, data: "2024-01-16", status: "Emissao NF", subStatus: "Falha ao enviar", tipoEnvio: "Amazon Prime", idPlataforma: "AMZ111222333", quantidadeTotal: 1, imagem: "/placeholder.svg", itens: [{ id: "ITEM-A11", nome: "Produto Com Falha no Envio", sku: "FAIL-002", quantidade: 1, valor: 1500.00, vinculado: true, marketplace: "Amazon" }], financeiro: { valorPedido: 1500.00, taxaFrete: 20.00, taxaMarketplace: 180.00, cupom: 0.00, impostos: 40.00, liquido: 1260.00, margem: 12 }, impressoEtiqueta: false, impressoLista: false },
    { id: "PED011", marketplace: "Mercado Livre", produto: "Smartphone e Fone", sku: "SMART-FONE", cliente: "Fernanda Lemos", valor: 3500.00, data: "2024-01-17", status: "NF Emitida", tipoEnvio: "ML Envios", idPlataforma: "MLB1122334455", quantidadeTotal: 2, imagem: "/placeholder.svg", itens: [
        { id: "ITEM-B1", nome: "Smartphone X", sku: "SMART-X", quantidade: 1, valor: 3000.00, bipado: false, imagem: "/placeholder.svg" },
        { id: "ITEM-B2", nome: "Fone Bluetooth Y", sku: "FONE-Y", quantidade: 1, valor: 500.00, bipado: false, imagem: "/placeholder.svg" },
    ], financeiro: { valorPedido: 3500.00, taxaFrete: 45.00, taxaMarketplace: 450.00, cupom: 0.00, impostos: 100.00, liquido: 2905.00, margem: 25 }, impressoEtiqueta: false, impressoLista: true },
    { id: "PED012", marketplace: "Mercado Livre", produto: "Câmera e Lente", sku: null, cliente: "Lucas Santos", valor: 5000.00, data: "2024-01-18", status: "Pendente", tipoEnvio: "ML Envios Flex", idPlataforma: "MLB000111222", quantidadeTotal: 2, imagem: "/placeholder.svg", itens: [
        { id: "ITEM-C1", nome: "Câmera DSLR", sku: null, quantidade: 1, valor: 4000.00, vinculado: false, marketplace: "Mercado Livre" },
        { id: "ITEM-C2", nome: "Lente 50mm", sku: null, quantidade: 1, valor: 1000.00, vinculado: false, marketplace: "Mercado Livre" },
    ], financeiro: { valorPedido: 5000.00, taxaFrete: 60.00, taxaMarketplace: 600.00, cupom: 0.00, impostos: 150.00, liquido: 4190.00, margem: 20 }, impressoEtiqueta: false, impressoLista: false },
];

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
    const [pedidos, setPedidos] = useState<any[]>(mockPedidos);
    const [isEmitting, setIsEmitting] = useState(false);
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
        { id: "valor", name: "Valor do Pedido", enabled: true, render: (pedido) => (`R$ ${pedido.valor.toFixed(2)}`)},
        { id: "tipoEnvio", name: "Tipo de Envio", enabled: true, render: (pedido) => (
            <Badge className={`uppercase bg-purple-600 text-white hover:bg-purple-700`}>
                {pedido.tipoEnvio}
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
        { id: "data", name: "Data", enabled: false, render: (pedido) => (<span className="text-gray-500">{pedido.data}</span>)},
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
            p.data,
            p.status,
            p.tipoEnvio
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

    let filteredPedidos = pedidos.filter(p => {
        const statusMatch = activeStatus === "todos" || (activeStatus === "impressao" ? p.status === 'NF Emitida' : p.status.toLowerCase().replace(/ /g, '-') === activeStatus.toLowerCase());
        
        // Lógica do filtro de data por range
        const date = new Date(p.data);
        const dateMatch = !dateRange.from || (date >= dateRange.from && (!dateRange.to || date <= dateRange.to));

        const searchTermMatch = searchTerm === "" ||
            p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()));
        return statusMatch && dateMatch && searchTermMatch;
    });

    if (activeStatus === "emissao-nf") {
        if (quickFilter === "Falha na emissão") {
            filteredPedidos = filteredPedidos.filter(p => p.subStatus === "Falha na emissao");
        } else if (quickFilter === "Falha ao Enviar") {
            filteredPedidos = filteredPedidos.filter(p => p.subStatus === "Falha ao enviar");
        }
    }
    
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
        { id: "todos", title: "Todos os Pedidos", count: mockPedidos.length, description: "Sincronizados com marketplaces" },
        { id: "a-vincular", title: "A Vincular", count: mockPedidos.filter(p => p.status === 'A vincular').length, description: "Pedidos sem vínculo de SKU" },
        { id: "emissao-nf", title: "Emissão de NF", count: mockPedidos.filter(p => p.status === 'Emissao NF').length, description: "Aguardando emissão" },
        { id: "impressao", title: "Impressão", count: mockPedidos.filter(p => p.status === 'NF Emitida').length, description: "NF e etiqueta" },
        { id: "aguardando-coleta", title: "Aguardando Coleta", count: mockPedidos.filter(p => p.status === 'Aguardando Coleta').length, description: "Prontos para envio" },
        { id: "enviado", title: "Enviado", count: mockPedidos.filter(p => p.status === 'Enviado').length, description: "Pedidos em trânsito" },
        { id: "cancelado", title: "Cancelados", count: mockPedidos.filter(p => p.status === 'Cancelado').length, description: "Pedidos cancelados/devolvidos" },
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
                                <div className="flex items-center space-x-4 mb-6">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente ou SKU..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
                                    <Popover open={isDatePopoverOpen} onOpenChange={setIsDatePopoverOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={`h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 ${!dateRange.from && "text-gray-500"}`}
                                            >
                                                <Calendar className="mr-2 h-4 w-4" />
                                                {dateRange.from ? 
                                                    dateRange.to ? 
                                                        `${format(dateRange.from, "PP", { locale: ptBR })} - ${format(dateRange.to, "PP", { locale: ptBR })}`
                                                        : format(dateRange.from, "PP", { locale: ptBR })
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
                                    <Button variant="outline" className="h-12 px-6 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60" onClick={(e) => { (e.currentTarget as HTMLButtonElement).blur(); setIsColumnsDrawerOpen(true); }}>
                                        <Table className="w-4 h-4 mr-2" />
                                        Colunas
                                    </Button>
                                </div>
                            )}

                            {activeStatus === "emissao-nf" && (
                                <div className="flex items-center space-x-4 mb-6">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente ou SKU..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
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
                                </div>
                            )}
                            
                            {activeStatus === "impressao" && (
                                <div className="flex items-center space-x-4 mb-6">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <Input
                                            placeholder="Buscar por ID, cliente ou SKU..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                        />
                                    </div>
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
                                            {filteredPedidos.length > 0 ? (
                                                filteredPedidos.map((pedido) => (
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
                                <div className="py-4 px-6 flex justify-between items-center text-sm text-gray-600">
                                    <div>Exibindo {filteredPedidos.length} de {mockPedidos.length} pedido(s)</div>
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
                <Drawer direction="right" open={isColumnsDrawerOpen} onOpenChange={(open) => { setIsColumnsDrawerOpen(open); if (!open) { const btn = document.querySelector<HTMLButtonElement>('button:has(.w-4.h-4.mr-2)'); btn?.focus(); } }}>
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
                                                    <p><strong>Tipo de Envio:</strong> {scannedPedido.tipoEnvio}</p>
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
                                                    <div className="text-xs text-gray-500">{pedido.marketplace} - {pedido.tipoEnvio}</div>
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
                                                    <div className="text-xs text-gray-500">{pedido.marketplace} - {pedido.tipoEnvio}</div>
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
                                <span>{emittedCount + failedCount} de {mockPedidos.filter(p => p.status === 'Emissao NF').length}</span>
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
