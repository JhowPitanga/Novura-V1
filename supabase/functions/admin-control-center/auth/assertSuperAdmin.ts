/**
 * assertSuperAdmin.ts
 * Validates that the incoming request carries a super_admin JWT.
 * Returns the authenticated user or throws a 403 Response.
 */

import { createAdminClient } from "../../_shared/adapters/infra/supabase-client.ts";
import { jsonResponse } from "../../_shared/adapters/infra/http-utils.ts";

export interface SuperAdminUser {
  readonly id: string;
  readonly email: string | undefined;
  readonly app_metadata: Record<string, unknown>;
}

export async function assertSuperAdmin(req: Request): Promise<SuperAdminUser | Response> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const admin = createAdminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user) {
    return jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const role = (user.app_metadata as Record<string, unknown>)?.role;
  if (role !== "super_admin") {
    return jsonResponse({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }

  return {
    id: user.id,
    email: user.email,
    app_metadata: user.app_metadata as Record<string, unknown>,
  };
}

export function isSuperAdminUser(val: SuperAdminUser | Response): val is SuperAdminUser {
  return !(val instanceof Response);
}
