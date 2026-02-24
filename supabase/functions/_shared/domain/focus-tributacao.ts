/**
 * Maps tributacao (tax regime) labels to Focus NFe numeric codes.
 * Used by focus-company-create.
 */

export function mapTributacaoToFocus(
  v: string | null | undefined,
): number | null {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return null;
  if (s === "simples nacional") return 1;
  if (s.includes("excesso") || s.includes("sublimite")) return 2;
  if (s === "regime normal" || s === "normal") return 3;
  if (s === "mei") return 4;
  return null;
}
