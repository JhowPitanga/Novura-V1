-- C0-T17: Drop the 400-line Shopee trigger from marketplace_orders_raw.
-- PREREQUISITE: OrdersUpsertAdapter (C0-T14) must be deployed and verified before running this.
-- After this migration, raw INSERTs no longer fan-out to marketplace_orders_presented_new.
-- The Cycle 0 pipeline (orders-webhook → pgmq → orders-queue-worker) fully owns Shopee ingestion.
-- The trigger function is kept for rollback reference.

DROP TRIGGER IF EXISTS on_marketplace_orders_raw_change_new ON public.marketplace_orders_raw;
