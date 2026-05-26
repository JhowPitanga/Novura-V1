/**
 * admin-control.service.ts
 * Single entry point for admin console API calls via admin-control-center.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeOrganization, normalizeUser } from "@/services/admin-normalize";
import type {
  AdminOrder,
  AdminOrganization,
  AdminOrganizationDetail,
  AdminOverviewMetrics,
  AdminUser,
  BaseFeatureCapabilities,
  OrderStatusSummary,
  OrgFeature,
  OrgModuleCatalogItem,
  SystemFeature,
  SystemPlan,
} from "@/types/admin";

interface ApiErrorBody {
  error?: string;
  code?: string;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const { data, error } = await supabase.functions.invoke("admin-control-center", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    const fnErr = error as { context?: Response; message?: string };
    if (fnErr.context) {
      try {
        const parsed = (await fnErr.context.json()) as ApiErrorBody;
        if (parsed?.error) {
          const code = parsed.code ? ` (${parsed.code})` : "";
          throw new Error(`${parsed.error}${code}`);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message !== fnErr.message) throw inner;
      }
    }
    throw new Error(
      fnErr.message?.includes("Failed to send")
        ? "Edge Function admin-control-center indisponível. Execute: supabase functions deploy admin-control-center"
        : fnErr.message ?? "Erro ao chamar API admin",
    );
  }

  const payload = data as ApiErrorBody & T;
  if (payload && typeof payload === "object" && payload.error && payload.code) {
    throw new Error(`${payload.error} (${payload.code})`);
  }

  return payload as T;
}

// ── Organizations ───────────────────────────────────────────────────────────

export async function getOverviewMetrics(): Promise<AdminOverviewMetrics> {
  const res = await invoke<{ metrics: AdminOverviewMetrics }>({ action: "overview_metrics" });
  return res.metrics;
}

export type ListOrgsParams = { page?: number; pageSize?: number; search?: string; status?: string };

export async function listOrganizations(params: ListOrgsParams = {}): Promise<AdminOrganization[]> {
  const res = await invoke<{ organizations: Record<string, unknown>[] }>({
    action: "list_organizations",
    ...params,
  });
  return (res.organizations ?? []).map(normalizeOrganization);
}

export async function getOrganization(organizationId: string): Promise<AdminOrganizationDetail> {
  const res = await invoke<{
    organization: Record<string, unknown>;
    features: AdminOrganizationDetail["features"];
  }>({ action: "get_organization", organizationId });
  return {
    ...normalizeOrganization(res.organization),
    features: res.features ?? [],
  };
}

export async function blockOrganization(organizationId: string, reason: string): Promise<void> {
  await invoke({ action: "block_organization", organizationId, reason });
}

export async function unblockOrganization(organizationId: string): Promise<void> {
  await invoke({ action: "unblock_organization", organizationId });
}

export async function archiveOrganization(organizationId: string, reason?: string): Promise<void> {
  await invoke({ action: "archive_organization", organizationId, reason });
}

// ── Modules + Features (unified) ─────────────────────────────────────────────

export async function listSystemFeatures(): Promise<SystemFeature[]> {
  const res = await invoke<{ features: SystemFeature[] }>({ action: "list_system_features" });
  return res.features ?? [];
}

export async function listOrganizationFeatures(organizationId: string): Promise<OrgFeature[]> {
  const res = await invoke<{ features: OrgFeature[] }>({
    action: "list_organization_features",
    organizationId,
  });
  return res.features ?? [];
}

export async function listOrganizationModules(organizationId: string): Promise<OrgModuleCatalogItem[]> {
  const res = await invoke<{ modules: OrgModuleCatalogItem[] }>({
    action: "list_organization_modules",
    organizationId,
  });
  return res.modules ?? [];
}

export async function updateOrganizationFeatures(
  organizationId: string,
  featureKey: string,
  is_enabled: boolean,
  capabilities: BaseFeatureCapabilities,
): Promise<void> {
  await invoke({ action: "update_organization_features", organizationId, featureKey, is_enabled, capabilities });
}

export async function updateSystemModule(moduleName: string, active: boolean): Promise<void> {
  await invoke({ action: "update_system_module", moduleName, active });
}

export async function updateOrganizationPlan(
  organizationId: string,
  planSku: string,
): Promise<void> {
  await invoke({ action: "update_organization_plan", organizationId, planSku });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export type ListUsersParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  organizationId?: string;
  role?: string;
};

export async function listGlobalUsers(params: ListUsersParams = {}): Promise<AdminUser[]> {
  const res = await invoke<{ users: Record<string, unknown>[] }>({
    action: "list_global_users",
    ...params,
  });
  return (res.users ?? []).map(normalizeUser);
}

// ── Orders ───────────────────────────────────────────────────────────────────

export type ListOrdersParams = {
  page?: number;
  pageSize?: number;
  organizationId?: string;
  status?: string;
  marketplace?: string;
};

export async function listGlobalOrders(params: ListOrdersParams = {}): Promise<AdminOrder[]> {
  const res = await invoke<{ orders: AdminOrder[] }>({ action: "list_global_orders", ...params });
  return (res.orders ?? []).map((o) => ({
    ...o,
    updated_at: o.updated_at ?? (o as { last_updated?: string }).last_updated ?? "",
  }));
}

export async function ordersStatusSummary(organizationId?: string): Promise<OrderStatusSummary> {
  return invoke<OrderStatusSummary>({ action: "orders_status_summary", organizationId });
}

// ── Plans ─────────────────────────────────────────────────────────────────────

export async function listSystemPlans(): Promise<SystemPlan[]> {
  const res = await invoke<{ plans: SystemPlan[] }>({ action: "list_system_plans" });
  return res.plans ?? [];
}
