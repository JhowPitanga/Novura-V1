# Adapters (by context)

Adapters are grouped by bounded context / domain.

| Subfolder | Purpose |
|-----------|--------|
| **infra/** | Supabase client, HTTP helpers (CORS, jsonResponse), object utils, token crypto (AES-GCM, HMAC). No business logic. |
| **integrations/** | Persistence for `marketplace_integrations` and `apps` tables (SupabaseMarketplaceIntegrationsAdapter, SupabaseAppCredentialsAdapter). |
| **tokens/** | ML and Shopee token resolution (getMlAccessToken, getShopeeAccessToken); uses integrations + infra. |
| **sync-context/** | Orchestration for order sync: resolveMLSyncContext, resolveShopeeSyncContext (token + app creds + date range). |
| **orders-raw/** | Persistence for `marketplace_orders_raw` table (audit/archive of raw order payloads). |
| **user-management/** | UserManagementPort implementation (users, org members, permissions). |
| **shopee/** | Outbound Shopee API client (order list, order detail, escrow). |

Imports from Edge Functions use paths like `../_shared/adapters/infra/http-utils.ts`, `../_shared/adapters/tokens/ml-token.ts`, etc.
