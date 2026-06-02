/**
 * Characterization tests for movements summary aggregation.
 */
import { describe, it, expect } from "vitest";
import { aggregateSummary } from "@/services/inventory/movements-summary";

describe("aggregateSummary", () => {
  it("aggregates entradas, saidas, and counts", () => {
    const summary = aggregateSummary([
      { movement_type: "ENTRADA", quantity_change: 5 },
      { movement_type: "ENTRADA", quantity_change: 3 },
      { movement_type: "SAIDA", quantity_change: -2 },
    ]);
    expect(summary.totalEntradas).toBe(8);
    expect(summary.countEntradas).toBe(2);
    expect(summary.totalSaidas).toBe(2);
    expect(summary.countSaidas).toBe(1);
  });

  it("counts only negative quantity TRANSFERENCIA rows", () => {
    const summary = aggregateSummary([
      { movement_type: "TRANSFERENCIA", quantity_change: -4 },
      { movement_type: "TRANSFERENCIA", quantity_change: 4 },
    ]);
    expect(summary.totalTransferencias).toBe(4);
    expect(summary.countTransferencias).toBe(1);
  });

  it("buckets CANCELAMENTO_RESERVA with RESERVA", () => {
    const summary = aggregateSummary([
      { movement_type: "RESERVA", quantity_change: 2 },
      { movement_type: "CANCELAMENTO_RESERVA", quantity_change: 1 },
    ]);
    expect(summary.totalReservas).toBe(3);
    expect(summary.countReservas).toBe(2);
  });
});
