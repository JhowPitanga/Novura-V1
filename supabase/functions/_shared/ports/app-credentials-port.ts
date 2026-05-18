/**
 * Port for reading app credentials (client_id, client_secret) from apps table.
 * Used for OAuth refresh (ML) and Shopee partner_id/partner_key.
 */
export interface AppCredentialsPort {
  getByName(appName: string): Promise<{ client_id: string; client_secret: string } | null>;
}
