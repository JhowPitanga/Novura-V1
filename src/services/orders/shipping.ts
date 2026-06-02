import { supabase, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { getAuthToken } from "./internal-helpers";

export async function arrangeShopeeShipment(
  organizationId: string,
  companyId: string,
  orderSn: string,
): Promise<any> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
  };
  const { data, error } = await (supabase as any).functions.invoke("shopee-arrange-shipment", {
    body: { organizationId, companyId, orderSn },
    headers,
  });
  if (error || (data && data.error)) {
    throw new Error(error?.message || data?.error || "Falha ao organizar envio");
  }
  return data;
}
