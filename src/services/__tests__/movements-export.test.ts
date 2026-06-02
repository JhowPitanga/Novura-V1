/**
 * Characterization tests for movements CSV export.
 */
import { describe, it, expect } from "vitest";
import { exportMovementsToCSV } from "@/services/movements.service";
import type { InventoryMovement } from "@/services/inventory/movements-types";

const CSV_HEADER =
  '"Data/Hora","Produto","SKU","Tipo","Quantidade","Armazém","Usuário","Observação","Pedido","Integração","Referência"';

function baseRow(overrides: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: "1",
    timestamp: "2024-06-01T12:00:00.000Z",
    organizations_id: "org",
    product_id: "p1",
    product_name: "Produto A",
    product_sku: "SKU-1",
    product_image_urls: null,
    storage_id: "s1",
    storage_name: "Armazém A",
    storage_type: "physical",
    order_id: null,
    marketplace_order_id: null,
    integration_id: null,
    integration_marketplace: null,
    marketplace_name: null,
    movement_type: "ENTRADA",
    quantity_change: 1,
    source_ref: null,
    entity_type: null,
    reason_code: null,
    counterpart_storage_id: null,
    counterpart_storage_name: null,
    created_by_user_id: null,
    actor_name: null,
    ...overrides,
  };
}

describe("exportMovementsToCSV", () => {
  it("uses expected header row byte-for-byte", () => {
    const csv = exportMovementsToCSV([]);
    expect(csv.split("\n")[0]).toBe(CSV_HEADER);
  });

  it("formats outbound transfer storage as origin > destination", () => {
    const csv = exportMovementsToCSV([
      baseRow({
        movement_type: "TRANSFERENCIA",
        quantity_change: -2,
        storage_name: "Origem",
        counterpart_storage_name: "Destino",
      }),
    ]);
    expect(csv).toContain('"Origem > Destino"');
  });

  it("escapes double quotes in fields", () => {
    const csv = exportMovementsToCSV([
      baseRow({
        product_name: 'Produto "Especial"',
      }),
    ]);
    expect(csv).toContain('Produto ""Especial""');
  });
});
