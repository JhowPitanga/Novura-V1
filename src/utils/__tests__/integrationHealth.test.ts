import { describe, expect, it } from "vitest";
import {
  computeDaysUntilExpiry,
  computeTokenHealth,
  mapHealthToColor,
  mapHealthToConnectionStatus,
} from "../integrationHealth";

describe("integrationHealth", () => {
  it("returns ok when token expires beyond threshold", () => {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    expect(
      computeTokenHealth({
        status: "active",
        expiresAt,
        refreshThresholdMinutes: 30,
      }),
    ).toBe("ok");
  });

  it("returns expiring_soon inside threshold window", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    expect(
      computeTokenHealth({
        status: "active",
        expiresAt,
        refreshThresholdMinutes: 30,
      }),
    ).toBe("expiring_soon");
  });

  it("returns expired when past expires_at", () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    expect(computeTokenHealth({ status: "active", expiresAt })).toBe("expired");
  });

  it("returns error for integration status error", () => {
    expect(computeTokenHealth({ status: "error", expiresAt: null })).toBe("error");
  });

  it("maps health to UI status and colors", () => {
    expect(mapHealthToConnectionStatus("ok")).toBe("active");
    expect(mapHealthToConnectionStatus("expiring_soon")).toBe("reconnect");
    expect(mapHealthToConnectionStatus("expired")).toBe("inactive");
    expect(mapHealthToColor("ok")).toBe("bg-green-500");
  });

  it("computes days until expiry", () => {
    const expiresAt = new Date(Date.now() + 3 * 86400000).toISOString();
    const days = computeDaysUntilExpiry(expiresAt);
    expect(days).toBeGreaterThanOrEqual(2);
    expect(days).toBeLessThanOrEqual(4);
  });
});
