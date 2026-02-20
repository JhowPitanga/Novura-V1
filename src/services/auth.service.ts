import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AccessContext {
  organization_id: string | null;
  permissions: Record<string, Record<string, boolean>>;
  role: string;
  global_role: string | null;
  module_switches: Record<string, any>;
  display_name: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(userId: string): string {
  return `access_context:${userId}`;
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
        global_role: parsed.global_role || null,
        module_switches: parsed.module_switches || {},
        display_name: parsed.display_name || null,
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

export async function fetchAccessContext(
  userId: string
): Promise<AccessContext> {
  const defaults: AccessContext = {
    organization_id: null,
    permissions: {},
    role: "member",
    global_role: null,
    module_switches: {},
    display_name: null,
  };

  // @ts-expect-error – RPC not typed by Supabase codegen yet
  const { data, error } = await supabase.rpc("rpc_get_user_access_context", {
    p_user_id: userId,
  });

  if (error) return defaults;

  const ctx = Array.isArray(data) ? data?.[0] : data;
  if (!ctx) return defaults;

  const result: AccessContext = {
    organization_id: ctx.organization_id || null,
    permissions: ctx.permissions || {},
    role: ctx.role || "member",
    global_role: ctx.global_role || null,
    module_switches: ctx.module_switches || {},
    display_name: ctx.display_name || null,
  };

  cacheAccessContext(userId, ctx);
  return result;
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
