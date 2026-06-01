/** App row credentials + OAuth environment config from apps.config */
export interface AppCredentialsRecord {
  client_id: string;
  client_secret: string;
  app_id: string;
  config: Record<string, unknown>;
}

/**
 * Port for reading app credentials (client_id, client_secret) from apps table.
 * Used for OAuth refresh (ML) and Shopee partner_id/partner_key.
 */
export interface AppCredentialsPort {
  getByName(appName: string): Promise<{ client_id: string; client_secret: string } | null>;
  getByAppId(appId: string): Promise<AppCredentialsRecord | null>;
}
