import { describe, expect, it } from "vitest";
import {
  integrationRequiresQuickSetup,
  isIntegrationFullyConfigured,
  shouldShowPendingSetupBanner,
} from "../integrationSetup";

describe("integrationSetup", () => {
  it("returns false when setup is completed", () => {
    expect(integrationRequiresQuickSetup("completed")).toBe(false);
  });

  it("returns true when setup is pending or unknown", () => {
    expect(integrationRequiresQuickSetup("pending")).toBe(true);
    expect(integrationRequiresQuickSetup(undefined)).toBe(true);
  });

  it("treats company + warehouse as configured even if setup_status is pending", () => {
    const snapshot = {
      setup_status: "pending",
      company_id: "c1",
      warehouse_config: { physical_storage_id: "w1" },
    };
    expect(isIntegrationFullyConfigured(snapshot)).toBe(true);
    expect(integrationRequiresQuickSetup("pending", snapshot)).toBe(false);
  });

  it("hides pending banner when integration is fully configured", () => {
    const integration = {
      id: "i1",
      status: "active",
      setup_status: "pending",
      company_id: "c1",
      provider_id: "p1",
      store_name: "ML flamixy",
      warehouse_config: { physical_storage_id: "w1" },
    };
    expect(shouldShowPendingSetupBanner(integration, [integration])).toBe(false);
  });

  it("shows pending banner when company or warehouse is missing", () => {
    const integration = {
      id: "i1",
      status: "active",
      setup_status: "pending",
      company_id: null,
      provider_id: "p1",
      store_name: "ML flamixy",
      warehouse_config: null,
    };
    expect(shouldShowPendingSetupBanner(integration, [integration])).toBe(true);
  });
});
