// Domain types – pure data models, no I/O dependencies.
// These map FROM existing database tables but never alter the schema.

export type MarketplaceName = "mercado_livre" | "shopee";

export interface MarketplaceCredentials {
  integrationId: string;
  accessToken: string;
  marketplace: MarketplaceName;
  isExpired: boolean;
  meliUserId?: number;
}

export interface ModulePermission {
  module: string;
  actions: string[];
}

export interface OrganizationUser {
  userId: string;
  email: string;
  fullName: string;
  role: "owner" | "admin" | "member";
  organizationId: string;
  permissions: ModulePermission[];
}

export interface CreateUserRequest {
  email: string;
  fullName: string;
  role: "owner" | "admin" | "member";
  organizationId: string;
  password?: string;
  modules?: string[];
}

export interface TokenRefreshResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  details?: unknown;
}
