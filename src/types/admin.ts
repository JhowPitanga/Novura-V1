/**
 * src/types/admin.ts
 * Frontend mirror of AdminContracts.ts for the admin console.
 * No `any`. Used by services, hooks, and components.
 */

export type BadgeStatus = "stable" | "beta" | "new";
export type OrgStatus = "active" | "blocked";

export interface SystemFeature {
  id: string;
  key: string;
  name: string;
  badge_status: BadgeStatus;
  is_globally_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BaseFeatureCapabilities {
  can_view: boolean;
  can_create: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  max_limit?: number;
}

export interface OrgFeature {
  feature_key: string;
  name: string;
  badge_status: BadgeStatus;
  is_globally_enabled: boolean;
  is_enabled: boolean;
  capabilities: BaseFeatureCapabilities;
}

export interface OrgStatusData {
  status: OrgStatus;
  active_users_count: number;
  max_users_allowed: number;
  plan_sku: string | null;
  blocked_reason: string | null;
  blocked_at: string | null;
  deleted_at: string | null;
}

export interface AdminOrganization {
  id: string;
  name: string;
  owner_user_id: string;
  created_at?: string;
  organization_status: OrgStatusData | null;
}

/** Unified module + feature row for per-org access control */
export interface OrgModuleCatalogItem {
  module_key: string;
  module_id: string;
  display_name: string;
  description: string | null;
  global_module_active: boolean;
  badge_status: BadgeStatus;
  feature_globally_enabled: boolean;
  is_enabled: boolean;
  /** Computed: global + org flags (matches tenant module_switches) */
  effective_active: boolean;
  capabilities: BaseFeatureCapabilities;
  has_feature_catalog: boolean;
}

export interface AdminOverviewMetrics {
  tenants_total: number;
  tenants_active: number;
  tenants_blocked: number;
  platform_users: number;
  orders_total: number;
}

export interface AdminOrganizationDetail extends AdminOrganization {
  features: OrgFeature[];
}

export interface AdminUser {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
  organization_id: string;
  organization_name: string | null;
  organization_status: OrgStatus;
  organization_deleted: boolean;
}

export interface AdminOrder {
  id: string;
  organizations_id: string;
  marketplace: string;
  marketplace_order_id: string;
  status: string;
  status_detail: string | null;
  order_total: number | null;
  customer_name: string | null;
  shipping_city_name: string | null;
  shipping_state_uf: string | null;
  shipment_status: string | null;
  created_at?: string;
  updated_at: string;
  last_updated?: string;
  status_interno?: string | null;
}

export interface OrderStatusSummary {
  summary: Record<string, number>;
  total: number;
}

export interface SystemPlan {
  id: string;
  name: string;
  sku: string;
  price_cents: number;
  max_users: number;
}
