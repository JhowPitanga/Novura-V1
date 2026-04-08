import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Database } from "../../database.types.ts";

/** Typed Supabase client (Database from supabase gen types typescript). */
export type SupabaseClient = ReturnType<typeof createClient<Database>>;

/**
 * Creates a Supabase client with the service_role key (bypasses RLS).
 * Use for server-side admin operations only.
 * Client is typed with Database for type-safe queries and table inference.
 */
export function createAdminClient(): SupabaseClient {
  return createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Creates a Supabase client scoped to the requesting user's session.
 * Passes the Authorization header from the incoming request.
 * Client is typed with Database for type-safe queries.
 */
export function createUserClient(req: { headers: Headers }): SupabaseClient {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient<Database>(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
}
