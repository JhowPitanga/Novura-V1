// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";


async function createCompleteUser(
    admin: any,
    userData: {
      email: string;
      password: string;
      name?: string;
      phone?: string;
      organizationId?: string;
      role?: string;
      permissions?: any;
      isInvitation?: boolean;
    }
  ) {
    // Create the user account
    const { data: userDataResult, error: createError } = await admin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true,
      user_metadata: {
        full_name: userData.name,
        phone: userData.phone,
        organization_id: userData.organizationId,
      },
    });
  
    if (createError) {
      throw new Error(createError.message);
    }
  
    const newUserId = userDataResult.user.id;
  
    // Create user profile with basic information
    const displayName = userData.name || userDataResult.user.email?.split('@')[0] || 'Usuário';
  
    await admin
      .from("user_profiles")
      .insert({
        id: newUserId,
        display_name: displayName,
        phone: userData.phone || null,
        timezone: 'America/Sao_Paulo',
        language: 'pt-BR',
        theme: 'light',
        notifications_enabled: true,
        email_notifications: true
      });
  
    // If organization is provided, add user to organization
    if (userData.organizationId) {
      // Get all available modules and actions to create default permissions
      const { data: modules } = await admin
        .from("system_modules")
        .select("id, name");
  
      const defaultPermissions: any = {};
  
      // Create default permissions with all actions enabled for owner, or use provided permissions
      for (const module of modules || []) {
        const { data: actions } = await admin
          .from("module_actions")
          .select("name")
          .eq("module_id", module.id);
  
        defaultPermissions[module.name] = {};
        for (const action of actions || []) {
          defaultPermissions[module.name][action.name] = true;
        }
      }
  
      // Use provided permissions or default permissions
      const finalPermissions = userData.permissions || defaultPermissions;
  
      // Add user to organization
      await admin
        .from("organization_members")
        .insert({
          organization_id: userData.organizationId,
          user_id: newUserId,
          role: userData.role || 'member',
          permissions: finalPermissions
        });
  
      // Create default organization settings for the user
      await admin
        .from("user_organization_settings")
        .insert({
          user_id: newUserId,
          organization_id: userData.organizationId,
          dashboard_layout: {},
          quick_actions: []
        });
    }
  
    return {
      user: userDataResult.user,
      userId: newUserId,
      organizationId: userData.organizationId
    };
  }
  


}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const { token, password, name, invitation_id } = body || {};

    const admin = createAdminClient();

    // New path: accept Supabase Auth invitation after email click/redirect
    // Client is expected to be authenticated already (exchangeCodeForSession ran)
    if (invitation_id && !password && !token) {
      const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
      const { data: { user: currentUser }, error: getUserErr } = await admin.auth.getUser(authHeader);
      if (getUserErr || !currentUser) {
        return jsonResponse({ error: "Unauthorized or missing session" }, 401);
      }

      // Load invitation
      const { data: invitation, error: invErr } = await admin
        .from("user_invitations")
        .select("*")
        .eq("id", invitation_id)
        // Somente convites pendentes podem ser aceitos
        .eq("status", "pendente")
        .single();
      if (invErr || !invitation) {
        return jsonResponse({ error: "Invalid or expired invitation" }, 400);
      }

      // Ensure invited email matches current user email
      const invitedEmail = (invitation.email || "").toLowerCase();
      const currentEmail = (currentUser.email || "").toLowerCase();
      if (!invitedEmail || invitedEmail !== currentEmail) {
        return jsonResponse({ error: "Email does not match invitation" }, 403);
      }

      // Ensure membership exists
      const { data: existingMember } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", invitation.organization_id)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (!existingMember) {
        await admin
          .from("organization_members")
          .insert({
            organization_id: invitation.organization_id,
            user_id: currentUser.id,
            role: invitation.role || 'member',
            permissions: invitation.permissions || {},
          });
      }

      // Mark invitation as accepted
      await admin
        .from("user_invitations")
        // Status aceito/alocado na org usa 'ativo' conforme convenção do banco
        .update({ status: 'ativo', user_id: currentUser.id })
        .eq("id", invitation.id);

      // Persist current organization for the user to help the app resolve orgId quickly
      try {
        // Update public.users with the active organization
        await admin
          .from('users')
          .update({ organization_id: invitation.organization_id })
          .eq('id', currentUser.id);
      } catch (_) {
        // ignore if table/column does not exist
      }

      try {
        // Update auth user metadata with organization_id to speed up client-side resolution
        const newMetadata = { ...(currentUser.user_metadata || {}), organization_id: invitation.organization_id } as Record<string, unknown>;
        await admin.auth.admin.updateUserById(currentUser.id, {
          user_metadata: newMetadata,
        });
      } catch (_) {
        // ignore metadata update failures; fallback RPC resolver will still work
      }

      return jsonResponse({ ok: true, organization_id: invitation.organization_id });
    }

    // Legacy/manual token flow: create account and membership using token/password
    if (!token || !password) {
      return jsonResponse({ error: "Token and password are required" }, 400);
    }

    // Find the invitation by token (support both 'invitation_token' and legacy 'token')
    let { data: invitation, error: invitationError } = await admin
      .from("user_invitations")
      .select("*")
      .eq("invitation_token", token)
      .eq("status", "pendente")
      .single();

    if (invitationError || !invitation) {
      const msg = String(invitationError?.message || '').toLowerCase();
      const isNoRows = invitationError && (invitationError.code === 'PGRST116' || msg.includes('no rows'));
      const columnMissing = msg.includes('column "invitation_token"') && msg.includes('does not exist');
      if (isNoRows || columnMissing || !invitation) {
        const alt = await admin
          .from("user_invitations")
          .select("*")
          .eq("token", token)
          .eq("status", "pendente")
          .single();
        invitation = alt.data;
        invitationError = alt.error;
      }
    }

    if (invitationError || !invitation) {
      return jsonResponse({ error: "Invalid or expired invitation token" }, 400);
    }

    // Check if invitation has expired
    if (invitation.expires_at && new Date() > new Date(invitation.expires_at)) {
      return jsonResponse({ error: "Invitation has expired" }, 400);
    }

    // Use the shared function to create the user with organization
    const result = await createCompleteUser(admin, {
      email: invitation.email,
      password: password,
      name: name || invitation.nome,
      phone: invitation.telefone,
      organizationId: invitation.organization_id,
      role: invitation.role || 'member',
      permissions: invitation.permissions,
      isInvitation: true
    });

    // Update invitation status to accepted
    await admin
      .from("user_invitations")
      .update({ status: 'ativo', user_id: result.userId })
      .eq("id", invitation.id);

    return jsonResponse({
      ok: true,
      user: result.user,
      organization_id: result.organizationId,
      message: "Account created successfully"
    });

  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
