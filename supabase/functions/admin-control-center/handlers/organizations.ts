/**
 * handlers/organizations.ts
 * All organization-scoped admin operations.
 * Uses service-role client (bypasses RLS — safe since assertSuperAdmin already ran).
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";
import type {
  ArchiveOrganizationBody,
  BlockOrganizationBody,
  GetOrganizationBody,
  ListOrganizationsBody,
  OrgFeatureRow,
  UnblockOrganizationBody,
} from "../types/AdminApiTypes.ts";

const PAGE_SIZE = 50;

export async function handleListOrganizations(body: ListOrganizationsBody): Promise<Response> {
  const admin = createAdminClient();
  const page = Math.max(1, body.page ?? 1);
  const size = Math.min(100, body.pageSize ?? PAGE_SIZE);
  const from = (page - 1) * size;

  let query = admin
    .from("organizations")
    .select(`id, name, owner_user_id,
      organization_status (status, active_users_count, max_users_allowed, plan_sku, deleted_at, blocked_reason, blocked_at)`)
    .order("name", { ascending: true })
    .range(from, from + size - 1);

  if (body.search) {
    query = query.ilike("name", `%${body.search}%`);
  }

  const { data, error } = await query;
  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);

  let rows = data ?? [];
  if (body.status) {
    rows = rows.filter((row) => {
      const st = row.organization_status as { status?: string } | { status?: string }[] | null;
      const statusRow = Array.isArray(st) ? st[0] : st;
      return statusRow?.status === body.status;
    });
  }

  return jsonResponse({ organizations: rows, page, pageSize: size });
}

export async function handleGetOrganization(body: GetOrganizationBody): Promise<Response> {
  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organizations")
    .select(`id, name, owner_user_id,
      organization_status (status, active_users_count, max_users_allowed, plan_sku, deleted_at, blocked_reason),
      organization_features (feature_key, is_enabled, capabilities,
        system_features (name, badge_status, is_globally_enabled))`)
    .eq("id", body.organizationId)
    .single();

  if (error || !org) return jsonResponse({ error: "Not found", code: "NOT_FOUND" }, 404);

  const features: OrgFeatureRow[] = ((org as Record<string, unknown>).organization_features as Array<Record<string, unknown>> ?? []).map((f) => {
    const sf = f.system_features as Record<string, unknown> ?? {};
    return {
      feature_key: f.feature_key as string,
      name: sf.name as string ?? f.feature_key as string,
      badge_status: sf.badge_status as string ?? "stable",
      is_globally_enabled: sf.is_globally_enabled as boolean ?? true,
      is_enabled: f.is_enabled as boolean,
      capabilities: f.capabilities as never,
    };
  });

  return jsonResponse({ organization: org, features });
}

export async function handleBlockOrganization(body: BlockOrganizationBody): Promise<Response> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_status")
    .update({
      status: "blocked",
      blocked_reason: body.reason,
      blocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", body.organizationId);

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ success: true });
}

export async function handleUnblockOrganization(body: UnblockOrganizationBody): Promise<Response> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_status")
    .update({
      status: "active",
      blocked_reason: null,
      blocked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", body.organizationId);

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ success: true });
}

export async function handleArchiveOrganization(body: ArchiveOrganizationBody): Promise<Response> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("organization_status")
    .update({
      status: "blocked",
      deleted_at: new Date().toISOString(),
      blocked_reason: body.reason ?? "Arquivada pelo admin",
      blocked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", body.organizationId);

  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ success: true });
}
