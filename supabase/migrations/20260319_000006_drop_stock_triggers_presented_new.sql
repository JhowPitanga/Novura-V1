-- C0-T18: Drop the two stock-flow triggers on marketplace_orders_presented_new.
-- PREREQUISITE: C0-T17 must be applied first (no new rows being written to presented_new by triggers).
-- Stock flow is now handled by OrdersUpsertAdapter → v2 RPCs (C0-T14).
-- These triggers are also the source of the double-refund risk on Shopee cancels.
-- Trigger functions are kept for rollback reference.

DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_stock_flow ON public.marketplace_orders_presented_new;
DROP TRIGGER IF EXISTS trg_marketplace_orders_presented_new_inventory_on_cancel ON public.marketplace_orders_presented_new;
