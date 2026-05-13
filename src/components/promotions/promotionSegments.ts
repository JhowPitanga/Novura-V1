import type { LucideIcon } from "lucide-react";
import {
  Tag,
  Zap,
  CalendarDays,
  Percent,
  Sparkles,
  Wallet,
  Megaphone,
} from "lucide-react";
import type { Promotion } from "@/types/promotions";

export type PromotionSegmentId =
  | "seller"
  | "marketplace_campaigns"
  | "lightning"
  | "dod"
  | "price_discount"
  | "smart_matching"
  | "bank_coupon"
  | "shopee_discount"
  | "shopee_flash";

export interface PromotionSegmentDef {
  id: PromotionSegmentId;
  /** Small uppercase line (reference: "POR TEMPO LIMITADO") */
  eyebrow: string;
  label: string;
  icon: LucideIcon;
  /** True when this segment applies to Mercado Livre */
  marketplace: "mercado_livre" | "shopee" | "both";
  matches: (p: Promotion) => boolean;
}

const ML_KINDS = {
  seller: ["SELLER_CAMPAIGN"] as const,
  marketplace: [
    "DEAL",
    "MARKETPLACE_CAMPAIGN",
    "VOLUME",
    "PRE_NEGOTIATED",
    "UNHEALTHY_STOCK",
  ] as const,
  lightning: ["LIGHTNING"] as const,
  dod: ["DOD"] as const,
  price_discount: ["PRICE_DISCOUNT"] as const,
  smart: ["SMART", "PRICE_MATCHING", "PRICE_MATCHING_MELI_ALL"] as const,
  bank_coupon: ["BANK", "SELLER_COUPON_CAMPAIGN"] as const,
};

function hasMlKind(p: Promotion, kinds: readonly string[]): boolean {
  return !!p.ml_kind && kinds.includes(p.ml_kind);
}

/** Legacy rows synced before ml_kind existed */
function isMlLegacyStandard(p: Promotion): boolean {
  return p.marketplace_key === "mercado_livre" && p.promotion_type === "STANDARD_DISCOUNT" && !p.ml_kind;
}

function isMlLegacyFlash(p: Promotion): boolean {
  return p.marketplace_key === "mercado_livre" && p.promotion_type === "FLASH_SALE" && !p.ml_kind;
}

/** Up to 7 category cards for Mercado Livre */
export const ML_PROMOTION_SEGMENTS: PromotionSegmentDef[] = [
  {
    id: "seller",
    eyebrow: "CRIADA POR VOCÊ",
    label: "Campanha do vendedor",
    icon: Tag,
    marketplace: "mercado_livre",
    matches: p =>
      p.marketplace_key === "mercado_livre" &&
      (hasMlKind(p, ML_KINDS.seller) || (isMlLegacyStandard(p) && p.source === "seller_created")),
  },
  {
    id: "marketplace_campaigns",
    eyebrow: "CONVITES E CAMPANHAS ML",
    label: "Campanhas do Mercado Livre",
    icon: Megaphone,
    marketplace: "mercado_livre",
    matches: p =>
      p.marketplace_key === "mercado_livre" &&
      (hasMlKind(p, ML_KINDS.marketplace) ||
        (isMlLegacyStandard(p) && p.source === "platform_invite")),
  },
  {
    id: "lightning",
    eyebrow: "POR TEMPO LIMITADO",
    label: "Oferta relâmpago",
    icon: Zap,
    marketplace: "mercado_livre",
    matches: p =>
      p.marketplace_key === "mercado_livre" &&
      (hasMlKind(p, ML_KINDS.lightning) || isMlLegacyFlash(p)),
  },
  {
    id: "dod",
    eyebrow: "POR TEMPO LIMITADO",
    label: "Oferta do dia",
    icon: CalendarDays,
    marketplace: "mercado_livre",
    matches: p => p.marketplace_key === "mercado_livre" && hasMlKind(p, ML_KINDS.dod),
  },
  {
    id: "price_discount",
    eyebrow: "PREÇO PROMOCIONAL",
    label: "Desconto individual",
    icon: Percent,
    marketplace: "mercado_livre",
    matches: p => p.marketplace_key === "mercado_livre" && hasMlKind(p, ML_KINDS.price_discount),
  },
  {
    id: "smart_matching",
    eyebrow: "AUTOMÁTICA",
    label: "Smart e preços competitivos",
    icon: Sparkles,
    marketplace: "mercado_livre",
    matches: p => p.marketplace_key === "mercado_livre" && hasMlKind(p, ML_KINDS.smart),
  },
  {
    id: "bank_coupon",
    eyebrow: "MLB · PIX E CUPONS",
    label: "PIX e cupons",
    icon: Wallet,
    marketplace: "mercado_livre",
    matches: p => p.marketplace_key === "mercado_livre" && hasMlKind(p, ML_KINDS.bank_coupon),
  },
];

export const SHOPEE_PROMOTION_SEGMENTS: PromotionSegmentDef[] = [
  {
    id: "shopee_discount",
    eyebrow: "DESCONTO NA LOJA",
    label: "Desconto Shopee",
    icon: Tag,
    marketplace: "shopee",
    matches: p => p.marketplace_key === "shopee" && p.promotion_type === "STANDARD_DISCOUNT",
  },
  {
    id: "shopee_flash",
    eyebrow: "POR TEMPO LIMITADO",
    label: "Oferta relâmpago",
    icon: Zap,
    marketplace: "shopee",
    matches: p => p.marketplace_key === "shopee" && p.promotion_type === "FLASH_SALE",
  },
];

export function getSegmentsForMarketplace(isMercadoLivre: boolean): PromotionSegmentDef[] {
  return isMercadoLivre ? ML_PROMOTION_SEGMENTS : SHOPEE_PROMOTION_SEGMENTS;
}

/** Promotions that do not fall into any segment (e.g. legacy rows without ml_kind on ML) */
export function matchesSegmentOrFallback(
  p: Promotion,
  segmentId: PromotionSegmentId | "ALL",
  segments: PromotionSegmentDef[],
): boolean {
  if (segmentId === "ALL") return true;
  return promotionMatchesSegment(p, segmentId, segments);
}

/** True if the promotion belongs to the given segment (single card filter). */
export function promotionMatchesSegment(
  p: Promotion,
  segmentId: PromotionSegmentId,
  segments: PromotionSegmentDef[],
): boolean {
  const seg = segments.find(s => s.id === segmentId);
  return seg ? seg.matches(p) : false;
}

export function countCandidatesInSegment(
  promotions: Promotion[],
  segment: PromotionSegmentDef,
): number {
  return promotions.filter(p => segment.matches(p) && p.status === "candidate").length;
}
