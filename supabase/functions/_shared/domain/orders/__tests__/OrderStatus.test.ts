import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OrderStatus, getOrderStatusLabel } from "../OrderStatus.ts";

const EXPECTED_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.CANCELLED]: "Cancelado",
  [OrderStatus.RETURNED]: "Devolução",
  [OrderStatus.UNLINKED]: "A vincular",
  [OrderStatus.INVOICE_PENDING]: "Emissão NF",
  [OrderStatus.READY_TO_PRINT]: "Impressão",
  [OrderStatus.AWAITING_PICKUP]: "Aguardando Coleta",
  [OrderStatus.SHIPPED]: "Enviado",
  [OrderStatus.PENDING]: "Pendente",
};

Deno.test("getOrderStatusLabel returns correct pt-BR label for every OrderStatus value", () => {
  const statuses = Object.values(OrderStatus) as OrderStatus[];
  assertEquals(statuses.length, 8);
  for (const status of statuses) {
    assertEquals(getOrderStatusLabel(status), EXPECTED_LABELS[status]);
  }
});

Deno.test("OrderStatus enum uses canonical english persistence values", () => {
  assertEquals(OrderStatus.CANCELLED, "cancelled");
  assertEquals(OrderStatus.RETURNED, "returned");
  assertEquals(OrderStatus.UNLINKED, "unlinked");
  assertEquals(OrderStatus.INVOICE_PENDING, "invoice_pending");
  assertEquals(OrderStatus.READY_TO_PRINT, "ready_to_print");
  assertEquals(OrderStatus.AWAITING_PICKUP, "awaiting_pickup");
  assertEquals(OrderStatus.SHIPPED, "shipped");
  assertEquals(OrderStatus.PENDING, "pending");
});
