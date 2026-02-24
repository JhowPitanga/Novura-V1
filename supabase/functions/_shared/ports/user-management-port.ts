import type {
  CreateUserRequest,
  ModulePermission,
  OrganizationUser,
} from "../domain/types.ts";

/**
 * Port for managing users within an organization.
 * Abstracts multi-table atomic operations across auth.users,
 * user_profiles, organization_members, and permissions.
 */
export interface UserManagementPort {
  createOwner(req: CreateUserRequest): Promise<OrganizationUser>;
  createMember(req: CreateUserRequest): Promise<OrganizationUser>;
  inviteByEmail(
    email: string,
    orgId: string,
    role: string,
  ): Promise<void>;
  updatePermissions(
    userId: string,
    orgId: string,
    permissions: ModulePermission[],
  ): Promise<void>;
  removeFromOrg(userId: string, orgId: string): Promise<void>;
}
