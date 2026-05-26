// Fake implementations of port interfaces for testing

import type { UserManagementPort } from "../ports/user-management-port.ts";
import type {
  CreateUserRequest,
  OrganizationUser,
  ModulePermission,
} from "../domain/types.ts";

// ── User Management ─────────────────────────────────────────

export interface FakeUserStore {
  users: Map<string, OrganizationUser>;
  invitations: Array<{ email: string; orgId: string; role: string }>;
  lastCreated: OrganizationUser | null;
}

export function createFakeUserStore(): FakeUserStore {
  return {
    users: new Map(),
    invitations: [],
    lastCreated: null,
  };
}

let _fakeIdCounter = 0;

export function createFakeUserManagementAdapter(
  store: FakeUserStore,
): UserManagementPort {
  return {
    async createOwner(req: CreateUserRequest): Promise<OrganizationUser> {
      const user: OrganizationUser = {
        userId: `fake-${++_fakeIdCounter}`,
        email: req.email,
        fullName: req.fullName,
        role: "owner",
        organizationId: req.organizationId,
        permissions: (req.modules ?? []).map((m) => ({
          module: m,
          actions: ["view", "create", "edit", "delete"],
        })),
      };
      store.users.set(user.userId, user);
      store.lastCreated = user;
      return user;
    },

    async createMember(req: CreateUserRequest): Promise<OrganizationUser> {
      const user: OrganizationUser = {
        userId: `fake-${++_fakeIdCounter}`,
        email: req.email,
        fullName: req.fullName,
        role: req.role === "owner" ? "member" : req.role,
        organizationId: req.organizationId,
        permissions: (req.modules ?? []).map((m) => ({
          module: m,
          actions: ["view"],
        })),
      };
      store.users.set(user.userId, user);
      store.lastCreated = user;
      return user;
    },

    async inviteByEmail(
      email: string,
      orgId: string,
      role: string,
    ): Promise<void> {
      store.invitations.push({ email, orgId, role });
    },

    async updatePermissions(
      userId: string,
      orgId: string,
      permissions: ModulePermission[],
    ): Promise<void> {
      const user = store.users.get(userId);
      if (!user) throw new Error(`User ${userId} not found`);
      if (user.organizationId !== orgId) {
        throw new Error("Organization mismatch");
      }
      user.permissions = permissions;
    },

    async removeFromOrg(userId: string, orgId: string): Promise<void> {
      const user = store.users.get(userId);
      if (!user) throw new Error(`User ${userId} not found`);
      if (user.organizationId !== orgId) {
        throw new Error("Organization mismatch");
      }
      store.users.delete(userId);
    },
  };
}
