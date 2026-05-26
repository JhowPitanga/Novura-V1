/**
 * handlers/orders.ts
 * Global cross-tenant order operations for the admin console.
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";
import type {
  ListGlobalOrdersBody,
  OrdersStatusSummaryBody,
} from "../types/AdminApiTypes.ts";

const PAGE_SIZE = 50;

export async function handleListGlobalOrders(body: ListGlobalOrdersBody): Promise<Response> {
  const admin = createAdminClient();
  const page = Math.max(1, body.page ?? 1);
  const size = Math.min(100, body.pageSize ?? PAGE_SIZE);
  const from = (page - 1) * size;

  let query = admin
    .from("marketplace_orders_presented_new")
    .select(
      `id, organizations_id, marketplace, marketplace_order_id,
       status, status_detail, status_interno, order_total, customer_name,
       shipping_city_name, shipping_state_uf,
       shipment_status, created_at, last_updated`,
    )
    .order("last_updated", { ascending: false })
    .range(from, from + size - 1);

  if (body.organizationId) {
    query = query.eq("organizations_id", body.organizationId);
  }
  if (body.status) {
    query = query.eq("status", body.status);
  }
  if (body.marketplace) {
    query = query.ilike("marketplace", `%${body.marketplace}%`);
  }

  const { data, error, count } = await query;
  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);
  return jsonResponse({ orders: data, page, pageSize: size, total: count });
}

export async function handleOrdersStatusSummary(body: OrdersStatusSummaryBody): Promise<Response> {
  const admin = createAdminClient();

  let query = admin
    .from("marketplace_orders_presented_new")
    .select("status, status_detail");

  if (body.organizationId) {
    query = query.eq("organizations_id", body.organizationId);
  }

  const { data, error } = await query;
  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = String(row.status ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return jsonResponse({ summary: counts, total: (data ?? []).length });
}

export async function handleListGlobalUsers(
  search: string | undefined,
  organizationId: string | undefined,
  role: string | undefined,
  page: number,
  pageSize: number,
): Promise<Response> {
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;

  let query = admin
    .from("organization_members")
    .select(
      `id, user_id, role, created_at, organization_id,
       organizations:organization_id (
         id, name,
         organization_status (status, deleted_at)
       )`,
    )
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (organizationId) query = query.eq("organization_id", organizationId);
  if (role) query = query.eq("role", role);

  const { data: members, error } = await query;
  if (error) return jsonResponse({ error: error.message, code: "DB_ERROR" }, 500);

  // Fetch auth emails for the result set
  const userIds = (members ?? []).map((m) => m.user_id as string);
  const authResults = await Promise.all(
    userIds.map(async (uid) => {
      const res = await admin.auth.admin.getUserById(uid);
      return { id: uid, email: res.data?.user?.email ?? null };
    }),
  );
  const emailMap = new Map(authResults.map((r) => [r.id, r.email]));

  const enriched = (members ?? []).map((m) => {
    const org = m.organizations as {
      id: string;
      name: string | null;
      organization_status?: { status: string; deleted_at: string | null } | { status: string; deleted_at: string | null }[];
    } | null;
    const st = org?.organization_status;
    const statusRow = Array.isArray(st) ? st[0] : st;
    return {
      id: m.id as string,
      user_id: m.user_id as string,
      role: m.role as string,
      created_at: m.created_at as string,
      organization_id: m.organization_id as string,
      email: emailMap.get(m.user_id as string) ?? null,
      organization_name: org?.name ?? null,
      organization_status: statusRow?.status ?? "active",
      organization_deleted: statusRow?.deleted_at != null,
    };
  }).filter((m) =>
    !search ||
    String(m.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    String(m.organization_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return jsonResponse({ users: enriched, page, pageSize });
}
