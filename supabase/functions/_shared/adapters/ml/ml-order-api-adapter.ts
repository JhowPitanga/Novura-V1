/**
 * Adapter for ML Orders API GET /orders/:id. Implements MlOrderFetchPort.
 * Contains the fetch logic (no delegation to domain function).
 */

import type { MlOrderFetchPort } from "../../ports/ml-order-fetch-port.ts";
import type { FetchFullOrderResult } from "../../domain/ml/ml-order-api-fetch.ts";
import { isMlOrderResponse } from "../../domain/ml/ml-order-api.types.ts";

const ML_ORDERS_BASE = "https://api.mercadolibre.com/orders";

export class MlOrderApiAdapter implements MlOrderFetchPort {
  async fetchFullOrder(accessToken: string, orderId: string): Promise<FetchFullOrderResult> {
    const resp = await fetch(`${ML_ORDERS_BASE}/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (resp.status === 403) return { ok: false, reason: "http", status: 403 };
    if (!resp.ok) return { ok: false, reason: "http", status: resp.status };
    try {
      const json = await resp.json();
      if (!isMlOrderResponse(json)) return { ok: false, reason: "parse" };
      return { ok: true, order: json };
    } catch {
      return { ok: false, reason: "parse" };
    }
  }
}
