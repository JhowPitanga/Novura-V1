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

    // Get user's organization
    const { data: orgMember } = await admin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single();

    if (!orgMember) {
      return jsonResponse({ error: "User not found in any organization" }, 404);
    }

    const organizationId = orgMember.organization_id;
    const userRole = orgMember.role;

    // Check if user has permission to manage users
    if (!["owner", "admin"].includes(userRole)) {
      return jsonResponse({ error: "Insufficient permissions to manage users" }, 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "list_users":
        return await handleListUsers(admin, organizationId, userRole);
      case "invite_user":
        return await handleInviteUser(admin, req, organizationId, user.id);
      case "update_user_permissions":
        return await handleUpdateUserPermissions(admin, req, organizationId, userRole);
      case "remove_user":
        return await handleRemoveUser(admin, req, organizationId, userRole);
      case "get_user_permissions":
        return await handleGetUserPermissions(admin, req, organizationId);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

async function handleListUsers(admin: any, organizationId: string, userRole: string) {
  // Get all organization members with their user data
  const { data: members, error: membersError } = await admin
    .from("organization_members")
    .select(`
      id,
      role,
      permissions,
      created_at,
      updated_at,
      user_id,
      users!inner(id, email, name, last_login)
    `)
    .eq("organization_id", organizationId);

  if (membersError) {
    throw membersError;
  }

  return jsonResponse({ users: members });
}

async function handleInviteUser(admin: any, req: Request, organizationId: string, inviterUserId: string) {
  const { email, name, phone, permissions } = await req.json();

  if (!email) {
    return jsonResponse({ error: "Email is required" }, 400);
  }

  // Generate invitation token
  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  // Create invitation
  const { data: invitation, error: invitationError } = await admin
    .from("user_invitations")
    .insert({
      email,
      nome: name,
      telefone: phone,
      permissions,
      invited_by_user_id: inviterUserId,
      organization_id: organizationId,
      token,
      expires_at: expiresAt,
      status: 'pending'
    })
    .select()
    .single();

  if (invitationError) {
    throw invitationError;
  }

  // Generate invitation link
  const invitationLink = `${new URL(req.url).origin}/convite-permissoes?token=${token}`;

  return jsonResponse({
    invitation,
    invitation_link: invitationLink
  });
}

async function handleUpdateUserPermissions(admin: any, req: Request, organizationId: string, userRole: string) {
  const { user_id, permissions } = await req.json();

  if (!user_id || !permissions) {
    return jsonResponse({ error: "User ID and permissions are required" }, 400);
  }

  // Only owners can update permissions
  if (userRole !== "owner") {
    return jsonResponse({ error: "Only owners can update user permissions" }, 403);
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

  // Only owners can remove users
  if (userRole !== "owner") {
    return jsonResponse({ error: "Only owners can remove users" }, 403);
  }

  // Cannot remove yourself
  const { data: { user } } = await admin.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", ""));
  if (user_id === user?.id) {
    return jsonResponse({ error: "Cannot remove yourself from the organization" }, 400);
  }

  // Remove user from organization
  const { error: removeError } = await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", organizationId)
    .eq("user_id", user_id);

  if (removeError) {
    throw removeError;
  }

  return jsonResponse({ success: true });
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
