import { supabase } from "@/integrations/supabase/client";

export interface ListingsRealtimeHandlers {
  onListingsChange: () => void;
  onMetricsChange: () => void;
  onQualityChange: () => void;
  onItemsChange: (payload: any) => void;
}

/**
 * Creates a Supabase Realtime channel that watches canonical listings tables
 * plus the legacy marketplace_items table.
 *
 * The hook must call removeListingsChannel(channel) in the useEffect cleanup.
 */
export function createListingsChannel(orgId: string, handlers: ListingsRealtimeHandlers) {
  return (supabase as any)
    .channel(`marketplace_listings_${orgId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "marketplace_listings",
        filter: `organizations_id=eq.${orgId}`,
      },
      handlers.onListingsChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "marketplace_listing_metrics",
        filter: `organizations_id=eq.${orgId}`,
      },
      handlers.onMetricsChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "marketplace_listing_quality",
        filter: `organizations_id=eq.${orgId}`,
      },
      handlers.onQualityChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "marketplace_items",
        filter: `organizations_id=eq.${orgId}`,
      },
      handlers.onItemsChange,
    )
    .subscribe();
}

export function removeListingsChannel(channel: any): void {
  try {
    (supabase as any).removeChannel(channel);
  } catch {}
}
