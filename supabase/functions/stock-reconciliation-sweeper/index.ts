/**
 * stock-reconciliation-sweeper — detects and self-heals stock drift.
 *
 * Triggered by pg_cron daily at 03:00 BRT (06:00 UTC).
 * Can also be invoked manually via the admin panel.
 *
 * For each product with active marketplace links:
 *   1. Read products_stock.available (source of truth, Core ERP).
 *   2. Query the channel API for current displayed stock.
 *   3. If drift > 0: inject a corrective entry into stock_sync_outbox.
 *      The outbox will be picked up by stock-sync-dispatcher → stock-sync-worker.
 *
 * The sweeper NEVER writes directly to channels — it reuses the full
 * Motor de Integracao pipeline with all resilience guarantees.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { getMlAccessToken } from "../_shared/adapters/tokens/ml-token.ts";
import { SupabaseMarketplaceIntegrationsAdapter } from "../_shared/adapters/integrations/marketplace-integrations-adapter.ts";
import { SupabaseAppCredentialsAdapter }          from "../_shared/adapters/integrations/app-credentials-adapter.ts";
import { importAesGcmKey, tryDecryptToken, hmacSha256Hex } from "../_shared/adapters/infra/token-utils.ts";

const DRIFT_THRESHOLD = 0;  // Any difference triggers reconciliation.
const BATCH_LIMIT     = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const admin  = createAdminClient();
  const stats  = { checked: 0, drifted: 0, injected: 0, errors: 0 };

  try {
    const linked = await fetchLinkedProducts(admin);
    for (const row of linked) {
      try {
        const drifted = await checkDrift(admin, row);
        stats.checked++;
        if (drifted) {
          await injectOutboxCorrection(admin, row);
          stats.drifted++;
          stats.injected++;
        }
      } catch (e) {
        console.error("[stock-reconciliation-sweeper] row error", { product_id: row.product_id, error: String(e) });
        stats.errors++;
      }
    }
    console.log("[stock-reconciliation-sweeper] sweep complete", stats);
    return jsonResponse({ ok: true, ...stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[stock-reconciliation-sweeper] fatal", msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});

// ── Drift detection ───────────────────────────────────────────────────────────

interface LinkedProductRow {
  organizations_id: string;
  product_id: string;
  storage_id: string | null;
  marketplace_name: string;
  marketplace_item_id: string;
  integration_id: string | null;
  internal_available: number;
}

async function fetchLinkedProducts(admin: ReturnType<typeof createAdminClient>): Promise<LinkedProductRow[]> {
  // Join marketplace_item_product_links with products_stock to get internal available.
  const { data, error } = await admin
    .from("marketplace_item_product_links")
    .select(`
      organizations_id,
      product_id,
      marketplace_name,
      marketplace_item_id,
      products!inner ( id, products_stock ( storage_id, available ) )
    `)
    .limit(BATCH_LIMIT);

  if (error) throw new Error(`fetchLinkedProducts: ${error.message}`);

  const rows: LinkedProductRow[] = [];
  for (const link of (data ?? []) as Record<string, unknown>[]) {
    const productsRaw = (link as Record<string, unknown>).products;
    const product     = Array.isArray(productsRaw) ? productsRaw[0] : productsRaw;
    if (!product) continue;
    const stocks      = (product as Record<string, unknown>).products_stock;
    const stockArr    = Array.isArray(stocks) ? stocks : [stocks];
    const firstStock  = stockArr[0] as Record<string, unknown> | undefined;
    rows.push({
      organizations_id:    String(link.organizations_id),
      product_id:          String(link.product_id),
      storage_id:          firstStock ? String(firstStock.storage_id) : null,
      marketplace_name:    String(link.marketplace_name),
      marketplace_item_id: String(link.marketplace_item_id),
      integration_id:      null,
      internal_available:  Number(firstStock?.available ?? 0),
    });
  }
  return rows;
}

async function checkDrift(
  admin: ReturnType<typeof createAdminClient>,
  row: LinkedProductRow,
): Promise<boolean> {
  const channelAvailable = await fetchChannelStock(admin, row);
  if (channelAvailable === null) return false; // Could not read channel — skip.

  const drift = Math.abs(row.internal_available - channelAvailable);
  if (drift > DRIFT_THRESHOLD) {
    console.warn("[stock-reconciliation-sweeper] drift detected", {
      product_id:          row.product_id,
      marketplace_name:    row.marketplace_name,
      marketplace_item_id: row.marketplace_item_id,
      internal_available:  row.internal_available,
      channel_available:   channelAvailable,
      drift,
    });
    return true;
  }
  return false;
}

async function fetchChannelStock(
  admin: ReturnType<typeof createAdminClient>,
  row: LinkedProductRow,
): Promise<number | null> {
  try {
    if (row.marketplace_name === "Mercado Livre") {
      return await fetchMlStock(admin, row);
    }
    if (row.marketplace_name === "Shopee") {
      return await fetchShopeeStock(admin, row);
    }
    return null;
  } catch (e) {
    console.warn("[stock-reconciliation-sweeper] fetchChannelStock error", { marketplace: row.marketplace_name, error: String(e) });
    return null;
  }
}

// ── ML stock reader ───────────────────────────────────────────────────────────

async function fetchMlStock(
  admin: ReturnType<typeof createAdminClient>,
  row: LinkedProductRow,
): Promise<number | null> {
  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
  if (!encKeyB64 || !row.integration_id) return null;

  const integrations = new SupabaseMarketplaceIntegrationsAdapter(admin);
  const appCreds     = new SupabaseAppCredentialsAdapter(admin);

  // Resolve any integration for this org + ML.
  const { data: integ } = await admin
    .from("marketplace_integrations")
    .select("id")
    .eq("organizations_id", row.organizations_id)
    .eq("marketplace_name", "Mercado Livre")
    .limit(1)
    .single();
  if (!integ) return null;

  const tokenResult  = await getMlAccessToken(integrations, appCreds, (integ as { id: string }).id, encKeyB64);
  const resp = await fetch(
    `https://api.mercadolibre.com/items/${encodeURIComponent(row.marketplace_item_id)}?attributes=available_quantity`,
    { headers: { Authorization: `Bearer ${tokenResult.accessToken}`, Accept: "application/json" } },
  );
  if (!resp.ok) return null;
  const json = await resp.json() as Record<string, unknown>;
  return Number(json.available_quantity ?? null);
}

// ── Shopee stock reader ───────────────────────────────────────────────────────

async function fetchShopeeStock(
  admin: ReturnType<typeof createAdminClient>,
  row: LinkedProductRow,
): Promise<number | null> {
  const encKeyB64 = Deno.env.get("TOKENS_ENCRYPTION_KEY") ?? "";
  if (!encKeyB64) return null;

  const { data: app } = await admin.from("apps").select("client_id, client_secret").eq("name", "Shopee").single();
  if (!app) return null;
  const partnerId  = String((app as Record<string, unknown>).client_id ?? "").trim();
  const partnerKey = String((app as Record<string, unknown>).client_secret ?? "").trim();

  const { data: integ } = await admin
    .from("marketplace_integrations")
    .select("id, access_token, config, meli_user_id")
    .eq("organizations_id", row.organizations_id)
    .eq("marketplace_name", "Shopee")
    .limit(1)
    .single();
  if (!integ) return null;

  const aesKey    = await importAesGcmKey(encKeyB64);
  const accessToken = await tryDecryptToken(aesKey, String((integ as Record<string, unknown>).access_token ?? "")) ?? "";
  const cfg      = (integ as Record<string, unknown>).config as Record<string, unknown> | null;
  const shopId   = cfg?.shopee_shop_id ? Number(cfg.shopee_shop_id) : Number((integ as Record<string, unknown>).meli_user_id ?? 0);

  const path = "/api/v2/product/get_item_base_info";
  const ts   = Math.floor(Date.now() / 1000);
  const sign = await hmacSha256Hex(partnerKey, `${partnerId}${path}${ts}${accessToken}${shopId}`);
  const qs   = new URLSearchParams({ partner_id: partnerId, timestamp: String(ts), access_token: accessToken, shop_id: String(shopId), sign, item_id_list: row.marketplace_item_id });

  const resp = await fetch(`https://openplatform.shopee.com.br${path}?${qs}`, { method: "GET" });
  if (!resp.ok) return null;
  const json = await resp.json() as Record<string, unknown>;
  const items = (json?.response as Record<string, unknown>)?.item_list as Record<string, unknown>[] | undefined;
  if (!items?.length) return null;
  return Number(items[0]?.stock_info_v2?.current_stock ?? null);
}

// ── Outbox correction injection ───────────────────────────────────────────────

async function injectOutboxCorrection(
  admin: ReturnType<typeof createAdminClient>,
  row: LinkedProductRow,
): Promise<void> {
  if (!row.storage_id) return;

  // Read current version from products_stock.
  const { data: ps } = await admin
    .from("products_stock")
    .select("version")
    .eq("product_id", row.product_id)
    .eq("storage_id", row.storage_id)
    .single();

  const version = Number((ps as { version?: number } | null)?.version ?? 0);

  await admin.from("stock_sync_outbox")
    .upsert({
      organization_id:    row.organizations_id,
      product_id:         row.product_id,
      storage_id:         row.storage_id,
      available_snapshot: row.internal_available,
      version,
      processed:          false,
      updated_at:         new Date().toISOString(),
    }, { onConflict: "product_id,storage_id" });
}
