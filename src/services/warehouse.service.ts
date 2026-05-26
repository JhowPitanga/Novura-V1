import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type StorageRow = Tables<"storage">;
export type IntegrationWarehouseConfig = Tables<"integration_warehouse_config">;

export type StorageType = "physical" | "fulfillment";

export interface StorageOption {
  id: string;
  name: string;
  type: string;
  marketplace_name: string | null;
  is_auto_created: boolean;
  readonly: boolean;
}

export interface WarehouseConfigFull {
  integrationId: string;
  physicalStorageId: string | null;
  fulfillmentStorageId: string | null;
}

// ---------------------------------------------------------------------------
// Storage queries
// ---------------------------------------------------------------------------

export async function fetchStorageByType(
  orgId: string,
  type: StorageType
): Promise<StorageOption[]> {
  const { data, error } = await supabase
    .from("storage")
    .select("id, name, type, marketplace_name, is_auto_created, readonly")
    .eq("organizations_id", orgId)
    .eq("active", true)
    .eq("type", type)
    .order("name");

  if (error) throw new Error(`fetchStorageByType failed: ${error.message}`);
  return (data || []) as StorageOption[];
}

export async function fetchAllActiveStorage(orgId: string): Promise<StorageOption[]> {
  const { data, error } = await supabase
    .from("storage")
    .select("id, name, type, marketplace_name, is_auto_created, readonly")
    .eq("organizations_id", orgId)
    .eq("active", true)
    .order("name");

  if (error) throw new Error(`fetchAllActiveStorage failed: ${error.message}`);
  return (data || []) as StorageOption[];
}

// ---------------------------------------------------------------------------
// Warehouse config queries
// ---------------------------------------------------------------------------

export async function fetchWarehouseConfig(
  orgId: string,
  integrationId: string
): Promise<WarehouseConfigFull | null> {
  const { data, error } = await (supabase as any)
    .from("integration_warehouse_config")
    .select("integration_id, physical_storage_id, fulfillment_storage_id")
    .eq("organization_id", orgId)
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error) throw new Error(`fetchWarehouseConfig failed: ${error.message}`);
  if (!data) return null;

  return {
    integrationId: data.integration_id,
    physicalStorageId: data.physical_storage_id ?? null,
    fulfillmentStorageId: data.fulfillment_storage_id ?? null,
  };
}

export async function upsertWarehouseConfig(
  orgId: string,
  integrationId: string,
  physicalStorageId: string,
  fulfillmentStorageId: string | null
): Promise<void> {
  const { data: integrationData, error: integrationError } = await (supabase as any)
    .from("marketplace_integrations")
    .select("marketplace_name, meli_user_id, config")
    .eq("id", integrationId)
    .eq("organizations_id", orgId)
    .maybeSingle();

  if (integrationError) {
    throw new Error(`upsertWarehouseConfig integration lookup failed: ${integrationError.message}`);
  }

  const configObj = (integrationData?.config ?? {}) as Record<string, unknown>;
  const sellerId =
    (integrationData?.meli_user_id != null ? String(integrationData.meli_user_id) : null) ??
    (typeof configObj.shopee_shop_id === "string" || typeof configObj.shopee_shop_id === "number"
      ? String(configObj.shopee_shop_id)
      : null) ??
    (typeof configObj.shop_id === "string" || typeof configObj.shop_id === "number"
      ? String(configObj.shop_id)
      : null) ??
    (typeof configObj.seller_id === "string" || typeof configObj.seller_id === "number"
      ? String(configObj.seller_id)
      : null);

  const { error } = await (supabase as any)
    .from("integration_warehouse_config")
    .upsert(
      {
        organization_id: orgId,
        integration_id: integrationId,
        physical_storage_id: physicalStorageId,
        fulfillment_storage_id: fulfillmentStorageId,
        marketplace_name: integrationData?.marketplace_name ?? null,
        id_seller: sellerId,
      },
      { onConflict: "organization_id,integration_id" }
    );

  if (error) throw new Error(`upsertWarehouseConfig failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Create fulfillment storage linked to an integration/marketplace
// ---------------------------------------------------------------------------

export async function createFulfillmentStorage(
  orgId: string,
  name: string,
  integrationId: string,
  marketplaceName: string
): Promise<StorageOption> {
  const { data, error } = await supabase
    .from("storage")
    .insert({
      organizations_id: orgId,
      name,
      type: "fulfillment",
      integration_id: integrationId,
      marketplace_name: marketplaceName,
      active: true,
      is_auto_created: false,
      readonly: false,
    })
    .select("id, name, type, marketplace_name, is_auto_created, readonly")
    .single();

  if (error) throw new Error(`createFulfillmentStorage failed: ${error.message}`);
  return data as StorageOption;
}
