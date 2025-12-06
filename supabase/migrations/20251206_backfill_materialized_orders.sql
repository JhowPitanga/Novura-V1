-- Backfill script to populate the new marketplace_orders_presented_new table.
-- This script triggers the 'on_marketplace_orders_raw_change_new' trigger for each existing row
-- in the 'marketplace_orders_raw' table by performing a dummy update.

UPDATE public.marketplace_orders_raw
SET last_updated = now();
