import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ACCESS_CONTEXT_CACHE_TTL_MS } from "@/lib/accessContext";

export interface AccessContext {
  organization_id: string | null;
  permissions: Record<string, Record<string, boolean>>;
  role: string;
  /** @deprecated Use global_role — now derived from JWT app_metadata.role */
  global_role: string | null;
  /** admin_role from JWT app_metadata.role (super_admin or null) */
  admin_role: string | null;
  module_switches: Record<string, any>;
  display_name: string | null;
  org_blocked: boolean;
}

const CACHE_TTL_MS = ACCESS_CONTEXT_CACHE_TTL_MS;

/** Prevents duplicate concurrent RPC calls for the same user (e.g. init race, rapid navigation). */
const inflightFetches = new Map<string, Promise<AccessContext>>();

function getCacheKey(userId: string): string {
  return `access_context:${userId}`;
}

/** Returns true when sessionStorage still holds a valid access context for the user. */
export function isAccessContextCacheFresh(userId: string): boolean {
  return getCachedAccessContext(userId) !== null;
}

export function clearAccessContextCache(userId: string): void {
  sessionStorage.removeItem(getCacheKey(userId));
}

export function getCachedAccessContext(
  userId: string
): AccessContext | null {
  const raw = sessionStorage.getItem(getCacheKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      Number.isFinite(parsed.cachedAt) &&
      Date.now() - parsed.cachedAt < CACHE_TTL_MS
    ) {
      return {
        organization_id: parsed.organization_id || null,
        permissions: parsed.permissions || {},
        role: parsed.role || "member",
        global_role: parsed.admin_role || parsed.global_role || null,
        admin_role: parsed.admin_role || null,
        module_switches: parsed.module_switches || {},
        display_name: parsed.display_name || null,
        org_blocked: parsed.org_blocked || false,
      };
    }
  } catch {
    // corrupt cache
  }

  return null;
}

export function cacheAccessContext(
  userId: string,
  ctx: Record<string, any>
): void {
  sessionStorage.setItem(
    getCacheKey(userId),
    JSON.stringify({ ...ctx, cachedAt: Date.now() })
  );
}

async function fetchAccessContextInternal(
  userId: string,
): Promise<AccessContext> {
  const defaults: AccessContext = {
    organization_id: null,
    permissions: {},
    role: "member",
    global_role: null,
    admin_role: null,
    module_switches: {},
    display_name: null,
    org_blocked: false,
  };

  // @ts-expect-error – RPC not typed by Supabase codegen yet
  const { data, error } = await supabase.rpc("rpc_get_user_access_context", {
    p_user_id: userId,
  });

  if (error) {
    console.warn("[auth] rpc_get_user_access_context failed:", error.message);
    return defaults;
  }

  const ctx = Array.isArray(data) ? data?.[0] : data;
  if (!ctx) return defaults;

  const organizationId = ctx.organization_id || null;
  let moduleSwitches = ctx.module_switches || {};

  if (organizationId) {
    moduleSwitches = await resolveEffectiveModuleSwitches(
      organizationId,
      moduleSwitches as Record<string, unknown>,
    );
  }

  const result: AccessContext = {
    organization_id: organizationId,
    permissions: ctx.permissions || {},
    role: ctx.role || "member",
    global_role: ctx.admin_role || ctx.global_role || null,
    admin_role: ctx.admin_role || null,
    module_switches: moduleSwitches,
    display_name: ctx.display_name || null,
    org_blocked: ctx.org_blocked || false,
  };

  cacheAccessContext(userId, {
    ...ctx,
    organization_id: organizationId,
    module_switches: moduleSwitches,
  });
  return result;
}

export async function fetchAccessContext(
  userId: string,
  options?: { bypassCache?: boolean },
): Promise<AccessContext> {
  if (!options?.bypassCache) {
    const cached = getCachedAccessContext(userId);
    if (cached) return cached;
  } else {
    clearAccessContextCache(userId);
  }

  const existing = inflightFetches.get(userId);
  if (existing) return existing;

  const promise = fetchAccessContextInternal(userId).finally(() => {
    inflightFetches.delete(userId);
  });
  inflightFetches.set(userId, promise);
  return promise;
}

/** Recomputes switches from system_modules + organization_features (server-side truth). */
async function resolveEffectiveModuleSwitches(
  organizationId: string,
  memberSwitches: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    // @ts-expect-error – RPC not in generated types yet
    const { data, error } = await supabase.rpc("build_effective_module_switches", {
      p_organization_id: organizationId,
      p_member_switches: memberSwitches ?? {},
    });
    if (!error && data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    if (error) {
      console.warn("[auth] build_effective_module_switches:", error.message);
    }
  } catch (e) {
    console.warn("[auth] build_effective_module_switches exception:", e);
  }
  return memberSwitches;
}
export async function loadAccessContext(
  user: User | null
): Promise<AccessContext | null> {
  if (!user) return null;

  const cached = getCachedAccessContext(user.id);
  if (cached) return cached;

  return fetchAccessContext(user.id);
}

export async function ensureEditorRecord(user: User): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("editor" as any)
      .select("user_id")
      .eq("user_id", user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("editor" as any).insert({
        user_id: user.id,
        email: user.email,
      });
    }
  } catch (e) {
    console.error("Failed to ensure editor record:", e);
  }
}

export async function ensurePublicUserRecord(user: User): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", user.id)
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("users").insert({ id: user.id });
    }
  } catch (e) {
    console.error("Failed to ensure public user record:", e);
  }
}

export async function bootstrapUserOrg(userId: string): Promise<void> {
  try {
    await supabase.rpc("rpc_bootstrap_user_org", { p_user_id: userId });
  } catch {
    // silently ignore
  }
}
