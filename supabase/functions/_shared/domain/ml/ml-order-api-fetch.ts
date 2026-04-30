/**
 * Deterministic result type for ML Orders API GET /orders/:id.
 * Implementation lives in MlOrderApiAdapter.
 * Use the discriminant `ok` to narrow; when `ok === true`, `order` is MlOrderResponse.
 */

import type { MlOrderResponse } from "./ml-order-api.types.ts";

export type FetchFullOrderResult =
  | { ok: true; order: MlOrderResponse }
  | { ok: false; reason: "http"; status: number }
  | { ok: false; reason: "parse" };

/** Error branch of FetchFullOrderResult (when ok === false). */
export type FetchFullOrderError = Extract<FetchFullOrderResult, { ok: false }>;

export function isFetchFullOrderError(r: FetchFullOrderResult): r is FetchFullOrderError {
  return !r.ok;
}
