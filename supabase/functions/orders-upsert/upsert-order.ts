/**
 * Facade: delegates to OrdersUpsertAdapter so existing callers (HTTP handler, webhooks, sync) keep the same API.
 * Core logic lives in OrdersUpsertAdapter (one normalizer adapter).
 */

import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { UpsertOrderInput, UpsertOrderResult } from "../_shared/domain/orders/orders-types.ts";
import { OrdersUpsertAdapter } from "./orders-upsert-adapter.ts";

export async function upsertOrder(
  supabase: SupabaseClient,
  input: UpsertOrderInput,
): Promise<UpsertOrderResult> {
  return new OrdersUpsertAdapter().upsert(supabase, input);
}
