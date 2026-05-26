/**
 * promotions-create
 * Creates a new promotion campaign on the marketplace and persists it locally.
 *
 * Body:
 *  { integrationId, promotionType, name, startDate, endDate }
 *  For Shopee flash sale: { ..., slotId }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { resolvePromotionsAdapter, normalizeMarketplaceKey } from "../_shared/adapters/promotions/factory.ts";
import { upsertCampaign, getIntegrationMeta } from "../_shared/adapters/promotions/db-upsert.ts";
import { ProviderUnsupportedError } from "../_shared/domain/promotions/promotion-types.ts";
import { HasCapabilityUseCase } from "../_shared/application/admin/HasCapabilityUseCase.ts";
import { SupabaseAdminRepository } from "../_shared/adapters/admin/SupabaseAdminRepository.ts";

function logPromotionsCreate(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    scope: "promotions-create",
    event,
    ...data,
  }));
}

function logPromotionsCreateWarn(event: string, data: Record<string, unknown> = {}): void {
  console.warn(JSON.stringify({
    scope: "promotions-create",
    level: "warn",
    event,
    ...data,
  }));
}

function logPromotionsCreateError(event: string, error: unknown, data: Record<string, unknown> = {}): void {
  const err = error as any;
  console.error(JSON.stringify({
    scope: "promotions-create",
    level: "error",
    event,
    message: err?.message ?? String(error),
    name: err?.name ?? null,
    code: err?.code ?? null,
    marketplaceCode: err?.marketplaceCode ?? null,
    retriable: err?.retriable ?? null,
    stack: err?.stack ?? null,
    ...data,
  }));
}

function summarizeCreateBody(body: Record<string, unknown>): Record<string, unknown> {
  return {
    integrationId: body.integrationId ?? null,
    promotionType: body.promotionType ?? null,
    nameLength: typeof body.name === "string" ? body.name.length : null,
    hasStartDate: typeof body.startDate === "string" && body.startDate.length > 0,
    hasEndDate: typeof body.endDate === "string" && body.endDate.length > 0,
    slotId: body.slotId ?? null,
  };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") {
    logPromotionsCreateWarn("method_not_allowed", { requestId, method: req.method });
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const ENC_KEY_B64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!ENC_KEY_B64) {
    logPromotionsCreateError("missing_tokens_encryption_key", new Error("Missing TOKENS_ENCRYPTION_KEY"), { requestId });
    return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (e) {
    logPromotionsCreateWarn("invalid_json_body", {
      requestId,
      message: (e as any)?.message ?? String(e),
    });
  }

  const { integrationId, promotionType, name, startDate, endDate, slotId } = body;
  logPromotionsCreate("request_received", {
    requestId,
    origin: req.headers.get("origin"),
    userAgent: req.headers.get("user-agent"),
    body: summarizeCreateBody(body),
  });
  if (!integrationId) {
    logPromotionsCreateWarn("validation_failed", { requestId, missing: "integrationId", body: summarizeCreateBody(body) });
    return jsonResponse({ error: "integrationId required" }, 400);
  }
  if (!promotionType) {
    logPromotionsCreateWarn("validation_failed", { requestId, missing: "promotionType", body: summarizeCreateBody(body) });
    return jsonResponse({ error: "promotionType required" }, 400);
  }
  if (!name) {
    logPromotionsCreateWarn("validation_failed", { requestId, missing: "name", body: summarizeCreateBody(body) });
    return jsonResponse({ error: "name required" }, 400);
  }

  const admin = createAdminClient() as any;
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  try {
    const { organizationId, marketplaceName } = await getIntegrationMeta(admin, integrationId);

    // ── Capability check: anuncios.can_create ──────────────────────────────
    const capUseCase = new HasCapabilityUseCase(new SupabaseAdminRepository(admin));
    const capResult = await capUseCase.execute({
      organizationId,
      featureKey: "anuncios",
      capabilityKey: "can_create",
    });
    if (!capResult.allowed) {
      logPromotionsCreateWarn("capability_denied", { requestId, organizationId, reason: capResult.reason });
      return jsonResponse({ ok: false, error: "Operação não permitida para esta organização", code: "CAPABILITY_DENIED" }, 403);
    }
    // ──────────────────────────────────────────────────────────────────────
    const marketplaceKey = normalizeMarketplaceKey(marketplaceName);
    const adapter = resolvePromotionsAdapter(integrationId, marketplaceName, ENC_KEY_B64, integrations, appCredentials);
    logPromotionsCreate("adapter_resolved", {
      requestId,
      organizationId,
      integrationId,
      marketplaceName,
      marketplaceKey,
      promotionType,
    });

    let campaign;
    if (promotionType === "FLASH_SALE" && slotId && adapter.createFlashSaleFromSlot) {
      logPromotionsCreate("create_flash_sale_started", { requestId, integrationId, marketplaceKey, slotId });
      campaign = await adapter.createFlashSaleFromSlot(slotId, name);
    } else if (promotionType === "STANDARD_DISCOUNT") {
      if (!startDate || !endDate) {
        logPromotionsCreateWarn("validation_failed", {
          requestId,
          missing: "startDate/endDate",
          body: summarizeCreateBody(body),
        });
        return jsonResponse({ error: "startDate and endDate required" }, 400);
      }
      logPromotionsCreate("create_standard_discount_started", {
        requestId,
        integrationId,
        marketplaceKey,
        startDate,
        endDate,
      });
      campaign = await adapter.createStandardDiscount({ name, startDate, endDate });
    } else {
      logPromotionsCreateWarn("unsupported_create_type", {
        requestId,
        integrationId,
        marketplaceKey,
        promotionType,
        hasSlotId: Boolean(slotId),
      });
      return jsonResponse({ error: `Cannot create ${promotionType} for this marketplace` }, 400);
    }
    logPromotionsCreate("marketplace_create_success", {
      requestId,
      integrationId,
      marketplaceKey,
      externalId: campaign?.externalId ?? null,
      promotionType: campaign?.promotionType ?? promotionType,
      status: campaign?.status ?? null,
      elapsedMs: Date.now() - startedAt,
    });

    const id = await upsertCampaign(admin, organizationId, integrationId, marketplaceKey, campaign);
    logPromotionsCreate("request_finished", {
      requestId,
      id,
      externalId: campaign?.externalId ?? null,
      elapsedMs: Date.now() - startedAt,
    });
    return jsonResponse({ ok: true, id, campaign });
  } catch (e: any) {
    if (e instanceof ProviderUnsupportedError) {
      logPromotionsCreateWarn("provider_unsupported", {
        requestId,
        message: e.message,
        body: summarizeCreateBody(body),
        elapsedMs: Date.now() - startedAt,
      });
      return jsonResponse({ ok: false, error: e.message }, 422);
    }
    logPromotionsCreateError("request_failed", e, {
      requestId,
      body: summarizeCreateBody(body),
      elapsedMs: Date.now() - startedAt,
    });
    return jsonResponse({ ok: false, error: e.message ?? String(e) }, 200);
  }
});
