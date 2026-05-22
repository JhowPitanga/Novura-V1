/**
 * AdminContracts.ts
 * Pure TypeScript domain types for the admin control centre.
 * No external dependencies, no `any`.
 */

// ─── Capability primitives ──────────────────────────────────────────────────

export type CapabilityValue = boolean | number;

export interface BaseFeatureCapabilities {
  readonly can_view: boolean;
  readonly can_create: boolean;
  readonly can_edit?: boolean;
  readonly can_delete?: boolean;
  readonly max_limit?: number;
}

export interface AnunciosCapabilities extends BaseFeatureCapabilities {
  readonly promote_create?: boolean;
  readonly promote_edit?: boolean;
  readonly promote_delete?: boolean;
}

export interface PedidosCapabilities extends BaseFeatureCapabilities {
  readonly can_cancel?: boolean;
  readonly can_export?: boolean;
}

export type KnownFeatureCapabilities =
  | AnunciosCapabilities
  | PedidosCapabilities
  | BaseFeatureCapabilities;

// ─── Domain entities ────────────────────────────────────────────────────────

export type BadgeStatus = "stable" | "beta" | "new";

export interface SystemFeature {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly badge_status: BadgeStatus;
  readonly is_globally_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface OrganizationFeature {
  readonly id: string;
  readonly organization_id: string;
  readonly feature_key: string;
  readonly is_enabled: boolean;
  readonly capabilities: BaseFeatureCapabilities;
  readonly created_at: string;
  readonly updated_at: string;
}

export type OrgStatus = "active" | "blocked";

export interface OrganizationStatusRow {
  readonly organization_id: string;
  readonly status: OrgStatus;
  readonly active_users_count: number;
  readonly max_users_allowed: number;
  readonly plan_sku: string | null;
  readonly blocked_reason: string | null;
  readonly blocked_at: string | null;
  readonly deleted_at: string | null;
  readonly updated_at: string;
}

export interface SystemPlan {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price_cents: number;
  readonly max_users: number;
  readonly features_template: Record<string, unknown>;
}

// ─── Use case I/O ───────────────────────────────────────────────────────────

export type CapabilityDenyReason =
  | "feature_disabled"
  | "capability_denied"
  | "org_blocked"
  | "global_disabled"
  | "capability_missing";

export interface CapabilityCheckInput {
  readonly organizationId: string;
  readonly featureKey: string;
  readonly capabilityKey: keyof BaseFeatureCapabilities | string;
}

export interface CapabilityCheckResult {
  readonly allowed: boolean;
  readonly reason?: CapabilityDenyReason;
}

// ─── Repository interface ───────────────────────────────────────────────────

export interface IAdminRepository {
  getSystemFeature(key: string): Promise<SystemFeature | null>;
  getOrganizationFeature(
    organizationId: string,
    featureKey: string,
  ): Promise<OrganizationFeature | null>;
  getOrganizationStatus(organizationId: string): Promise<OrganizationStatusRow | null>;
}
