# Shopee OAuth Verification

**Date:** 2026-02-27  
**Reference:** https://open.shopee.com/developer-guide/20 (Auth step — page may be login-gated; content was minimal when fetched programmatically.)

## Implementation Summary

The codebase implements Shopee Partner API auth (HMAC-SHA256 request signing). There is **no PKCE/code_verifier** — Shopee uses partner_id + timestamp + sign for both auth URL and token exchange.

## shopee-start-auth

- **Endpoint used:** `https://partner.shopeemobile.com/api/v2/shop/auth_partner`
- **Query params:** `partner_id`, `timestamp`, `sign`, `redirect`
- **Sign:** HMAC-SHA256(partner_key, baseString) in **lowercase hex**. BaseString = `partner_id + path + timestamp` (path = `/api/v2/shop/auth_partner`).
- **Redirect:** App redirect URI with `state` appended (state = base64 JSON of organizationId, storeName, connectedByUserId, redirect_uri). Shopee will redirect the seller to this URL with `code` and `shop_id`.
- **Credentials:** From `apps` table where `name = 'Shopee'` (client_id = partner_id, client_secret = partner_key).

**Verified:** Implementation matches the typical Shopee Partner auth flow (auth_partner URL with sign, redirect with state). No verifier is stored in state — only app context.

## shopee-callback

- **Token endpoint:** `https://partner.shopeemobile.com/api/v2/auth/token/get`
- **Method:** POST with query params `partner_id`, `timestamp`, `sign`; body JSON: `{ code, shop_id, partner_id }` (numeric).
- **Sign:** Same algorithm: baseString = `partner_id + path + timestamp` (path = `/api/v2/auth/token/get`), HMAC-SHA256 lowercase hex.
- **State:** Decoded from callback query/body; used to get organizationId, storeName, connectedByUserId.
- **Storage:** Tokens encrypted with AES-GCM (TOKENS_ENCRYPTION_KEY), stored in `marketplace_integrations` with `marketplace_name = 'Shopee'`, `meli_user_id` = shop_id.

**Gap:** Callback uses `insert` into `marketplace_integrations`. CYCLE_0 and ML flow require **UPSERT** on conflict (organizations_id, marketplace_name) so reconnecting the same store updates the row. Consider changing to UPSERT with `onConflict: 'organizations_id, marketplace_name'` when UNIQUE constraint exists (Phase 1b). Documented for Phase 1b / callback fix.

## Checklist (verify manually when doc is accessible)

- [ ] Confirm path is exactly `/api/v2/shop/auth_partner` and `/api/v2/auth/token/get` for production.
- [ ] Confirm sign is lowercase hex and baseString order (partner_id + path + timestamp).
- [ ] Confirm redirect param name is `redirect` (not redirect_uri) in auth URL.
- [ ] Confirm token request body uses numeric `shop_id` and `partner_id`.

## Conclusion

Implementation is consistent with Shopee Partner API auth. No code change required for start-auth. Callback should use UPSERT once UNIQUE (organizations_id, marketplace_name) is added to marketplace_integrations.
