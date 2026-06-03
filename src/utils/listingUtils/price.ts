import type { PublicationFeeDetails } from "@/types/listings";

const feeFmt = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

/** Inline label for marketplace_listing_fees (commission % + fixed fee). */
export function formatListingFeeLine(details: PublicationFeeDetails | null | undefined): string {
  if (!details) return "—";
  const pct =
    details.percentage != null && Number.isFinite(Number(details.percentage))
      ? `${String(details.percentage).replace(".", ",")}%`
      : null;
  const fixed =
    details.fixedFee != null && Number(details.fixedFee) > 0 ? feeFmt(Number(details.fixedFee)) : null;
  if (pct && fixed) return `${pct} + ${fixed}`;
  if (pct) return pct;
  if (fixed) return fixed;
  return "—";
}

/** Parses a price string (pt-BR or plain number) to a number. */
export function parsePriceToNumber(price: string): number {
  const s = String(price || "").replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function extractCostsFromListingPrices(lp: any): { currency: string; commission: number; shippingCost: number; tax: number; total: number } | null {
  try {
    if (!lp) return null;
    const entry = Array.isArray(lp?.prices) ? lp.prices[0] : lp;
    const currency = entry?.currency_id || entry?.sale_fee?.currency_id || "BRL";
    const commission =
      typeof entry?.sale_fee?.amount === "number"
        ? entry.sale_fee.amount
        : typeof entry?.sale_fee_amount === "number"
        ? entry.sale_fee_amount
        : typeof entry?.application_fee?.amount === "number"
        ? entry.application_fee.amount
        : 0;
    const shippingCost =
      typeof entry?.shipping_cost?.amount === "number"
        ? entry.shipping_cost.amount
        : typeof entry?.logistics?.shipping_cost === "number"
        ? entry.logistics.shipping_cost
        : 0;
    const tax = typeof entry?.taxes?.amount === "number" ? entry.taxes.amount : 0;
    const total = [commission || 0, shippingCost || 0, tax || 0].reduce((a, b) => a + b, 0);
    return {
      currency: String(currency || "BRL"),
      commission: commission || 0,
      shippingCost: shippingCost || 0,
      tax: tax || 0,
      total,
    };
  } catch {
    return null;
  }
}

export function extractSaleFeeDetails(lp: any): { currency: string; percentage: number | null; fixedFee: number | null; grossAmount: number | null } | null {
  try {
    if (!lp) return null;
    const entry = Array.isArray(lp?.prices)
      ? lp.prices.find((p: any) => p?.sale_fee_details) || lp.prices[0]
      : lp;
    const currency = entry?.currency_id || entry?.sale_fee?.currency_id || "BRL";
    const details = entry?.sale_fee_details || entry?.sale_fee?.details || {};
    const percentage =
      typeof details?.percentage_fee === "number"
        ? details.percentage_fee
        : typeof details?.percentage === "number"
        ? details.percentage
        : null;
    const fixedFee =
      typeof details?.fixed_fee === "number"
        ? details.fixed_fee
        : typeof details?.fixed_amount === "number"
        ? details.fixed_amount
        : typeof details?.fixed_fee?.amount === "number"
        ? details.fixed_fee.amount
        : null;
    const grossAmount =
      typeof details?.gross_amount === "number"
        ? details.gross_amount
        : typeof details?.total === "number"
        ? details.total
        : typeof entry?.sale_fee?.amount === "number"
        ? entry.sale_fee.amount
        : null;
    if (percentage == null && fixedFee == null && grossAmount == null) return null;
    return { currency: String(currency || "BRL"), percentage, fixedFee, grossAmount };
  } catch {
    return null;
  }
}
