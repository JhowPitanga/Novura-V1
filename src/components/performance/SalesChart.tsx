import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";

const METRIC_CONFIG: Record<string, { label: string; color: string; format: (v: number) => string }> = {
    vendas:     { label: "Vendas",      color: "#7c3aed", format: (v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
    pedidos:    { label: "Pedidos",     color: "#06b6d4", format: (v) => String(v) },
    unidades:   { label: "Unidades",    color: "#2563eb", format: (v) => String(v) },
    ticketMedio:{ label: "Ticket",      color: "#f97316", format: (v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` },
};

interface SalesChartProps {
    series: any[];
    selectedMetrics: string[];
    onToggle: (metric: string) => void;
    isSingleDay: boolean;
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[140px]">
            <p className="font-semibold text-gray-700 mb-2">{label}</p>
            {payload.map((entry: any) => {
                const cfg = METRIC_CONFIG[entry.dataKey];
                return (
                    <div key={entry.dataKey} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.stroke }} />
                            <span className="text-gray-500">{cfg?.label ?? entry.dataKey}</span>
                        </div>
                        <span className="font-medium text-gray-800">
                            {cfg ? cfg.format(Number(entry.value)) : entry.value}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function SalesChart({ series, selectedMetrics, onToggle, isSingleDay }: SalesChartProps) {
    const allMetrics = Object.keys(METRIC_CONFIG);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    {/* Metric toggle chips */}
                    <div className="flex flex-wrap gap-2">
                        {allMetrics.map((metric) => {
                            const cfg = METRIC_CONFIG[metric];
                            const active = selectedMetrics.includes(metric);
                            return (
                                <button
                                    key={metric}
                                    onClick={() => onToggle(metric)}
                                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                        active
                                            ? "text-white border-transparent shadow-sm"
                                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700"
                                    }`}
                                    style={active ? { backgroundColor: cfg.color, borderColor: cfg.color } : undefined}
                                >
                                    <span
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: active ? "rgba(255,255,255,0.7)" : cfg.color }}
                                    />
                                    {cfg.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                    {isSingleDay ? "Hoje — por hora" : "Período selecionado — por dia"}
                    {series.length > 0 && ` · ${series.length} pontos`}
                </p>
            </CardHeader>
            <CardContent className="p-0 pb-4 px-4">
                {selectedMetrics.length === 0 ? (
                    <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">
                        Selecione uma métrica acima para visualizar o gráfico.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: "#9ca3af" }}
                                tickLine={false}
                                axisLine={false}
                                interval="preserveStartEnd"
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: "#9ca3af" }}
                                tickLine={false}
                                axisLine={false}
                                width={55}
                                tickFormatter={(v) => {
                                    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                                    return String(v);
                                }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            {selectedMetrics.map((metric) => (
                                <Line
                                    key={metric}
                                    type="monotone"
                                    dataKey={metric}
                                    stroke={METRIC_CONFIG[metric]?.color ?? "#7c3aed"}
                                    strokeWidth={2}
                                    dot={{ r: 3, strokeWidth: 0, fill: METRIC_CONFIG[metric]?.color ?? "#7c3aed" }}
                                    activeDot={{ r: 5 }}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
