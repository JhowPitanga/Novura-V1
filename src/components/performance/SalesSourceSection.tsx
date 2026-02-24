import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const piePalette = ["#8b5cf6", "#a78bfa", "#c4b5fd", "#7c3aed", "#6d28d9", "#4c1d95"];

interface SalesSource {
    name: string;
    value: number;
}

interface SalesSourceSectionProps {
    salesSources: SalesSource[];
}

export function SalesSourceSection({ salesSources }: SalesSourceSectionProps) {
    const totalSources = salesSources.reduce((acc, s) => acc + s.value, 0);
    const zeroPie = totalSources === 0;
    const pieData = salesSources.length ? salesSources : [{ name: "Sem dados", value: 1 }];
    const pieConfig = Object.fromEntries(
        pieData.map((entry, index) => [
            entry.name,
            { label: entry.name, color: piePalette[index % piePalette.length] },
        ])
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Fonte de vendas</CardTitle>
                <CardDescription>Percentual por marketplace/aplicativo</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    <div className="space-y-3">
                        {salesSources.length === 0 ? (
                            <div className="p-4 border rounded-lg text-sm text-gray-600">
                                Sem dados de marketplace para o período selecionado.
                            </div>
                        ) : (
                            salesSources.map((s) => (
                                <TooltipProvider key={s.name}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                                <div className="flex items-center space-x-2">
                                                    <Badge variant="outline">{s.name}</Badge>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-semibold">
                                                        R$ {s.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {zeroPie ? 0 : Math.round((s.value / totalSources) * 100)}%
                                                    </p>
                                                </div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>Vendas totais do marketplace no período</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ))
                        )}
                    </div>
                    <ChartContainer config={pieConfig} className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Pie dataKey="value" data={pieData} innerRadius={60} outerRadius={90}>
                                    {pieData.map((_, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={zeroPie ? "#E9D5FF" : piePalette[index % piePalette.length]}
                                        />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                </div>
            </CardContent>
        </Card>
    );
}
