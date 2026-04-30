-- C0-T19: Drop orphaned trigger functions after T17 + T18 drop all callers.
-- PREREQUISITE: C0-T17 and C0-T18 must be applied first.
-- Functions kept: reserve/consume/refund_stock_for_order (legacy inventory-jobs-worker still uses them),
--                 fn_get_default_storage, fn_order_reserva_stock_linked.

DROP FUNCTION IF EXISTS public.process_marketplace_order_presented_new();
DROP FUNCTION IF EXISTS public.refresh_presented_order(uuid);
DROP FUNCTION IF EXISTS public.trg_presented_new_stock_flow();
DROP FUNCTION IF EXISTS public.trg_presented_new_inventory_on_cancel();
