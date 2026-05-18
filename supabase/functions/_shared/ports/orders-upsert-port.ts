/**
 * Port for upserting a normalized order into orders + order_items + order_shipping + order_status_history.
 */

import type { SupabaseClient } from "../adapters/infra/supabase-client.ts";
import type { UpsertOrderInput, UpsertOrderResult } from "../domain/orders/orders-types.ts";

export interface OrdersUpsertPort {
  upsert(admin: SupabaseClient, input: UpsertOrderInput): Promise<UpsertOrderResult>;
}
