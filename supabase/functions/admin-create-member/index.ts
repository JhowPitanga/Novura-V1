// deno-lint-ignore-file no-explicit-any
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { buildLimitedPermissions, type Permissions } from "../_shared/domain/user-permissions.ts";

interface CreateMemberPayload {
  email: string;
  password?: string;
  name?: string;
  phone?: string;
  organization_id?: string;
  // Allowed modules; defaults to ['desempenho','pedidos'] if not provided
  modules?: string[];
}

interface JsonResponse {
  success: boolean;
  message?: string;
  data?: any;
  error?: any;
}

function toJson(status: number, body: JsonResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function ensureProfile(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  displayName?: string,
  phone?: string,
) {
  const { error } = await supabaseAdmin.from("user_profiles").upsert(
    {
      id: userId,
      display_name: displayName ?? null,
      phone: phone ?? null,
    },
    { onConflict: "id" },
  );
  if (error) throw error;
}

async function ensureOrgSettings(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string,
) {
  const { error } = await supabaseAdmin.from("user_organization_settings").upsert(
    {
      user_id: userId,
      organization_id: organizationId,
    },
    { onConflict: "user_id,organization_id" },
  );
  if (error) throw error;
}

async function pickTargetOrganization(
  supabaseAdmin: ReturnType<typeof createClient>,
  providedOrgId?: string,
): Promise<string> {
  if (providedOrgId) return providedOrgId;

  // Prefer an organization that has an owner/admin member
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .in("role", ["owner", "admin"])
    .limit(1);

  if (error) throw error;
  if (data && data.length > 0) return data[0].organization_id as string;

  // Fallback: try the first organization
  const orgs = await supabaseAdmin.from("organizations").select("id").limit(1);
  if (orgs.error) throw orgs.error;
  if (!orgs.data || orgs.data.length === 0) {
    throw new Error("Nenhuma organização encontrada para vincular o membro.");
  }
  return orgs.data[0].id as string;
}

function envOrThrow(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Env '${name}' não configurada.`);
  return v;
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return toJson(405, { success: false, message: "Method not allowed" });
  }

  let payload: CreateMemberPayload;
  try {
    payload = await req.json();
  } catch {
    return toJson(400, { success: false, message: "JSON inválido no corpo da requisição." });
  }

  const { email, password = "Teste1234$", name, phone, organization_id, modules } = payload;
  if (!email) {
    return toJson(400, { success: false, message: "Campo 'email' é obrigatório." });
  }

  try {
    const supabaseAdmin = createAdminClient();

    const organizationId = await pickTargetOrganization(supabaseAdmin, organization_id);
    const permissions = buildLimitedPermissions(modules ?? ["desempenho", "pedidos"]);

    // Try to create auth user; if email already exists, look up existing user via Admin API (listUsers)
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: name ?? null,
      },
    });
    if (createErr) {
      // Handle existing email by looking up in auth.users using service role
      const isEmailExists = (createErr as any)?.code === "email_exists" ||
        (createErr as any)?.status === 422 ||
        (typeof (createErr as any)?.message === "string" && (createErr as any).message.includes("already registered"));
      if (!isEmailExists) {
        return toJson(400, { success: false, message: "Erro ao criar usuário", error: createErr });
      }

      // Fallback: search via Admin API pagination
      let found: string | null = null;
      let page = 1;
      const perPage = 100;
      for (let i = 0; i < 20; i++) { // scan up to 2000 users to find a match
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (listErr) {
          return toJson(400, { success: false, message: "Usuário já existe e falhou buscar ID (listUsers)", error: listErr });
        }
        const u = (list?.users || []).find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (u) { found = u.id; break; }
        if (!list || !list.users || list.users.length < perPage) { break; }
        page += 1;
      }

      if (!found) {
        return toJson(400, { success: false, message: "Usuário já existe mas não foi encontrado via Admin API" });
      }
      userId = found;
    } else {
      userId = created.user.id;
    }

    // Ensure profile
    await ensureProfile(supabaseAdmin, userId, name, phone);

    // Add organization membership with limited permissions
    const { error: memberErr } = await supabaseAdmin.from("organization_members").upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        role: "member",
        permissions,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (memberErr) throw memberErr;

    // Ensure org settings
    await ensureOrgSettings(supabaseAdmin, userId, organizationId);

    return toJson(200, {
      success: true,
      message: "Membro criado com sucesso na organização alvo.",
      data: {
        user_id: userId,
        email,
        organization_id: organizationId,
        permissions,
      },
    });
  } catch (e) {
    return toJson(500, { success: false, message: "Falha ao criar membro", error: `${e}` });
  }
}

// Serve
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
serve(handler);