import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createStatusChangedEvent } from "../OrderDomainEvents.ts";
import { OrderStatus } from "../OrderStatus.ts";

Deno.test("createStatusChangedEvent sets type to ORDER_STATUS_CHANGED", () => {
  const event = createStatusChangedEvent({
    orderId: "order-1",
    organizationId: "org-1",
    previousStatus: OrderStatus.PENDING,
    newStatus: OrderStatus.SHIPPED,
    source: "webhook",
  });
  assertEquals(event.type, "ORDER_STATUS_CHANGED");
  assertEquals(event.orderId, "order-1");
  assertEquals(event.organizationId, "org-1");
  assertEquals(event.previousStatus, OrderStatus.PENDING);
  assertEquals(event.newStatus, OrderStatus.SHIPPED);
  assertEquals(event.source, "webhook");
});

Deno.test("createStatusChangedEvent sets changedAt to a valid ISO 8601 string", () => {
  const event = createStatusChangedEvent({
    orderId: "o",
    organizationId: "org",
    previousStatus: null,
    newStatus: OrderStatus.PENDING,
    source: "sync",
  });
  const date = new Date(event.changedAt);
  assertEquals(Number.isNaN(date.getTime()), false);
});
