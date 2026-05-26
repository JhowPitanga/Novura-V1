import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AbcBadge } from "@/components/performance/AbcBadge";
import type { AbcCriterion, AbcTag } from "@/services/performance.service";

interface AbcCurveSectionProps {
    rows: Array<{
        tag: AbcTag;
        pct: number;
        valor: number;
        unidades: number;
    }>;
    isLoading: boolean;
    criterion: AbcCriterion;
    onCriterionChange: (c: AbcCriterion) => void;
    selectedTag: AbcTag | null;
    onSelectedTagChange: (tag: AbcTag | null) => void;
    subjectLabel: string;
}

const ABC_TAGS: AbcTag[] = ["A", "B", "C"];

const fmtBRL = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AbcCurveSection({
    rows,
    isLoading,
    criterion,
    onCriterionChange,
    selectedTag,
    onSelectedTagChange,
    subjectLabel,
}: AbcCurveSectionProps) {
    const summaries = ABC_TAGS.map((tag) => {
        const tagRows = rows.filter((row) => row.tag === tag);
        return {
            tag,
            count: tagRows.length,
            pct: tagRows.reduce((sum, row) => sum + row.pct, 0),
            valor: tagRows.reduce((sum, row) => sum + row.valor, 0),
            unidades: tagRows.reduce((sum, row) => sum + row.unidades, 0),
        };
    });

    return (
        <Card className="border-violet-100 shadow-sm">
            <CardContent className="p-5">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-stretch xl:justify-between">
                    <div className="flex-1">
                        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-violet-700">Composição ABC</p>
                                <p className="text-xs text-gray-500">
                                    Clique em A, B ou C para filtrar os {subjectLabel} abaixo.
                                </p>
                            </div>
                            {selectedTag && (
                                <button
                                    type="button"
                                    onClick={() => onSelectedTagChange(null)}
                                    className="w-fit text-xs font-medium text-violet-600 hover:text-violet-800"
                                >
                                    Limpar filtro
                                </button>
                            )}
                        </div>

                        {isLoading ? (
                            <div className="grid gap-3 md:grid-cols-3">
                                {ABC_TAGS.map((tag) => (
                                    <Skeleton key={tag} className="h-28 rounded-2xl" />
                                ))}
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-violet-100 bg-violet-50/40 px-4 py-8 text-center text-sm text-gray-500">
                                Sem dados no período selecionado.
                            </div>
                        ) : (
                            <div className="grid gap-3 md:grid-cols-3">
                                {summaries.map((summary) => {
                                    const active = selectedTag === summary.tag;
                                    return (
                                        <button
                                            key={summary.tag}
                                            type="button"
                                            onClick={() => onSelectedTagChange(active ? null : summary.tag)}
                                            className={`rounded-2xl border p-4 text-left transition-all ${
                                                active
                                                    ? "border-violet-500 bg-violet-50 shadow-sm ring-2 ring-violet-100"
                                                    : "border-gray-100 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <AbcBadge tag={summary.tag} size="md" />
                                                    <div>
                                                        <p className="text-sm font-semibold text-gray-900">
                                                            Curva {summary.tag}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {summary.count} {summary.count === 1 ? "item" : "itens"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                                                    {summary.pct.toFixed(1)}%
                                                </span>
                                            </div>

                                            <div className="mt-4 space-y-2">
                                                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                                    <div
                                                        className="h-full rounded-full bg-violet-600"
                                                        style={{ width: `${Math.min(summary.pct, 100)}%` }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-gray-500">
                                                        {criterion === "valor" ? "Faturamento" : "Unidades"}
                                                    </span>
                                                    <span className="font-semibold text-gray-900">
                                                        {criterion === "valor"
                                                            ? fmtBRL(summary.valor)
                                                            : `${summary.unidades.toLocaleString("pt-BR")} un.`}
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="xl:w-[220px] rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                        <p className="text-sm font-semibold text-gray-900">Critério ABC</p>
                        <p className="mt-1 text-xs text-gray-500">Alterna a composição e a ordenação da lista.</p>
                        <div className="mt-4 inline-flex w-full rounded-xl border border-violet-100 bg-white p-1 shadow-sm">
                            {(["valor", "unidades"] as AbcCriterion[]).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => onCriterionChange(c)}
                                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                                        criterion === c
                                            ? "bg-violet-600 text-white shadow-sm"
                                            : "text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                                    }`}
                                >
                                    {c === "valor" ? "Por R$" : "Unidades"}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
