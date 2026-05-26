import type { AdminOrganization, AdminUser, OrgStatusData } from "@/types/admin";

export function normalizeOrgStatus(
  raw: OrgStatusData | OrgStatusData[] | null | undefined,
): OrgStatusData | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

export function normalizeOrganization(raw: Record<string, unknown>): AdminOrganization {
  return {
    id: String(raw.id),
    name: String(raw.name ?? "Sem nome"),
    owner_user_id: String(raw.owner_user_id ?? ""),
    created_at: String(raw.created_at ?? ""),
    organization_status: normalizeOrgStatus(
      raw.organization_status as OrgStatusData | OrgStatusData[] | null,
    ),
  };
}

export function normalizeUser(raw: Record<string, unknown>): AdminUser {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    email: raw.email != null ? String(raw.email) : null,
    role: String(raw.role),
    created_at: String(raw.created_at),
    organization_id: String(raw.organization_id ?? ""),
    organization_name: raw.organization_name != null ? String(raw.organization_name) : null,
    organization_status: String(raw.organization_status ?? "active") as AdminUser["organization_status"],
    organization_deleted: Boolean(raw.organization_deleted),
  };
}
