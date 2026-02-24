import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package } from "lucide-react";

interface MetricTotals {
    vendas: number;
    unidades: number;
    pedidos: number;
    ticketMedio: number;
}

interface MetricCardsGridProps {
    totals: MetricTotals;
    selectedMetrics: string[];
    onToggle: (metric: string) => void;
}

const metricConfig = [
    {
        key: "vendas",
        label: "Vendas",
        Icon: DollarSign,
        iconClass: "text-violet-600",
        ringClass: "ring-[#7c3aed]",
        barColor: "#7c3aed",
        format: (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
    {
        key: "unidades",
        label: "Unidades Vendidas",
        Icon: Package,
        iconClass: "text-violet-500",
        ringClass: "ring-[#a78bfa]",
        barColor: "#a78bfa",
        format: (v: number) => `${v}`,
    },
    {
        key: "pedidos",
        label: "Pedidos",
        Icon: Package,
        iconClass: "text-violet-400",
        ringClass: "ring-[#c4b5fd]",
        barColor: "#c4b5fd",
        format: (v: number) => `${v}`,
    },
    {
        key: "ticketMedio",
        label: "Ticket Médio",
        Icon: DollarSign,
        iconClass: "text-violet-700",
        ringClass: "ring-[#6d28d9]",
        barColor: "#6d28d9",
        format: (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    },
] as const;

export function MetricCardsGrid({ totals, selectedMetrics, onToggle }: MetricCardsGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {metricConfig.map(({ key, label, Icon, iconClass, ringClass, barColor, format }) => {
                const active = selectedMetrics.includes(key);
                return (
                    <Card
                        key={key}
                        onClick={() => onToggle(key)}
                        className={`cursor-pointer ${active ? `ring-2 ${ringClass}` : ""}`}
                    >
                        {active && <div className="h-1 w-full" style={{ backgroundColor: barColor }} />}
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">{label}</CardTitle>
                            <Icon className={`h-4 w-4 ${iconClass}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {format(totals[key])}
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
