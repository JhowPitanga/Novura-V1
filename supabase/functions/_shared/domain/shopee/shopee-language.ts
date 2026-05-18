/**
 * Normalizes language code for Shopee API (e.g. pt, pt-BR -> pt-br).
 */

export function normalizeLanguage(input: string | null): string | null {
  if (!input) return "pt-br";
  const s = String(input).trim().toLowerCase().replace(/_/g, "-");
  if (s === "pt" || s === "pt-br" || s === "ptbr") return "pt-br";
  return s;
}
