/**
 * Pure domain helpers for Focus NFe status and document fields.
 * Used by focus-nfe-cancel, focus-nfe-emit, focus-nfe-sync, focus-webhook.
 */

/** Returns only digit characters (e.g. for CPF/CNPJ). */
export function digits(s: string | null | undefined): string {
  return String(s || "").replace(/\D/g, "");
}

/** Maps Focus NFe status text to canonical domain status. */
export function mapDomainStatus(s: string | null | undefined): string {
  const v = String(s || "").trim().toLowerCase();
  const norm = v.replace(/[^a-z]/g, "");
  if (norm === "autorizado" || norm === "autorizada") return "autorizada";
  if (norm === "rejeitado" || norm === "rejeitada") return "rejeitada";
  if (norm === "denegado" || norm === "denegada") return "denegada";
  if (norm === "cancelado" || norm === "cancelada") return "cancelada";
  return "pendente";
}
