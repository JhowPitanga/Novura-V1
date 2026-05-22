/**
 * HasCapabilityUseCase.test.ts
 * Deno unit tests — no `any`, deterministic mocks.
 */

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { HasCapabilityUseCase } from "./HasCapabilityUseCase.ts";
import type {
  IAdminRepository,
  OrganizationFeature,
  OrganizationStatusRow,
  SystemFeature,
} from "../../domain/admin/AdminContracts.ts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStatus(overrides: Partial<OrganizationStatusRow> = {}): OrganizationStatusRow {
  return {
    organization_id: "org-1",
    status: "active",
    active_users_count: 2,
    max_users_allowed: 10,
    plan_sku: "plan_standard",
    blocked_reason: null,
    blocked_at: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeGlobalFeature(overrides: Partial<SystemFeature> = {}): SystemFeature {
  return {
    id: "feat-1",
    key: "anuncios",
    name: "Anúncios",
    badge_status: "stable",
    is_globally_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOrgFeature(caps: Record<string, unknown> = {}): OrganizationFeature {
  return {
    id: "of-1",
    organization_id: "org-1",
    feature_key: "anuncios",
    is_enabled: true,
    capabilities: { can_view: true, can_create: true, ...caps } as never,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeRepo(
  status: OrganizationStatusRow | null,
  feature: SystemFeature | null,
  orgFeature: OrganizationFeature | null,
): IAdminRepository {
  return {
    getOrganizationStatus: () => Promise.resolve(status),
    getSystemFeature: () => Promise.resolve(feature),
    getOrganizationFeature: () => Promise.resolve(orgFeature),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

Deno.test("blocked org → denied with org_blocked", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus({ status: "blocked" }), makeGlobalFeature(), makeOrgFeature()),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_create" });
  assertEquals(result, { allowed: false, reason: "org_blocked" });
});

Deno.test("deleted org → denied with org_blocked", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus({ deleted_at: new Date().toISOString() }), makeGlobalFeature(), makeOrgFeature()),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_create" });
  assertEquals(result, { allowed: false, reason: "org_blocked" });
});

Deno.test("global feature disabled → global_disabled", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus(), makeGlobalFeature({ is_globally_enabled: false }), makeOrgFeature()),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_create" });
  assertEquals(result, { allowed: false, reason: "global_disabled" });
});

Deno.test("org feature disabled → feature_disabled", async () => {
  const orgF = { ...makeOrgFeature(), is_enabled: false };
  const uc = new HasCapabilityUseCase(makeRepo(makeStatus(), makeGlobalFeature(), orgF));
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_create" });
  assertEquals(result, { allowed: false, reason: "feature_disabled" });
});

Deno.test("can_create=false → capability_denied (PRD §9.3)", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus(), makeGlobalFeature(), makeOrgFeature({ can_create: false })),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_create" });
  assertEquals(result, { allowed: false, reason: "capability_denied" });
});

Deno.test("can_view=true → allowed (PRD §9.3)", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus(), makeGlobalFeature(), makeOrgFeature({ can_create: false, can_view: true })),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "can_view" });
  assertEquals(result, { allowed: true });
});

Deno.test("missing capability key → capability_missing", async () => {
  const uc = new HasCapabilityUseCase(
    makeRepo(makeStatus(), makeGlobalFeature(), makeOrgFeature()),
  );
  const result = await uc.execute({ organizationId: "org-1", featureKey: "anuncios", capabilityKey: "promote_create" });
  assertEquals(result, { allowed: false, reason: "capability_missing" });
});
