// deno-lint-ignore-file no-explicit-any
/**
 * Normalizes order payload fields (e.g. string IDs to numbers) for Mercado Livre webhooks.
 */

export function normalizeOrderNumbers(order: any): any {
  try {
    const o = JSON.parse(JSON.stringify(order));
    const toNumOrDelete = (obj: any, key: string) => {
      if (!obj || typeof obj !== "object" || !(key in obj)) return;
      const v = obj[key];
      if (typeof v === "number" && Number.isFinite(v)) return;
      if (typeof v === "string" && /^\d+$/.test(v)) {
        obj[key] = Number(v);
        return;
      }
      try {
        delete obj[key];
      } catch {
        // ignore
      }
    };
    if (o && o.buyer) toNumOrDelete(o.buyer, "id");
    toNumOrDelete(o, "pack_id");
    if (o && o.data) {
      toNumOrDelete(o.data, "pack_id");
      if (o.data.buyer) toNumOrDelete(o.data.buyer, "id");
    }
    return o;
  } catch {
    return order;
  }
}
