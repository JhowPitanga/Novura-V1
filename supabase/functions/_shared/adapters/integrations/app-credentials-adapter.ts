/**
 * Supabase implementation of AppCredentialsPort.
 * Single place that accesses apps table (client_id, client_secret).
 */

import type { AppCredentialsPort } from "../../ports/app-credentials-port.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

export class SupabaseAppCredentialsAdapter implements AppCredentialsPort {
  constructor(private admin: SupabaseClient) {}

  async getByName(appName: string): Promise<{ client_id: string; client_secret: string } | null> {
    const { data: row, error } = await this.admin
      .from("apps")
      .select("client_id, client_secret")
      .eq("name", appName)
      .single();
    if (error || !row) return null;
    const client_id = String((row as Record<string, unknown>).client_id ?? "").trim();
    const client_secret = String((row as Record<string, unknown>).client_secret ?? "").trim();
    if (!client_id || !client_secret) return null;
    return { client_id, client_secret };
  }
}
