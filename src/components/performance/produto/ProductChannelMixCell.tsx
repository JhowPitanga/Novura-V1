import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProductChannelMix } from "@/services/performance.service";

const MKT_COLORS: Record<string, string> = {
    "Mercado Livre": "#FFE600",
    "mercadolivre": "#FFE600",
    "Shopee": "#EE4D2D",
    "shopee": "#EE4D2D",
    "Amazon": "#FF9900",
    "amazon": "#FF9900",
};

function getColor(marketplace: string, idx: number): string {
    const fallbacks = ["#7C3AED", "#A78BFA", "#C4B5FD", "#6D28D9", "#4C1D95"];
    return MKT_COLORS[marketplace] ?? fallbacks[idx % fallbacks.length];
}

interface ProductChannelMixCellProps {
    mixes: ProductChannelMix[];
}

export function ProductChannelMixCell({ mixes }: ProductChannelMixCellProps) {
    if (!mixes || mixes.length === 0) {
        return <span className="text-xs text-gray-300">—</span>;
    }

    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex h-5 w-[100px] rounded overflow-hidden cursor-default">
                        {mixes.map((m, idx) => (
                            <div
                                key={m.marketplace}
                                style={{
                                    width: `${m.pct_within_product}%`,
                                    backgroundColor: getColor(m.marketplace, idx),
                                    minWidth: m.pct_within_product > 0 ? "2px" : 0,
                                }}
                            />
                        ))}
                    </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs space-y-0.5 min-w-[140px]">
                    {mixes.map((m) => (
                        <div key={m.marketplace} className="flex justify-between gap-4">
                            <span>{m.marketplace}</span>
                            <span className="font-medium">{m.pct_within_product.toFixed(1)}%</span>
                        </div>
                    ))}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
