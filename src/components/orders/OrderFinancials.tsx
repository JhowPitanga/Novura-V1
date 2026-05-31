import type { ElementType } from "react";
import {
  CreditCard, TrendingUp, DollarSign, MinusCircle, ShoppingCart,
  Truck, Percent, Receipt, Wallet, Zap, Ticket, Loader2,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/utils/orderUtils";
import type { OrderFinancialBreakdown } from "@/utils/orderFinancialBreakdown";
import { OrderDrawerSection } from "./OrderDrawerSection";

interface FinancialDetailRowProps {
  icon: ElementType;
  label: string;
  value: number;
  isNegative: boolean;
  percent?: number;
}

function FinancialDetailRow({ icon: Icon, label, value, isNegative, percent }: FinancialDetailRowProps) {
  const absoluteValue = Math.abs(value);
  const valueDisplay = isNegative ? `- ${formatCurrency(absoluteValue)}` : `+ ${formatCurrency(absoluteValue)}`;
  const valueColor = isNegative ? "text-orange-700" : "text-green-600";
  const iconColor = isNegative ? "text-orange-600" : "text-green-600";
  const percentDisplay = percent !== undefined && percent > 0
    ? <span className="text-xs font-normal text-gray-500 ml-2">({percent.toFixed(1)}%)</span>
    : null;

  return (
    <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-600 flex items-center font-medium text-sm">
        <Icon className={`w-5 h-5 mr-3 shrink-0 ${iconColor}`} />
        {label}
        {percentDisplay}
      </span>
      <span className={`font-bold ${valueColor} text-right text-base shrink-0`}>
        {valueDisplay}
      </span>
    </div>
  );
}

interface OrderFinancialsProps {
  breakdown: OrderFinancialBreakdown | null;
  taxRatePct: number;
  loading?: boolean;
}

export function OrderFinancials({ breakdown, taxRatePct, loading }: OrderFinancialsProps) {
  if (loading || !breakdown) {
    return (
      <OrderDrawerSection title="Detalhamento Financeiro" icon={CreditCard}>
        <div className="flex items-center justify-center py-8 text-purple-600">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </OrderDrawerSection>
    );
  }

  const zero = (n: number) => (breakdown.isZeroed ? 0 : n);

  return (
    <OrderDrawerSection title="Detalhamento Financeiro" icon={CreditCard}>
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-green-700 mb-3 border-b-2 border-green-100 pb-2 flex items-center">
            <DollarSign className="w-4 h-4 mr-2" />
            Receitas (Entradas)
          </h4>
          <FinancialDetailRow
            icon={ShoppingCart}
            label="Valor Bruto dos Itens"
            value={zero(breakdown.valorBrutoItens)}
            isNegative={false}
          />
          {zero(breakdown.freteRecebidoLiquido) > 0 ? (
            <FinancialDetailRow
              icon={Truck}
              label="Frete Recebido (Líquido)"
              value={zero(breakdown.freteRecebidoLiquido)}
              isNegative={false}
            />
          ) : null}
        </div>

        <Separator className="bg-gray-100" />

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-orange-700 mb-3 border-b-2 border-orange-100 pb-2 flex items-center">
            <MinusCircle className="w-4 h-4 mr-2" />
            Custos e Despesas (Saídas)
          </h4>
          {zero(breakdown.freteCusto) > 0 ? (
            <FinancialDetailRow icon={Truck} label="Valor Pago Frete" value={zero(breakdown.freteCusto)} isNegative />
          ) : null}
          <FinancialDetailRow icon={Percent} label="Comissão do Marketplace" value={zero(breakdown.comissaoMarketplace)} isNegative />
          <FinancialDetailRow
            icon={Receipt}
            label="Impostos e Taxas Fiscais"
            value={zero(breakdown.impostosCalculados)}
            isNegative
            percent={breakdown.impostosPercentual || taxRatePct}
          />
          <FinancialDetailRow icon={Wallet} label="Custo dos Produtos (CMV)" value={zero(breakdown.custoProdutos)} isNegative />
          {zero(breakdown.custosExtras) > 0 ? (
            <FinancialDetailRow icon={Zap} label="Custos Extras" value={zero(breakdown.custosExtras)} isNegative />
          ) : null}
          {zero(breakdown.cupomFixo) > 0 ? (
            <FinancialDetailRow icon={Ticket} label="Desconto / Cupom" value={zero(breakdown.cupomFixo)} isNegative />
          ) : null}
        </div>

        <Separator className="bg-gray-100" />

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-wider text-purple-700 mb-3 border-b-2 border-purple-100 pb-2 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2" />
            Resultados Finais
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-purple-50 rounded-3xl p-4 border-2 border-purple-200/60 text-center">
              <span className="text-purple-800 font-semibold flex items-center justify-center text-sm uppercase">
                <CreditCard className="w-5 h-5 mr-2 text-purple-600" />
                Lucro estimado
              </span>
              <p className="mt-2 text-purple-800 font-extrabold text-2xl">
                {formatCurrency(breakdown.isZeroed ? 0 : breakdown.lucroPedido)}
              </p>
            </div>
            <div className={`rounded-3xl p-4 border-2 text-center ${breakdown.mcPercent < 0 ? "bg-red-50 border-red-200/60" : "bg-purple-50 border-purple-200/60"}`}>
              <span className={`font-semibold flex items-center justify-center text-sm uppercase ${breakdown.mcPercent < 0 ? "text-red-800" : "text-purple-800"}`}>
                <TrendingUp className={`w-5 h-5 mr-2 ${breakdown.mcPercent < 0 ? "text-red-600" : "text-purple-600"}`} />
                Margem
              </span>
              <p className={`mt-2 font-extrabold text-2xl ${breakdown.mcPercent < 0 ? "text-red-800" : "text-purple-800"}`}>
                {breakdown.mcPercent.toFixed(1)}%
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            Líquido operacional: {formatCurrency(breakdown.isZeroed ? 0 : breakdown.valorLiquidoReceber)}
          </p>
        </div>
      </div>
    </OrderDrawerSection>
  );
}
