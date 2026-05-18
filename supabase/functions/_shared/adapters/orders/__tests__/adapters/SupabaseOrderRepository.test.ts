import { SupabaseOrderRepository } from "../../SupabaseOrderRepository.ts";
import type { SupabaseClient } from "../../../infra/supabase-client.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
}

type OrdersQuery = {
  select: (_columns: string) => OrdersQuery;
  eq: (_column: string, _value: string) => OrdersQuery;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
};

type FakeSupabase = {
  from: (table: string) => OrdersQuery;
};

const orderRow = {
  id: "order-1",
  organization_id: "org-1",
  marketplace: "mercado_livre",
  marketplace_order_id: "ml-1",
  status: "ready_to_print",
  marketplace_status: "paid",
  shipment_status: "ready_to_ship",
  shipment_substatus: "ready_to_print",
  is_fulfillment: false,
  is_cancelled: false,
  is_refunded: false,
  is_returned: false,
  is_printed_label: false,
  has_invoice: true,
  is_pickup_done: false,
  order_items: [{ id: "item-1", product_id: "prod-1", marketplace_item_id: "mli-1", quantity: 1 }],
};

Deno.test("SupabaseOrderRepository.findById maps signal boolean fields correctly", async () => {
  const fake: FakeSupabase = {
    from: (_table: string) => ({
      select: (_columns: string) => fake.from("orders"),
      eq: (_column: string, _value: string) => fake.from("orders"),
      maybeSingle: async () => ({ data: orderRow, error: null }),
    }),
  };
  const repo = new SupabaseOrderRepository(fake as unknown as SupabaseClient);
  const record = await repo.findById("order-1");
  if (!record) throw new Error("Expected order record");
  assertEquals(record.marketplaceSignals.isFulfillment, false);
  assertEquals(record.marketplaceSignals.shipmentStatus, "ready_to_ship");
  assertEquals(record.marketplaceSignals.shipmentSubstatus, "ready_to_print");
  assertEquals(record.marketplaceSignals.hasInvoice, true);
  assertEquals(record.items[0].productId, "prod-1");
});
