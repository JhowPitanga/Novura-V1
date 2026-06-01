import type { AppWithProvider } from "@/services/marketplace-providers.service";
import type { MarketplaceIntegration } from "@/services/marketplace-providers.service";

function appEnvironment(appRow: AppWithProvider): "sandbox" | "production" {
  const id = String(appRow.id ?? "").toLowerCase();
  const name = String(appRow.name ?? "").toLowerCase();
  if (id.includes("test") || id.includes("sandbox") || name.includes("sandbox")) {
    return "sandbox";
  }
  return "production";
}

function integrationEnvironment(integration: MarketplaceIntegration): "sandbox" | "production" {
  const cfg = (integration.config ?? {}) as Record<string, unknown>;
  return String(cfg.environment ?? "production").toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

/** Match a marketplace_integrations row to a catalog app (prod vs sandbox). */
export function integrationMatchesApp(
  integration: MarketplaceIntegration,
  appRow: AppWithProvider,
): boolean {
  if (integration.provider_id !== appRow.provider_id) return false;

  const cfg = (integration.config ?? {}) as Record<string, unknown>;
  const configAppId = typeof cfg.app_id === "string" ? cfg.app_id.trim() : "";
  if (configAppId) return configAppId === String(appRow.id ?? "");

  return integrationEnvironment(integration) === appEnvironment(appRow);
}
