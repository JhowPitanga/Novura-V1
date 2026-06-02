/**
 * source_ref format contract for manual stock adjustments and transfers.
 * Shared by InventoryManagementDrawer (writes) and movements export (reads).
 */

export const MOVE_TYPES = {
  ENTRADA: "ENTRADA",
  SAIDA: "SAIDA",
  TRANSFERENCIA: "TRANSFERENCIA",
} as const;

export function buildAdjustSourceRef(
  actorName: string,
  note: string,
  moveType: "ENTRADA" | "SAIDA"
): string {
  const moveRefBase = note ? `${actorName} - ${note}` : actorName;
  return `${moveRefBase}[${moveType}]`;
}

export function buildTransferSourceRef(
  actorName: string,
  note: string,
  direction: "IN" | "OUT"
): string {
  const moveRefBase = note ? `${actorName} - ${note}` : actorName;
  return `${moveRefBase}[${direction}]`;
}

export function parseSourceRefActor(sourceRef: string | null): string {
  const src = String(sourceRef || "");
  const match = src.match(/^([^[]+)\[/);
  if (!match?.[1]?.trim()) return "";
  const extracted = match[1].trim();
  return extracted.split(" - ")[0].trim();
}

export function parseSourceRefObservation(sourceRef: string | null): string {
  const src = String(sourceRef || "");
  const match = src.match(/^([^[]+)\[/);
  if (!match?.[1]?.trim()) return "";
  const extracted = match[1].trim();
  const parts = extracted.split(" - ");
  if (parts.length <= 1) return "";
  return parts.slice(1).join(" - ").trim();
}
