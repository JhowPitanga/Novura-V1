// PRD §8 Fase 1: dual-write to canonical tables only when listings_canonical is enabled.
// Backfill and listings-sync-one pass force: true to always write.

interface SupabaseClient {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
}

export interface ShouldWriteCanonicalOptions {
  /** Bypass flag check (backfill, sync-one reconcile). */
  force?: boolean;
}

/**
 * Returns true when canonical ingest should run for this org + marketplace.
 */
export async function shouldWriteCanonical(
  supabase: SupabaseClient,
  organizationId: string,
  marketplaceName: string,
  options?: ShouldWriteCanonicalOptions,
): Promise<boolean> {
  if (options?.force) return true;

  const { data, error } = await supabase
    .from('marketplace_integrations')
    .select('config')
    .eq('organizations_id', organizationId)
    .eq('marketplace_name', marketplaceName)
    .maybeSingle();

  if (error) {
    console.warn('[shouldWriteCanonical]', organizationId, marketplaceName, error.message);
    return false;
  }

  const cfg = data?.config;
  if (cfg && typeof cfg === 'object') {
    return (cfg as Record<string, unknown>).listings_canonical === true;
  }
  return false;
}
