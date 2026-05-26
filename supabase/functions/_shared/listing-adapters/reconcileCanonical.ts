// Rebuilds canonical listing tables from stored raw payload + optional ML supplementary rows.

import { resolveAdapter } from './index.ts';
import { upsertCanonicalListing } from './upsertCanonical.ts';
import { shouldWriteCanonical } from './shouldWriteCanonical.ts';
import type { AdapterNormalizeExtra, ProviderFeeRuleSnapshot } from './types.ts';

interface SupabaseClient {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

export function isMercadoLivreChannel(marketplaceName: string): boolean {
  const c = String(marketplaceName || '').toLowerCase();
  return c.includes('mercado') || c === 'ml';
}

export function isShopeeChannel(marketplaceName: string): boolean {
  return String(marketplaceName || '').toLowerCase().includes('shopee');
}

function extractCategoryId(payload: unknown): string | null {
  const raw = payload as Record<string, unknown>;
  const data = (raw?.['data'] ?? raw) as Record<string, unknown>;
  const base = (data?.['base_info'] ?? {}) as Record<string, unknown>;
  const cat = base?.['category_id'] ?? data?.['category_id'] ?? raw?.['category_id'];
  return cat != null ? String(cat) : null;
}

async function fetchFeeRuleByCategory(
  supabase: SupabaseClient,
  marketplaceName: string,
  categoryId: string | null,
): Promise<ProviderFeeRuleSnapshot | null> {
  const ids = categoryId ? [categoryId, '_default'] : ['_default'];
  for (const cid of ids) {
    const { data } = await supabase
      .from('marketplace_provider_fee_rules')
      .select('commission_percentage, commission_fixed_fee, listing_fee_amount, currency, source')
      .eq('marketplace_name', marketplaceName)
      .eq('category_id', cid)
      .maybeSingle();
    if (data) {
      return data as ProviderFeeRuleSnapshot;
    }
  }
  return null;
}

async function learnShopeeFeeFromOrders(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceItemId: string,
  categoryId: string | null,
): Promise<Pick<AdapterNormalizeExtra, 'observedAvgCommissionAmount' | 'observedAvgCommissionPercentage'>> {
  const { data: orders } = await supabase
    .from('marketplace_orders_presented_new')
    .select('items_total_sale_fee, items_total_amount')
    .eq('organizations_id', organizationId)
    .eq('first_item_id', marketplaceItemId)
    .eq('marketplace_name', 'Shopee')
    .gt('items_total_sale_fee', 0)
    .order('created_at', { ascending: false })
    .limit(25);

  const rows = (orders ?? []) as Array<{ items_total_sale_fee?: number; items_total_amount?: number }>;
  if (!rows.length) return {};

  const avgFee =
    rows.reduce((s, r) => s + Number(r.items_total_sale_fee ?? 0), 0) / rows.length;

  const withAmount = rows.filter((r) => Number(r.items_total_amount) > 0);
  let avgPct: number | null = null;
  if (withAmount.length) {
    avgPct =
      withAmount.reduce(
        (s, r) => s + (Number(r.items_total_sale_fee ?? 0) / Number(r.items_total_amount)) * 100,
        0,
      ) / withAmount.length;
  }

  if (categoryId && avgPct != null && avgPct > 0) {
    await supabase.from('marketplace_provider_fee_rules').upsert(
      {
        marketplace_name: 'Shopee',
        category_id: categoryId,
        site_id: 'BR',
        commission_percentage: Math.round(avgPct * 100) / 100,
        commission_fixed_fee: 0,
        listing_fee_amount: 0,
        source: 'order_items_avg',
        metadata: { sample_size: rows.length, marketplace_item_id: marketplaceItemId },
      },
      { onConflict: 'marketplace_name,category_id,site_id' },
    );
  }

  return {
    observedAvgCommissionAmount: avgFee > 0 ? avgFee : null,
    observedAvgCommissionPercentage: avgPct,
  };
}

export async function fetchShopeeSupplementary(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceItemId: string,
  payload: unknown,
): Promise<AdapterNormalizeExtra> {
  const categoryId = extractCategoryId(payload);
  const feeRule = await fetchFeeRuleByCategory(supabase, 'Shopee', categoryId);
  const observed = await learnShopeeFeeFromOrders(
    supabase,
    organizationId,
    marketplaceItemId,
    categoryId,
  );
  return { feeRule, ...observed };
}

/** Channel-specific enrichment (metrics, prices, fee rules). */
export async function fetchChannelSupplementary(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceName: string,
  marketplaceItemId: string,
  payload?: unknown,
): Promise<AdapterNormalizeExtra | undefined> {
  if (isMercadoLivreChannel(marketplaceName)) {
    return fetchMlSupplementary(supabase, organizationId, marketplaceItemId);
  }
  if (isShopeeChannel(marketplaceName)) {
    return fetchShopeeSupplementary(supabase, organizationId, marketplaceItemId, payload);
  }
  return undefined;
}

export async function fetchMlSupplementary(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceItemId: string,
): Promise<AdapterNormalizeExtra> {
  const [metricsRes, pricesRes] = await Promise.all([
    supabase
      .from('marketplace_metrics')
      .select('*')
      .eq('organizations_id', organizationId)
      .eq('marketplace_name', 'Mercado Livre')
      .eq('marketplace_item_id', marketplaceItemId)
      .maybeSingle(),
    supabase
      .from('marketplace_item_prices')
      .select('*')
      .eq('organizations_id', organizationId)
      .eq('marketplace_name', 'Mercado Livre')
      .eq('marketplace_item_id', marketplaceItemId)
      .maybeSingle(),
  ]);

  const metricsRow = (metricsRes.data ?? null) as Record<string, unknown> | null;
  return {
    metricsRow,
    listingPricesRow: (pricesRes.data ?? null) as Record<string, unknown> | null,
    qualityRow: metricsRow,
  };
}

export async function loadListingRawPayload(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceItemId: string,
): Promise<{
  marketplaceName: string;
  integrationId: string | null;
  payload: unknown;
} | null> {
  const { data: rawItem } = await supabase
    .from('marketplace_items_raw')
    .select('*')
    .eq('organizations_id', organizationId)
    .eq('marketplace_item_id', marketplaceItemId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rawItem) {
    return {
      marketplaceName: String(rawItem.marketplace_name ?? rawItem.marketplace ?? ''),
      integrationId: rawItem.integration_id ?? null,
      payload: rawItem,
    };
  }

  const { data: legacyItem } = await supabase
    .from('marketplace_items')
    .select('*')
    .eq('organizations_id', organizationId)
    .eq('marketplace_item_id', marketplaceItemId)
    .maybeSingle();

  if (!legacyItem) return null;

  return {
    marketplaceName: String(legacyItem.marketplace_name ?? 'Mercado Livre'),
    integrationId: legacyItem.integration_id ?? null,
    payload: legacyItem.data ? { data: legacyItem.data, ...legacyItem } : legacyItem,
  };
}

export interface ReconcileCanonicalParams {
  organizationId: string;
  marketplaceName: string;
  marketplaceItemId: string;
  integrationId?: string | null;
  payloadSource?: string;
  payloadOverride?: unknown;
  /** Backfill / sync-one: write canonical even if listings_canonical flag is off. */
  force?: boolean;
}

/** Non-throwing: logs warnings on failure. */
export async function reconcileCanonicalFromStoredRaw(
  supabase: SupabaseClient,
  params: ReconcileCanonicalParams,
): Promise<{ ok: boolean; listingId?: string; error?: string; skipped?: boolean }> {
  const {
    organizationId,
    marketplaceName,
    marketplaceItemId,
    integrationId: integrationIdParam,
    payloadSource = 'reconcile',
    payloadOverride,
    force,
  } = params;

  try {
    const enabled = await shouldWriteCanonical(supabase, organizationId, marketplaceName, { force });
    if (!enabled) {
      return { ok: true, skipped: true };
    }

    let payload = payloadOverride;
    let integrationId = integrationIdParam ?? null;
    let mktName = marketplaceName;

    if (payload == null) {
      const loaded = await loadListingRawPayload(supabase, organizationId, marketplaceItemId);
      if (!loaded?.marketplaceName) {
        return { ok: false, error: 'Item not found in marketplace_items_raw or marketplace_items' };
      }
      payload = loaded.payload;
      mktName = loaded.marketplaceName;
      integrationId = integrationId ?? loaded.integrationId;
    }

    const extra = await fetchChannelSupplementary(
      supabase,
      organizationId,
      mktName,
      marketplaceItemId,
      payload,
    );

    const adapter = resolveAdapter(mktName);
    const wrapped =
      payload && typeof payload === 'object' && !('data' in (payload as Record<string, unknown>))
        ? {
            data: payload,
            marketplace_item_id: marketplaceItemId,
            marketplace_name: mktName,
          }
        : payload;

    const normalized = adapter.normalize(wrapped, {
      organizationId,
      integrationId,
      payloadVersion: 1,
      extra,
    });

    await supabase.from('marketplace_listings_raw').upsert(
      {
        organizations_id: organizationId,
        marketplace_name: mktName,
        marketplace_item_id: marketplaceItemId,
        integration_id: integrationId,
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
      integrationId,
    });

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, listingId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
