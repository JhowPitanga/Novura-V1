// Shared domain types for marketplace_integrations rows used by Edge Functions.

export interface IntegrationRow {
  id: string;
  organizations_id: string | null;
  company_id: string;
  provider_id: string | null;
  marketplace_name: string | null;
  external_account_id: string | null;
  store_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  expires_in: string | null;
  status: string;
  last_refresh_at: string | null;
  last_refresh_error: string | null;
  token_key_version: number;
  connected_at: string | null;
  connected_by_user_id: string | null;
  setup_status: string;
  setup_completed_at: string | null;
  deactivated_at: string | null;
  meli_user_id: number | null;
  config: Record<string, unknown> | null;
  drop_off: boolean;
  fulfillment: boolean;
  self_service: boolean;
  xd_drop_off: boolean;
  shipping_preferences: Record<string, unknown> | null;
  preferences_fetched_at: string | null;
}
