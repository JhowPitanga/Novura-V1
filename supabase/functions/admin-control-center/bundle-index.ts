/**
 * Self-contained deploy bundle for admin-control-center (MCP / manual deploy).
 * Keep in sync with handlers/* when changing business logic.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonRecord = Record<string, unknown>;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const COUNT_COLUMN: Record<string, string> = {
  organizations: "id",
  organization_status: "organization_id",
  organization_members: "id",
  marketplace_orders_presented_new: "id",
};

async function assertSuperAdmin(req: Request): Promise<Response | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  const role = (data.user.app_metadata as JsonRecord | null)?.role;
  return role === "super_admin" ? null : json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
}

async function exactCount(table: string, filter?: { column: string; value: string }): Promise<number> {
  const col = COUNT_COLUMN[table] ?? "id";
  let query = admin().from(table).select(col, { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function overviewMetrics(): Promise<Response> {
  try {
    const [tenants, blockedTenants, users, orders] = await Promise.all([
      exactCount("organizations"),
      exactCount("organization_status", { column: "status", value: "blocked" }),
      exactCount("organization_members"),
      exactCount("marketplace_orders_presented_new"),
    ]);
    return json({
      metrics: {
        tenants_total: tenants,
        tenants_blocked: blockedTenants,
        tenants_active: Math.max(0, tenants - blockedTenants),
        platform_users: users,
        orders_total: orders,
      },
    });
  } catch (err) {
    return json({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}

async function listOrganizations(body: JsonRecord): Promise<Response> {
  const page = Math.max(1, Number(body.page ?? 1));
  const size = Math.min(100, Number(body.pageSize ?? 50));
  const from = (page - 1) * size;

  let query = admin()
    .from("organizations")
    .select(
      "id, name, owner_user_id, organization_status (status, active_users_count, max_users_allowed, plan_sku, deleted_at, blocked_reason, blocked_at)",
    )
    .order("name", { ascending: true })
    .range(from, from + size - 1);

  if (typeof body.search === "string" && body.search) {
    query = query.ilike("name", `%${body.search}%`);
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);

  let rows = data ?? [];
  if (typeof body.status === "string" && body.status) {
    rows = rows.filter((row: JsonRecord) => {
      const raw = row.organization_status as JsonRecord | JsonRecord[] | null;
      const status = Array.isArray(raw) ? raw[0]?.status : raw?.status;
      return status === body.status;
    });
  }
  return json({ organizations: rows, page, pageSize: size });
}

async function getOrganization(body: JsonRecord): Promise<Response> {
  const orgId = String(body.organizationId ?? "");
  const { data: org, error } = await admin()
    .from("organizations")
    .select(
      `id, name, owner_user_id,
       organization_status (status, active_users_count, max_users_allowed, plan_sku, deleted_at, blocked_reason),
       organization_features (feature_key, is_enabled, capabilities,
         system_features (name, badge_status, is_globally_enabled))`,
    )
    .eq("id", orgId)
    .maybeSingle();

  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);
  if (!org) return json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const rawFeatures = (org as JsonRecord).organization_features as JsonRecord[] | undefined;
  const features = (rawFeatures ?? []).map((f) => {
    const sf = (f.system_features as JsonRecord | JsonRecord[] | null) ?? {};
    const sys = Array.isArray(sf) ? sf[0] : sf;
    return {
      feature_key: f.feature_key,
      name: sys?.name ?? f.feature_key,
      badge_status: sys?.badge_status ?? "stable",
      is_globally_enabled: sys?.is_globally_enabled ?? true,
      is_enabled: f.is_enabled,
      capabilities: f.capabilities ?? {},
    };
  });

  return json({ organization: org, features });
}

async function patchOrgStatus(body: JsonRecord, mode: "block" | "unblock" | "archive"): Promise<Response> {
  const id = String(body.organizationId ?? "");
  const now = new Date().toISOString();
  const payload =
    mode === "unblock"
      ? { status: "active", blocked_reason: null, blocked_at: null, updated_at: now }
      : {
        status: "blocked",
        blocked_reason: String(body.reason ?? "Admin"),
        blocked_at: now,
        updated_at: now,
        ...(mode === "archive" ? { deleted_at: now } : {}),
      };
  const { error } = await admin().from("organization_status").update(payload).eq("organization_id", id);
  return error ? json({ error: error.message, code: "DB_ERROR" }, 500) : json({ success: true });
}

async function listSystemFeatures(): Promise<Response> {
  const { data, error } = await admin().from("system_features").select("*").order("key");
  return error ? json({ error: error.message, code: "DB_ERROR" }, 500) : json({ features: data ?? [] });
}

const DEFAULT_CAPS = { can_view: true, can_create: true, can_edit: true, can_delete: false };

async function fetchOrgModuleCatalog(orgId: string): Promise<JsonRecord[]> {
  const [modsRes, featsRes, orgFeatsRes] = await Promise.all([
    admin().from("system_modules").select("id, name, display_name, description, active").order("name"),
    admin().from("system_features").select("key, name, badge_status, is_globally_enabled"),
    admin().from("organization_features").select("feature_key, is_enabled, capabilities").eq("organization_id", orgId),
  ]);
  if (modsRes.error) throw new Error(modsRes.error.message);
  if (featsRes.error) throw new Error(featsRes.error.message);
  if (orgFeatsRes.error) throw new Error(orgFeatsRes.error.message);
  const featByKey = new Map((featsRes.data ?? []).map((f: JsonRecord) => [f.key, f]));
  const orgByKey = new Map((orgFeatsRes.data ?? []).map((f: JsonRecord) => [f.feature_key, f]));
  return (modsRes.data ?? []).map((mod: JsonRecord) => {
    const feat = featByKey.get(mod.name) as JsonRecord | undefined;
    const orgF = orgByKey.get(mod.name) as JsonRecord | undefined;
    const globalGate = Boolean(mod.active) && Boolean(feat?.is_globally_enabled ?? true);
    const orgEnabled = orgF?.is_enabled ?? globalGate;
    const effectiveActive = globalGate && Boolean(orgEnabled);
    return {
      module_key: mod.name,
      module_id: mod.id,
      display_name: mod.display_name ?? mod.name,
      description: mod.description ?? null,
      global_module_active: Boolean(mod.active),
      badge_status: feat?.badge_status ?? "stable",
      feature_globally_enabled: feat?.is_globally_enabled ?? true,
      is_enabled: orgEnabled,
      effective_active: effectiveActive,
      capabilities: orgF?.capabilities ?? DEFAULT_CAPS,
      has_feature_catalog: Boolean(feat),
    };
  });
}

async function ensureSystemFeatureForModule(featureKey: string): Promise<void> {
  const { data: existing } = await admin().from("system_features").select("key").eq("key", featureKey).maybeSingle();
  if (existing) return;
  const { data: mod, error: modErr } = await admin().from("system_modules").select("name, display_name").eq("name", featureKey).maybeSingle();
  if (modErr || !mod) throw new Error(`Module not found: ${featureKey}`);
  const devKeys = new Set(["recursos_seller", "novura_academy", "comunidade"]);
  const badge = featureKey === "novura_academy" ? "new" : devKeys.has(featureKey) ? "beta" : "stable";
  const { error: insErr } = await admin().from("system_features").insert({
    key: mod.name,
    name: mod.display_name ?? mod.name,
    badge_status: badge,
    is_globally_enabled: true,
  });
  if (insErr) throw new Error(insErr.message);
}

async function listOrganizationFeatures(orgId: string): Promise<Response> {
  try {
    const modules = await fetchOrgModuleCatalog(orgId);
    const features = modules.map((m) => ({
      feature_key: m.module_key,
      name: m.display_name,
      badge_status: m.badge_status,
      is_globally_enabled: m.global_module_active && m.feature_globally_enabled,
      is_enabled: m.is_enabled,
      capabilities: m.capabilities,
    }));
    return json({ features, modules });
  } catch (err) {
    return json({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}

async function syncOrgModuleSwitches(organizationId: string): Promise<void> {
  const { error } = await admin().rpc("sync_org_module_switches", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

async function syncAllOrgsModuleSwitches(): Promise<void> {
  const { error } = await admin().rpc("sync_all_orgs_module_switches");
  if (error) throw new Error(error.message);
}

async function updateOrganizationFeatures(body: JsonRecord): Promise<Response> {
  const orgId = String(body.organizationId ?? "");
  const featureKey = String(body.featureKey ?? "");
  try {
    await ensureSystemFeatureForModule(featureKey);
  } catch (err) {
    return json({ error: (err as Error).message, code: "NOT_FOUND" }, 404);
  }
  const { error } = await admin().from("organization_features").upsert({
    organization_id: orgId,
    feature_key: body.featureKey,
    is_enabled: Boolean(body.is_enabled),
    capabilities: body.capabilities ?? {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,feature_key" });
  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);
  try {
    await syncOrgModuleSwitches(orgId);
    const { error: permErr } = await admin().rpc("bulk_set_module_view", {
      p_organization_id: orgId,
      p_module: featureKey,
      p_view: Boolean(body.is_enabled),
    });
    if (permErr) throw new Error(permErr.message);
  } catch (syncErr) {
    return json({ error: (syncErr as Error).message, code: "SYNC_ERROR" }, 500);
  }
  return json({ success: true });
}

async function listOrganizationModules(orgId: string): Promise<Response> {
  try {
    const modules = await fetchOrgModuleCatalog(orgId);
    return json({ modules });
  } catch (err) {
    return json({ error: (err as Error).message, code: "DB_ERROR" }, 500);
  }
}

async function updateSystemModule(body: JsonRecord): Promise<Response> {
  const { error } = await admin()
    .from("system_modules")
    .update({ active: Boolean(body.active) })
    .eq("name", String(body.moduleName ?? ""));
  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);
  try {
    await syncAllOrgsModuleSwitches();
  } catch (syncErr) {
    return json({ error: (syncErr as Error).message, code: "SYNC_ERROR" }, 500);
  }
  return json({ success: true });
}

async function listPlans(): Promise<Response> {
  const { data, error } = await admin().from("system_plans").select("*").order("price_cents");
  return error ? json({ error: error.message, code: "DB_ERROR" }, 500) : json({ plans: data ?? [] });
}

async function updateOrgPlan(body: JsonRecord): Promise<Response> {
  const planSku = String(body.planSku ?? "");
  const { data: plan, error: planError } = await admin()
    .from("system_plans")
    .select("sku, max_users")
    .eq("sku", planSku)
    .maybeSingle();
  if (planError || !plan) return json({ error: "Plan not found", code: "NOT_FOUND" }, 404);
  const { error } = await admin().from("organization_status").update({
    plan_sku: plan.sku,
    max_users_allowed: plan.max_users,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", String(body.organizationId ?? ""));
  return error ? json({ error: error.message, code: "DB_ERROR" }, 500) : json({ success: true });
}

async function listOrders(body: JsonRecord): Promise<Response> {
  const page = Math.max(1, Number(body.page ?? 1));
  const size = Math.min(100, Number(body.pageSize ?? 50));
  const from = (page - 1) * size;
  let query = admin()
    .from("marketplace_orders_presented_new")
    .select(
      "id, organizations_id, marketplace, marketplace_order_id, status, status_detail, status_interno, order_total, customer_name, shipping_city_name, shipping_state_uf, shipment_status, created_at, last_updated",
    )
    .order("last_updated", { ascending: false })
    .range(from, from + size - 1);
  if (typeof body.organizationId === "string" && body.organizationId) {
    query = query.eq("organizations_id", body.organizationId);
  }
  if (typeof body.status === "string" && body.status) query = query.eq("status", body.status);
  if (typeof body.marketplace === "string" && body.marketplace) {
    query = query.ilike("marketplace", `%${body.marketplace}%`);
  }
  const { data, error } = await query;
  return error ? json({ error: error.message, code: "DB_ERROR" }, 500) : json({ orders: data ?? [], page, pageSize: size });
}

async function ordersSummary(body: JsonRecord): Promise<Response> {
  let query = admin().from("marketplace_orders_presented_new").select("status, status_detail");
  if (typeof body.organizationId === "string" && body.organizationId) {
    query = query.eq("organizations_id", body.organizationId);
  }
  const { data, error } = await query;
  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);
  const summary: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = String((row as JsonRecord).status ?? "unknown");
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return json({ summary, total: (data ?? []).length });
}

async function listGlobalUsers(body: JsonRecord): Promise<Response> {
  const page = Math.max(1, Number(body.page ?? 1));
  const size = Math.min(100, Number(body.pageSize ?? 50));
  const from = (page - 1) * size;
  let query = admin()
    .from("organization_members")
    .select(
      `id, user_id, role, created_at, organization_id,
       organizations:organization_id (id, name, organization_status (status, deleted_at))`,
    )
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  if (typeof body.organizationId === "string" && body.organizationId) {
    query = query.eq("organization_id", body.organizationId);
  }
  if (typeof body.role === "string" && body.role) query = query.eq("role", body.role);
  const { data: members, error } = await query;
  if (error) return json({ error: error.message, code: "DB_ERROR" }, 500);

  const search = typeof body.search === "string" ? body.search.toLowerCase() : "";
  const userIds = (members ?? []).map((m: JsonRecord) => String(m.user_id));
  const authResults = await Promise.all(
    userIds.map(async (uid) => {
      const res = await admin().auth.admin.getUserById(uid);
      return { id: uid, email: res.data?.user?.email ?? null };
    }),
  );
  const emailMap = new Map(authResults.map((r) => [r.id, r.email]));

  const enriched = (members ?? []).map((m: JsonRecord) => {
    const org = m.organizations as JsonRecord | null;
    const st = org?.organization_status as JsonRecord | JsonRecord[] | null;
    const statusRow = Array.isArray(st) ? st[0] : st;
    return {
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      organization_id: m.organization_id,
      email: emailMap.get(String(m.user_id)) ?? null,
      organization_name: org?.name ?? null,
      organization_status: statusRow?.status ?? "active",
      organization_deleted: statusRow?.deleted_at != null,
    };
  }).filter((m) =>
    !search ||
    String(m.email ?? "").toLowerCase().includes(search) ||
    String(m.organization_name ?? "").toLowerCase().includes(search)
  );

  return json({ users: enriched, page, pageSize: size });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const auth = await assertSuperAdmin(req);
  if (auth) return auth;
  let body: JsonRecord = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON", code: "BAD_REQUEST" }, 400);
  }
  const action = String(body.action ?? "");
  try {
    switch (action) {
      case "overview_metrics":
        return await overviewMetrics();
      case "list_organizations":
        return await listOrganizations(body);
      case "get_organization":
        return await getOrganization(body);
      case "block_organization":
        return await patchOrgStatus(body, "block");
      case "unblock_organization":
        return await patchOrgStatus(body, "unblock");
      case "archive_organization":
        return await patchOrgStatus(body, "archive");
      case "list_system_features":
        return await listSystemFeatures();
      case "list_organization_features":
        return await listOrganizationFeatures(String(body.organizationId ?? ""));
      case "update_organization_features":
        return await updateOrganizationFeatures(body);
      case "list_organization_modules":
        return await listOrganizationModules(String(body.organizationId ?? ""));
      case "update_system_module":
        return await updateSystemModule(body);
      case "list_system_plans":
        return await listPlans();
      case "update_organization_plan":
        return await updateOrgPlan(body);
      case "list_global_orders":
        return await listOrders(body);
      case "orders_status_summary":
        return await ordersSummary(body);
      case "list_global_users":
        return await listGlobalUsers(body);
      default:
        return json({ error: `Unknown action: ${action}`, code: "BAD_REQUEST" }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message, code: "INTERNAL_ERROR" }, 500);
  }
});
