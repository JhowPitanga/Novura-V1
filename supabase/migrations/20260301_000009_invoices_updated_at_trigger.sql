-- Cycle 0: triggers to keep updated_at in sync on invoices and order_shipping.
-- Uses existing public.update_updated_at_column() from org-security migration.

-- invoices: set updated_at on every row update
DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- order_shipping: set updated_at on every row update
DROP TRIGGER IF EXISTS update_order_shipping_updated_at ON public.order_shipping;
CREATE TRIGGER update_order_shipping_updated_at
  BEFORE UPDATE ON public.order_shipping
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
