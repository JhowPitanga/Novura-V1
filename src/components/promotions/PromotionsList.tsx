import { PromotionRow } from "./PromotionRow";
import type { Promotion } from "@/types/promotions";
import { Megaphone } from "lucide-react";

interface PromotionsListProps {
  promotions: Promotion[];
  onView: (p: Promotion) => void;
  onEdit: (p: Promotion) => void;
  onAddItems: (p: Promotion) => void;
  onDelete: (p: Promotion) => void;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Card-based promotion list (reference layout — no marketplace channel column).
 */
export function PromotionsList({
  promotions,
  onView,
  onEdit,
  onAddItems,
  onDelete,
  canEdit,
  canDelete,
}: PromotionsListProps) {
  if (promotions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
        <div className="p-4 bg-gray-100 rounded-full mb-4">
          <Megaphone className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">Nenhuma promoção encontrada</p>
        <p className="text-sm text-gray-400 mt-1 max-w-md px-4">
          Ajuste a pesquisa, selecione outro tipo acima ou sincronize para trazer as campanhas do marketplace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden lg:grid lg:grid-cols-12 gap-2 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <div className="lg:col-span-3">Nome</div>
        <div className="lg:col-span-1">Desconto</div>
        <div className="lg:col-span-2">Tipo</div>
        <div className="lg:col-span-2">Subsídio</div>
        <div className="lg:col-span-2">Vigência</div>
        <div className="lg:col-span-1 text-center">Status</div>
        <div className="lg:col-span-1 text-right pr-2" aria-hidden>
          {" "}
        </div>
      </div>

      <div className="space-y-2">
        {promotions.map(p => (
          <PromotionRow
            key={p.id}
            promotion={p}
            onView={onView}
            onEdit={onEdit}
            onAddItems={onAddItems}
            onDelete={onDelete}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        ))}
      </div>
    </div>
  );
}
