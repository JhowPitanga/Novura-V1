/**
 * AdminApiTypes.ts
 * Request / response shapes for admin-control-center endpoints.
 * No `any`. Mirrors AdminContracts.ts for the HTTP layer.
 */

import type {
  BadgeStatus,
  BaseFeatureCapabilities,
  OrgStatus,
} from "../../_shared/domain/admin/AdminContracts.ts";

// ─── Common ─────────────────────────────────────────────────────────────────

export interface PaginationParams {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ApiError {
  readonly error: string;
  readonly code: string;
}

// ─── Organizations ───────────────────────────────────────────────────────────

export interface OrgRow {
  readonly id: string;
  readonly name: string;
  readonly owner_user_id: string;
  readonly created_at: string;
  readonly status: OrgStatus | null;
  readonly active_users_count: number;
  readonly max_users_allowed: number;
  readonly plan_sku: string | null;
  readonly deleted_at: string | null;
  readonly blocked_reason: string | null;
}

export interface ListOrganizationsBody extends PaginationParams {
  readonly action: "list_organizations";
  readonly search?: string;
  readonly status?: OrgStatus;
}

export interface GetOrganizationBody {
  readonly action: "get_organization";
  readonly organizationId: string;
}

export interface BlockOrganizationBody {
  readonly action: "block_organization";
  readonly organizationId: string;
  readonly reason: string;
}

export interface UnblockOrganizationBody {
  readonly action: "unblock_organization";
  readonly organizationId: string;
}

export interface ArchiveOrganizationBody {
  readonly action: "archive_organization";
  readonly organizationId: string;
  readonly reason?: string;
}

// ─── Features ────────────────────────────────────────────────────────────────

export interface UpdateFeaturesBody {
  readonly action: "update_organization_features";
  readonly organizationId: string;
  readonly featureKey: string;
  readonly is_enabled: boolean;
  readonly capabilities: BaseFeatureCapabilities;
}

export interface GetFeaturesBody {
  readonly action: "list_system_features";
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface ListGlobalUsersBody extends PaginationParams {
  readonly action: "list_global_users";
  readonly search?: string;
  readonly organizationId?: string;
  readonly role?: string;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface ListGlobalOrdersBody extends PaginationParams {
  readonly action: "list_global_orders";
  readonly organizationId?: string;
  readonly status?: string;
  readonly marketplace?: string;
}

export interface OrdersStatusSummaryBody {
  readonly action: "orders_status_summary";
  readonly organizationId?: string;
}

// ─── Feature detail ──────────────────────────────────────────────────────────

export interface OrgFeatureRow {
  readonly feature_key: string;
  readonly name: string;
  readonly badge_status: BadgeStatus;
  readonly is_globally_enabled: boolean;
  readonly is_enabled: boolean;
  readonly capabilities: BaseFeatureCapabilities;
}
