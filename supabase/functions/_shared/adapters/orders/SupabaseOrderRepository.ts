import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { IOrderRepository, OrderRecord, OrderRecordItem } from "../../domain/orders/ports/IOrderRepository.ts";
import type { MarketplaceSignals } from "../../domain/orders/MarketplaceSignals.ts";
import type { OrderStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";

type OrderRow = {
  readonly id: string;
  readonly organization_id: string;
  readonly marketplace: "mercado_livre" | "shopee";
  readonly marketplace_order_id: string;
  readonly status: OrderStatus | null;
  readonly marketplace_status: string | null;
  readonly shipment_status: string | null;
  readonly shipment_substatus: string | null;
  readonly is_fulfillment: boolean | null;
  readonly is_cancelled: boolean | null;
  readonly is_refunded: boolean | null;
  readonly is_returned: boolean | null;
  readonly is_printed_label: boolean | null;
  readonly has_invoice: boolean | null;
  readonly is_pickup_done: boolean | null;
  readonly order_items: ReadonlyArray<{
    readonly id: string;
    readonly product_id: string | null;
    readonly marketplace_item_id: string | null;
    readonly variation_id: string | null;
    readonly seller_sku: string | null;
    readonly quantity: number | null;
  }> | null;
};

export class SupabaseOrderRepository implements IOrderRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.supabase.from("orders").select("*, order_items(*)").eq("id", orderId).maybeSingle();
    if (error) throw new Error(`SupabaseOrderRepository.findById failed: ${error.message}`);
    if (!data) return null;
    return this.mapOrderRow(data as unknown as OrderRow);
  }

  async findByMarketplaceOrderId(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceOrderId: string;
  }): Promise<OrderRecord | null> {
    const { data, error } = await this.supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("organization_id", params.organizationId)
      .eq("marketplace", params.marketplace)
      .eq("marketplace_order_id", params.marketplaceOrderId)
      .maybeSingle();
    if (error) throw new Error(`SupabaseOrderRepository.findByMarketplaceOrderId failed: ${error.message}`);
    if (!data) return null;
    return this.mapOrderRow(data as unknown as OrderRow);
  }

  async updateStatus(params: { readonly orderId: string; readonly currentStatus: OrderStatus | null; readonly newStatus: OrderStatus }): Promise<void> {
    const query = this.supabase.from("orders").update({ status: params.newStatus }).eq("id", params.orderId).eq("status", params.currentStatus).select("id");
    const { data, error } = await query;
    if (error) throw new Error(`SupabaseOrderRepository.updateStatus failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error("SupabaseOrderRepository.updateStatus concurrency conflict");
  }

  async markLabelPrinted(params: { readonly orderIds: ReadonlyArray<string>; readonly organizationId: string }): Promise<void> {
    const { error } = await this.supabase
      .from("orders")
      .update({ is_printed_label: true, label_printed_at: new Date().toISOString() })
      .in("id", [...params.orderIds])
      .eq("organization_id", params.organizationId);
    if (error) throw new Error(`SupabaseOrderRepository.markLabelPrinted failed: ${error.message}`);
  }

  async updateOrderItemsProductId(orderId: string, items: ReadonlyArray<{ readonly id: string; readonly productId: string }>): Promise<void> {
    for (const item of items) {
      const { error } = await this.supabase.from("order_items").update({ product_id: item.productId }).eq("order_id", orderId).eq("id", item.id);
      if (error) throw new Error(`SupabaseOrderRepository.updateOrderItemsProductId failed: ${error.message}`);
    }
  }

  async addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void> {
    const { error } = await this.supabase.from("order_status_history").insert({
      order_id: orderId,
      from_status: event.previousStatus,
      to_status: event.newStatus,
      changed_at: event.changedAt,
      source: event.source,
    });
    if (error) throw new Error(`SupabaseOrderRepository.addStatusHistory failed: ${error.message}`);
  }

  private mapOrderRow(row: OrderRow): OrderRecord {
    const signals: MarketplaceSignals = {
      organizationId: row.organization_id,
      marketplaceOrderId: row.marketplace_order_id,
      marketplace: row.marketplace,
      marketplaceStatus: row.marketplace_status ?? "",
      shipmentStatus: row.shipment_status ?? undefined,
      shipmentSubstatus: row.shipment_substatus ?? undefined,
      isFulfillment: row.is_fulfillment ?? false,
      isCancelled: row.is_cancelled ?? false,
      isRefunded: row.is_refunded ?? false,
      isReturned: row.is_returned ?? false,
      isPrintedLabel: row.is_printed_label ?? false,
      hasInvoice: row.has_invoice ?? false,
      isPickupDone: row.is_pickup_done ?? undefined,
    };
    const items: ReadonlyArray<OrderRecordItem> = (row.order_items ?? []).map((it) => ({
      id: it.id,
      productId: it.product_id,
      marketplaceItemId: it.marketplace_item_id,
      variationId: it.variation_id,
      sellerSku: it.seller_sku,
      quantity: it.quantity ?? 0,
    }));
    return {
      id: row.id,
      organizationId: row.organization_id,
      marketplace: row.marketplace,
      marketplaceOrderId: row.marketplace_order_id,
      currentStatus: row.status,
      marketplaceSignals: signals,
      items,
    };
  }
}
