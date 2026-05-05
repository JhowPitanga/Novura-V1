import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { LogisticBreakdown } from "@/hooks/useOrdersMetrics";

const MKT_COLORS: Record<string, string> = {
    "shopee":        "#ee4d2d",
    "mercadolivre":  "#ffe600",
    "mercado livre": "#ffe600",
    "mercado_livre": "#ffe600",
    "amazon":        "#ff9900",
    "magalu":        "#0068ff",
    "magazine luiza":"#0068ff",
    "outros":        "#a78bfa",
};

function getMktColor(name: string, idx: number): string {
    const key = name.toLowerCase().replace(/[\s_-]/g, "");
    // Try partial match
    for (const [k, v] of Object.entries(MKT_COLORS)) {
        if (key.includes(k.replace(/[\s_-]/g, ""))) return v;
    }
    const palette = ["#7c3aed", "#a78bfa", "#f97316", "#06b6d4", "#10b981", "#f43f5e"];
    return palette[idx % palette.length];
}

// Friendly labels for logistic_type values
const LOGISTIC_LABELS: Record<string, string> = {
    "fulfillment":      "Fulfillment",
    "self_service":     "Envio próprio",
    "me1":              "ME1 — Envio próprio",
    "me2":              "ME2 — Full",
    "flex":             "Flex",
    "coleta":           "Coleta",
    "xd_drop_off":      "Drop-off",
    "não informado":    "Não informado",
};

function fmtLogistic(raw: string): string {
    const key = raw.toLowerCase();
    return LOGISTIC_LABELS[key] ?? raw;
}

interface SalesSource {
    name: string;
    storeName?: string;
    value: number;
}

interface SalesSourceSectionProps {
    salesSources: SalesSource[];
    byLogistic?: LogisticBreakdown[];
}

export function SalesSourceSection({ salesSources, byLogistic = [] }: SalesSourceSectionProps) {
    const total = salesSources.reduce((s, x) => s + x.value, 0);
    const sorted = [...salesSources].sort((a, b) => b.value - a.value);
    const maxValue = sorted[0]?.value ?? 1;

    // Group logistics by marketplace
    const logisticsByMkt: Record<string, LogisticBreakdown[]> = {};
    byLogistic.forEach((l) => {
        const key = l.marketplace;
        if (!logisticsByMkt[key]) logisticsByMkt[key] = [];
        logisticsByMkt[key].push(l);
    });
    // Keep only marketplaces that appear in salesSources
    const mktKeys = sorted.map((s) => s.name);

    const hasLogistics = byLogistic.length > 0;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Canal de Venda</CardTitle>
                    <CardDescription>Composição de faturamento por marketplace</CardDescription>
                </CardHeader>
                <CardContent>
                        {sorted.length === 0 ? (
                            <p className="text-sm text-gray-400">Sem dados para o período selecionado.</p>
                        ) : (
                            <div className="space-y-3">
                                {sorted.map((s, idx) => {
                                    const pct = total > 0 ? (s.value / total) * 100 : 0;
                                    const barWidth = maxValue > 0 ? (s.value / maxValue) * 100 : 0;
                                    const color = getMktColor(s.name, idx);
                                    return (
                                        <div key={s.name} className="space-y-1">
                                            <div className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    <span className="font-medium text-gray-700">
                                                        {s.name}
                                                        {s.storeName ? (
                                                            <span className="text-gray-400 font-normal"> - {s.storeName}</span>
                                                        ) : null}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-right">
                                                    <span className="text-xs text-gray-400 w-10 text-right">
                                                        {pct.toFixed(1)}%
                                                    </span>
                                                    <span className="text-xs font-semibold text-gray-700 w-[100px] text-right">
                                                        R$ {s.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${barWidth}%`, backgroundColor: color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                                {total > 0 && (
                                    <div className="pt-1 text-xs text-gray-400 text-right">
                                        Total: R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                    </div>
                                )}
                            </div>
                        )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle>Logísticas por Canal</CardTitle>
                    <CardDescription>Tipos de envio mais usados por marketplace</CardDescription>
                </CardHeader>
                <CardContent>
                    {hasLogistics ? (
                        <Accordion type="single" collapsible className="space-y-3">
                                {mktKeys.map((mkt, mktIdx) => {
                                    const logs = (logisticsByMkt[mkt] || [])
                                        .slice()
                                        .sort((a, b) => b.count - a.count)
                                        .slice(0, 4);
                                    if (logs.length === 0) return null;
                                    const mktTotal = logs.reduce((s, l) => s + l.count, 0);
                                    const color = getMktColor(mkt, mktIdx);
                                    return (
                                        <AccordionItem
                                            key={mkt}
                                            value={mkt}
                                            className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/90 to-white px-4 shadow-sm overflow-hidden"
                                        >
                                            <AccordionTrigger className="py-3 hover:no-underline text-left text-violet-700">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />
                                                    <span className="text-sm font-semibold">
                                                        {mkt}
                                                        {(() => {
                                                            const source = sorted.find((s) => s.name === mkt);
                                                            return source?.storeName
                                                                ? <span className="text-gray-400 font-normal"> - {source.storeName}</span>
                                                                : null;
                                                        })()}
                                                    </span>
                                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-600">
                                                        {logs.length} logística(s)
                                                    </span>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-3 pt-0">
                                            <div className="space-y-2">
                                                {logs.map((l) => {
                                                    const pct = mktTotal > 0 ? (l.count / mktTotal) * 100 : 0;
                                                    return (
                                                        <div key={l.logistic_type} className="flex items-center gap-2 rounded-xl bg-white/80 p-2">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between text-xs mb-0.5">
                                                                    <span className="text-gray-700 truncate font-medium">
                                                                        {fmtLogistic(l.logistic_type)}
                                                                    </span>
                                                                    <span className="text-violet-500 ml-2 flex-shrink-0 font-semibold">
                                                                        {pct.toFixed(0)}%
                                                                    </span>
                                                                </div>
                                                                <div className="h-2 rounded-full bg-violet-100 overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded-full"
                                                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                                                    />
                                                                </div>
                                                            </div>
                                                            <span className="text-xs text-violet-500 w-10 text-right flex-shrink-0 font-semibold">
                                                                {l.count}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                        </Accordion>
                    ) : (
                        <p className="text-sm text-gray-400">Sem dados logísticos no período selecionado.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
