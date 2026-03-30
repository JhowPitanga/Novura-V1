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
