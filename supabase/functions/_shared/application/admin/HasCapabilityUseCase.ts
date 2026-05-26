/**
 * HasCapabilityUseCase.ts
 * Pure, deterministic capability check — no side effects, no `any`.
 * Follows the algorithm specified in PRD §6.1.
 */

import type {
  CapabilityCheckInput,
  CapabilityCheckResult,
  IAdminRepository,
} from "../../domain/admin/AdminContracts.ts";

export class HasCapabilityUseCase {
  constructor(private readonly repo: IAdminRepository) {}

  async execute(input: CapabilityCheckInput): Promise<CapabilityCheckResult> {
    const { organizationId, featureKey, capabilityKey } = input;

    // Step 1 — org must be active
    const orgStatus = await this.repo.getOrganizationStatus(organizationId);
    if (!orgStatus || orgStatus.status === "blocked" || orgStatus.deleted_at !== null) {
      return { allowed: false, reason: "org_blocked" };
    }

    // Step 2 — global feature kill-switch
    const globalFeature = await this.repo.getSystemFeature(featureKey);
    if (!globalFeature || !globalFeature.is_globally_enabled) {
      return { allowed: false, reason: "global_disabled" };
    }

    // Step 3 — per-org override
    const orgFeature = await this.repo.getOrganizationFeature(organizationId, featureKey);
    if (!orgFeature || !orgFeature.is_enabled) {
      return { allowed: false, reason: "feature_disabled" };
    }

    // Step 4 — capability key check
    const caps = orgFeature.capabilities as Record<string, unknown>;
    if (!(capabilityKey in caps)) {
      return { allowed: false, reason: "capability_missing" };
    }

    const value = caps[capabilityKey];

    if (typeof value === "boolean") {
      return value
        ? { allowed: true }
        : { allowed: false, reason: "capability_denied" };
    }

    if (typeof value === "number") {
      // Numeric quota: truthy = there is quota left (comparison delegated to caller for MVP)
      return value > 0
        ? { allowed: true }
        : { allowed: false, reason: "capability_denied" };
    }

    return { allowed: false, reason: "capability_denied" };
  }
}
