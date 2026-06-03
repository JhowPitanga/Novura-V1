import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { getAuthToken } from "./internal-helpers";

export async function syncMercadoLivreOrders(
  organizationId: string,
  orderIds?: string[],
): Promise<any> {
  const token = await getAuthToken();
  const body: any = { organizationId };
  if (orderIds && orderIds.length > 0) {
    body.order_ids = orderIds;
  }
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/mercado-livre-sync-orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function syncShopeeOrders(
  organizationId: string,
  shopId: number,
  opts?: {
    orderSnList?: string[];
    timeFrom?: number;
    timeTo?: number;
  },
): Promise<any> {
  const token = await getAuthToken();
  const payload: any = { organizationId, shop_id: shopId };
  if (opts?.orderSnList && opts.orderSnList.length > 0) {
    payload.order_sn_list = opts.orderSnList;
  }
  if (opts?.timeFrom) payload.time_from = opts.timeFrom;
  if (opts?.timeTo) payload.time_to = opts.timeTo;
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/shopee-sync-orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error ? String(json.error) : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function fetchShopeeShops(
  organizationId: string,
): Promise<Array<{ id: string; shop_id: number; label: string }>> {
  if (!organizationId) return [];
  const { data } = await (supabase as any)
    .from("marketplace_integrations")
    .select("id, organizations_id, marketplace_name, config, meli_user_id")
    .eq("marketplace_name", "Shopee")
    .eq("organizations_id", organizationId);
  const opts: Array<{ id: string; shop_id: number; label: string }> = Array.isArray(data)
    ? data
        .map((row: any) => {
          const cfg = row?.config || {};
          const sid = Number(cfg?.shopee_shop_id || row?.meli_user_id || 0);
          const lbl = String(cfg?.shop_name || `Shop ${sid || ""}`).trim();
          return { id: String(row.id), shop_id: sid, label: lbl || String(sid) };
        })
        .filter((x: any) => Number(x.shop_id) > 0)
    : [];
  return opts;
}
