/**
 * Port for fetching a full ML order (GET /orders/:id).
 */

import type { FetchFullOrderResult } from "../domain/ml/ml-order-api-fetch.ts";

export interface MlOrderFetchPort {
  fetchFullOrder(accessToken: string, orderId: string): Promise<FetchFullOrderResult>;
}
