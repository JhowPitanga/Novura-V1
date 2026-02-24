import type { UserManagementPort } from "../ports/user-management-port.ts";
import type {
  CreateUserRequest,
  ModulePermission,
  OrganizationUser,
} from "../domain/types.ts";
import type { SupabaseClient } from "./supabase-client.ts";

/**
 * Supabase-backed implementation of UserManagementPort.
 * Orchestrates multi-table operations across auth.users,
 * user_profiles, organization_members, and permissions.
 * No table schema changes – adapter works with existing tables.
 */
export class SupabaseUserManagementAdapter implements UserManagementPort {
  constructor(private admin: SupabaseClient) {}

  async createOwner(req: CreateUserRequest): Promise<OrganizationUser> {
    const userId = await this.createAuthUser(req.email, req.password, req.fullName);
    await this.ensureProfile(userId, req.fullName, req.email);
    await this.addToOrganization(userId, req.organizationId, "owner");
    const permissions = await this.setFullPermissions(userId, req.organizationId, req.modules ?? []);
    return {
      userId,
      email: req.email,
      fullName: req.fullName,
      role: "owner",
      organizationId: req.organizationId,
      permissions,
    };
  }

  async createMember(req: CreateUserRequest): Promise<OrganizationUser> {
    let userId: string;
    try {
      userId = await this.createAuthUser(req.email, req.password, req.fullName);
    } catch (_) {
      userId = await this.findExistingUser(req.email);
    }

    await this.ensureProfile(userId, req.fullName, req.email);
    const role = req.role === "owner" ? "member" : req.role;
    await this.addToOrganization(userId, req.organizationId, role);
    const permissions = await this.setViewPermissions(userId, req.organizationId, req.modules ?? []);
    return {
      userId,
      email: req.email,
      fullName: req.fullName,
      role,
      organizationId: req.organizationId,
      permissions,
    };
  }

  async inviteByEmail(email: string, orgId: string, role: string): Promise<void> {
    const { error } = await (this.admin.auth.admin as any).inviteUserByEmail(email, {
      data: { organization_id: orgId, role },
    });
    if (error) throw new Error(`Invite failed: ${error.message}`);
  }

  async updatePermissions(
    userId: string,
    orgId: string,
    permissions: ModulePermission[],
  ): Promise<void> {
    await this.admin
      .from("permissions")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    if (permissions.length > 0) {
      const rows = permissions.map((p) => ({
        user_id: userId,
        organization_id: orgId,
        module_name: p.module,
        actions: p.actions,
      }));
      const { error } = await this.admin.from("permissions").insert(rows);
      if (error) throw new Error(`Failed to insert permissions: ${error.message}`);
    }
  }

  async removeFromOrg(userId: string, orgId: string): Promise<void> {
    await this.admin
      .from("permissions")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    const { error } = await this.admin
      .from("organization_members")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", orgId);

    if (error) throw new Error(`Failed to remove member: ${error.message}`);
  }

  // ── Private helpers ───────────────────────────────────────

  private async createAuthUser(email: string, password?: string, fullName?: string): Promise<string> {
    const { data, error } = await (this.admin.auth.admin as any).createUser({
      email,
      password: password || crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    return data.user.id;
  }

  private async findExistingUser(email: string): Promise<string> {
    const { data } = await (this.admin.auth.admin as any).listUsers();
    const user = data?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!user) throw new Error(`User not found: ${email}`);
    return user.id;
  }

  private async ensureProfile(userId: string, fullName: string, email: string): Promise<void> {
    await this.admin.from("user_profiles").upsert(
      { id: userId, full_name: fullName, email },
      { onConflict: "id" },
    );
  }

  private async addToOrganization(userId: string, orgId: string, role: string): Promise<void> {
    await this.admin.from("organization_members").upsert(
      { user_id: userId, organization_id: orgId, role },
      { onConflict: "user_id,organization_id" },
    );
  }

  private async setFullPermissions(
    userId: string,
    orgId: string,
    modules: string[],
  ): Promise<ModulePermission[]> {
    const permissions: ModulePermission[] = modules.map((m) => ({
      module: m,
      actions: ["view", "create", "edit", "delete"],
    }));
    if (permissions.length > 0) {
      await this.updatePermissions(userId, orgId, permissions);
    }
    return permissions;
  }

  private async setViewPermissions(
    userId: string,
    orgId: string,
    modules: string[],
  ): Promise<ModulePermission[]> {
    const permissions: ModulePermission[] = modules.map((m) => ({
      module: m,
      actions: ["view"],
    }));
    if (permissions.length > 0) {
      await this.updatePermissions(userId, orgId, permissions);
    }
    return permissions;
  }
}
