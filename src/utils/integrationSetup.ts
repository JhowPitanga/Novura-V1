export interface IntegrationSetupSnapshot {
  setup_status?: string | null;
  company_id?: string | null;
  warehouse_config?: {
    physical_storage_id?: string | null;
  } | null;
}

/** True when company and physical warehouse are already linked (even if setup_status is stale). */
export function isIntegrationFullyConfigured(
  integration: IntegrationSetupSnapshot,
): boolean {
  if (integration.setup_status === "completed") return true;
  const hasCompany = Boolean(integration.company_id);
  const hasWarehouse = Boolean(integration.warehouse_config?.physical_storage_id);
  return hasCompany && hasWarehouse;
}

/** Whether QuickSetup (company + warehouse) is still required after OAuth. */
export function integrationRequiresQuickSetup(
  setupStatus?: string | null,
  integration?: IntegrationSetupSnapshot | null,
): boolean {
  if (integration && isIntegrationFullyConfigured(integration)) return false;
  return setupStatus !== "completed";
}

/** Show the amber banner only for integrations that still need company/warehouse. */
export function shouldShowPendingSetupBanner(
  integration: IntegrationSetupSnapshot & {
    id: string;
    status?: string | null;
    deactivated_at?: string | null;
    provider_id?: string | null;
    store_name?: string | null;
    external_account_id?: string | null;
  },
  allIntegrations: Array<
    IntegrationSetupSnapshot & {
      id: string;
      setup_status?: string | null;
      deactivated_at?: string | null;
      provider_id?: string | null;
      store_name?: string | null;
      external_account_id?: string | null;
    }
  >,
): boolean {
  if (integration.status !== "active" || integration.deactivated_at) return false;
  if (isIntegrationFullyConfigured(integration)) return false;
  if (integration.setup_status !== "pending") return false;

  const hasCompletedSibling = allIntegrations.some(
    (other) =>
      other.id !== integration.id &&
      other.setup_status === "completed" &&
      !other.deactivated_at &&
      other.provider_id === integration.provider_id &&
      (other.store_name === integration.store_name ||
        (other.external_account_id &&
          integration.external_account_id &&
          other.external_account_id === integration.external_account_id)),
  );
  return !hasCompletedSibling;
}
