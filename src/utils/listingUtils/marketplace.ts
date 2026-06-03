export function marketplaceSlugify(name: string): string {
  const raw = String(name || "").trim().toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  if (normalized === "mercado_livre") return "mercado-livre";
  return normalized;
}

export function marketplaceDisplayNameFromSlug(slug: string): string {
  const s = String(slug || "").trim().toLowerCase();
  if (s === "mercado-livre" || s === "mercado_livre" || s === "mercado") return "Mercado Livre";
  if (s === "shopee") return "Shopee";
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Converts marketplace display name to a URL path segment */
export function toSlug(displayName: string): string {
  return "/" + displayName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Nav path `/mercado_livre` → slug `mercado_livre` for URL search params */
export function slugFromMarketplacePath(path: string): string {
  return String(path || "").replace(/^\//, "").trim();
}

/** Slug `mercado_livre` → nav path `/mercado_livre` */
export function marketplacePathFromSlug(slug: string): string {
  const s = String(slug || "").replace(/^\//, "").trim();
  return s ? `/${s}` : "";
}
