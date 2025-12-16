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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as any;

    // Auth: require a valid user session token
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const currentUser = userRes.user;

    const body = await req.json();
    const company_id: string | undefined = body?.company_id;
    const organization_id_input: string | undefined = body?.organization_id; // optional, trust only if membership ok
    const pfx_base64: string | undefined = body?.pfx_base64;
    const file_name: string | undefined = body?.file_name;
    const valid_from: string | undefined = body?.valid_from; // optional ISO or YYYY-MM-DD
    const valid_to: string | undefined = body?.valid_to;     // optional ISO or YYYY-MM-DD

    if (!company_id || !pfx_base64) {
      return jsonResponse({ error: "Missing required fields: company_id, pfx_base64" }, 400);
    }

    // Minimal size checks (PFX typically < 1MB). Accept up to ~5MB base64.
    if (pfx_base64.length > 7_000_000) {
      return jsonResponse({ error: "PFX too large" }, 413);
    }

    // Resolve company and its organization
    const { data: company, error: compErr } = await admin
      .from("companies")
      .select("id, organization_id")
      .eq("id", company_id)
      .single();
    if (compErr || !company) {
      return jsonResponse({ error: compErr?.message || "Company not found" }, 404);
    }

    let organizations_id: string | null = company.organization_id || null;

    // If company has no org, fall back to caller's current org (RPC) as a safe default
    if (!organizations_id) {
      try {
        const { data: rpcOrg } = await admin.rpc('get_user_organization_id', { p_user_id: currentUser.id });
        const resolved = Array.isArray(rpcOrg) ? (rpcOrg?.[0] as string | undefined) : (rpcOrg as string | undefined);
        if (resolved) organizations_id = resolved;
      } catch (_) {
        // ignore
      }
    }

    // Last resort, trust explicit org only if provided and membership check passes
    if (!organizations_id && organization_id_input) {
      organizations_id = organization_id_input;
    }

    if (!organizations_id) {
      return jsonResponse({ error: "Unable to resolve organization for the company" }, 400);
    }

    // Membership check: only members can write certs for this org
    const { data: isMemberData, error: isMemberErr } = await admin.rpc('is_org_member', {
      p_user_id: currentUser.id,
      p_org_id: organizations_id,
    });
    const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
    if (isMemberErr || !isMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    await admin
      .from('companies')
      .update({
        certificado_validade: valid_to ?? null,
        certificado_a1_url: file_name ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', company_id);

    return jsonResponse({ ok: true });
  } catch (e: any) {
    const message = e?.message || "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
