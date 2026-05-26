import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  MoreHorizontal,
  ExternalLink,
  PackagePlus,
  Pencil,
  Trash2,
  Zap,
  Tag,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PromotionStatusBadge } from "./PromotionStatusBadge";
import type { Promotion } from "@/types/promotions";
import { getMlKindLabel } from "@/types/promotions";
import { displayNameFromMarketplaceKey } from "@/utils/marketplaceUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ML_AUTO_KINDS = new Set<string>(["SMART", "PRICE_MATCHING", "PRICE_MATCHING_MELI_ALL"]);

function formatVigencia(start: string | null, end: string | null): string {
  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "—";
    }
  };
  if (!start && !end) return "—";
  return `${fmt(start)} até ${fmt(end)}`;
}

const PROMOTION_TYPE_LABEL: Record<string, string> = {
  STANDARD_DISCOUNT: "Desconto na loja",
  FLASH_SALE: "Oferta relâmpago",
};

function promoTypeLabel(promotion: Promotion): string {
  if (promotion.ml_kind) return getMlKindLabel(promotion.ml_kind);
  return PROMOTION_TYPE_LABEL[promotion.promotion_type] ?? promotion.promotion_type;
}

function isAutomaticPromotion(p: Promotion): boolean {
  if (p.ml_kind && ML_AUTO_KINDS.has(p.ml_kind)) return true;
  return false;
}

function discountLabel(p: Promotion): string {
  if (p.discount_percent != null && Number.isFinite(Number(p.discount_percent))) {
    return `${Number(p.discount_percent)}%`;
  }
  return "—";
}

function subsidyLabel(p: Promotion): { text: string; highlight: boolean } {
  const meli = p.meli_percent != null ? Number(p.meli_percent) : null;
  const seller = p.seller_percent != null ? Number(p.seller_percent) : null;
  if (meli != null && seller != null) {
    if (meli >= 100 || seller === 0) {
      return { text: "Subsídio integral", highlight: true };
    }
    return {
      text: `ML ${meli}% · Loja ${seller}%`,
      highlight: false,
    };
  }
  if (meli != null && meli > 0) {
    return { text: `ML ${meli}%`, highlight: true };
  }
  return { text: "—", highlight: false };
}

interface PromotionRowProps {
  promotion: Promotion;
  onView: (p: Promotion) => void;
  onEdit: (p: Promotion) => void;
  onAddItems: (p: Promotion) => void;
  onDelete: (p: Promotion) => void;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Single promotion row as a card (reference: list with columns, no marketplace channel column).
 */
export function PromotionRow({
  promotion,
  onView,
  onEdit,
  onAddItems,
  onDelete,
  canEdit,
  canDelete,
}: PromotionRowProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const isEditable = ["scheduled", "pending", "draft"].includes(promotion.status);
  const canDeleteNow = canDelete && !["active"].includes(promotion.status);
  const auto = isAutomaticPromotion(promotion);
  const subsidy = subsidyLabel(promotion);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 lg:py-3 lg:px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-2 lg:items-center">
            {/* Nome */}
            <div className="lg:col-span-3 min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {auto && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-semibold uppercase tracking-wide bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100"
                  >
                    Automática
                  </Badge>
                )}
              </div>
              <p className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2" title={promotion.name}>
                {promotion.name || "—"}
              </p>
            </div>

            {/* Desconto */}
            <div className="lg:col-span-1">
              <p className="text-xs text-gray-500 lg:hidden">Desconto</p>
              <p className="text-sm font-semibold text-gray-900 tabular-nums">{discountLabel(promotion)}</p>
            </div>

            {/* Tipo */}
            <div className="lg:col-span-2 min-w-0">
              <p className="text-xs text-gray-500 lg:hidden">Tipo</p>
              <p className="text-sm text-gray-800 line-clamp-2">{promoTypeLabel(promotion)}</p>
            </div>

            {/* Subsídio */}
            <div className="lg:col-span-2 min-w-0">
              <p className="text-xs text-gray-500 lg:hidden">Subsídio</p>
              <p
                className={`text-sm font-medium ${subsidy.highlight ? "text-emerald-600" : "text-gray-700"}`}
              >
                {subsidy.text}
              </p>
            </div>

            {/* Vigência */}
            <div className="lg:col-span-2 min-w-0">
              <p className="text-xs text-gray-500 lg:hidden">Vigência</p>
              <p className="text-xs text-gray-700 leading-relaxed">
                {formatVigencia(promotion.start_date, promotion.finish_date)}
              </p>
            </div>

            {/* Status */}
            <div className="lg:col-span-1 flex lg:justify-center">
              <PromotionStatusBadge status={promotion.status} variant="list" />
            </div>

            {/* Expand + overflow menu */}
            <div className="lg:col-span-1 flex items-center justify-end gap-1">
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-gray-500"
                  aria-expanded={open}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
                  <span className="sr-only">Expandir ações</span>
                </Button>
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => onView(promotion)}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Ver detalhes
                  </DropdownMenuItem>
                  {promotion.promotion_type === "STANDARD_DISCOUNT" && canEdit && (
                    <DropdownMenuItem
                      onClick={() =>
                        navigate(
                          `/anuncios/promocoes/${promotion.id}?marketplace=${encodeURIComponent(displayNameFromMarketplaceKey(promotion.marketplace_key))}`,
                        )
                      }
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      Gerenciar desconto
                    </DropdownMenuItem>
                  )}
                  {promotion.marketplace_key === "shopee" && promotion.promotion_type === "FLASH_SALE" && canEdit && (
                    <DropdownMenuItem onClick={() => navigate(`/anuncios/promocoes/shopee/flash/${promotion.id}`)}>
                      <Zap className="h-4 w-4 mr-2" />
                      Gerenciar oferta relâmpago
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <DropdownMenuItem onClick={() => onAddItems(promotion)}>
                      <PackagePlus className="h-4 w-4 mr-2" />
                      Adicionar produtos
                    </DropdownMenuItem>
                  )}
                  {canEdit && isEditable && (
                    <DropdownMenuItem onClick={() => onEdit(promotion)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  {canDeleteNow && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(promotion)}
                        className="text-red-600 focus:text-red-700 focus:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Encerrar / Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <CollapsibleContent>
          <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onView(promotion)}>
              Ver detalhes
            </Button>
            {promotion.promotion_type === "STANDARD_DISCOUNT" && canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `/anuncios/promocoes/${promotion.id}?marketplace=${encodeURIComponent(displayNameFromMarketplaceKey(promotion.marketplace_key))}`,
                  )
                }
              >
                Gerenciar desconto
              </Button>
            )}
            {promotion.marketplace_key === "shopee" && promotion.promotion_type === "FLASH_SALE" && canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate(`/anuncios/promocoes/shopee/flash/${promotion.id}`)}
              >
                Gerenciar flash
              </Button>
            )}
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={() => onAddItems(promotion)}>
                Adicionar produtos
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
