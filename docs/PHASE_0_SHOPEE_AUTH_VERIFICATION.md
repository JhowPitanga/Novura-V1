# Phase 0: Shopee Auth — Verification Against Official Flow

**Reference (may be login-gated):** https://open.shopee.com/developer-guide/20  
**Status:** Verified against public documentation and third-party guides (Rollout, Stack Overflow, Shopee API docs). If the official page is reachable, re-verify the items below manually.

---

## Implementation Summary

| Component | Location | Role |
|-----------|----------|------|
| Start auth | `supabase/functions/shopee-start-auth/index.ts` | Builds authorization URL with `partner_id`, `timestamp`, `sign`, `redirect` (with state). |
| Callback | `supabase/functions/shopee-callback/index.ts` | Receives `code`, `shop_id`, `state`; exchanges code for tokens via `/api/v2/auth/token/get`. |

---

## Flow Verified

### 1. Authorization request (shopee-start-auth)

- **Endpoint:** `https://partner.shopeemobile.com/api/v2/shop/auth_partner` (production).
- **Query params:** `partner_id`, `timestamp`, `sign`, `redirect` (redirect URI with state appended).
- **Sign:** HMAC-SHA256 with partner_key; base string = `partner_id + path + timestamp` (path = `/api/v2/shop/auth_partner`). Output lowercase hex.
- **State:** Base64-encoded JSON: `{ organizationId, storeName, connectedByUserId, redirect_uri }`. Passed in the `redirect` URL as query param `state`.
- **Assumptions:** Partner ID and key from `apps` table (`name = 'Shopee'`), `client_id` = partner_id, `client_secret` = partner_key. Redirect URI from request body, app config, `SHOPEE_REDIRECT_URI`, or default `https://novuraerp.com.br/oauth/shopee/callback`.

**Match with public docs:** Yes. Auth URL format and sign algorithm (partner_id + path + timestamp, HMAC-SHA256) match Shopee 2.0 and Rollout guides.

### 2. Callback and token exchange (shopee-callback)

- **Callback params:** `code`, `shop_id` (required); `state` (optional, for organizationId etc.); `error` (on user cancel).
- **Token endpoint:** POST `https://partner.shopeemobile.com/api/v2/auth/token/get` with query `partner_id`, `timestamp`, `sign` and body `{ code, shop_id, partner_id }` (numeric). Sign base string: `partner_id + path + timestamp` (path = `/api/v2/auth/token/get`), HMAC-SHA256 lowercase hex.
- **Storage:** Tokens encrypted (AES-GCM) and stored in `marketplace_integrations` with `organizations_id`, `company_id`, `marketplace_name: 'Shopee'`, `meli_user_id` = shop_id (integer), config (storeName, connectedByUserId, shopee_shop_id).

**Match with public docs:** Yes. Token exchange path, parameters, and sign method match. Note: Uses INSERT; if the plan enforces UPSERT on (organizations_id, marketplace_name), callback should be updated to UPSERT for reconnection (see Phase 1b / CYCLE_0).

---

## Manual Checklist (when open.shopee.com is accessible)

- [ ] Confirm auth path is exactly `/api/v2/shop/auth_partner` and token path `/api/v2/auth/token/get` for the correct region (production = partner.shopeemobile.com).
- [ ] Confirm redirect parameter name: `redirect` (not `redirect_uri`) in auth URL.
- [ ] Confirm token request: POST with JSON body `code`, `shop_id` (number), `partner_id` (number); query has `partner_id`, `timestamp`, `sign`.
- [ ] Confirm signature: base string order and encoding (no spaces, path without query string, timestamp in seconds); output hex lowercase.
- [ ] Confirm token response fields: `access_token`, `refresh_token`, `expire_in` or `expires_in` (seconds). Access token ~4h, refresh ~1 month per public docs.

---

## Gaps / Notes

1. **Reconnection:** Callback uses INSERT. If UNIQUE (organizations_id, marketplace_name) is added (Phase 1b), switch to UPSERT so the same org can reconnect Shopee without duplicate key errors.
2. **Region:** Code is fixed to production (`partner.shopeemobile.com`). No sandbox/region switch; document if other environments are needed later.
