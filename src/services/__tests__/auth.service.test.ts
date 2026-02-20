import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCachedAccessContext,
  cacheAccessContext,
  loadAccessContext,
} from "../auth.service";

// Mock supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe("auth.service", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCachedAccessContext", () => {
    it("returns null when no cache exists", () => {
      expect(getCachedAccessContext("user-1")).toBeNull();
    });

    it("returns null when cache is expired", () => {
      const expired = {
        organization_id: "org-1",
        permissions: { produtos: { view: true } },
        role: "member",
        global_role: null,
        module_switches: {},
        display_name: "Test",
        cachedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
      };
      sessionStorage.setItem(
        "access_context:user-1",
        JSON.stringify(expired)
      );

      expect(getCachedAccessContext("user-1")).toBeNull();
    });

    it("returns cached context when valid", () => {
      const valid = {
        organization_id: "org-1",
        permissions: { produtos: { view: true } },
        role: "admin",
        global_role: "nv_superadmin",
        module_switches: {},
        display_name: "Test User",
        cachedAt: Date.now() - 2 * 60 * 1000, // 2 minutes ago
      };
      sessionStorage.setItem(
        "access_context:user-1",
        JSON.stringify(valid)
      );

      const result = getCachedAccessContext("user-1");
      expect(result).not.toBeNull();
      expect(result!.organization_id).toBe("org-1");
      expect(result!.role).toBe("admin");
      expect(result!.global_role).toBe("nv_superadmin");
      expect(result!.display_name).toBe("Test User");
    });

    it("returns null when cache is corrupted JSON", () => {
      sessionStorage.setItem("access_context:user-1", "not-json");
      expect(getCachedAccessContext("user-1")).toBeNull();
    });
  });

  describe("cacheAccessContext", () => {
    it("stores context in sessionStorage with cachedAt timestamp", () => {
      const ctx = {
        organization_id: "org-1",
        permissions: {},
        role: "member",
      };
      cacheAccessContext("user-1", ctx);

      const stored = JSON.parse(
        sessionStorage.getItem("access_context:user-1")!
      );
      expect(stored.organization_id).toBe("org-1");
      expect(stored.cachedAt).toBeDefined();
      expect(typeof stored.cachedAt).toBe("number");
    });
  });

  describe("loadAccessContext", () => {
    it("returns null when user is null", async () => {
      const result = await loadAccessContext(null);
      expect(result).toBeNull();
    });

    it("returns cached context when available", async () => {
      const cached = {
        organization_id: "org-1",
        permissions: { pedidos: { view: true } },
        role: "owner",
        global_role: null,
        module_switches: {},
        display_name: "Cached User",
        cachedAt: Date.now(),
      };
      sessionStorage.setItem(
        "access_context:user-1",
        JSON.stringify(cached)
      );

      const mockUser = { id: "user-1", email: "test@test.com" } as any;
      const result = await loadAccessContext(mockUser);

      expect(result).not.toBeNull();
      expect(result!.organization_id).toBe("org-1");
      expect(result!.role).toBe("owner");
    });
  });
});
