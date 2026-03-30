/**
 * Fetch ML order IDs via /orders/search (paginated), then full order via GET /orders/:id.
 */

const PAGE_SIZE = 50;
const DELAY_MS = 100;
/** Hard cap: return at most this many order IDs per invocation to avoid edge-function timeout. */
const MAX_ORDERS_PER_SYNC = 200;

export async function fetchOrderIds(
  accessToken: string,
  sellerId: string,
  dateFrom: string,
  dateTo: string,
): Promise<string[]> {
  const ids: string[] = [];
  let offset = 0;
  for (let page = 0; page < 200; page++) {
    const url = new URL("https://api.mercadolibre.com/orders/search");
    url.searchParams.set("seller", sellerId);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("sort", "date_desc");
    url.searchParams.set("order.date_last_updated.from", dateFrom);
    url.searchParams.set("order.date_last_updated.to", dateTo);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(String(err?.error ?? err?.message ?? resp.statusText));
    }
    const json = await resp.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    const batchIds = results.map((o: { id?: string }) => String(o?.id ?? "")).filter(Boolean);
    ids.push(...batchIds);
    offset += batchIds.length;
    if (ids.length >= MAX_ORDERS_PER_SYNC) return ids.slice(0, MAX_ORDERS_PER_SYNC);
    if (batchIds.length === 0 || offset >= Number(json?.paging?.total ?? 0)) break;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return ids;
}

