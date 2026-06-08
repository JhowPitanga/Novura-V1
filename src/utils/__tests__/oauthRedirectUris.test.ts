import { describe, expect, it } from "vitest";
import {
  normalizeShopeeRedirectUri,
  resolveOAuthRedirectUri,
  SHOPEE_REDIRECT_CANONICAL,
} from "../oauthRedirectUris";

describe("oauthRedirectUris", () => {
  it("strips www from redirect URIs", () => {
    expect(normalizeShopeeRedirectUri("https://www.novuraerp.com.br/oauth/shopee/callback")).toBe(
      "https://novuraerp.com.br/oauth/shopee/callback",
    );
  });

  it("resolves mercado livre canonical callback", () => {
    expect(resolveOAuthRedirectUri("mercado_livre")).toBe(
      "https://novuraerp.com.br/oauth/mercado-livre/callback",
    );
  });

  it("resolves shopee callback path", () => {
    const uri = resolveOAuthRedirectUri("shopee");
    expect(uri).toContain("/oauth/shopee/callback");
  });

  it("uses env override for shopee when provided", () => {
    expect(resolveOAuthRedirectUri("shopee", "https://www.example.com/cb")).toBe(
      "https://example.com/cb",
    );
  });
});
