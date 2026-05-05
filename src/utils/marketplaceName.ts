/**
 * Normalize marketplace_name values from DB / integrations (underscore, spaces, casing).
 * Used for filtering listings in product↔ad linking UI.
 */
export function normalizeMarketplaceKey(raw: string | null | undefined): string {
  const s = String(raw || "")
    .trim()
    .replace(/\u00a0/g, " ")
    .toLowerCase();
  if (!s) return "";
  // Collapse separators so mercado-livre / mercado_livre / mercadolivre match the same bucket
  const collapsed = s.replace(/[\s_\-]+/g, "");
  if (
    collapsed.includes("mercado") ||
    collapsed.includes("meli") ||
    collapsed === "ml" ||
    s === "ml" ||
    s === "meli" ||
    s === "mercadolivre"
  ) {
    return "mercado_livre";
  }
  if (collapsed.includes("shopee") || s.includes("shopee")) {
    return "shopee";
  }
  return s.replace(/\s+/g, "_");
}

export function marketplaceKeysEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeMarketplaceKey(a) === normalizeMarketplaceKey(b);
}
