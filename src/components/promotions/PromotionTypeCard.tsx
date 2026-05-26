import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export interface PromotionTypeCardProps {
  eyebrow: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  count: number;
  candidateCount?: number;
  selected: boolean;
  onClick: () => void;
  headerAction?: ReactNode;
  /** Hide card when empty (e.g. optional Shopee slots) */
  hideIfEmpty?: boolean;
}

/**
 * Compact category card — no status micro-filters (Todas / Ativas / …).
 * Reference: marketplace hub small campaign tiles.
 */
export function PromotionTypeCard({
  eyebrow,
  label,
  description,
  icon: Icon,
  count,
  candidateCount = 0,
  selected,
  onClick,
  headerAction,
  hideIfEmpty = false,
}: PromotionTypeCardProps) {
  if (hideIfEmpty && count === 0 && candidateCount === 0) return null;

  const footerParts: string[] = [];
  if (count > 0) footerParts.push(`${count} ${count === 1 ? "promoção" : "promoções"}`);
  if (candidateCount > 0) {
    footerParts.push(`${candidateCount} ${candidateCount === 1 ? "convite" : "convites"}`);
  }
  const footer = footerParts.length > 0 ? footerParts.join(" · ") : "Nenhuma ainda";

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onClick}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && onClick()}
      className={`cursor-pointer transition-all duration-200 select-none focus:outline-none focus:ring-2 focus:ring-violet-500 min-h-[7.5rem] ${
        selected
          ? "border-violet-500 ring-2 ring-violet-200 shadow-md bg-violet-50/40"
          : "border-gray-200 hover:border-violet-300 hover:shadow-sm bg-white"
      }`}
    >
      <CardContent className="p-3 pt-3 flex flex-col h-full gap-1.5">
        <div className="flex items-start justify-between gap-1 min-h-[1.25rem]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 leading-tight line-clamp-2">
            {eyebrow}
          </p>
          {headerAction && (
            <div className="shrink-0 -mt-0.5 -mr-0.5" onClick={e => e.stopPropagation()}>
              {headerAction}
            </div>
          )}
        </div>
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div
            className={`p-1.5 rounded-md shrink-0 ${selected ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-600"}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{label}</p>
            {description && (
              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{description}</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-auto pt-1 border-t border-gray-100">{footer}</p>
      </CardContent>
    </Card>
  );
}
