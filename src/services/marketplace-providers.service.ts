import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type MarketplaceProvider =
  Database["public"]["Tables"]["marketplace_providers"]["Row"];

export type AppWithProvider =
  Database["public"]["Views"]["apps_public_view"]["Row"];

export type MarketplaceIntegration =
  Database["public"]["Tables"]["marketplace_integrations"]["Row"] & {
    marketplace_providers?: Pick<MarketplaceProvider, "key" | "display_name" | "category" | "logo_url"> | null;
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
  const { data, error } = await supabase
    .from("marketplace_integrations")
    .select(
      "*, marketplace_providers(key, display_name, category, logo_url)",
    )
    .eq("organizations_id", organizationId)
    .is("deactivated_at", null)
    .order("connected_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MarketplaceIntegration[];
}

export async function fetchIntegrationById(
  organizationId: string,
  integrationId: string,
): Promise<MarketplaceIntegration | null> {
  const { data, error } = await supabase
    .from("marketplace_integrations")
    .select("*, marketplace_providers(key, display_name, category, logo_url)")
    .eq("organizations_id", organizationId)
    .eq("id", integrationId)
    .maybeSingle();

  if (error) throw error;
  return (data as MarketplaceIntegration | null) ?? null;
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
