export type TokenHealth = "ok" | "expiring_soon" | "expired" | "error" | "unknown";

export interface IntegrationHealthInput {
  status?: string | null;
  expiresAt?: string | null;
  lastRefreshError?: string | null;
  refreshThresholdMinutes?: number;
}

export function computeTokenHealth(input: IntegrationHealthInput): TokenHealth {
  if (input.status === "error" || input.status === "revoked") return "error";
  if (!input.expiresAt) return "unknown";

  const expiresMs = new Date(input.expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return "unknown";
  if (expiresMs <= Date.now()) return "expired";

  const thresholdMs = (input.refreshThresholdMinutes ?? 30) * 60 * 1000;
  if (expiresMs - thresholdMs <= Date.now()) return "expiring_soon";

  return "ok";
}

export function computeDaysUntilExpiry(expiresAt?: string | null): number | null {
  if (!expiresAt) return null;
  const expiresMs = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresMs)) return null;
  return Math.ceil((expiresMs - Date.now()) / 86400000);
}

export function mapHealthToConnectionStatus(
  health: TokenHealth,
): "active" | "reconnect" | "inactive" {
  if (health === "ok") return "active";
  if (health === "expiring_soon") return "reconnect";
  return "inactive";
}

export function mapHealthToColor(health: TokenHealth): string {
  if (health === "ok") return "bg-green-500";
  if (health === "expiring_soon") return "bg-yellow-500";
  return "bg-red-500";
}
