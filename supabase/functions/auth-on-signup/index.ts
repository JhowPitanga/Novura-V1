import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";

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
    const admin = createAdminClient();

    let payload: any = {};
    try {
      payload = await req.json();
    } catch (_) {
      payload = {};
    }

    const authHdr = req.headers.get("authorization") || "";
    const token = authHdr.startsWith("Bearer ") ? authHdr.slice(7).trim() : null;

    let userId: string | null = null;
    let email: string | null = null;
    let full_name: string | null = payload?.full_name || payload?.name || payload?.display_name || null;
    let first_name: string | null = payload?.first_name || null;
    let last_name: string | null = payload?.last_name || null;
    let phone: string | null = payload?.phone || null;

    if (token) {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data?.user?.id) {
        userId = data.user.id;
        email = data.user.email || payload?.email || null;
        const meta: any = data.user.user_metadata || {};
        if (!full_name) full_name = meta.full_name || meta.name || null;
        if (!phone) phone = meta.phone || null;
      }
    }

    if (!userId) {
      const u = payload?.user || payload?.record || null;
      if (u?.id) {
        userId = u.id as string;
        email = (u.email as string) || payload?.email || null;
        const meta: any = u.user_metadata || {};
        if (!full_name) full_name = meta.full_name || meta.name || null;
        if (!phone) phone = meta.phone || null;
      }
    }

    if (!userId && payload?.email) {
      email = payload.email as string;
    }

    if (userId) {
      const displayName = full_name || (email ? String(email).split("@")[0] : "Usuário");
      await admin.from("users").upsert({ id: userId }, { onConflict: "id" });
      await admin
        .from("user_profiles")
        .upsert({ id: userId, display_name: displayName, phone: phone || null }, { onConflict: "id" });
      try {
        await admin.rpc("rpc_bootstrap_user_org", { p_user_id: userId });
      } catch (_) {}
    }

    return jsonResponse({ ok: true, userId, email, first_name, last_name, phone });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

