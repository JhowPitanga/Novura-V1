// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, GET, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
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
      case "list_users":
        if (!["owner", "admin"].includes(userRole)) {
          return jsonResponse({ error: "Insufficient permissions to list users" }, 403);
        }
        return await handleListUsers(admin, organizationId, userRole);
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
