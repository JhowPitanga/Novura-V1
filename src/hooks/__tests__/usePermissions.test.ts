import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePermissions } from "../usePermissions";

// Mock useAuth
const mockAuthReturn = {
  user: null,
  session: null,
  loading: false,
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  organizationId: "org-1",
  permissions: null as Record<string, any> | null,
  userRole: "member" as string | null,
  globalRole: null as string | null,
  moduleSwitches: null as Record<string, any> | null,
  displayName: null,
};

vi.mock("../useAuth", () => ({
  useAuth: () => mockAuthReturn,
}));

describe("usePermissions", () => {
  beforeEach(() => {
    mockAuthReturn.organizationId = "org-1";
    mockAuthReturn.permissions = null;
    mockAuthReturn.userRole = "member";
    mockAuthReturn.globalRole = null;
    mockAuthReturn.moduleSwitches = null;
  });

  describe("hasPermission", () => {
    it("returns false when permissions are null", () => {
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "view")).toBe(false);
    });

    it("returns true for owner on any module", () => {
      mockAuthReturn.permissions = { produtos: { view: true } };
      mockAuthReturn.userRole = "owner";
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "delete")).toBe(true);
    });

    it("checks object permissions correctly", () => {
      mockAuthReturn.permissions = {
        produtos: { view: true, edit: true, delete: false },
      };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "view")).toBe(true);
      expect(result.current.hasPermission("produtos", "edit")).toBe(true);
      expect(result.current.hasPermission("produtos", "delete")).toBe(false);
    });

    it("checks boolean permissions correctly", () => {
      mockAuthReturn.permissions = { produtos: true };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "view")).toBe(true);
    });

    it("checks array permissions correctly", () => {
      mockAuthReturn.permissions = { produtos: ["view", "edit"] };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "view")).toBe(true);
      expect(result.current.hasPermission("produtos", "delete")).toBe(false);
    });

    it("returns true for novura_admin only for nv_superadmin", () => {
      mockAuthReturn.globalRole = null;
      const { result: r1 } = renderHook(() => usePermissions());
      expect(r1.current.hasPermission("novura_admin", "view")).toBe(false);

      mockAuthReturn.globalRole = "nv_superadmin";
      const { result: r2 } = renderHook(() => usePermissions());
      expect(r2.current.hasPermission("novura_admin", "view")).toBe(true);
    });

    it("restricts to view-only when module switch is disabled", () => {
      mockAuthReturn.permissions = {
        produtos: { view: true, edit: true },
      };
      mockAuthReturn.moduleSwitches = {
        global: { produtos: { active: false } },
      };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "view")).toBe(true);
      expect(result.current.hasPermission("produtos", "edit")).toBe(false);
    });

    it("superadmin bypasses disabled module switch", () => {
      mockAuthReturn.permissions = { produtos: { view: true } };
      mockAuthReturn.globalRole = "nv_superadmin";
      mockAuthReturn.moduleSwitches = {
        global: { produtos: { active: false } },
      };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasPermission("produtos", "edit")).toBe(true);
    });
  });

  describe("hasModuleAccess", () => {
    it("returns false when no permissions", () => {
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasModuleAccess("produtos")).toBe(false);
    });

    it("returns true for owner", () => {
      mockAuthReturn.permissions = {};
      mockAuthReturn.userRole = "owner";
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasModuleAccess("produtos")).toBe(true);
    });

    it("returns view value when view key exists in object permissions", () => {
      mockAuthReturn.permissions = { produtos: { view: false, edit: true } };
      const { result } = renderHook(() => usePermissions());
      // When view key exists, hasModuleAccess returns its value
      expect(result.current.hasModuleAccess("produtos")).toBe(false);
    });

    it("returns true when any permission is true and no view key", () => {
      mockAuthReturn.permissions = { produtos: { edit: true, create: false } };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasModuleAccess("produtos")).toBe(true);
    });

    it("returns false when all permissions are false", () => {
      mockAuthReturn.permissions = {
        produtos: { view: false, edit: false },
      };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasModuleAccess("produtos")).toBe(false);
    });

    it("returns true for non-empty array permissions", () => {
      mockAuthReturn.permissions = { produtos: ["view"] };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.hasModuleAccess("produtos")).toBe(true);
    });
  });

  describe("hasAnyPermission", () => {
    it("returns true when any of the listed actions is granted", () => {
      mockAuthReturn.permissions = { pedidos: { view: true, cancel: false } };
      const { result } = renderHook(() => usePermissions());
      expect(
        result.current.hasAnyPermission("pedidos", ["view", "cancel"])
      ).toBe(true);
    });

    it("returns false when none of the listed actions is granted", () => {
      mockAuthReturn.permissions = {
        pedidos: { view: false, cancel: false },
      };
      const { result } = renderHook(() => usePermissions());
      expect(
        result.current.hasAnyPermission("pedidos", ["view", "cancel"])
      ).toBe(false);
    });
  });

  describe("convenience helpers", () => {
    it("canManageUsers returns true for owner", () => {
      mockAuthReturn.permissions = {};
      mockAuthReturn.userRole = "owner";
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canManageUsers()).toBe(true);
    });

    it("canManageUsers returns true for admin", () => {
      mockAuthReturn.permissions = {};
      mockAuthReturn.userRole = "admin";
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canManageUsers()).toBe(true);
    });

    it("canViewProducts delegates to hasAnyPermission", () => {
      mockAuthReturn.permissions = { produtos: { view: true } };
      const { result } = renderHook(() => usePermissions());
      expect(result.current.canViewProducts()).toBe(true);
    });
  });
});
