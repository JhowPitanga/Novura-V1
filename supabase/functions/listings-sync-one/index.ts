// deno-lint-ignore-file no-explicit-any
// listings-sync-one — synchronises a single listing item into the canonical tables.
// Called from the frontend "Sincronizar este anúncio" action or by other edge functions.
//
// Request body:
//   { organizationId: string, marketplaceItemId: string, scope?: 'full'|'metrics'|'fees'|'quality' }

declare const Deno: any;

import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import {
  isMercadoLivreChannel,
  loadListingRawPayload,
  reconcileCanonicalFromStoredRaw,
} from "../_shared/listing-adapters/reconcileCanonical.ts";

type Scope = 'full' | 'metrics' | 'fees' | 'quality';

function invokeHeaders(serviceRoleKey: string) {
  return {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'x-internal-call': '1',
  };
}

async function invokeChannelSync(
  admin: ReturnType<typeof createAdminClient>,
  serviceRoleKey: string,
  fnName: string,
  body: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.functions.invoke(fnName, {
    body,
    headers: invokeHeaders(serviceRoleKey),
  });
  if (error) {
    console.warn(`[listings-sync-one] ${fnName} invoke warning:`, (error as Error)?.message ?? error);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing service configuration" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const organizationId = String(body.organizationId ?? '');
  const marketplaceItemId = String(body.marketplaceItemId ?? '');
  const scope: Scope = (['full', 'metrics', 'fees', 'quality'].includes(String(body.scope))
    ? String(body.scope)
    : 'full') as Scope;

  if (!organizationId || !marketplaceItemId) {
    return jsonResponse({ error: "organizationId and marketplaceItemId are required" }, 400);
  }

  let triggeredByUserId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const parts = authHeader.replace("Bearer ", "").split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        triggeredByUserId = payload?.sub ?? null;
      }
    } catch { /* ignore */ }
  }

  const admin = createAdminClient();
  const startedAt = new Date();

  const { data: jobRow } = await admin
    .from("marketplace_listing_sync_jobs" as any)
    .insert({
      organizations_id: organizationId,
      marketplace_name: '',
      marketplace_item_id: marketplaceItemId,
      triggered_by_user_id: triggeredByUserId,
      scope,
      status: 'running',
      started_at: startedAt.toISOString(),
    })
    .select("id")
    .single();

  const jobId: string | null = jobRow?.id ?? null;

  const updateJob = async (status: string, marketplaceName: string, errorMsg?: string) => {
    if (!jobId) return;
    const finishedAt = new Date();
    await admin
      .from("marketplace_listing_sync_jobs" as any)
      .update({
        marketplace_name: marketplaceName,
        status,
        error_message: errorMsg ?? null,
        finished_at: finishedAt.toISOString(),
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      })
      .eq("id", jobId);
  };

  try {
    const loaded = await loadListingRawPayload(admin, organizationId, marketplaceItemId);
    if (!loaded?.marketplaceName) {
      await updateJob('error', '', `Item not found: ${marketplaceItemId}`);
      return jsonResponse({ error: "Item not found in marketplace_items_raw or marketplace_items" }, 404);
    }

    const marketplaceName = loaded.marketplaceName;
    const itemIds = [marketplaceItemId];
    const isMl = isMercadoLivreChannel(marketplaceName);
    const isShopee = marketplaceName.toLowerCase().includes('shopee');

    if (isMl) {
      if (scope === 'full') {
        await invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-sync-items', {
          organizationId,
          itemId: marketplaceItemId,
        });
        await Promise.all([
          invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-update-metrics', {
            organizationId,
            itemIds,
          }),
          invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-update-quality', {
            organizationId,
            itemIds,
          }),
          invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-update-reviews', {
            organizationId,
            itemIds,
          }),
          invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-sync-prices', {
            organizationId,
            itemIds,
          }),
          invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-sync-stock-distribution', {
            organizationId,
            itemIds,
          }),
        ]);
      } else if (scope === 'metrics') {
        await invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-update-metrics', {
          organizationId,
          itemIds,
        });
      } else if (scope === 'quality') {
        await invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-update-quality', {
          organizationId,
          itemIds,
        });
      } else if (scope === 'fees') {
        await invokeChannelSync(admin, SERVICE_ROLE_KEY, 'mercado-livre-sync-prices', {
          organizationId,
          itemIds,
        });
      }
    } else if (isShopee) {
      if (scope === 'full' || scope === 'metrics' || scope === 'quality') {
        await invokeChannelSync(admin, SERVICE_ROLE_KEY, 'shopee-sync-items', {
          organizationId,
          item_id_list: itemIds,
        });
      }
    }

    const reconcile = await reconcileCanonicalFromStoredRaw(admin, {
      organizationId,
      marketplaceName,
      marketplaceItemId,
      integrationId: loaded.integrationId,
      payloadSource: 'sync-one',
      force: true,
    });

    if (!reconcile.ok) {
      await updateJob('error', marketplaceName, reconcile.error);
      return jsonResponse({ error: reconcile.error ?? 'Reconcile failed' }, 500);
    }

    await updateJob('success', marketplaceName);

    return jsonResponse({
      ok: true,
      listingId: reconcile.listingId,
      marketplaceName,
      scope,
      durationMs: new Date().getTime() - startedAt.getTime(),
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await updateJob('error', '', msg);
    return jsonResponse({ error: msg }, 500);
  }
});
