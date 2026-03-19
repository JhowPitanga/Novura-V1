// supabase/functions/_shared/adapters/orders-upsert/index.ts
import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { UpsertOrderInput, UpsertOrderResult } from "../../domain/orders/orders-types.ts";
import { OrdersUpsertAdapter } from "./orders-upsert-adapter.ts";

export { OrdersUpsertAdapter } from "./orders-upsert-adapter.ts";

/** Delegates to OrdersUpsertAdapter.upsert. Single entry point for order upsert. */
export async function upsertOrder(
  admin: SupabaseClient,
  input: UpsertOrderInput,
): Promise<UpsertOrderResult> {
  return new OrdersUpsertAdapter().upsert(admin, input);
}
