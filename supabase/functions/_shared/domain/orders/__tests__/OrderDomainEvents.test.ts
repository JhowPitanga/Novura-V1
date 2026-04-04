import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createStatusChangedEvent } from "../OrderDomainEvents.ts";

Deno.test("createStatusChangedEvent sets type to ORDER_STATUS_CHANGED", () => {
  const event = createStatusChangedEvent({
    orderId: "order-1",
    organizationId: "org-1",
    previousStatus: "pending",  // EN slug — canonical value persisted in DB
    newStatus: "shipped",       // EN slug
    source: "webhook",
  });
  assertEquals(event.type, "ORDER_STATUS_CHANGED");
  assertEquals(event.orderId, "order-1");
  assertEquals(event.organizationId, "org-1");
  assertEquals(event.previousStatus, "pending");
  assertEquals(event.newStatus, "shipped");
  assertEquals(event.source, "webhook");
});

Deno.test("createStatusChangedEvent sets changedAt to a valid ISO 8601 string", () => {
  const event = createStatusChangedEvent({
    orderId: "o",
    organizationId: "org",
    previousStatus: null,
    newStatus: "pending",  // EN slug
    source: "sync",
  });
  const date = new Date(event.changedAt);
  assertEquals(Number.isNaN(date.getTime()), false);
});
