// Dual-write helper: normalizes a raw marketplace payload and upserts canonical tables.

// Errors are logged but never thrown — callers must not fail the main sync on canonical errors.



import { resolveAdapter } from './index.ts';

import { upsertCanonicalListing } from './upsertCanonical.ts';

import { fetchChannelSupplementary } from './reconcileCanonical.ts';

import type { AdapterNormalizeExtra } from './types.ts';



interface SupabaseClient {

  // deno-lint-ignore no-explicit-any

  from: (table: string) => any;

}



export interface SyncCanonicalParams {

  organizationId: string;

  integrationId?: string | null;

  marketplaceName: string;

  marketplaceItemId: string;

  payload: unknown;

  payloadSource?: string;

  /** Pre-fetched ML supplementary rows (avoids extra DB round-trips in batch jobs). */

  mlExtra?: AdapterNormalizeExtra;

}



export async function syncCanonicalFromPayload(

  supabase: SupabaseClient,

  params: SyncCanonicalParams,

): Promise<{ ok: boolean; listingId?: string; error?: string }> {

  const {

    organizationId,

    integrationId,

    marketplaceName,

    marketplaceItemId,

    payload,

    payloadSource = 'sync-items',

    mlExtra,

  } = params;



  try {

    const wrapped =

      payload && typeof payload === 'object' && !('data' in (payload as Record<string, unknown>))

        ? {

            data: payload,

            marketplace_item_id: marketplaceItemId,

            marketplace_name: marketplaceName,

          }

        : payload;



    let extra = mlExtra;

    if (!extra) {

      extra = await fetchChannelSupplementary(

        supabase,

        organizationId,

        marketplaceName,

        marketplaceItemId,

        payload,

      );

    }



    const adapter = resolveAdapter(marketplaceName);

    const normalized = adapter.normalize(wrapped, {

      organizationId,

      integrationId: integrationId ?? null,

      payloadVersion: 1,

      extra,

    });



    await supabase.from('marketplace_listings_raw').upsert(

      {

        organizations_id: organizationId,

        marketplace_name: marketplaceName,

        marketplace_item_id: marketplaceItemId,

        integration_id: integrationId ?? null,

        payload: (wrapped as Record<string, unknown>)?.data ?? wrapped,

        payload_version: 1,

        payload_source: payloadSource,

        fetched_at: new Date().toISOString(),

      },

      {

        onConflict: 'organizations_id,marketplace_name,marketplace_item_id,payload_version',

        ignoreDuplicates: true,

      },

    );



    const { listingId, error } = await upsertCanonicalListing(supabase, normalized, {

      organizationsId: organizationId,

      integrationId: integrationId ?? null,

    });



    if (error) {

      console.warn('[syncCanonicalFromPayload]', marketplaceItemId, error.message);

      return { ok: false, error: error.message };

    }



    return { ok: true, listingId };

  } catch (err) {

    const msg = err instanceof Error ? err.message : String(err);

    console.warn('[syncCanonicalFromPayload]', marketplaceItemId, msg);

    return { ok: false, error: msg };

  }

}



export { reconcileCanonicalFromStoredRaw } from './reconcileCanonical.ts';


