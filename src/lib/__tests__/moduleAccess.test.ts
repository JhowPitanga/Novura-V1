import { describe, it, expect } from "vitest";
import {
  getModuleSwitchState,
  isOrgModuleEnabled,
  isOrgModuleDisabled,
  parseModuleActiveMap,
} from "../moduleAccess";

describe("moduleAccess", () => {
  it("parseModuleActiveMap reads global switches", () => {
    const map = parseModuleActiveMap({
      global: { anuncios: { active: true }, produtos: { active: false } },
    });
    expect(map.anuncios).toBe(true);
    expect(map.produtos).toBe(false);
  });

  it("parseModuleActiveMap reads legacy flat switches", () => {
    const map = parseModuleActiveMap({
      anuncios: { active: true },
      produtos: { active: false },
    });
    expect(map.anuncios).toBe(true);
    expect(map.produtos).toBe(false);
  });

  it("isOrgModuleEnabled only when explicitly on", () => {
    const map = { anuncios: true };
    expect(isOrgModuleEnabled("anuncios", map)).toBe(true);
    expect(isOrgModuleEnabled("produtos", map)).toBe(false);
    expect(getModuleSwitchState("produtos", map)).toBe("unknown");
  });

  it("isOrgModuleDisabled when explicitly off", () => {
    const map = { anuncios: false };
    expect(isOrgModuleDisabled("anuncios", map)).toBe(true);
  });
});
