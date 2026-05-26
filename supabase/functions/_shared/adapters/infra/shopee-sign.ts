/**
 * Shopee HMAC-SHA256 request signing utility.
 *
 * Shopee V2 signing rules:
 *   base_string = partner_id + api_path + timestamp + access_token + shop_id
 *   signature   = HMAC-SHA256(partner_key, base_string).hex()
 *
 * Extracted from shopee.ts OAuth provider adapter so it can be reused
 * by promotions adapters and any other edge function that calls Shopee APIs.
 */

import { hmacSha256Hex } from "./token-utils.ts";

/**
 * Build and return the hex HMAC-SHA256 signature for a Shopee API request.
 *
 * @param partnerId   - Shopee Partner ID (numeric string)
 * @param apiPath     - e.g. "/api/v2/discount/add_discount"
 * @param timestamp   - Unix timestamp in seconds
 * @param partnerKey  - Shopee Partner Key (secret)
 * @param accessToken - Current access token for the shop
 * @param shopId      - Shopee shop ID (number)
 */
export async function shopeeSign(
  partnerId: string,
  apiPath: string,
  timestamp: number,
  partnerKey: string,
  accessToken: string,
  shopId: number,
): Promise<string> {
  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`;
  return hmacSha256Hex(partnerKey, baseString);
}
