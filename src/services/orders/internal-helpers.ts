import { supabase } from "@/integrations/supabase/client";

export async function getAuthToken(): Promise<string> {
  const { data: sessionRes } = await (supabase as any).auth.getSession();
  const token: string | undefined = sessionRes?.session?.access_token;
  if (!token) throw new Error("Sessão expirada ou ausente. Faça login novamente.");
  return token;
}
