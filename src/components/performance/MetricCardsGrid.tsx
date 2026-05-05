import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDownRight, ArrowUpRight, BarChart2, Info, Package, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import type { ReactNode } from "react";

export interface MetricTotals {
    vendas: number;
    unidades: number;
    pedidos: number;
    ticketMedio: number;
    receitaLiquida?: number | null;
    margem_pct?: number | null;
}

interface MetricCardsGridProps {
    totals: MetricTotals;
    growth?: Partial<Record<keyof MetricTotals, number | null>>;
    selectedMetrics: string[];
    onToggle: (metric: string) => void;
}

const fmtBRL = (v: number) =>
    `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (v: number) => v.toLocaleString("pt-BR");
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

function MetricCard({
    label,
    value,
    hint,
    Icon,
    iconClass,
    activeColor,
    active,
    onClick,
    accent,
    children,
    growth,
}: {
    label: string;
    value: string;
    hint?: string;
    Icon: any;
    iconClass: string;
    activeColor: string;
    active?: boolean;
    onClick?: () => void;
    accent?: string;
    children?: ReactNode;
    growth?: number | null;
}) {
    const ringStyle = active ? { boxShadow: `0 0 0 2px ${activeColor}` } : undefined;
    return (
        <Card
            onClick={onClick}
            className={`relative overflow-hidden transition-all ${onClick ? "cursor-pointer hover:shadow-md" : ""} ${active ? "ring-2" : ""}`}
            style={ringStyle}
        >
            {active && (
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: activeColor }} />
            )}
            {accent && !active && (
                <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ backgroundColor: accent }} />
            )}
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-500 leading-tight">{label}</span>
                        {hint && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info className="h-3 w-3 text-gray-400 cursor-help flex-shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                    <Icon className={`h-4 w-4 flex-shrink-0 ${iconClass}`} />
                </div>
                <div className="text-2xl font-bold tracking-tight text-gray-900">{value}</div>
                <GrowthBadge value={growth} />
                {children}
            </CardContent>
        </Card>
    );
}

function GrowthBadge({ value }: { value?: number | null }) {
    if (value == null || !Number.isFinite(value)) return null;
    const isUp = value > 0;
    const isDown = value < 0;
    const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : BarChart2;
    const classes = isUp
        ? "bg-emerald-50 text-emerald-700"
        : isDown
            ? "bg-rose-50 text-rose-700"
            : "bg-gray-50 text-gray-500";
    return (
        <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>
            <Icon className="h-3 w-3" />
            {isUp ? "+" : ""}{value.toFixed(1)}%
        </span>
    );
}

export function MetricCardsGrid({ totals, growth = {}, selectedMetrics, onToggle }: MetricCardsGridProps) {
    const hasLiquida = totals.receitaLiquida != null;
    const hasMargem = totals.margem_pct != null;

    const isAboveGMV = hasLiquida && totals.receitaLiquida! > totals.vendas;
    const liquidaValue = hasLiquida
        ? fmtBRL(Math.min(totals.receitaLiquida!, totals.vendas))
        : "—";

    return (
        <TooltipProvider>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">

                {/* GMV */}
                <MetricCard
                    label="Venda Bruta (GMV)"
                    value={fmtBRL(totals.vendas)}
                    hint="Faturamento bruto total no período, antes de qualquer desconto ou taxa."
                    Icon={TrendingUp}
                    iconClass="text-violet-600"
                    activeColor="#7c3aed"
                    active={selectedMetrics.includes("vendas")}
                    onClick={() => onToggle("vendas")}
                    growth={growth.vendas}
                />

                {/* Pedidos + Unidades */}
                <Card
                    onClick={() => onToggle("pedidos")}
                    className={`relative overflow-hidden cursor-pointer hover:shadow-md transition-all ${selectedMetrics.includes("pedidos") ? "ring-2 ring-cyan-400" : ""}`}
                >
                    {selectedMetrics.includes("pedidos") && (
                        <div className="absolute top-0 left-0 right-0 h-[3px] bg-cyan-400" />
                    )}
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500">Pedidos & Unidades</span>
                            <ShoppingCart className="h-4 w-4 text-cyan-500" />
                        </div>
                        <div className="flex items-end gap-3">
                            <div>
                                <div className="text-2xl font-bold tracking-tight text-gray-900">
                                    {fmtNum(totals.pedidos)}
                                </div>
                                <p className="text-xs text-gray-400">pedidos</p>
                            </div>
                            <div className="h-8 w-px bg-gray-200" />
                            <div
                                onClick={(e) => { e.stopPropagation(); onToggle("unidades"); }}
                                className={`cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-violet-100 hover:text-violet-700 ${selectedMetrics.includes("unidades") ? "bg-violet-100 text-violet-700" : "hover:bg-violet-50"}`}
                                title="Clique para alternar unidades no gráfico"
                            >
                                <div className="text-xl font-bold tracking-tight">
                                    {fmtNum(totals.unidades)}
                                </div>
                                <p className="text-xs text-current opacity-60">unidades</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <GrowthBadge value={growth.pedidos} />
                            <GrowthBadge value={growth.unidades} />
                        </div>
                        {totals.pedidos > 0 && totals.unidades > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                                {(totals.unidades / totals.pedidos).toFixed(1)} itens/pedido
                            </p>
                        )}
                    </CardContent>
                </Card>

                {/* Ticket Médio */}
                <MetricCard
                    label="Ticket Médio"
                    value={fmtBRL(totals.ticketMedio)}
                    hint="Valor médio gasto por pedido no período."
                    Icon={BarChart2}
                    iconClass="text-orange-500"
                    activeColor="#f97316"
                    active={selectedMetrics.includes("ticketMedio")}
                    onClick={() => onToggle("ticketMedio")}
                    growth={growth.ticketMedio}
                />

                {/* Receita Líquida */}
                <MetricCard
                    label="Receita Líquida"
                    value={isAboveGMV ? fmtBRL(totals.vendas) : liquidaValue}
                    hint="O que sobra após deduzir taxas de marketplace, frete e impostos estimados."
                    Icon={Wallet}
                    iconClass="text-emerald-600"
                    activeColor="#059669"
                    accent="#059669"
                    active={false}
                    growth={growth.receitaLiquida}
                >
                    {hasLiquida && totals.vendas > 0 && (
                        <p className="text-xs text-emerald-600 mt-1">
                            {fmtPct((Math.min(totals.receitaLiquida!, totals.vendas) / totals.vendas) * 100)} do GMV
                        </p>
                    )}
                    {!hasLiquida && (
                        <p className="text-xs text-gray-400 mt-1">Configure taxas para calcular</p>
                    )}
                </MetricCard>

                {/* Margem de Contribuição */}
                <MetricCard
                    label="Margem de Contribuição"
                    value={hasMargem ? fmtPct(totals.margem_pct!) : "—"}
                    hint="Percentual médio de lucro que sobra de cada venda após deduzir os custos variáveis (custo do produto)."
                    Icon={Package}
                    iconClass={hasMargem ? (totals.margem_pct! >= 0 ? "text-pink-500" : "text-rose-500") : "text-gray-300"}
                    activeColor="#ec4899"
                    accent={hasMargem ? (totals.margem_pct! >= 0 ? "#ec4899" : "#f43f5e") : undefined}
                    active={false}
                    growth={growth.margem_pct}
                >
                    {!hasMargem && (
                        <p className="text-xs text-gray-400 mt-1">Cadastre custo dos produtos</p>
                    )}
                    {hasMargem && (
                        <p className={`text-xs mt-1 ${totals.margem_pct! >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {totals.margem_pct! >= 0 ? "Positiva" : "Negativa"}
                        </p>
                    )}
                </MetricCard>

            </div>
        </TooltipProvider>
    );
}
