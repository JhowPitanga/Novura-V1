import { supabase } from "@/integrations/supabase/client";

export interface LinkProductToOrderItemsParams {
  orderId: string;
  organizationId: string;
  marketplace: string;
  links: Array<{
    orderItemId: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
    isPermanent: boolean;
  }>;
}

export interface LinkProductToOrderItemsResult {
  remainingUnlinkedCount: number;
  statusChanged: boolean;
  newStatus?: string;
}

export async function linkProductToOrderItems(
  params: LinkProductToOrderItemsParams,
): Promise<LinkProductToOrderItemsResult> {
  const { data, error } = await (supabase as any).functions.invoke("link-order-product", {
    body: params,
  });
  if (error) {
    throw new Error(`linkProductToOrderItems failed: ${error.message}`);
  }
  return data as LinkProductToOrderItemsResult;
}
