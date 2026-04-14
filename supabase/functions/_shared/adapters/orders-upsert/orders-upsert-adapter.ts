/**
 * Normalizer adapter: implements OrdersUpsertPort. All order upsert logic (orders, order_items, order_shipping, order_status_history) in one place.
 * C0-T12: computes internal_status + has_unlinked_items after writing items.
 * Stock side effects (reserve, consume, refund) are handled exclusively by
 * HandleStockSideEffectsUseCase via RecalculateOrderStatusUseCase, which runs
 * AFTER ResolveOrderWarehouseUseCase sets orders.storage_id. Never call stock
 * RPCs directly here to avoid using wrong storage or double-deducting stock.
 */

import { computeInternalStatus } from "../../domain/orders/order-status.ts";
import type {
  NormalizedOrder,
  NormalizedOrderItem,
  NormalizedOrderShipping,
  OrderInsertRow,
  OrderItemInsertRow,
  OrderShippingInsertRow,
  UpsertOrderInput,
  UpsertOrderResult,
} from "../../domain/orders/orders-types.ts";
import type { OrdersUpsertPort } from "../../ports/orders-upsert-port.ts";
import type { SupabaseClient } from "../infra/supabase-client.ts";

const ORDERS_CONFLICT = "organization_id,marketplace,marketplace_order_id";
const ITEMS_CONFLICT = "order_id,marketplace_item_id";

function mapOrderRow(organizationId: string, order: NormalizedOrder, companyId?: string | null): OrderInsertRow {
  return {
    organization_id: organizationId,
    company_id: companyId ?? null,
    marketplace: order.marketplace,
    marketplace_order_id: order.marketplace_order_id,
    pack_id: order.pack_id,
    status: order.status,
    marketplace_status: order.marketplace_status,
    payment_status: order.payment_status,
    gross_amount: order.gross_amount,
    marketplace_fee: order.marketplace_fee,
    shipping_cost: order.shipping_cost,
    shipping_subsidy: order.shipping_subsidy,
    net_amount: order.net_amount,
    buyer_name: order.buyer_name,
    buyer_document: order.buyer_document,
    buyer_email: order.buyer_email,
    buyer_phone: order.buyer_phone,
    buyer_state: order.buyer_state,
    created_at: order.created_at,
    shipped_at: order.shipped_at,
    delivered_at: order.delivered_at,
    canceled_at: order.canceled_at,
    shipment_status: order.shipmentStatus ?? null,
    shipment_substatus: order.shipmentSubstatus ?? null,
    is_fulfillment: order.isFulfillment ?? false,
    is_cancelled: order.isCancelled ?? false,
    is_refunded: order.isRefunded ?? false,
    is_returned: order.isReturned ?? false,
    has_invoice: order.hasInvoice ?? false,
    is_pickup_done: order.isPickupDone ?? false,
    last_synced_at: new Date().toISOString(),
  };
}

function mapItemRow(orderId: string, item: NormalizedOrderItem): OrderItemInsertRow {
  return {
    order_id: orderId,
    marketplace_item_id: item.marketplace_item_id,
    sku: item.sku,
    title: item.title,
    quantity: item.quantity,
    unit_price: item.unit_price,
    variation_name: item.variation_name,
    image_url: item.image_url,
  };
}

function mapShippingRow(orderId: string, s: NormalizedOrderShipping): OrderShippingInsertRow {
  return {
    order_id: orderId,
    shipment_id: s.shipment_id,
    logistic_type: s.logistic_type,
    tracking_number: s.tracking_number,
    carrier: s.carrier,
    status: s.status,
    substatus: s.substatus,
    street_name: s.street_name,
    street_number: s.street_number,
    complement: s.complement,
    neighborhood: s.neighborhood,
    city: s.city,
    state_uf: s.state_uf,
    zip_code: s.zip_code,
    country: "BR",
    sla_expected_date: s.sla_expected_date,
    sla_status: s.sla_status,
    estimated_delivery: s.estimated_delivery,
    updated_at: new Date().toISOString(),
  };
}

type EnsureOrderRowOk = {
  orderId: string;
  created: boolean;
  previousMarketplaceStatus: string | null;
  previousStatus: string | null;
  previousInternalStatus: string | null;
};

type EnsureOrderRowError = { error: string };

export class OrdersUpsertAdapter implements OrdersUpsertPort {
  async upsert(admin: SupabaseClient, input: UpsertOrderInput): Promise<UpsertOrderResult> {
    const { organization_id, company_id, order, source } = input;

    try {
      const rowResult = await this.ensureOrderRow(admin, organization_id, order, company_id);
      if ("error" in rowResult) {
        return { success: false, order_id: null, created: false, error: rowResult.error };
      }

      const { orderId, created, previousMarketplaceStatus, previousStatus, previousInternalStatus } = rowResult;
      const marketplaceChanged = previousMarketplaceStatus !== order.marketplace_status;
      const statusChanged = previousStatus !== (order.status ?? null);
      if (marketplaceChanged || statusChanged) {
        const toStatus = order.marketplace_status ?? order.status ?? "unknown";
        await this.appendStatusHistory(
          admin,
          orderId,
          previousMarketplaceStatus ?? previousStatus,
          toStatus,
          source,
        );
      }

      // UPSERT items (preserves product_id on existing rows).
      await this.upsertOrderItems(admin, orderId, order.items);

      // Compute has_unlinked_items and internal_status after items are written.
      const hasUnlinked = await this.countUnlinkedItems(admin, orderId) > 0;
      const newInternalStatus = computeInternalStatus(order.marketplace, order.marketplace_status, hasUnlinked);
      await this.updateInternalStatus(admin, orderId, newInternalStatus, hasUnlinked);

      if (order.shipping) {
        await this.upsertOrderShipping(admin, orderId, order.shipping);
      }

      return { success: true, order_id: orderId, created };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { success: false, order_id: null, created: false, error: message };
    }
  }

  private async ensureOrderRow(
    supabase: SupabaseClient,
    organizationId: string,
    order: NormalizedOrder,
    companyId?: string | null,
  ): Promise<EnsureOrderRowOk | EnsureOrderRowError> {
    const { data: existingData } = await supabase
      .from("orders")
      .select("id, marketplace_status, status, internal_status")
      .eq("organization_id", organizationId)
      .eq("marketplace", order.marketplace)
      .eq("marketplace_order_id", order.marketplace_order_id)
      .maybeSingle();

    type ExistingRow = { id: string; marketplace_status: string | null; status: string | null; internal_status: string | null } | null;
    const existing = existingData as ExistingRow;
    const previousMarketplaceStatus = existing?.marketplace_status ?? null;
    const previousStatus = existing?.status ?? null;
    const previousInternalStatus = existing?.internal_status ?? null;

    const row = mapOrderRow(organizationId, order, companyId);
    const { data: upsertedData, error: orderErr } = await supabase
      .from("orders")
      .upsert(row as never, { onConflict: ORDERS_CONFLICT })
      .select("id")
      .single();

    if (orderErr) return { error: orderErr.message };

    type UpsertedRow = { id: string } | null;
    const upserted = upsertedData as UpsertedRow;
    const orderId = upserted?.id ?? "";
    const created = !existing;

    return { orderId, created, previousMarketplaceStatus, previousStatus, previousInternalStatus };
  }

  private async appendStatusHistory(
    supabase: SupabaseClient,
    orderId: string,
    fromStatus: string | null,
    toStatus: string,
    source: string,
  ): Promise<void> {
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      from_status: fromStatus,
      to_status: toStatus,
      source,
    } as never);
  }

  /**
   * UPSERT items preserving product_id.
   * ON CONFLICT (order_id, marketplace_item_id): update metadata but never overwrite product_id.
   */
  private async upsertOrderItems(
    supabase: SupabaseClient,
    orderId: string,
    items: NormalizedOrderItem[],
  ): Promise<void> {
    if (items.length === 0) return;
    const rows = items.map((item) => mapItemRow(orderId, item));
    const { error } = await supabase
      .from("order_items")
      .upsert(rows as never, {
        onConflict: ITEMS_CONFLICT,
        ignoreDuplicates: false,
      });
    if (error) console.error("[orders-upsert] order_items upsert failed", error.message);
  }

  private async countUnlinkedItems(supabase: SupabaseClient, orderId: string): Promise<number> {
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .is("product_id", null) as { count: number | null };
    return count ?? 0;
  }

  private async updateInternalStatus(
    supabase: SupabaseClient,
    orderId: string,
    internalStatus: string,
    hasUnlinkedItems: boolean,
  ): Promise<void> {
    const { error } = await supabase
      .from("orders")
      .update({ internal_status: internalStatus, has_unlinked_items: hasUnlinkedItems } as never)
      .eq("id", orderId);
    if (error) console.error("[orders-upsert] internal_status update failed", error.message);
  }

  private async upsertOrderShipping(
    supabase: SupabaseClient,
    orderId: string,
    shipping: NormalizedOrderShipping,
  ): Promise<void> {
    const row = mapShippingRow(orderId, shipping);
    await supabase.from("order_shipping").upsert(row as never, { onConflict: "order_id" });
  }
}
