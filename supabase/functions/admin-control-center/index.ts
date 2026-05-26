/**
 * admin-control-center/index.ts
 * Secure API gateway for the Novura Admin Console.
 * Auth guard runs BEFORE any business logic.
 * ≤150 lines — all business logic lives in handlers/*.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleOptions, jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { assertSuperAdmin, isSuperAdminUser } from "./auth/assertSuperAdmin.ts";
import {
  handleArchiveOrganization,
  handleBlockOrganization,
  handleGetOrganization,
  handleListOrganizations,
  handleUnblockOrganization,
} from "./handlers/organizations.ts";
import {
  handleListOrganizationFeatures,
  handleListSystemFeatures,
  handleUpdateOrganizationFeatures,
} from "./handlers/features.ts";
import {
  handleListGlobalOrders,
  handleListGlobalUsers,
  handleOrdersStatusSummary,
} from "./handlers/orders.ts";
import {
  handleListOrganizationModules,
  handleListSystemPlans,
  handleUpdateOrganizationPlan,
  handleUpdateSystemModule,
} from "./handlers/modules.ts";
import { handleOverviewMetrics } from "./handlers/metrics.ts";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return handleOptions();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const adminOrResponse = await assertSuperAdmin(req);
  if (!isSuperAdminUser(adminOrResponse)) return adminOrResponse;

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON", code: "BAD_REQUEST" }, 400);
  }

  const action = body.action as string | undefined;
  if (!action) {
    return jsonResponse({ error: "Missing action", code: "BAD_REQUEST" }, 400);
  }

  // ── Route ──────────────────────────────────────────────────────────────────
  try {
    switch (action) {
      case "overview_metrics":
        return await handleOverviewMetrics();

      // Organizations
      case "list_organizations":
        return await handleListOrganizations(body as never);
      case "get_organization":
        return await handleGetOrganization(body as never);
      case "block_organization":
        return await handleBlockOrganization(body as never);
      case "unblock_organization":
        return await handleUnblockOrganization(body as never);
      case "archive_organization":
        return await handleArchiveOrganization(body as never);

      // Features
      case "list_system_features":
        return await handleListSystemFeatures();
      case "update_organization_features":
        return await handleUpdateOrganizationFeatures(body as never);
      case "list_organization_features": {
        const orgId = body.organizationId as string | undefined;
        if (!orgId) return jsonResponse({ error: "Missing organizationId", code: "BAD_REQUEST" }, 400);
        return await handleListOrganizationFeatures(orgId);
      }
      case "list_organization_modules": {
        const orgId = body.organizationId as string | undefined;
        if (!orgId) return jsonResponse({ error: "Missing organizationId", code: "BAD_REQUEST" }, 400);
        return await handleListOrganizationModules(orgId);
      }
      case "update_system_module":
        return await handleUpdateSystemModule(
          body.moduleName as string,
          Boolean(body.active),
        );
      case "list_system_plans":
        return await handleListSystemPlans();
      case "update_organization_plan":
        return await handleUpdateOrganizationPlan(
          body.organizationId as string,
          body.planSku as string,
        );

      // Orders
      case "list_global_orders":
        return await handleListGlobalOrders(body as never);
      case "orders_status_summary":
        return await handleOrdersStatusSummary(body as never);

      // Users
      case "list_global_users":
        return await handleListGlobalUsers(
          body.search as string | undefined,
          body.organizationId as string | undefined,
          body.role as string | undefined,
          Math.max(1, (body.page as number) || 1),
          Math.min(100, (body.pageSize as number) || 50),
        );

      default:
        return jsonResponse({ error: `Unknown action: ${action}`, code: "BAD_REQUEST" }, 400);
    }
  } catch (err) {
    const e = err as Error;
    console.error(JSON.stringify({ scope: "admin-control-center", action, error: e.message }));
    return jsonResponse({ error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
});
