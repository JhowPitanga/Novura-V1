// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


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
  

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    },
  });
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
    const { token, password, name } = await req.json();

    if (!token || !password) {
      return jsonResponse({ error: "Token and password are required" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Find the invitation by token
    const { data: invitation, error: invitationError } = await admin
      .from("user_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (invitationError || !invitation) {
      return jsonResponse({ error: "Invalid or expired invitation token" }, 400);
    }

    // Check if invitation has expired
    if (new Date() > new Date(invitation.expires_at)) {
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
      .update({ status: 'accepted', user_id: result.userId })
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
