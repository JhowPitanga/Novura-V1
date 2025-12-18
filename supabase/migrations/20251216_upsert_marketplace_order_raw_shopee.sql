BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_marketplace_order_raw_shopee(
  p_organizations_id uuid,
  p_company_id uuid,
  p_marketplace_name text,
  p_marketplace_order_id text,
  p_data jsonb
)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.marketplace_orders_raw (
    organizations_id,
    company_id,
    marketplace_name,
    marketplace_order_id,
    data,
    last_synced_at,
    updated_at
  )
  VALUES (
    p_organizations_id,
    p_company_id,
    p_marketplace_name,
    p_marketplace_order_id,
    p_data,
    now(),
    now()
  )
  ON CONFLICT (organizations_id, marketplace_name, marketplace_order_id) DO UPDATE SET
    data = EXCLUDED.data,
    last_synced_at = now(),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

