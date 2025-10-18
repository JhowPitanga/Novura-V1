import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type MarketplaceItem = Database['public']['Tables']['marketplace_items']['Row'];

export async function fetchMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  opts?: { limit?: number }
): Promise<MarketplaceItem[]> {
  const limit = opts?.limit ?? 200;
  const { data, error } = await supabase
    .from('marketplace_items')
    .select('*')
    .eq('organizations_id', organizationId)
    .eq('marketplace_name', 'Mercado Livre')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function syncMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  siteId?: string
): Promise<{ ok: boolean; synced: number }> {
  const { data, error } = await supabase.functions.invoke('mercado-livre-sync-items', {
    body: { organizationId, siteId },
  });
  if (error) throw error;
  return (data as any) ?? { ok: false, synced: 0 };
}

export function subscribeMercadoLivreItems(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  onChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: MarketplaceItem; old?: MarketplaceItem }) => void
) {
  const channel = supabase
    .channel(`marketplace_items_meli_${organizationId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'marketplace_items',
      filter: `organizations_id=eq.${organizationId}`,
    }, (payload: any) => {
      const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
      const newRow = payload.new as MarketplaceItem | undefined;
      const oldRow = payload.old as MarketplaceItem | undefined;
      if (newRow?.marketplace_name !== 'Mercado Livre' && oldRow?.marketplace_name !== 'Mercado Livre') return;
      onChange({ eventType, new: newRow, old: oldRow });
    })
    .subscribe();

  const unsubscribe = () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
  return { channel, unsubscribe };
}