import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { isIntegrationFullyConfigured } from "@/utils/integrationSetup";

export type MarketplaceProvider =
  Database["public"]["Tables"]["marketplace_providers"]["Row"];

export type AppWithProvider =
  Database["public"]["Views"]["apps_public_view"]["Row"];

export type MarketplaceIntegration =
  Database["public"]["Tables"]["marketplace_integrations"]["Row"] & {
    marketplace_providers?: Pick<MarketplaceProvider, "key" | "display_name" | "category" | "logo_url"> | null;
    warehouse_config?: {
      physical_storage_id: string | null;
      fulfillment_storage_id: string | null;
    } | null;
  };

// ---------------------------------------------------------------------------
// Query keys — colocated with the service per CLAUDE.md §3
// ---------------------------------------------------------------------------
export const marketplaceProviderKeys = {
  all: ["marketplace_providers"] as const,
  list: () => [...marketplaceProviderKeys.all, "list"] as const,
} as const;

export const appsWithProviderKeys = {
  all: ["apps_with_provider"] as const,
  list: () => [...appsWithProviderKeys.all, "list"] as const,
} as const;

export const integrationKeys = {
  all: ["marketplace_integrations"] as const,
  list: (orgId: string) =>
    [...integrationKeys.all, "list", orgId] as const,
  detail: (orgId: string, integrationId: string) =>
    [...integrationKeys.all, "detail", orgId, integrationId] as const,
  blockedCompanies: (orgId: string, providerKey: string) =>
    [...integrationKeys.all, "blocked_companies", orgId, providerKey] as const,
} as const;

// ---------------------------------------------------------------------------
// Fetch all active providers (catalog)
// ---------------------------------------------------------------------------
export async function fetchMarketplaceProviders(): Promise<MarketplaceProvider[]> {
  const { data, error } = await supabase
    .from("marketplace_providers")
    .select("*")
    .eq("is_active", true)
    .order("display_name");

  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Fetch apps enriched with provider metadata (for the Apps page)
// ---------------------------------------------------------------------------
export async function fetchAppsWithProvider(): Promise<AppWithProvider[]> {
  const { data, error } = await supabase
    .from("apps_public_view")
    .select("*")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Fetch integrations for an organization
// ---------------------------------------------------------------------------
export async function fetchIntegrations(
  organizationId: string,
): Promise<MarketplaceIntegration[]> {
  const [integrationsRes, warehouseRes] = await Promise.all([
    supabase
      .from("marketplace_integrations")
      .select("*, marketplace_providers(key, display_name, category, logo_url)")
      .eq("organizations_id", organizationId)
      .is("deactivated_at", null)
      .order("connected_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("integration_warehouse_config")
      .select("integration_id, physical_storage_id, fulfillment_storage_id")
      .eq("organization_id", organizationId),
  ]);

  if (integrationsRes.error) throw integrationsRes.error;
  if (warehouseRes.error) throw warehouseRes.error;

  const warehouseByIntegration = new Map(
    (warehouseRes.data ?? []).map((row) => [
      row.integration_id,
      {
        physical_storage_id: row.physical_storage_id,
        fulfillment_storage_id: row.fulfillment_storage_id,
      },
    ]),
  );

  return (integrationsRes.data ?? []).map((row) => ({
    ...(row as MarketplaceIntegration),
    warehouse_config: warehouseByIntegration.get(row.id) ?? null,
  }));
}

/** Marks setup as completed when company + warehouse exist but setup_status stayed pending. */
export async function reconcileStaleIntegrationSetups(
  organizationId: string,
  integrations: MarketplaceIntegration[],
): Promise<number> {
  const stale = integrations.filter(
    (row) =>
      row.setup_status === "pending" &&
      row.company_id &&
      isIntegrationFullyConfigured(row),
  );

  if (!stale.length) return 0;

  await Promise.all(
    stale.map((row) =>
      completeIntegrationSetup(row.id, row.company_id!, organizationId),
    ),
  );
  return stale.length;
}

export async function fetchIntegrationById(
  organizationId: string,
  integrationId: string,
): Promise<MarketplaceIntegration | null> {
  const [integrationRes, warehouseRes] = await Promise.all([
    supabase
      .from("marketplace_integrations")
      .select("*, marketplace_providers(key, display_name, category, logo_url)")
      .eq("organizations_id", organizationId)
      .eq("id", integrationId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("integration_warehouse_config")
      .select("integration_id, physical_storage_id, fulfillment_storage_id")
      .eq("organization_id", organizationId)
      .eq("integration_id", integrationId)
      .maybeSingle(),
  ]);

  if (integrationRes.error) throw integrationRes.error;
  if (warehouseRes.error) throw warehouseRes.error;
  if (!integrationRes.data) return null;

  return {
    ...(integrationRes.data as MarketplaceIntegration),
    warehouse_config: warehouseRes.data
      ? {
          physical_storage_id: warehouseRes.data.physical_storage_id ?? null,
          fulfillment_storage_id: warehouseRes.data.fulfillment_storage_id ?? null,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Fetch company IDs already blocked for a given provider in this org
// ---------------------------------------------------------------------------
export async function fetchBlockedCompanies(
  organizationId: string,
  providerKey: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc(
    "list_blocked_companies_for_provider",
    {
      p_organization_id: organizationId,
      p_provider_key: providerKey,
    },
  );

  if (error) throw error;
  return (data as string[]) ?? [];
}

// ---------------------------------------------------------------------------
// Complete integration setup (set company_id + mark as completed)
// ---------------------------------------------------------------------------
export async function completeIntegrationSetup(
  integrationId: string,
  companyId: string,
  organizationId: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_integration_setup", {
    p_integration_id: integrationId,
    p_company_id: companyId,
    p_organization_id: organizationId,
  });
  if (error) throw error;
}

export async function updateIntegrationStoreName(
  integrationId: string,
  organizationId: string,
  storeName: string,
): Promise<void> {
  const { error } = await supabase
    .from("marketplace_integrations")
    .update({ store_name: storeName })
    .eq("id", integrationId)
    .eq("organizations_id", organizationId);
  if (error) throw error;
}

function isMissingRpcError(error: { code?: string | null; message?: string | null }): boolean {
  if (error.code === "PGRST202") return true;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("could not find the function");
}

export function getMarketplaceRpcErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "Erro desconhecido");
  const e = error as { message?: string; details?: string; hint?: string };
  return [e.message, e.details, e.hint].filter(Boolean).join(" — ");
}

export function isReservedStockDisconnectError(error: unknown): boolean {
  return getMarketplaceRpcErrorMessage(error).toLowerCase().includes("reserved_stock_present");
}

export async function canDisconnectMarketplaceIntegration(
  organizationId: string,
  integrationId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_disconnect_marketplace_integration", {
    p_organizations_id: organizationId,
    p_integration_id: integrationId,
  });
  if (error) {
    if (isMissingRpcError(error)) return true;
    throw error;
  }
  return Boolean(data);
}

async function resolveMarketplaceDisplayName(params: {
  marketplaceName?: string | null;
  providerKey?: string | null;
}): Promise<string> {
  const direct = params.marketplaceName?.trim();
  if (direct) return direct;

  const providerKey = params.providerKey?.trim();
  if (!providerKey) {
    throw new Error("Não foi possível identificar o marketplace para desconectar.");
  }

  const { data, error } = await supabase
    .from("marketplace_providers")
    .select("display_name")
    .eq("key", providerKey)
    .maybeSingle();

  if (error) throw error;
  const displayName = data?.display_name?.trim();
  if (displayName) return displayName;

  throw new Error("Não foi possível identificar o marketplace para desconectar.");
}

export async function disconnectMarketplaceApp(
  organizationId: string,
  params: {
    integrationId?: string | null;
    providerKey?: string | null;
    marketplaceName?: string | null;
  },
): Promise<void> {
  const integrationId = params.integrationId?.trim();
  const providerKey = params.providerKey?.trim();

  if (integrationId) {
    const { error } = await supabase.rpc("disconnect_marketplace_integration", {
      p_organizations_id: organizationId,
      p_integration_id: integrationId,
    });
    if (!error) return;
    if (!isMissingRpcError(error)) throw error;
  }

  if (providerKey) {
    const { error } = await supabase.rpc("disconnect_marketplace_by_provider", {
      p_organizations_id: organizationId,
      p_provider_key: providerKey,
    });
    if (!error) return;
    if (!isMissingRpcError(error)) throw error;
  }

  const marketplaceName = await resolveMarketplaceDisplayName(params);
  const { error: cascadeError } = await supabase.rpc("disconnect_marketplace_cascade", {
    p_organizations_id: organizationId,
    p_marketplace_name: marketplaceName,
  });
  if (cascadeError) throw cascadeError;
}

export interface RecoverOAuthFlowInput {
  organizationId: string;
  appId: string;
  providerKey: string;
  storeName: string;
  startedAt: number;
  reconnectIntegrationId?: string | null;
}

function toOAuthSuccessPayload(
  row: {
    id: string;
    external_account_id: string | null;
    setup_status: string | null;
  },
  flow: RecoverOAuthFlowInput,
): {
  providerKey: string;
  integrationId: string;
  externalAccountId: string;
  appId: string;
  ok: boolean;
  setupStatus?: string;
  isReconnect?: boolean;
} {
  return {
    providerKey: flow.providerKey,
    integrationId: row.id,
    externalAccountId: String(row.external_account_id ?? ""),
    appId: flow.appId,
    ok: true,
    setupStatus: row.setup_status ?? undefined,
    isReconnect: Boolean(flow.reconnectIntegrationId),
  };
}

/** Fallback when postMessage from OAuth popup fails — finds the integration touched by OAuth. */
export async function recoverPendingOAuthIntegration(
  flow: RecoverOAuthFlowInput,
): Promise<{
  providerKey: string;
  integrationId: string;
  externalAccountId: string;
  appId: string;
  ok: boolean;
  setupStatus?: string;
  isReconnect?: boolean;
} | null> {
  if (flow.reconnectIntegrationId) {
    const { data: reconnectRow, error: reconnectErr } = await supabase
      .from("marketplace_integrations")
      .select("id, external_account_id, store_name, connected_at, setup_status, config, provider_id")
      .eq("id", flow.reconnectIntegrationId)
      .eq("organizations_id", flow.organizationId)
      .eq("status", "active")
      .is("deactivated_at", null)
      .maybeSingle();

    if (reconnectErr) throw reconnectErr;
    if (reconnectRow?.id) {
      return toOAuthSuccessPayload(reconnectRow, flow);
    }
  }

  const { data, error } = await supabase
    .from("marketplace_integrations")
    .select("id, external_account_id, store_name, connected_at, setup_status, config, provider_id")
    .eq("organizations_id", flow.organizationId)
    .eq("status", "active")
    .is("deactivated_at", null)
    .order("connected_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  const startedMs = flow.startedAt - 60_000;
  const match = (data ?? []).find((row) => {
    if (String(row.store_name ?? "").trim() !== flow.storeName.trim()) return false;
    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const configAppId = typeof cfg.app_id === "string" ? cfg.app_id.trim() : "";
    if (configAppId && configAppId !== flow.appId) return false;
    const connectedAt = new Date(String(row.connected_at ?? 0)).getTime();
    return Number.isFinite(connectedAt) && connectedAt >= startedMs;
  });

  if (!match?.id) return null;

  return toOAuthSuccessPayload(match, flow);
}
