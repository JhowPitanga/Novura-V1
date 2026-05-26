import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrazilSalesMap } from "@/components/performance/BrazilSalesMap";
import type { StateSale } from "@/services/performance.service";

interface StatesRankingTableProps {
    data: StateSale[];
    isLoading: boolean;
}

export function StatesRankingTable({ data, isLoading }: StatesRankingTableProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Vendas por Estado</CardTitle>
                <CardDescription>Distribuição geográfica no período</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Skeleton className="h-[360px]" />
                        <div className="space-y-2">
                            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
                        </div>
                    </div>
                ) : data.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">Sem dados de estado no período selecionado.</p>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* Tile map */}
                        <div className="flex items-center justify-center pt-2">
                            <BrazilSalesMap data={data} />
                        </div>

                        {/* Ranking table */}
                        <div className="overflow-y-auto max-h-[380px] space-y-1 pr-1">
                            {data.map((row, idx) => (
                                <div
                                    key={row.uf}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <span className="w-5 text-xs text-gray-400 font-medium shrink-0">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                                                {row.uf}
                                            </span>
                                            <span className="text-sm text-gray-700 truncate">{row.state_name}</span>
                                        </div>
                                        <div className="mt-1 h-1.5 bg-gray-100 rounded-full">
                                            <div
                                                className="h-full bg-violet-500 rounded-full transition-all"
                                                style={{ width: `${Math.min(row.pct_total, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-sm font-semibold text-gray-900">
                                            R$ {row.total.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-xs text-gray-400">{row.pct_total.toFixed(1)}% · {row.pedidos} ped.</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
