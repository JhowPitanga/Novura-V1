/**
 * shopee-sync-fulfillment-stock: syncs fulfillment (Shopee Fulfillment) stock
 * from the Shopee Open Platform API into the fulfillment_stock table.
 *
 * Triggered by a scheduler (cron) or manually via POST with { organizationId }.
 * Requires TOKENS_ENCRYPTION_KEY env var.
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter } from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { getShopeeAccessToken } from "../_shared/adapters/tokens/shopee-token.ts";
import {
  hmacSha256Hex,
  importAesGcmKey,
} from "../_shared/adapters/infra/token-utils.ts";

const SHOPEE_HOST = "https://openplatform.shopee.com.br";
const SHOPEE_MARKETPLACE_NAME = "Shopee";

/** Builds a signed Shopee API request URL. */
function buildShopeeUrl(
  path: string,
  partnerId: string,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  extraParams: Record<string, string> = {},
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  const sign = hmacSha256Hex(baseString, partnerKey);
  const params = new URLSearchParams({
    partner_id: partnerId,
    timestamp: String(timestamp),
    access_token: accessToken,
    shop_id: String(shopId),
    sign,
    ...extraParams,
  });
  return `${SHOPEE_HOST}${path}?${params.toString()}`;
}

/** Fetches the list of Shopee Fulfillment (SLS) items for a shop. */
async function fetchFulfillmentItems(
  partnerId: string,
  partnerKey: string,
  accessToken: string,
  shopId: number,
): Promise<string[]> {
  const path = "/api/v2/logistics/get_fbl_warehouse_item_list";
  const url = buildShopeeUrl(path, partnerId, partnerKey, accessToken, shopId);
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const json = await resp.json() as any;
  const items = json?.response?.item_list ?? [];
  return items.map((item: any) => String(item?.item_id ?? "")).filter(Boolean);
}

/** Fetches fulfillment stock quantities for a batch of item IDs. */
async function fetchItemStockInfo(
  partnerId: string,
  partnerKey: string,
  accessToken: string,
  shopId: number,
  itemIds: string[],
): Promise<Array<{ itemId: string; qty: number }>> {
  if (itemIds.length === 0) return [];
  const path = "/api/v2/product/get_item_list";
  const url = buildShopeeUrl(path, partnerId, partnerKey, accessToken, shopId, {
    item_id_list: itemIds.join(","),
    need_complaint_policy: "false",
  });
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const json = await resp.json() as any;
  const items: Array<{ itemId: string; qty: number }> = [];
  for (const item of json?.response?.item_list ?? []) {
    const itemId = String(item?.item_id ?? "");
    const qty = Number(item?.stock_info_v2?.summary_info?.total_available_stock ?? 0);
    if (itemId) items.push({ itemId, qty });
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();

  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY");
  if (!encKeyB64) return jsonResponse({ error: "Missing TOKENS_ENCRYPTION_KEY" }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const organizationId: string | undefined = body?.organizationId;

  const admin = createAdminClient();
  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCredentials = new SupabaseAppCredentialsAdapter(admin);

  // Load target integrations: all Shopee integrations for the org (or all orgs if no filter)
  const integrationsQuery = admin
    .from("marketplace_integrations")
    .select("id, organizations_id")
    .eq("marketplace_name", SHOPEE_MARKETPLACE_NAME)
    .eq("is_active", true) as any;

  const { data: integrationRows, error: intErr } = organizationId
    ? await integrationsQuery.eq("organizations_id", organizationId)
    : await integrationsQuery;

  if (intErr) return jsonResponse({ error: intErr.message }, 500);
  if (!integrationRows || integrationRows.length === 0) {
    return jsonResponse({ ok: true, processed: 0, message: "No active Shopee integrations found" });
  }

  const results: Record<string, unknown> = {};

  for (const integration of integrationRows) {
    const integrationId: string = integration.id;
    const orgId: string = integration.organizations_id;

    try {
      // Get access token
      const tokenResult = await getShopeeAccessToken(
        integrations,
        appCredentials,
        integrationId,
        encKeyB64,
      );
      const appRow = await appCredentials.getByName(SHOPEE_MARKETPLACE_NAME);
      if (!appRow) continue;

      const partnerId = String(appRow.client_id).trim();
      const partnerKey = String(appRow.client_secret).trim();
      const { accessToken, shopId } = tokenResult;

      // Resolve fulfillment_storage_id from integration_warehouse_config
      const { data: configRow } = await (admin as any)
        .from("integration_warehouse_config")
        .select("fulfillment_storage_id")
        .eq("integration_id", integrationId)
        .maybeSingle();

      const fulfillmentStorageId: string | null = configRow?.fulfillment_storage_id ?? null;
      if (!fulfillmentStorageId) {
        results[integrationId] = { skipped: true, reason: "no fulfillment_storage_id configured" };
        continue;
      }

      // Fetch fulfillment item IDs from Shopee
      const fulfillmentItemIds = await fetchFulfillmentItems(partnerId, partnerKey, accessToken, shopId);
      if (fulfillmentItemIds.length === 0) {
        results[integrationId] = { ok: true, synced: 0 };
        continue;
      }

      // Fetch stock quantities in batches of 50 (Shopee API limit)
      const BATCH = 50;
      const stockData: Array<{ itemId: string; qty: number }> = [];
      for (let i = 0; i < fulfillmentItemIds.length; i += BATCH) {
        const batch = fulfillmentItemIds.slice(i, i + BATCH);
        const batchData = await fetchItemStockInfo(partnerId, partnerKey, accessToken, shopId, batch);
        stockData.push(...batchData);
      }

      // Resolve product_id for each marketplace_item_id via marketplace_item_product_links
      const nowIso = new Date().toISOString();
      let synced = 0;

      for (const { itemId, qty } of stockData) {
        try {
          const { data: linkData } = await (admin as any)
            .from("marketplace_item_product_links")
            .select("product_id")
            .eq("organizations_id", orgId)
            .eq("marketplace_name", SHOPEE_MARKETPLACE_NAME)
            .eq("marketplace_item_id", itemId)
            .maybeSingle();

          const productId: string | null = linkData?.product_id ?? null;
          if (!productId) continue;

          await (admin as any).from("fulfillment_stock").upsert(
            {
              organization_id: orgId,
              storage_id: fulfillmentStorageId,
              product_id: productId,
              marketplace_item_id: itemId,
              variation_id: "",
              quantity: qty,
              last_synced_at: nowIso,
            },
            { onConflict: "storage_id,product_id,marketplace_item_id,variation_id" },
          );

          synced++;
        } catch (itemErr: any) {
          console.warn(`[shopee-sync-fulfillment-stock] item ${itemId} failed:`, itemErr?.message);
        }
      }

      results[integrationId] = { ok: true, synced };
    } catch (err: any) {
      console.error(`[shopee-sync-fulfillment-stock] integration ${integrationId} failed:`, err?.message);
      results[integrationId] = { ok: false, error: err?.message };
    }
  }

  return jsonResponse({ ok: true, results });
});
