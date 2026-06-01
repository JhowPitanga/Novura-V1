/**
 * Supabase implementation of AppCredentialsPort.
 * Single place that accesses apps table (client_id, client_secret, config).
 */

import type {
  AppCredentialsPort,
  AppCredentialsRecord,
} from "../../ports/app-credentials-port.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

function parseAppRow(row: Record<string, unknown>): AppCredentialsRecord | null {
  const client_id = String(row.client_id ?? "").trim();
  const client_secret = String(row.client_secret ?? "").trim();
  const app_id = String(row.id ?? "").trim();
  if (!client_id || !client_secret || !app_id) return null;
  const config = (row.config ?? {}) as Record<string, unknown>;
  return { client_id, client_secret, app_id, config };
}

export class SupabaseAppCredentialsAdapter implements AppCredentialsPort {
  constructor(private admin: SupabaseClient) {}

  async getByName(appName: string): Promise<{ client_id: string; client_secret: string } | null> {
    const { data: row, error } = await this.admin
      .from("apps")
      .select("id, client_id, client_secret, config")
      .eq("name", appName)
      .single();
    if (error || !row) return null;
    const parsed = parseAppRow(row as Record<string, unknown>);
    if (!parsed) return null;
    return { client_id: parsed.client_id, client_secret: parsed.client_secret };
  }

  async getByAppId(appId: string): Promise<AppCredentialsRecord | null> {
    const { data: row, error } = await this.admin
      .from("apps")
      .select("id, client_id, client_secret, config")
      .eq("id", appId)
      .maybeSingle();
    if (error || !row) return null;
    return parseAppRow(row as Record<string, unknown>);
  }
}
