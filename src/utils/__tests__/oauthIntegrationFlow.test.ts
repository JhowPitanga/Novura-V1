import { describe, expect, it } from "vitest";
import { integrationMatchesApp } from "../integrationAppMatch";
import { parseOAuthStatePayload } from "../oauthState";

describe("integrationAppMatch", () => {
  it("matches sandbox integration to sandbox app by config.app_id", () => {
    const integration = {
      provider_id: "p1",
      config: { app_id: "test Shopee", environment: "sandbox" },
    } as Parameters<typeof integrationMatchesApp>[0];
    const appRow = { id: "test Shopee", name: "Shopee Sandbox (Test)", provider_id: "p1" } as Parameters<
      typeof integrationMatchesApp
    >[1];

    expect(integrationMatchesApp(integration, appRow)).toBe(true);
  });

  it("does not match sandbox integration to production app", () => {
    const integration = {
      provider_id: "p1",
      config: { app_id: "test Shopee", environment: "sandbox" },
    } as Parameters<typeof integrationMatchesApp>[0];
    const appRow = { id: "Shopee", name: "Shopee", provider_id: "p1" } as Parameters<
      typeof integrationMatchesApp
    >[1];

    expect(integrationMatchesApp(integration, appRow)).toBe(false);
  });
});

describe("oauthState", () => {
  it("reads openerOrigin from signed state json", () => {
    const payload = {
      providerKey: "shopee",
      appId: "test Shopee",
      openerOrigin: "http://localhost:5174",
      issuedAt: 1,
    };
    const state = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(parseOAuthStatePayload(state)?.openerOrigin).toBe("http://localhost:5174");
  });
});
