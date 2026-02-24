// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";

function generateInvitationToken(bytesLength: number = 32) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, GET, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const admin = createAdminClient();
    const { data: { user } } = await admin.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", ""));

    if (!user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Resolve user's organization and permissions with robust fallbacks
    let organizationId: string | null = null;
    let userRole: string = 'member';
    let memberPermissions: any = {};

    // 1) Try RPC with fallback logic from DB helpers
    try {
      const { data: orgIdData, error: orgIdErr } = await admin.rpc('get_user_organization_id', {
        p_user_id: user.id,
      });
      if (!orgIdErr && orgIdData) {
        organizationId = Array.isArray(orgIdData) ? (orgIdData[0] as string) : (orgIdData as string);
      }
    } catch (_) {
      // ignore and fallback to direct query
    }

    // 2) If still unknown, read from organization_members (direct)
    if (!organizationId) {
      const { data: orgMember } = await admin
        .from('organization_members')
        .select('organization_id, role, permissions')
        .eq('user_id', user.id)
        .order('role', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (orgMember) {
        organizationId = orgMember.organization_id;
        userRole = orgMember.role || userRole;
        memberPermissions = orgMember.permissions || memberPermissions;
      }
    }

    if (!organizationId) {
      return jsonResponse({ error: 'User not found in any organization' }, 404);
    }

    let globalRole: string | null = null;
    try {
      const { data: gRow } = await admin
        .from('users')
        .select('global_role')
        .eq('id', user.id)
        .maybeSingle();
      globalRole = (gRow as any)?.global_role ?? null;
    } catch (_) {}
    if (!globalRole) {
      const meta = (user as any)?.user_metadata || {};
      const app = (user as any)?.app_metadata || {};
      globalRole = (meta?.global_role as string | null) || (app?.global_role as string | null) || null;
    }

    // 3) Try to load role/permissions via RPC (it has invite fallback semantics)
    try {
      const { data: permsRow, error: permsErr } = await admin.rpc('rpc_get_member_permissions', {
        p_user_id: user.id,
        p_organization_id: organizationId,
      });
      if (!permsErr && permsRow) {
        const row = Array.isArray(permsRow) ? (permsRow[0] as any) : (permsRow as any);
        userRole = row?.role || userRole;
        memberPermissions = row?.permissions || memberPermissions || {};
      }
    } catch (_) {
      // keep best-effort values
    }

    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    // Allow action via JSON body when not provided in query (so clients can use supabase.functions.invoke)
    if (!action && (req.method === "POST" || req.method === "PUT" || req.method === "DELETE")) {
      try {
        const maybeJson = await req.clone().json().catch(() => null);
        action = (maybeJson && typeof maybeJson.action === 'string') ? maybeJson.action : action;
      } catch (_) {
        // ignore body parse issues here; handlers will parse again as needed
      }
    }

    switch (action) {
      case "toggle_module":
        return await handleToggleModule(admin, req, organizationId, globalRole);
      case "list_users":
        if (!["owner", "admin"].includes(userRole)) {
          return jsonResponse({ error: "Insufficient permissions to list users" }, 403);
        }
        return await handleListUsers(admin, organizationId, userRole);
      case "list_all_users":
        if (!(["owner", "admin", "super"].includes(userRole) || globalRole === 'nv_superadmin')) {
          return jsonResponse({ error: "Insufficient permissions to list all users" }, 403);
        }
        return await handleListAllUsers(admin, organizationId);
      case "invite_user":
        {
          const canInvite = ["owner", "admin"].includes(userRole)
            || !!(memberPermissions?.usuarios?.invite === true);
          if (!canInvite) {
            return jsonResponse({ error: "Insufficient permissions to invite users" }, 403);
          }
          return await handleInviteUser(admin, req, organizationId, user.id);
        }
      case "update_user_permissions":
        return await handleUpdateUserPermissions(admin, req, organizationId, userRole, memberPermissions);
      case "remove_user":
        return await handleRemoveUser(admin, req, organizationId, userRole);
      case "get_user_permissions":
        return await handleGetUserPermissions(admin, req, organizationId);
      case "get_user_details":
        return await handleGetUserDetails(admin, req, organizationId);
      case "update_user_identity":
        return await handleUpdateUserIdentity(admin, req, organizationId, userRole, memberPermissions);
      case "send_password_reset":
        return await handleSendPasswordReset(admin, req, organizationId, userRole, memberPermissions);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (e) {
    const err: any = e as any;
    const message = err?.message || "Unknown error";
    const details = err?.details || err?.hint || err?.error;
    const code = err?.code;
    return jsonResponse({ error: message, details, code }, 500);
  }
});

async function handleListUsers(admin: any, organizationId: string, userRole: string) {
  // Buscar membros da organização
  const { data: members, error: membersError } = await admin
    .from("organization_members")
    .select(`
      id,
      role,
      permissions,
      created_at,
      updated_at,
      user_id
    `)
    .eq("organization_id", organizationId);

  if (membersError) {
    throw membersError;
  }

  const userIds = (members || []).map((member: any) => member.user_id);

  // Buscar display_name em public.user_profiles (se existir)
  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("id, display_name")
    .in("id", userIds);

  if (profilesError) {
    // Não falha hard: apenas registra detalhes para retorno
    console.warn("user_profiles lookup error", profilesError);
  }

  const profilesMap = new Map<string, string>();
  for (const p of profiles || []) {
    if (p?.id) profilesMap.set(p.id, p.display_name);
  }

  // Buscar dados de auth via Admin API (email, last_sign_in_at, user_metadata)
  const adminUsersResults = await Promise.all(
    userIds.map(async (id: string) => {
      try {
        const res = await admin.auth.admin.getUserById(id);
        return { id, user: res.data?.user || null, error: res.error || null };
      } catch (e) {
        return { id, user: null, error: e };
      }
    })
  );

  const authMap = new Map<string, any>();
  for (const r of adminUsersResults) {
    if (r.user) authMap.set(r.id, r.user);
  }

  // Monta resposta unificada
  const usersWithDetails = (members || []).map((member: any) => {
    const authUser = authMap.get(member.user_id);
    const email = authUser?.email || undefined;
    const metadataName = authUser?.user_metadata?.name || authUser?.user_metadata?.full_name;
    const displayName = profilesMap.get(member.user_id);

    return {
      ...member,
      users: {
        id: member.user_id,
        email,
        name: displayName || metadataName || email || null,
        last_login: authUser?.last_sign_in_at || null,
      },
    };
  });

  return jsonResponse({ users: usersWithDetails });
}

async function handleToggleModule(admin: any, req: Request, organizationId: string, globalRole: string | null) {
  const { module_id, module_name, active, organization_id } = await req.json();
  if (globalRole !== 'nv_superadmin') {
    return jsonResponse({ error: 'Insufficient permissions' }, 403);
  }
  if (typeof active !== 'boolean') {
    return jsonResponse({ error: 'Active flag is required' }, 400);
  }
  const targetOrgId = (organization_id as string | undefined) || organizationId;
  let name = module_name as string | undefined;
  let id = module_id as string | undefined;
  if (!name && id) {
    const { data } = await admin
      .from('system_modules')
      .select('name')
      .eq('id', id)
      .maybeSingle();
    name = (data as any)?.name || undefined;
  }
  if (!id && name) {
    const { data } = await admin
      .from('system_modules')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    id = (data as any)?.id || undefined;
  }
  if (!name || !id) {
    return jsonResponse({ error: 'Module not found' }, 404);
  }
  try {
    const { error: modErr } = await admin
      .from('system_modules')
      .update({ active })
      .eq('id', id);
  } catch (_) {}

  let permsErr: any = null;
  try {
    const { error } = await admin.rpc('bulk_set_module_enabled', {
      p_organization_id: targetOrgId,
      p_module: name,
      p_enabled: active,
    });
    permsErr = error || null;
  } catch (e) {
    permsErr = e as any;
  }
  if (permsErr) {
    const ok = await updateModuleEnabledWithoutRpc(admin, targetOrgId, name, active);
    if (!ok) {
      return jsonResponse({ error: 'Failed to update permissions' }, 500);
    }
  }

  let switchErr: any = null;
  try {
    const { error } = await admin.rpc('set_global_module_switch', {
      p_organization_id: targetOrgId,
      p_module: name,
      p_active: active,
    });
    switchErr = error || null;
  } catch (e) {
    switchErr = e as any;
  }
  if (switchErr) {
    try {
      await setGlobalModuleSwitchWithoutRpc(admin, targetOrgId, name, active);
    } catch (_) {}
  }

  return jsonResponse({ success: true });
}

async function updateModuleEnabledWithoutRpc(admin: any, orgId: string, moduleName: string, enabled: boolean) {
  let moduleId: string | null = null;
  try {
    const { data: m } = await admin
      .from('system_modules')
      .select('id')
      .eq('name', moduleName)
      .maybeSingle();
    moduleId = (m as any)?.id || null;
  } catch (_) {}

  let actions: string[] = [];
  if (moduleId) {
    try {
      const { data: acts } = await admin
        .from('module_actions')
        .select('name')
        .eq('module_id', moduleId);
      actions = (acts || []).map((a: any) => String(a.name));
    } catch (_) {}
  }
  if (!actions || actions.length === 0) actions = ['view'];
  const vJson: any = {};
  for (const a of actions) vJson[a] = enabled;

  const { data: members } = await admin
    .from('organization_members')
    .select('user_id, role, permissions')
    .eq('organization_id', orgId)
    .in('role', ['admin','member']);
  const memberIds = (members || []).map((m: any) => String(m.user_id));

  let superIds: string[] = [];
  if (memberIds.length > 0) {
    try {
      const { data: users } = await admin
        .from('users')
        .select('id, global_role')
        .in('id', memberIds);
      superIds = (users || [])
        .filter((u: any) => (u?.global_role === 'nv_superadmin'))
        .map((u: any) => String(u.id));
    } catch (_) {}
  }

  const targets = (members || []).filter((m: any) => !superIds.includes(String(m.user_id)));
  const updates = targets.map(async (m: any) => {
    const current = m.permissions || {};
    const next = { ...current, [moduleName]: vJson };
    const { error } = await admin
      .from('organization_members')
      .update({ permissions: next })
      .eq('organization_id', orgId)
      .eq('user_id', m.user_id);
    if (error) throw error;
  });
  try {
    await Promise.all(updates);
    return true;
  } catch (_) {
    return false;
  }
}

async function setGlobalModuleSwitchWithoutRpc(admin: any, orgId: string, moduleName: string, active: boolean) {
  const { data: members } = await admin
    .from('organization_members')
    .select('user_id, module_switches')
    .eq('organization_id', orgId);
  const updates = (members || []).map(async (m: any) => {
    const raw = m.module_switches || {};
    const global = (raw && typeof raw === 'object') ? (raw.global || {}) : {};
    const next = { ...raw, global: { ...global, [moduleName]: { active } } };
    const { error } = await admin
      .from('organization_members')
      .update({ module_switches: next })
      .eq('organization_id', orgId)
      .eq('user_id', m.user_id);
    if (error) throw error;
  });
  await Promise.all(updates);
}

async function handleListAllUsers(admin: any, organizationId: string) {
  let page = 1;
  const perPage = 100;
  const all: any[] = [];
  for (let i = 0; i < 20; i++) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
    if (listErr) throw listErr;
    const batch = (list?.users || []);
    all.push(...batch);
    if (!list || !list.users || batch.length < perPage) break;
    page += 1;
  }
  const ids = all.map((u: any) => String(u.id));
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role, permissions")
    .eq("organization_id", organizationId)
    .in("user_id", ids);
  const memMap = new Map<string, { role?: string; permissions?: any }>();
  for (const m of members || []) {
    memMap.set(String(m.user_id), { role: m.role, permissions: m.permissions });
  }
  const usersWithDetails = all.map((u: any) => {
    const m = memMap.get(String(u.id)) || {};
    const email = u?.email || undefined;
    const nameFromMeta = u?.user_metadata?.name || u?.user_metadata?.full_name || null;
    const name = nameFromMeta || email || null;
    return {
      id: String(u.id),
      user_id: String(u.id),
      role: m.role || undefined,
      permissions: m.permissions || {},
      users: { id: String(u.id), email, name, last_login: u?.last_sign_in_at || null },
    };
  });
  return jsonResponse({ users: usersWithDetails });
}

async function handleInviteUser(admin: any, req: Request, organizationId: string, inviterUserId: string) {
  const { email, name, phone, permissions, role } = await req.json();

  if (!email) {
    return jsonResponse({ error: "Email is required" }, 400);
  }

  // Create invitation record (for tracking org, role, permissions)
  // Generate a token and try inserting with either 'token' or 'invitation_token' depending on schema
  const invitationToken = generateInvitationToken();
  const basePayload: any = {
    email,
    nome: name,
    telefone: phone,
    permissions,
    invited_by_user_id: inviterUserId,
    organization_id: organizationId,
    role: role || 'member'
  };

  async function tryInsert(withColumn: 'token' | 'invitation_token', withStatus?: 'pendente' | 'pending') {
    const payload: any = { ...basePayload, [withColumn]: invitationToken };
    if (withStatus) payload.status = withStatus;
    return await admin
      .from("user_invitations")
      .insert(payload)
      .select()
      .single();
  }

  // Attempt order:
  // 1) token (no status) -> 2) token + status pendente -> 3) invitation_token (no status) -> 4) invitation_token + status pendente -> 5) repeat with 'pending'
  let invitationInsert = await tryInsert('token');
  if (invitationInsert.error) {
    const msg = String(invitationInsert.error.message || '').toLowerCase();
    if (msg.includes('column "token"') && msg.includes('does not exist')) {
      invitationInsert = await tryInsert('invitation_token');
    } else if (msg.includes('user_invitations_status_check')) {
      invitationInsert = await tryInsert('token', 'pendente');
    }
  }

  if (invitationInsert.error) {
    const msg = String(invitationInsert.error.message || '').toLowerCase();
    if (msg.includes('user_invitations_status_check')) {
      // Try english fallback for status word, still on last used column
      const lastTriedIsToken = !msg.includes('column "token"') || !msg.includes('does not exist');
      invitationInsert = await tryInsert(lastTriedIsToken ? 'token' : 'invitation_token', 'pending');
    } else if (msg.includes('column "invitation_token"') && msg.includes('does not exist')) {
      // Schema only has 'token'
      invitationInsert = await tryInsert('token');
    }
  }

  if (invitationInsert.error) {
    throw invitationInsert.error;
  }
  const invitation = invitationInsert.data;

  // Compute redirectTo using configured SITE_URL
  const origin = req.headers.get("origin") || undefined;
  const siteUrl = (Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("APP_URL") || origin || "http://127.0.0.1:5176").replace(/\/$/, "");
  const redirectTo = `${siteUrl}/convite-aceito?invitation_id=${encodeURIComponent(invitation.id)}`;

  // Send invitation email via Supabase Auth
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invitation_id: invitation.id,
      organization_id: organizationId,
      invited_by_user_id: inviterUserId,
      invited_name: name || null,
    },
  });

  if (inviteError) {
    // Mapeia erros comuns para respostas amigáveis e não remove o registro (permite retry)
    const msg = inviteError.message?.toLowerCase?.() || "";
    const friendly = msg.includes("already") || msg.includes("exist")
      ? "Email já cadastrado ou convite já enviado."
      : msg.includes("redirect")
        ? "URL de redirecionamento não permitida nas configurações do Auth."
        : inviteError.message;

    return jsonResponse({ error: friendly }, 409);
  }

  return jsonResponse({
    invitation_id: invitation.id,
    email_sent: true,
  });
}

async function handleUpdateUserPermissions(admin: any, req: Request, organizationId: string, userRole: string, memberPermissions: any) {
  const { user_id, permissions } = await req.json();

  if (!user_id || !permissions) {
    return jsonResponse({ error: "User ID and permissions are required" }, 400);
  }

  // Owners/admins or users with granular permission can update
  const canUpdate = ["owner", "admin"].includes(userRole)
    || !!(memberPermissions?.usuarios?.manage_permissions === true);
  if (!canUpdate) {
    return jsonResponse({ error: "Insufficient permissions to update user permissions" }, 403);
  }

  // Update user permissions
  const { error: updateError } = await admin
    .from("organization_members")
    .update({ permissions })
    .eq("organization_id", organizationId)
    .eq("user_id", user_id);

  if (updateError) {
    throw updateError;
  }

  return jsonResponse({ success: true });
}

async function handleRemoveUser(admin: any, req: Request, organizationId: string, userRole: string) {
  const { user_id } = await req.json();

  if (!user_id) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  // Owners and admins can remove users (but only owners can remove owners)
  if (!["owner", "admin"].includes(userRole)) {
    return jsonResponse({ error: "Insufficient permissions to remove users" }, 403);
  }

  // Cannot remove yourself
  const { data: { user } } = await admin.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", ""));
  if (user_id === user?.id) {
    return jsonResponse({ error: "Cannot remove yourself from the organization" }, 400);
  }

  // Check target member role to prevent admin removing owners
  const { data: targetMember, error: targetMemberError } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user_id)
    .single();
  if (targetMemberError) throw targetMemberError;
  if (targetMember?.role === 'owner' && userRole !== 'owner') {
    return jsonResponse({ error: "Only owners can remove owners" }, 403);
  }

  // Fully delete user account from Supabase Auth (prevents future logins)
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(user_id);
  if (authDeleteError) {
    throw authDeleteError;
  }

  // Best-effort cleanup: remove org membership and profile data
  const { error: removeMemberError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", user_id);
  if (removeMemberError) {
    // Surface error to caller
    throw removeMemberError;
  }

  const { error: profileDeleteError } = await admin
    .from("user_profiles")
    .delete()
    .eq("id", user_id);
  if (profileDeleteError && profileDeleteError.code !== 'PGRST116') {
    // Ignore not found, but raise other errors
    throw profileDeleteError;
  }

  return jsonResponse({ success: true, auth_deleted: true });
}

async function handleGetUserPermissions(admin: any, req: Request, organizationId: string) {
  const { user_id } = await req.json();

  if (!user_id) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("permissions, role")
    .eq("organization_id", organizationId)
    .eq("user_id", user_id)
    .single();

  if (memberError) {
    throw memberError;
  }

  return jsonResponse({ permissions: member.permissions, role: member.role });
}

// Returns user's basic details (email, display name) for the same organization
async function handleGetUserDetails(admin: any, req: Request, organizationId: string) {
  const { user_id } = await req.json();
  if (!user_id) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  // Ensure the target user is part of the same organization
  const { data: targetMember, error: targetError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user_id)
    .single();
  if (targetError || !targetMember) {
    return jsonResponse({ error: "User not found in this organization" }, 404);
  }

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("display_name")
    .eq("id", user_id)
    .single();
  if (profileError && profileError.code !== 'PGRST116') {
    // ignore not found, but surface other errors
    console.warn('user_profiles fetch error', profileError);
  }

  const { data: authRes, error: authErr } = await admin.auth.admin.getUserById(user_id);
  if (authErr) {
    throw authErr;
  }
  const email = authRes?.user?.email || null;
  const nameFromMeta = authRes?.user?.user_metadata?.name || authRes?.user?.user_metadata?.full_name || null;
  const name = profile?.display_name || nameFromMeta || email;

  return jsonResponse({ email, name });
}

// Updates user's email and/or display name (profile), with permission checks
async function handleUpdateUserIdentity(admin: any, req: Request, organizationId: string, userRole: string, memberPermissions: any) {
  const { user_id, email, name } = await req.json();
  if (!user_id) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  const canManage = ["owner", "admin"].includes(userRole) || !!(memberPermissions?.usuarios?.manage_permissions === true);
  if (!canManage) {
    return jsonResponse({ error: "Insufficient permissions to update user identity" }, 403);
  }

  // Verify membership
  const { data: targetMember, error: targetError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user_id)
    .single();
  if (targetError || !targetMember) {
    return jsonResponse({ error: "User not found in this organization" }, 404);
  }

  // Update email via Auth Admin if provided
  if (email) {
    const { error: updErr } = await admin.auth.admin.updateUserById(user_id, { email });
    if (updErr) {
      const msg = updErr?.message?.toLowerCase?.() || "";
      const friendly = msg.includes("unique") || msg.includes("already") || msg.includes("exist")
        ? "Este email já está em uso."
        : updErr.message;
      return jsonResponse({ error: friendly }, 400);
    }
  }

  // Update profile display name if provided
  if (typeof name === 'string') {
    const { error: profErr } = await admin
      .from("user_profiles")
      .upsert({ id: user_id, display_name: name }, { onConflict: "id" });
    if (profErr) throw profErr;
  }

  return jsonResponse({ success: true });
}

// Sends a password reset email to the user's current email
async function handleSendPasswordReset(admin: any, req: Request, organizationId: string, userRole: string, memberPermissions: any) {
  const { user_id } = await req.json();
  if (!user_id) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  const canManage = ["owner", "admin"].includes(userRole) || !!(memberPermissions?.usuarios?.manage_permissions === true);
  if (!canManage) {
    return jsonResponse({ error: "Insufficient permissions to reset password" }, 403);
  }

  // Ensure same organization
  const { data: targetMember, error: targetError } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("user_id", user_id)
    .single();
  if (targetError || !targetMember) {
    return jsonResponse({ error: "User not found in this organization" }, 404);
  }

  // Fetch email
  const { data: authRes, error: authErr } = await admin.auth.admin.getUserById(user_id);
  if (authErr) throw authErr;
  const email = authRes?.user?.email;
  if (!email) return jsonResponse({ error: "User has no email" }, 400);

  // Compute redirectTo if available, but don't fail if not configured
  const origin = req.headers.get("origin") || undefined;
  const siteUrl = (Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_SITE_URL") || Deno.env.get("APP_URL") || origin || "").replace(/\/$/, "");
  const redirectTo = siteUrl ? `${siteUrl}/reset-password` : undefined;

  const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined as any);
  if (resetErr) {
    const msg = resetErr?.message?.toLowerCase?.() || "";
    const friendly = msg.includes("redirect") ? "URL de redirecionamento não permitida nas configurações do Auth." : resetErr.message;
    return jsonResponse({ error: friendly }, 400);
  }

  return jsonResponse({ email_sent: true });
}
