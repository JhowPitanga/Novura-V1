import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, User, Package, CreditCard, Clock, TrendingUp, Wallet, Percent, Truck, Receipt, Ticket, MinusCircle, ShoppingCart, DollarSign, Zap, Copy } from "lucide-react";
import { formatDateTimeSP } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";

// --- TIPOS MOCKADOS PARA COMPILAÇÃO ---
// Em um projeto real, estes viriam de "@/types/pedidos"
interface Item {
    id: string;
    nome: string;
    sku?: string;
    quantidade: number;
    valor: number;
}

interface Pedido {
    id: string;
    marketplace: string;
    idPlataforma: string;
    data: string;
    cliente: string;
    status: string;
    // Campos adicionais derivados (podem vir via any)
    shipment_status?: string;
    shippingCity?: string | null;
    shippingState?: string | null;
    shippingUF?: string | null;
    valor: number; // Valor total dos itens
    itens: Item[];
}

// --- FUNÇÃO AUXILIAR DE ESTILO ---
const getStatusColor = (status: string) => {
    switch (status) {
        case "Pendente": return "bg-yellow-100 text-yellow-800 border-yellow-300";
        case "A vincular": return "bg-red-100 text-red-800 border-red-300";
        case "Emissao NF": return "bg-blue-100 text-blue-800 border-blue-300";
        case "NF Emitida": return "bg-green-100 text-green-800 border-green-300";
        case "Aguardando Coleta": return "bg-purple-100 text-purple-800 border-purple-300";
        case "Enviado": return "bg-teal-100 text-teal-800 border-teal-300";
        case "Cancelado": return "bg-red-100 text-red-800 border-red-300";
        case "Devolução": return "bg-gray-100 text-gray-800 border-gray-300";
        case "Devolvido": return "bg-gray-100 text-gray-800 border-gray-300";
        default: return "bg-gray-100 text-gray-800 border-gray-300";
    }
};

// Mapeamento de status de envio (cores e tradução)
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
            return 'bg-yellow-100 text-yellow-800 border-yellow-300';
        case 'in_transit':
        case 'shipped':
            return 'bg-blue-100 text-blue-800 border-blue-300';
        case 'delivered':
            return 'bg-green-100 text-green-800 border-green-300';
        case 'not_delivered':
        case 'returned':
            return 'bg-purple-100 text-purple-800 border-purple-300';
        case 'canceled':
        case 'cancelled':
            return 'bg-red-100 text-red-800 border-red-300';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-300';
    }
};

// --- FUNÇÃO DE FORMATAÇÃO ---
const formatCurrency = (value: number) => 
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });


// --- COMPONENTE DE LINHA FINANCEIRA (Para organizar o layout) ---
interface FinancialDetailRowProps {
    icon: React.ElementType; // Icone Lucide
    label: string;
    value: number;
    isNegative: boolean; // Se for uma despesa (vermelho)
    percent?: number; // Para mostrar a porcentagem
}

const FinancialDetailRow: React.FC<FinancialDetailRowProps> = ({ icon: Icon, label, value, isNegative, percent }) => {
    // Usamos Math.abs(value) para garantir que o sinal seja tratado apenas pela formatação visual
    const absoluteValue = Math.abs(value); 
    const valueDisplay = isNegative ? `- ${formatCurrency(absoluteValue)}` : `+ ${formatCurrency(absoluteValue)}`;
    const valueColor = isNegative ? 'text-orange-700' : 'text-green-600';
    const iconColor = isNegative ? 'text-orange-600' : 'text-green-600';
    const percentDisplay = percent !== undefined ? <span className="text-xs font-normal text-gray-500 ml-2">({percent.toFixed(0)}%)</span> : null;

    return (
        <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0">
            <span className="text-gray-600 flex items-center font-medium">
                <Icon className={`w-5 h-5 mr-3 ${iconColor}`} />
                {label}
                {percentDisplay}
            </span>
            <span className={`font-bold ${valueColor} text-right text-base`}>
                {valueDisplay}
            </span>
        </div>
    );
};


interface PedidoDetailsProps {
    // Tipagem forte aplicada
    pedido: Pedido;
}

export function PedidoDetails({ pedido }: PedidoDetailsProps) {
    const [geralExpanded, setGeralExpanded] = useState(false);
    const [itensExpanded, setItensExpanded] = useState(false); 
    const [historicoExpanded, setHistoricoExpanded] = useState(false);
    const [financeiroExpanded, setFinanceiroExpanded] = useState(true);
    const [copiadoPlataforma, setCopiadoPlataforma] = useState(false);
    const [cmvLinked, setCmvLinked] = useState<number | null>(null);

    // Historico steps: manter a estrutura para o timeline
    const historicoSteps = [
        { status: "Pedido Recebido", date: "15/01/2024 14:30", completed: true },
        { status: "Pagamento Confirmado", date: "15/01/2024 14:32", completed: true },
        { status: "Em Processamento", date: "15/01/2024 15:00", completed: true },
        { status: "Em Rota para Envio", date: "16/01/2024 09:00", completed: false },
        { status: "NF Emitida", date: "16/01/2024 11:30", completed: false },
    ];

    // --- CÁLCULOS FINANCEIROS DINÂMICOS COM BASE NOS DADOS SINCRONIZADOS ---
    const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;

    // Valor bruto dos itens calculado a partir da lista de itens (quantidade x valor unitário)
    const valorBrutoItens = (pedido?.itens || []).reduce((sum: number, it: any) => sum + (toNum(it?.valor) * (toNum(it?.quantidade) || 0)), 0) || toNum((pedido as any)?.financeiro?.valorPedido) || toNum(pedido?.valor);

    // Dados financeiros provenientes da sincronização (payments/shipments normalizados em pedidos.tsx)
    const valorRecebidoFrete = toNum((pedido as any)?.financeiro?.freteRecebido);
    const freteCusto = toNum((pedido as any)?.financeiro?.taxaFrete); // custo real do frete
    const comissaoMarketplace = toNum((pedido as any)?.financeiro?.taxaMarketplace);
    const saleFeeReportado = toNum((pedido as any)?.financeiro?.saleFee);
    const feesViaPayments = toNum((pedido as any)?.financeiro?.feesPayments);
    const shippingFeeBuyer = toNum((pedido as any)?.financeiro?.shippingFeeBuyer);
    const freteRecebidoLiquido = toNum((pedido as any)?.financeiro?.freteRecebidoLiquido ?? (valorRecebidoFrete - shippingFeeBuyer));
    const impostosCalculados = toNum((pedido as any)?.financeiro?.impostos); // preparado p/ regime tributário
    const custoProdutosFixo = toNum(cmvLinked ?? (pedido as any)?.financeiro?.custoProdutos);
    const custosExtras = toNum((pedido as any)?.financeiro?.custosExtras); // ex: embalagem, mão de obra
    const cupomFixo = toNum((pedido as any)?.financeiro?.cupom);

    // Zerar detalhamento financeiro para Cancelado/Devolução
    const isZeroed = String(pedido?.status || '').toLowerCase() === 'cancelado' || String(pedido?.status || '').toLowerCase() === 'devolução';
    const zeroIfNeeded = (n: number) => (isZeroed ? 0 : n);

    // Percentuais derivados apenas para exibição auxiliar
    const comissaoPercentual = valorBrutoItens > 0 ? (comissaoMarketplace / valorBrutoItens) : 0;
    const impostosPercentual = valorBrutoItens > 0 ? (impostosCalculados / valorBrutoItens) : 0;
    const saleFeePercentual = valorBrutoItens > 0 ? (saleFeeReportado / valorBrutoItens) : 0;
    const showSaleFeeSeparado = false; // evitamos duplicidade; comissão efetiva já contempla sale_fee
    
    // Custo Líquido do Frete (Frete Custo - Frete Recebido)
    const custoLiquidoFrete = zeroIfNeeded(freteCusto) - zeroIfNeeded(freteRecebidoLiquido);
    
    // 1. Líquido a Receber (Repasse do Marketplace)
    // Valor Bruto dos Itens + Valor Recebido Frete - Comissões - Impostos - Descontos
    const valorLiquidoReceber =
        zeroIfNeeded(valorBrutoItens) +
        zeroIfNeeded(freteRecebidoLiquido) -
        zeroIfNeeded(comissaoMarketplace) -
        zeroIfNeeded(impostosCalculados) -
        zeroIfNeeded(cupomFixo);
        
    // 2. Lucro Total do Pedido (Após todos os custos internos)
    const lucroPedido =
        valorLiquidoReceber -
        zeroIfNeeded(custoProdutosFixo) -
        zeroIfNeeded(custosExtras) -
        zeroIfNeeded(custoLiquidoFrete);
        
    const custosVariaveisTotal =
        zeroIfNeeded(comissaoMarketplace) +
        zeroIfNeeded(impostosCalculados) +
        zeroIfNeeded(custoProdutosFixo) +
        zeroIfNeeded(custosExtras) +
        zeroIfNeeded(cupomFixo) +
        zeroIfNeeded(freteCusto);
    const despesasVariaveisTotal = zeroIfNeeded(freteRecebidoLiquido);
    const mcValor =
        zeroIfNeeded(valorBrutoItens) -
        custosVariaveisTotal +
        despesasVariaveisTotal;
    const mcPercent = isZeroed ? 0 : (valorBrutoItens > 0 ? (mcValor / valorBrutoItens) * 100 : 0);

    

    // --- FORMATAÇÃO DE DATA (forçada para America/Sao_Paulo) ---
    const dataBase = (pedido as any)?.dataPagamento || pedido.data;
    const dataFormatada = formatDateTimeSP(dataBase);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                let links: any[] = [];
                const raw = (pedido as any)?.linked_products;
                if (Array.isArray(raw)) {
                    links = raw;
                } else if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) links = parsed;
                    } catch {}
                }
                const ids = Array.from(new Set(links.map((e: any) => String(e?.product_id || "")).filter((x: string) => !!x)));
                const skus = Array.from(new Set(links.map((e: any) => String(e?.sku || "")).filter((x: string) => !!x)));
                let products: any[] = [];
                if (ids.length > 0) {
                    const { data } = await (supabase as any)
                        .from("products")
                        .select("id, cost_price")
                        .in("id", ids);
                    if (Array.isArray(data)) products = data;
                }
                if (!products.length && skus.length > 0) {
                    const { data } = await (supabase as any)
                        .from("products")
                        .select("id, cost_price, sku")
                        .in("sku", skus);
                    if (Array.isArray(data)) products = data;
                }
                if (products.length) {
                    const costs = products.map((p: any) => (typeof p?.cost_price === 'number' ? p.cost_price : Number(p?.cost_price) || 0)).filter((n: number) => Number.isFinite(n));
                    const avg = costs.length ? (costs.reduce((a: number, b: number) => a + b, 0) / costs.length) : 0;
                    const qty = Number((pedido as any)?.quantidadeTotal) || (Array.isArray(pedido.itens) ? pedido.itens.reduce((s: number, it: any) => s + (Number(it?.quantidade) || 0), 0) : 1);
                    const cmv = avg * qty;
                    if (!cancelled) setCmvLinked(cmv);
                } else {
                    if (!cancelled) setCmvLinked(null);
                }
            } catch {
                if (!cancelled) setCmvLinked(null);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [pedido]);

    return (
        <div className="space-y-6 max-w-full overflow-x-hidden">
            {/* Seção 1: Informações Gerais com dropdown */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <Collapsible open={geralExpanded} onOpenChange={setGeralExpanded}>
                    <CollapsibleTrigger asChild>
                        <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <Package className="w-5 h-5 mr-2 text-purple-600" />
                                    Informações Gerais
                                </h3>
                                {geralExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="px-6 pb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">ID da Plataforma:</span>
                                        <span className="font-mono font-semibold text-gray-900 flex items-center gap-2">
                                            {pedido.idPlataforma}
                                            <button
                                                type="button"
                                                className="inline-flex items-center p-1 text-xs text-gray-400 hover:text-gray-600"
                                                onClick={() => {
                                                    try {
                                                        const value = String(pedido.idPlataforma ?? "");
                                                        navigator.clipboard?.writeText(value);
                                                        setCopiadoPlataforma(true);
                                                        setTimeout(() => setCopiadoPlataforma(false), 1500);
                                                    } catch (e) {
                                                        // ignore
                                                    }
                                                }}
                                                aria-label="Copiar ID da plataforma"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            {copiadoPlataforma && (
                                                <span className="text-[10px] text-purple-700 font-semibold">COPIADO</span>
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Data do Pedido:</span>
                                        <span className="text-gray-900">{dataFormatada}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Cidade:</span>
                                        <span className="text-gray-900">{(pedido as any)?.shippingCity || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Estado:</span>
                                        <span className="text-gray-900">{(pedido as any)?.shippingState || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">UF:</span>
                                        <span className="text-gray-900">{(pedido as any)?.shippingUF || '-'}</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Cliente:</span>
                                        <span className="text-gray-900 font-medium flex items-center">
                                            <User className="w-4 h-4 mr-1 text-gray-400" /> {(pedido as any)?.billing_name || pedido.cliente}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Status:</span>
                                        <Badge className={getStatusColor(pedido.status) + " font-bold"}>
                                            {pedido.status}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600 text-sm">Status de Envio:</span>
                                        <Badge className={(pedido as any)?.shipment_status ? getShipmentStatusColor((pedido as any).shipment_status) + " font-medium" : "bg-gray-100 text-gray-800 border-gray-300"}>
                                            {formatShipmentStatus((pedido as any)?.shipment_status) || '-'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>

            {/* Seção 2: Itens do Pedido - Dropdown */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <Collapsible open={itensExpanded} onOpenChange={setItensExpanded}>
                    <CollapsibleTrigger asChild>
                        <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                                    <Package className="w-5 h-5 mr-2 text-purple-600" />
                                    Itens do Pedido ({pedido.itens.length})
                                </h3>
                                {itensExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="px-6 pb-6">
                            {/* Tabela de Itens - Adaptada do código do usuário */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 text-sm font-medium text-gray-500 pb-2 border-b border-gray-200">
                                    <span className="col-span-2">Produto</span>
                                    <span className="text-center">Qtd</span>
                                    <span className="text-right hidden sm:inline">Valor Unit.</span>
                                    <span className="text-right">Total</span>
                                </div>
                                {/* >>> Mapeamento dos itens do objeto pedido */}
                                {pedido.itens.map((item: Item) => (
                                    <div key={item.id} className="grid grid-cols-4 sm:grid-cols-5 gap-4 items-center py-3 hover:bg-gray-50 rounded-lg px-3 transition-colors">
                                    <div className="col-span-2">
                                        <span className="text-gray-900 font-medium">{item.nome}</span>
                                        <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku || "N/A"}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">SKU Vinculado: {(pedido as any)?.linkedSku || "N/A"}</p>
                                    </div>
                                    {/* Cor ajustada para roxo */}
                                    <div className={`text-center font-medium ${item.quantidade > 1 ? 'text-purple-600 bg-purple-100 rounded-lg py-1 px-2' : 'text-gray-900'}`}>
                                        {item.quantidade}
                                    </div>
                                        <div className="text-right text-gray-900 hidden sm:inline">
                                            {formatCurrency(item.valor)}
                                        </div>
                                        <div className="text-right font-semibold text-gray-900">
                                            {formatCurrency(item.quantidade * item.valor)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>

            {/* Seção 4: Detalhamento Financeiro - Dropdown (aberto por padrão) */}
            <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
                <Collapsible open={financeiroExpanded} onOpenChange={setFinanceiroExpanded}>
                    <CollapsibleTrigger asChild>
                        <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                    <CreditCard className="w-6 h-6 mr-2 text-purple-600" />
                                    Detalhamento Financeiro (Visão Completa)
                                </h3>
                                {financeiroExpanded ? (
                                    <ChevronUp className="w-5 h-5 text-gray-400" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-gray-400" />
                                )}
                            </div>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <div className="px-6 pb-6">
                {/* Grid Responsivo: Lista de detalhes (coluna 1) e Resultados Finais (coluna 2) */}
                <div className="grid grid-cols-1 gap-y-8">
                    {/* Coluna 1: Receitas e Despesas (ocupa 2/3 em telas grandes) */}
                    <div className="lg:col-span-2">
                        
                        {/* Bloco 1: Receitas */}
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-green-700 mb-4 border-b-2 border-green-100 pb-2 flex items-center">
                            <DollarSign className="w-4 h-4 mr-2" />
                            Receitas (Entradas)
                        </h4>
                        
                        <div className="space-y-1">
                            {/* Valor Bruto dos Itens (Venda) */}
                            <FinancialDetailRow 
                                icon={ShoppingCart} 
                                label="Valor Bruto dos Itens" 
                                value={zeroIfNeeded(valorBrutoItens)} 
                                isNegative={false} 
                            />
                        </div>

                        <Separator className="my-6 bg-gray-100" />
                        
                        {/* Bloco 2: Despesas e Custos */}
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-orange-700 mb-4 border-b-2 border-orange-100 pb-2 flex items-center">
                            <MinusCircle className="w-4 h-4 mr-2" />
                            Custos e Despesas (Saídas)
                        </h4>
                        
                        <div className="space-y-1">
                        {/* Frete Custo (Custo de Envio) */}
                        <FinancialDetailRow 
                            icon={Truck} 
                            label="Valor Pago Frete" 
                            value={zeroIfNeeded(freteCusto)} // Custo total é uma despesa
                            isNegative={true} 
                        />


                            {/* Comissão Marketplace (efetiva) */}
                            <FinancialDetailRow 
                                icon={Percent} 
                                label="Comissão do Marketplace (Efetiva)" 
                                value={zeroIfNeeded(comissaoMarketplace)} 
                                isNegative={true} 
                            />

                            {/* Comissão (sale_fee reportado): visível quando difere da efetiva */}
                            {showSaleFeeSeparado && (
                                <FinancialDetailRow 
                                    icon={Percent} 
                                    label="Comissão (sale_fee do Pedido)" 
                                    value={zeroIfNeeded(saleFeeReportado)} 
                                    isNegative={true} 
                                />
                            )}
                            
                            {/* Impostos */}
                            <FinancialDetailRow 
                                icon={Receipt} 
                                label="Impostos e Taxas Fiscais" 
                                value={zeroIfNeeded(impostosCalculados)} 
                                isNegative={true} 
                                percent={isZeroed ? 0 : (impostosPercentual * 100)}
                            />

                            {/* Custo dos Produtos (CMV) */}
                            <FinancialDetailRow 
                                icon={Wallet} 
                                label="Custo dos Produtos" 
                                value={zeroIfNeeded(custoProdutosFixo)} 
                                isNegative={true} 
                            />
                            
                            {/* Custos Extras */}
                            <FinancialDetailRow 
                                icon={Zap} 
                                label="Custos Extras (embalagens, etc)" 
                                value={zeroIfNeeded(custosExtras)} 
                                isNegative={true} 
                            />

                            {/* Cupom (Desconto) */}
                            <FinancialDetailRow 
                                icon={Ticket} 
                                label="Desconto/Cupom Utilizado" 
                                value={zeroIfNeeded(cupomFixo)} 
                                isNegative={true} 
                            />
                        </div>

                        {/* Resultados Finais dentro do Detalhamento Financeiro */}
                        <Separator className="my-6 bg-gray-100" />
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-purple-700 mb-4 border-b-2 border-purple-100 pb-2 flex items-center">
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Resultados Finais
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Card: A Receber (Lucro do Pedido) */}
                            <div className="bg-purple-50 rounded-3xl p-4 border-2 border-purple-200/60 transition-all text-center">
                                <div className="flex items-center justify-center">
                                    <span className="text-purple-800 font-semibold flex items-center justify-center text-sm uppercase">
                                        <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                                        A receber
                                    </span>
                                </div>
                                <div className="mt-2 flex justify-center items-center min-h-[56px] w-full">
                                    <span className="text-purple-800 font-extrabold text-2xl leading-none text-center">
                                        {formatCurrency(isZeroed ? 0 : lucroPedido)}
                                    </span>
                                </div>
                            </div>
                            {/* Card: Margem de Contribuição em % */}
                            <div className={`${mcPercent < 0 ? 'bg-red-50 border-red-200/60' : 'bg-purple-50 border-purple-200/60'} rounded-3xl p-4 border-2 transition-all text-center`}>
                                <div className="flex items-center justify-center">
                                    <span className={`${mcPercent < 0 ? 'text-red-800' : 'text-purple-800'} font-semibold flex items-center justify-center text-sm uppercase`}>
                                        <TrendingUp className={`w-5 h-5 mr-2 ${mcPercent < 0 ? 'text-red-600' : 'text-purple-600'}`} />
                                        Margem em %
                                    </span>
                                </div>
                                <div className="mt-2 flex justify-center items-center min-h-[56px] w-full">
                                    <span className={`${mcPercent < 0 ? 'text-red-800' : 'text-purple-800'} font-extrabold text-2xl leading-none text-center`}>
                                        {mcPercent.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                
                </div>
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </div>


        </div>
    );
}
