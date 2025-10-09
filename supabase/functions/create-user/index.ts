// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { email, password, metadata } = await req.json();
    if (!email || !password) {
      return jsonResponse({ error: "Missing email or password" }, 400);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

    return jsonResponse({ ok: true, userId, organizationId, user: data.user });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});