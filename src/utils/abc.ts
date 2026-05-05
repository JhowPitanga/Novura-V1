import type { AbcTag } from "@/services/performance.service";

export interface AbcInput {
    id: string;
    label: string;
    valor: number;
    unidades: number;
}

export interface AbcResult extends AbcInput {
    pct: number;
    cum_pct: number;
    tag: AbcTag;
}

/**
 * Classifies a list of items using ABC Pareto (80/15/5) curve.
 * Items with fewer than 5 entries are returned without tags (tag stays null-like).
 */
export function computeAbc(
    items: AbcInput[],
    criterion: 'valor' | 'unidades' = 'valor',
): AbcResult[] {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) =>
        criterion === 'valor' ? b.valor - a.valor : b.unidades - a.unidades,
    );

    const grandTotal = sorted.reduce(
        (sum, it) => sum + (criterion === 'valor' ? it.valor : it.unidades),
        0,
    );

    if (grandTotal === 0) {
        return sorted.map((it) => ({ ...it, pct: 0, cum_pct: 0, tag: 'C' as AbcTag }));
    }

    let cum = 0;
    return sorted.map((it) => {
        const raw = criterion === 'valor' ? it.valor : it.unidades;
        const pct = parseFloat(((raw / grandTotal) * 100).toFixed(2));
        const prior = cum;
        cum += pct;
        const tag: AbcTag = prior < 80 ? 'A' : prior < 95 ? 'B' : 'C';
        return { ...it, pct, cum_pct: parseFloat(cum.toFixed(2)), tag };
    });
}

/** Returns color classes for an ABC tag. */
export function abcTagClasses(tag: AbcTag): string {
    const map: Record<AbcTag, string> = {
        A: 'bg-emerald-500 text-white border-emerald-600',
        B: 'bg-amber-500 text-white border-amber-600',
        C: 'bg-rose-500 text-white border-rose-600',
    };
    return map[tag];
}

/** Returns only items with at most the given cumulative percentage. */
export function filterAbcByTag(items: AbcResult[], tags: AbcTag[]): AbcResult[] {
    return items.filter((it) => tags.includes(it.tag));
}
