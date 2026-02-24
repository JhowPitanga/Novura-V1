import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

const metricColors: Record<string, string> = {
    vendas: "#7c3aed",
    unidades: "#a78bfa",
    pedidos: "#c4b5fd",
    ticketMedio: "#6d28d9",
};

interface SalesChartProps {
    series: any[];
    selectedMetrics: string[];
    isSingleDay: boolean;
}

export function SalesChart({ series, selectedMetrics, isSingleDay }: SalesChartProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Trajetória de Desempenho</CardTitle>
                <CardDescription>
                    {isSingleDay ? "Hoje (00:00 - 23:59)" : "Período selecionado"}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer
                    config={{
                        vendas: { label: "Vendas", color: metricColors.vendas },
                        unidades: { label: "Unidades", color: metricColors.unidades },
                        pedidos: { label: "Pedidos", color: metricColors.pedidos },
                        ticketMedio: { label: "Ticket Médio", color: metricColors.ticketMedio },
                    }}
                    className="h-[380px] w-full"
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" />
                            <YAxis />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            {selectedMetrics.map((metric) => (
                                <Line
                                    key={metric}
                                    type="monotone"
                                    dataKey={metric}
                                    stroke={metricColors[metric]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </ChartContainer>
            </CardContent>
        </Card>
    );
}
