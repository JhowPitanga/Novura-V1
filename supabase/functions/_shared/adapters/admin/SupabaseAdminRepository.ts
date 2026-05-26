/**
 * SupabaseAdminRepository.ts
 * Supabase implementation of IAdminRepository.
 * Uses the admin client (service role) to read admin-controlled tables.
 */

import type { SupabaseClient } from "../infra/supabase-client.ts";

import type {
  IAdminRepository,
  OrganizationFeature,
  OrganizationStatusRow,
  SystemFeature,
} from "../../domain/admin/AdminContracts.ts";

export class SupabaseAdminRepository implements IAdminRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSystemFeature(key: string): Promise<SystemFeature | null> {
    const { data, error } = await this.client
      .from("system_features")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as SystemFeature;
  }

  async getOrganizationFeature(
    organizationId: string,
    featureKey: string,
  ): Promise<OrganizationFeature | null> {
    const { data, error } = await this.client
      .from("organization_features")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as OrganizationFeature;
  }

  async getOrganizationStatus(organizationId: string): Promise<OrganizationStatusRow | null> {
    const { data, error } = await this.client
      .from("organization_status")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error || !data) return null;
    return data as unknown as OrganizationStatusRow;
  }
}
