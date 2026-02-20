import { useState } from "react";
import {
    ChevronDown, ChevronUp, CreditCard, TrendingUp, DollarSign,
    MinusCircle, ShoppingCart, Truck, Percent, Receipt, Wallet, Zap, Ticket,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/utils/orderUtils";

interface FinancialDetailRowProps {
    icon: React.ElementType;
    label: string;
    value: number;
    isNegative: boolean;
    percent?: number;
}

function FinancialDetailRow({ icon: Icon, label, value, isNegative, percent }: FinancialDetailRowProps) {
    const absoluteValue = Math.abs(value);
    const valueDisplay = isNegative ? `- ${formatCurrency(absoluteValue)}` : `+ ${formatCurrency(absoluteValue)}`;
    const valueColor = isNegative ? 'text-orange-700' : 'text-green-600';
    const iconColor = isNegative ? 'text-orange-600' : 'text-green-600';
    const percentDisplay = percent !== undefined
        ? <span className="text-xs font-normal text-gray-500 ml-2">({percent.toFixed(0)}%)</span>
        : null;

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
}

interface OrderFinancialsProps {
    pedido: any;
    cmvLinked: number | null;
}

export function OrderFinancials({ pedido, cmvLinked }: OrderFinancialsProps) {
    const [expanded, setExpanded] = useState(true);

    const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v)) || 0;

    const valorBrutoItens =
        (pedido?.itens || []).reduce((sum: number, it: any) => sum + (toNum(it?.valor) * (toNum(it?.quantidade) || 0)), 0) ||
        toNum(pedido?.financeiro?.valorPedido) ||
        toNum(pedido?.valor);

    const valorRecebidoFrete = toNum(pedido?.financeiro?.freteRecebido);
    const freteCusto = toNum(pedido?.financeiro?.taxaFrete);
    const comissaoMarketplace = toNum(pedido?.financeiro?.taxaMarketplace);
    const saleFeeReportado = toNum(pedido?.financeiro?.saleFee);
    const shippingFeeBuyer = toNum(pedido?.financeiro?.shippingFeeBuyer);
    const freteRecebidoLiquido = toNum(
        pedido?.financeiro?.freteRecebidoLiquido ?? (valorRecebidoFrete - shippingFeeBuyer)
    );
    const impostosCalculados = toNum(pedido?.financeiro?.impostos);
    const custoProdutosFixo = toNum(cmvLinked ?? pedido?.financeiro?.custoProdutos);
    const custosExtras = toNum(pedido?.financeiro?.custosExtras);
    const cupomFixo = toNum(pedido?.financeiro?.cupom);

    const isZeroed =
        String(pedido?.status || '').toLowerCase() === 'cancelado' ||
        String(pedido?.status || '').toLowerCase() === 'devolução';
    const zeroIfNeeded = (n: number) => (isZeroed ? 0 : n);

    const impostosPercentual = valorBrutoItens > 0 ? impostosCalculados / valorBrutoItens : 0;
    const showSaleFeeSeparado = false;

    const custoLiquidoFrete = zeroIfNeeded(freteCusto) - zeroIfNeeded(freteRecebidoLiquido);

    const valorLiquidoReceber =
        zeroIfNeeded(valorBrutoItens) +
        zeroIfNeeded(freteRecebidoLiquido) -
        zeroIfNeeded(comissaoMarketplace) -
        zeroIfNeeded(impostosCalculados) -
        zeroIfNeeded(cupomFixo);

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
    const mcValor = zeroIfNeeded(valorBrutoItens) - custosVariaveisTotal + despesasVariaveisTotal;
    const mcPercent = isZeroed ? 0 : (valorBrutoItens > 0 ? (mcValor / valorBrutoItens) * 100 : 0);

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
            <Collapsible open={expanded} onOpenChange={setExpanded}>
                <CollapsibleTrigger asChild>
                    <div className="p-6 cursor-pointer hover:bg-gray-50 transition-colors w-full">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                <CreditCard className="w-6 h-6 mr-2 text-purple-600" />
                                Detalhamento Financeiro (Visão Completa)
                            </h3>
                            {expanded
                                ? <ChevronUp className="w-5 h-5 text-gray-400" />
                                : <ChevronDown className="w-5 h-5 text-gray-400" />
                            }
                        </div>
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="px-6 pb-6">
                        <div className="grid grid-cols-1 gap-y-8">
                            <div className="lg:col-span-2">
                                <h4 className="text-sm font-semibold uppercase tracking-wider text-green-700 mb-4 border-b-2 border-green-100 pb-2 flex items-center">
                                    <DollarSign className="w-4 h-4 mr-2" />
                                    Receitas (Entradas)
                                </h4>
                                <div className="space-y-1">
                                    <FinancialDetailRow
                                        icon={ShoppingCart}
                                        label="Valor Bruto dos Itens"
                                        value={zeroIfNeeded(valorBrutoItens)}
                                        isNegative={false}
                                    />
                                </div>

                                <Separator className="my-6 bg-gray-100" />

                                <h4 className="text-sm font-semibold uppercase tracking-wider text-orange-700 mb-4 border-b-2 border-orange-100 pb-2 flex items-center">
                                    <MinusCircle className="w-4 h-4 mr-2" />
                                    Custos e Despesas (Saídas)
                                </h4>
                                <div className="space-y-1">
                                    <FinancialDetailRow icon={Truck} label="Valor Pago Frete" value={zeroIfNeeded(freteCusto)} isNegative={true} />
                                    <FinancialDetailRow icon={Percent} label="Comissão do Marketplace (Efetiva)" value={zeroIfNeeded(comissaoMarketplace)} isNegative={true} />
                                    {showSaleFeeSeparado && (
                                        <FinancialDetailRow icon={Percent} label="Comissão (sale_fee do Pedido)" value={zeroIfNeeded(saleFeeReportado)} isNegative={true} />
                                    )}
                                    <FinancialDetailRow
                                        icon={Receipt}
                                        label="Impostos e Taxas Fiscais"
                                        value={zeroIfNeeded(impostosCalculados)}
                                        isNegative={true}
                                        percent={isZeroed ? 0 : impostosPercentual * 100}
                                    />
                                    <FinancialDetailRow icon={Wallet} label="Custo dos Produtos" value={zeroIfNeeded(custoProdutosFixo)} isNegative={true} />
                                    <FinancialDetailRow icon={Zap} label="Custos Extras (embalagens, etc)" value={zeroIfNeeded(custosExtras)} isNegative={true} />
                                    <FinancialDetailRow icon={Ticket} label="Desconto/Cupom Utilizado" value={zeroIfNeeded(cupomFixo)} isNegative={true} />
                                </div>

                                <Separator className="my-6 bg-gray-100" />

                                <h4 className="text-sm font-semibold uppercase tracking-wider text-purple-700 mb-4 border-b-2 border-purple-100 pb-2 flex items-center">
                                    <TrendingUp className="w-4 h-4 mr-2" />
                                    Resultados Finais
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
    );
}
