/**
 * handlers/metrics.ts
 * Infra metrics for the internal admin overview.
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";

/** Primary key / count column per table (organization_status has no `id`). */
const COUNT_COLUMN: Record<string, string> = {
  organizations: "id",
  organization_status: "organization_id",
  organization_members: "id",
  marketplace_orders_presented_new: "id",
};

async function exactCount(
  table: string,
  filter?: { readonly column: string; readonly value: string },
): Promise<number> {
  const admin = createAdminClient();
  const column = COUNT_COLUMN[table] ?? "id";
  let query = admin.from(table).select(column, { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function handleOverviewMetrics(): Promise<Response> {
  try {
    const [tenants, blockedTenants, users, orders] = await Promise.all([
      exactCount("organizations"),
      exactCount("organization_status", { column: "status", value: "blocked" }),
      exactCount("organization_members"),
      exactCount("marketplace_orders_presented_new"),
    ]);

    return jsonResponse({
      metrics: {
        tenants_total: tenants,
        tenants_blocked: blockedTenants,
        tenants_active: Math.max(0, tenants - blockedTenants),
        platform_users: users,
        orders_total: orders,
      },
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}
