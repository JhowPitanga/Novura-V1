import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, User, Package, CreditCard, Clock, TrendingUp, Wallet, Percent, Truck, Receipt, Ticket, MinusCircle, ShoppingCart, DollarSign, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Assumindo que você tem os componentes Badge, Separator, Collapsible, CollapsibleContent, CollapsibleTrigger
// Como não temos acesso aos componentes reais, assumimos que eles estão definidos
const Badge = (props) => <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${props.className}`}>{props.children}</span>;
const Separator = (props) => <hr className={`border-gray-200 ${props.className}`} />;
const Collapsible = (props) => <div>{props.children}</div>;
const CollapsibleContent = (props) => props.open ? <div>{props.children}</div> : null;
const CollapsibleTrigger = (props) => <div onClick={props.onToggle}>{props.children}</div>;

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
    valor: number; // Valor total dos itens
    margem: number; // Margem percentual mockada ou calculada
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
        case "Cancelado": return "bg-gray-100 text-gray-800 border-gray-300";
        default: return "bg-gray-100 text-gray-800 border-gray-300";
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
    const valueColor = isNegative ? 'text-red-600' : 'text-green-600';
    const iconColor = isNegative ? 'text-pink-600' : 'text-green-600'; // pink para despesas
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
    const [itensExpanded, setItensExpanded] = useState(true); 
    const [historicoExpanded, setHistoricoExpanded] = useState(false);

    // Historico steps: manter a estrutura para o timeline
    const historicoSteps = [
        { status: "Pedido Recebido", date: "15/01/2024 14:30", completed: true },
        { status: "Pagamento Confirmado", date: "15/01/2024 14:32", completed: true },
        { status: "Em Processamento", date: "15/01/2024 15:00", completed: true },
        { status: "Em Rota para Envio", date: "16/01/2024 09:00", completed: false },
        { status: "NF Emitida", date: "16/01/2024 11:30", completed: false },
    ];

    // --- CÁLCULOS FINANCEIROS DINÂMICOS E NOVOS MOCKS ---
    const comissaoPercentual = 0.12; // 12%
    const impostosPercentual = 0.08; // 8%
    
    // Novas variáveis mockadas (para preencher os campos em branco)
    const custoProdutosFixo = 999.00; // Custo dos produtos (CMV) - MOCK
    const custosExtras = 80.00; // Ex: Custos com embalagem especial - MOCK
    const valorRecebidoFrete = 109.90; // Valor que o cliente pagou pelo frete (Receita) - MOCK
    const freteCusto = 159.00; // Custo real do frete para o vendedor (Despesa) - MOCK
    const cupomFixo = 50.00; // Desconto dado ao cliente (Despesa) - MOCK
    
    // Venda Bruta (Valor dos Itens no carrinho)
    const valorBrutoItens = pedido.valor;
    
    // Cálculo das Despesas de Transação
    const comissaoMarketplace = valorBrutoItens * comissaoPercentual;
    const impostosCalculados = valorBrutoItens * impostosPercentual;
    
    // Custo Líquido do Frete (Frete Custo - Frete Recebido)
    const custoLiquidoFrete = freteCusto - valorRecebidoFrete;
    
    // 1. Líquido a Receber (Repasse do Marketplace)
    // Valor Bruto dos Itens + Valor Recebido Frete - Comissões - Impostos - Descontos
    const valorLiquidoReceber =
        valorBrutoItens +
        valorRecebidoFrete -
        comissaoMarketplace -
        impostosCalculados -
        cupomFixo;
        
    // 2. Lucro Total do Pedido (Após todos os custos internos)
    // Repasse Liquido - Custos Internos - Custo Liquido do Frete (o frete recebido já foi contado acima)
    const lucroPedido =
        valorLiquidoReceber -
        custoProdutosFixo -
        custosExtras -
        (freteCusto - valorRecebidoFrete); 
        
    // 3. Margem Final (usando o lucro e o valor bruto dos itens)
    const margemCalculada = valorBrutoItens > 0 ? (lucroPedido / valorBrutoItens) * 100 : 0;

    // --- FORMATAÇÃO DE DATA ---
    const dataFormatada = format(new Date(pedido.data), "dd/MM/yyyy HH:mm", { locale: ptBR });


    return (
        <div className="space-y-6 max-w-full overflow-x-hidden">
            {/* Seção 1: Informações Gerais - Sem Sombra, Cor Roxo */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    {/* Cor principal roxa: text-purple-600 */}
                    <Package className="w-5 h-5 mr-2 text-purple-600" />
                    Informações Gerais
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Marketplace:</span>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {pedido.marketplace}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">ID da Plataforma:</span>
                            <span className="font-mono font-semibold text-gray-900">{pedido.idPlataforma}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Data do Pedido:</span>
                            <span className="text-gray-900">{dataFormatada}</span>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Cliente:</span>
                            <span className="text-gray-900 font-medium flex items-center">
                                <User className="w-4 h-4 mr-1 text-gray-400" /> {pedido.cliente}
                            </span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Tipo de Entrega:</span>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <Truck className="w-3 h-3 mr-1" />
                                Entrega Normal
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 text-sm">Status:</span>
                            {/* Uso da função getStatusColor para estilo dinâmico */}
                            <Badge className={getStatusColor(pedido.status) + " font-bold"}>
                                {pedido.status}
                            </Badge>
                        </div>
                    </div>
                </div>
            </div>

            {/* Seção 2: Itens do Pedido - Sem Sombra */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* O Collapsible original não tem onOpenChange, estou mantendo o onToggle para a versão mockada funcionar */}
                <Collapsible open={itensExpanded} onOpenChange={setItensExpanded} onToggle={() => setItensExpanded(!itensExpanded)}>
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
                    <CollapsibleContent open={itensExpanded}>
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

            {/* Seção 4: Detalhamento Financeiro - REESTRUTURADA E RESPONSIVA */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                    <CreditCard className="w-6 h-6 mr-2 text-purple-600" />
                    Detalhamento Financeiro (Visão Completa)
                </h3>

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
                                value={valorBrutoItens} 
                                isNegative={false} 
                            />

                            {/* Valor Frete Recebido da Plataforma */}
                            <FinancialDetailRow 
                                icon={Truck} 
                                label="Valor Recebido Frete da Plataforma" 
                                value={valorRecebidoFrete} 
                                isNegative={false} 
                            />
                        </div>

                        <Separator className="my-6 bg-gray-100" />
                        
                        {/* Bloco 2: Despesas e Custos */}
                        <h4 className="text-sm font-semibold uppercase tracking-wider text-pink-700 mb-4 border-b-2 border-pink-100 pb-2 flex items-center">
                            <MinusCircle className="w-4 h-4 mr-2" />
                            Custos e Despesas (Saídas)
                        </h4>
                        
                        <div className="space-y-1">
                            {/* Frete Custo (Custo de Envio) */}
                            <FinancialDetailRow 
                                icon={Truck} 
                                label="Valor Pago Frete (Custo Real)" 
                                value={freteCusto} // Custo total é uma despesa
                                isNegative={true} 
                            />

                            {/* Comissão Marketplace */}
                            <FinancialDetailRow 
                                icon={Percent} 
                                label="Comissão do Marketplace" 
                                value={comissaoMarketplace} 
                                isNegative={true} 
                                percent={comissaoPercentual * 100}
                            />
                            
                            {/* Impostos */}
                            <FinancialDetailRow 
                                icon={Receipt} 
                                label="Impostos e Taxas Fiscais" 
                                value={impostosCalculados} 
                                isNegative={true} 
                                percent={impostosPercentual * 100}
                            />

                            {/* Custo dos Produtos (CMV) */}
                            <FinancialDetailRow 
                                icon={Wallet} 
                                label="Custo dos Produtos (CMV)" 
                                value={custoProdutosFixo} 
                                isNegative={true} 
                            />
                            
                            {/* Custos Extras */}
                            <FinancialDetailRow 
                                icon={Zap} 
                                label="Custos Extras (Embalagem, Mão de Obra)" 
                                value={custosExtras} 
                                isNegative={true} 
                            />

                            {/* Cupom (Desconto) */}
                            <FinancialDetailRow 
                                icon={Ticket} 
                                label="Desconto/Cupom Utilizado" 
                                value={cupomFixo} 
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
                            {/* Card: Líquido a Receber (Repasse) */}
                            <div className="bg-purple-50 rounded-xl p-6 border-2 border-purple-200/60 transition-all">
                                <div className="flex items-center justify-between">
                                    <span className="text-purple-800 font-semibold flex items-center text-sm uppercase">
                                        <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                                        Líquido a Receber (Repasse)
                                    </span>
                                </div>
                                <span className="text-purple-800 font-extrabold text-3xl mt-2 block">
                                    {formatCurrency(valorLiquidoReceber)}
                                </span>
                                <p className="text-xs text-purple-600 mt-2">Valor creditado pelo Marketplace (inclui frete recebido, menos comissões, impostos e descontos).</p>
                            </div>
                            {/* Card: Margem em % */}
                            <div className={`${margemCalculada >= 0 ? 'bg-green-50 border-green-200/60' : 'bg-red-50 border-red-200/60'} rounded-xl p-6 border-2 transition-all`}>
                                <div className="flex items-center justify-between">
                                    <span className={`${margemCalculada >= 0 ? 'text-green-800' : 'text-red-800'} font-semibold flex items-center text-sm uppercase`}>
                                        <TrendingUp className="w-5 h-5 mr-2" />
                                        Margem em %
                                    </span>
                                </div>
                                <span className={`${margemCalculada >= 0 ? 'text-green-800' : 'text-red-800'} font-extrabold text-3xl mt-2 block`}>
                                    {margemCalculada.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    </div>


                </div>
            </div>


        </div>
    );
}
