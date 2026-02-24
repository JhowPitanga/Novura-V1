// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";

export async function createCompleteUser(
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
    const { email, password, metadata } = await req.json();
    if (!email || !password) {
      return jsonResponse({ error: "Missing email or password" }, 400);
    }

    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata ?? {},
    });

    if (error) {
      return jsonResponse({ error: error.message }, 400);
    }

    // Create organization and set the user as owner
    const userId = data.user?.id;
    if (!userId) {
      return jsonResponse({ error: "User creation returned without ID" }, 500);
    }

    const { data: orgInsert, error: orgError } = await admin
      .from("organizations")
      .insert({ owner_user_id: userId })
      .select("id")
      .single();

    if (orgError) {
      return jsonResponse({ error: `Organization creation failed: ${orgError.message}` }, 500);
    }

    const organizationId = orgInsert?.id;

    // Update user metadata with organization_id
    try {
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...(data.user?.user_metadata ?? {}),
          ...(metadata ?? {}),
          organization_id: organizationId,
        },
      });
    } catch (updateErr) {
      // Do not fail the request because of metadata update error
      console.warn("Failed to update user metadata with organization_id", updateErr);
    }

    // Use the shared function to set up the owner with full permissions
    try {
        await createCompleteUser(admin, {
        email: data.user.email!,
        password: password,
        name: metadata?.full_name || metadata?.name,
        phone: metadata?.phone,
        organizationId: organizationId,
        role: 'owner',
        // Owner gets all permissions by default (handled in createCompleteUser)
      });

      console.log("Owner setup completed successfully");
    } catch (permissionsErr) {
      // Do not fail the request because of permissions setup error
      console.warn("Failed to set up default permissions for owner", permissionsErr);
    }

    return jsonResponse({ ok: true, userId, organizationId, user: data.user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});