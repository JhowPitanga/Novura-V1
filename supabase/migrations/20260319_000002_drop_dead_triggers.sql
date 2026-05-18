-- C0-T11: Drop dead/broken triggers.
-- trg_mipl_refresh_presented: function body is a no-op (RETURN NEW with no side effects).
-- trg_moi_linked_update: wrong JOIN — marketplace_order_items.id matched against
--   marketplace_orders_presented_new.id (different tables), so zero rows ever updated.

DROP TRIGGER IF EXISTS trg_mipl_refresh_presented ON public.marketplace_item_product_links;
DROP FUNCTION IF EXISTS public.trg_mipl_refresh_presented();

DROP TRIGGER IF EXISTS trg_moi_linked_update ON public.marketplace_order_items;
DROP FUNCTION IF EXISTS public.trg_marketplace_order_items_linked_update();
