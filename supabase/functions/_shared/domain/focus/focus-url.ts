/**
 * Normalizes a path or full URL for Focus API.
 * If pathOrUrl is already absolute (http/https), returns as-is.
 * Otherwise appends to base (with or without leading slash).
 */

export function normalizeFocusUrl(
  base: string,
  pathOrUrl: string | null | undefined,
): string | null {
  if (!pathOrUrl) return null;
  const p = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(p)) return p;
  const baseTrimmed = base.replace(/\/$/, "");
  if (p.startsWith("/")) return `${baseTrimmed}${p}`;
  return `${baseTrimmed}/${p}`;
}
