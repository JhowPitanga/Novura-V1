/**
 * Mercado Livre order notification (webhook/push) payload.
 * Example: { resource: "/orders/2195160686", user_id: 468424240, topic: "orders_v2", ... }
 */

export interface MlOrderNotificationPayload {
  resource: string;
  user_id: number;
  topic: string;
  application_id?: number;
  attempts?: number;
  sent?: string;
  received?: string;
}

export function isMlOrderNotificationPayload(x: unknown): x is MlOrderNotificationPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.resource === "string" &&
    typeof o.user_id === "number" &&
    typeof o.topic === "string"
  );
}

/** Extract order ID from notification resource (e.g. "/orders/2195160686" -> "2195160686"). */
export function extractOrderIdFromMlResource(resource: string): string | null {
  if (!resource || typeof resource !== "string") return null;
  const m = resource.trim().match(/\/orders\/?([A-Za-z0-9-_.]+)/);
  return m && m[1] ? m[1].split("?")[0].split("/")[0] : null;
}
