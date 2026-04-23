// @deprecated — this file now re-exports from the universal oauth module.
// Use src/WebhooksAPI/marketplace/oauth.ts directly for new code.

export {
  startOAuth as startShopeeAuth,
  listenForOAuthResult as listenForShopeeOAuthSuccess,
  openOAuthPopup,
} from "../oauth";

export type {
  StartOAuthOptions as StartAuthOptions,
  OAuthSuccessPayload,
  OAuthErrorPayload,
} from "../oauth";
