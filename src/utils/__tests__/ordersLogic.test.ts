/**
 * Characterization tests for pure order logic.
 * T1-T3: imported from extracted utils (Commit 2).
 * T4: imported from orderCsvUtils (Commit 2).
 * T5: shopeeEpochFrom/To — inline, mirrors logic that remains in useOrderSyncActions.
 * T6: applyVinculacoes — inline, mirrors logic that remains in useOrdersPageController.
 *
 * T1 — columnPrefsMerge   (controller lines 361-380 → orderColumnUtils.ts)
 * T2 — isPedidoAtrasado   (controller lines 333-343 → orderStatusUtils.ts)
 * T3 — buildStatusCounts  (controller lines 322-331 → orderStatusUtils.ts)
 * T4 — buildCsvRow        (actions lines 322-346   → orderCsvUtils.ts)
 * T5 — shopeeEpoch        (actions lines 226-241   — stays in hook, tested inline)
 * T6 — applyVinculacoes   (controller lines 205-230 — stays in hook, tested inline)
 */
import { describe, it, expect } from "vitest";
import {
  calendarStartOfDaySPEpochMs,
  calendarEndOfDaySPEpochMs,
} from "@/lib/datetime";
import { columnPrefsMerge } from "@/utils/orderColumnUtils";
import { isPedidoAtrasado, buildStatusCounts } from "@/utils/orderStatusUtils";
import { buildCsvRow } from "@/utils/orderCsvUtils";

function shopeeEpochFrom(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  return Math.floor(calendarStartOfDaySPEpochMs(new Date(dateStr)) / 1000);
}

function shopeeEpochTo(dateStr: string): number | undefined {
  if (!dateStr) return undefined;
  return Math.floor(calendarEndOfDaySPEpochMs(new Date(dateStr)) / 1000);
}

function applyVinculacoes(
  pedidos: any[],
  pedidoId: string | number,
  vinculos: Record<string, string>,
): any[] {
  const target = pedidos.find(p => p.id === pedidoId);
  if (!target) return pedidos;
  const novosItens = target.items.map((item: any) => {
    const produtoId = vinculos[item.id];
    return produtoId ? { ...item, linked: true } : item;
  });
  const todosVinculados = novosItens.every((item: any) => item.linked);
  return pedidos.map(p => {
    if (p.id !== target.id) return p;
    return todosVinculados
      ? { ...p, items: novosItens, status: 'Emissao NF' }
      : { ...p, items: novosItens };
  });
}

// ─── T1: columnPrefsMerge ─────────────────────────────────────────────────────

describe("T1 columnPrefsMerge", () => {
  const fresh = [
    { id: 'a', alwaysVisible: false, enabled: true },
    { id: 'b', alwaysVisible: true, enabled: true },
    { id: 'c', alwaysVisible: false, enabled: true },
  ];

  it("null prefs → returns freshCols unchanged", () => {
    expect(columnPrefsMerge(fresh, null)).toEqual(fresh);
  });

  it("pref with unknown id → skipped; all fresh cols still returned", () => {
    const prefs = [{ id: 'unknown', enabled: false }];
    expect(columnPrefsMerge(fresh, prefs)).toEqual(fresh);
  });

  it("alwaysVisible=true overrides pref.enabled=false", () => {
    const prefs = [{ id: 'b', enabled: false }];
    const result = columnPrefsMerge(fresh, prefs);
    expect(result.find(c => c.id === 'b')?.enabled).toBe(true);
  });

  it("pref.enabled=false applies to non-alwaysVisible col", () => {
    const prefs = [{ id: 'a', enabled: false }];
    const result = columnPrefsMerge(fresh, prefs);
    expect(result.find(c => c.id === 'a')?.enabled).toBe(false);
  });

  it("new cols (not in prefs) appended after prefs-ordered cols", () => {
    const prefs = [{ id: 'a', enabled: true }];
    const result = columnPrefsMerge(fresh, prefs);
    const ids = result.map(c => c.id);
    expect(ids[0]).toBe('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
  });
});

// ─── T2: isPedidoAtrasado ─────────────────────────────────────────────────────

describe("T2 isPedidoAtrasado", () => {
  it("delivered shipmentStatus → false", () => {
    expect(isPedidoAtrasado({ shipmentStatus: 'delivered', internalStatus: 'Impressao' })).toBe(false);
  });

  it("cancelled internalStatus → false", () => {
    expect(isPedidoAtrasado({ internalStatus: 'cancelado' })).toBe(false);
  });

  it("returned internalStatus → false", () => {
    expect(isPedidoAtrasado({ internalStatus: 'returned' })).toBe(false);
  });

  it("sla.status='delayed' → true", () => {
    expect(isPedidoAtrasado({ internalStatus: 'Impressao', shippingSla: { status: 'delayed' } })).toBe(true);
  });

  it("sla.expectedDate in past → true", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isPedidoAtrasado({ internalStatus: 'Impressao', shippingSla: { expectedDate: past } })).toBe(true);
  });

  it("sla.expectedDate in future → false", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isPedidoAtrasado({ internalStatus: 'Impressao', shippingSla: { expectedDate: future } })).toBe(false);
  });

  it("no date, no sla → false", () => {
    expect(isPedidoAtrasado({ internalStatus: 'Impressao' })).toBe(false);
  });
});

// ─── T3: buildStatusCounts ────────────────────────────────────────────────────

describe("T3 buildStatusCounts", () => {
  it("empty list → all zeros", () => {
    const result = buildStatusCounts([]);
    expect(result.todos).toBe(0);
    expect(result['emissao-nf']).toBe(0);
    expect(result.cancelado).toBe(0);
    expect(result['sem-estoque']).toBe(0);
  });

  it("correctly buckets mixed-status orders", () => {
    const orders = [
      { id: '1', internalStatus: 'Emissao NF' },
      { id: '2', internalStatus: 'Impressao' },
      { id: '3', internalStatus: 'cancelado' },
      { id: '4', internalStatus: 'Emissao NF' },
    ];
    const result = buildStatusCounts(orders as any[]);
    expect(result.todos).toBe(4);
    expect(result['emissao-nf']).toBe(2);
    expect(result.impressao).toBe(1);
    expect(result.cancelado).toBe(1);
  });

  it("sem-estoque counted by normStatus equality", () => {
    const orders = [{ id: '1', internalStatus: 'Sem Estoque' }];
    expect(buildStatusCounts(orders as any[])['sem-estoque']).toBe(1);
  });

  it("aguardando-coleta matches normalized variant", () => {
    const orders = [{ id: '1', internalStatus: 'Aguardando Coleta' }];
    expect(buildStatusCounts(orders as any[])['aguardando-coleta']).toBe(1);
  });
});

// ─── T4: buildCsvRow ──────────────────────────────────────────────────────────

describe("T4 buildCsvRow", () => {
  const base = {
    id: '123',
    marketplace: 'Mercado Livre',
    productTitle: 'Produto X',
    sku: 'SKU-001',
    customerName: 'João',
    totalAmount: 99.9,
    paidAt: '2024-01-15T12:00:00.000Z',
    status: 'Impressao',
    shippingType: 'full',
  };

  it("returns array of 9 elements (matches CSV header count)", () => {
    expect(buildCsvRow(base)).toHaveLength(9);
  });

  it("null/undefined sku → 'N/A'", () => {
    expect(buildCsvRow({ ...base, sku: null })[3]).toBe("N/A");
    expect(buildCsvRow({ ...base, sku: undefined })[3]).toBe("N/A");
  });

  it("totalAmount formatted as 'R$ X.XX'", () => {
    expect(String(buildCsvRow(base)[5])).toMatch(/^R\$ \d+\.\d{2}$/);
  });

  it("missing paidAt falls back to createdAt", () => {
    const row = buildCsvRow({ ...base, paidAt: undefined, createdAt: '2024-01-10T08:00:00.000Z' });
    expect(row[6]).toBeTruthy();
  });

  it("null paidAt and null createdAt → empty string", () => {
    const row = buildCsvRow({ ...base, paidAt: null, createdAt: null });
    expect(row[6]).toBe("");
  });
});

// ─── T5: shopeeEpoch ─────────────────────────────────────────────────────────

describe("T5 shopeeEpochFrom/To", () => {
  it("empty string → undefined for both", () => {
    expect(shopeeEpochFrom('')).toBeUndefined();
    expect(shopeeEpochTo('')).toBeUndefined();
  });

  it("valid date string → integer seconds (10 digits)", () => {
    const epoch = shopeeEpochFrom('2024-01-15');
    expect(typeof epoch).toBe('number');
    expect(Number.isInteger(epoch!)).toBe(true);
    expect(String(epoch!).length).toBe(10);
  });

  it("epochTo > epochFrom for same date (end-of-day > start-of-day)", () => {
    const from = shopeeEpochFrom('2024-01-15')!;
    const to = shopeeEpochTo('2024-01-15')!;
    expect(to).toBeGreaterThan(from);
  });

  it("epochTo - epochFrom ≈ 86399 seconds (nearly full day)", () => {
    const from = shopeeEpochFrom('2024-01-15')!;
    const to = shopeeEpochTo('2024-01-15')!;
    const diff = to - from;
    expect(diff).toBeGreaterThanOrEqual(86380);
    expect(diff).toBeLessThanOrEqual(86400);
  });
});

// ─── T6: applyVinculacoes ─────────────────────────────────────────────────────

describe("T6 applyVinculacoes", () => {
  const makePedido = () => ({
    id: 'p1',
    items: [
      { id: 'item1', sku: 'SKU-A', linked: false },
      { id: 'item2', sku: 'SKU-B', linked: false },
    ],
    status: 'A Vincular',
  });

  it("all items linked → status promoted to 'Emissao NF'", () => {
    const result = applyVinculacoes([makePedido()], 'p1', { item1: 'prod-X', item2: 'prod-Y' });
    expect(result[0].status).toBe('Emissao NF');
    expect(result[0].items.every((i: any) => i.linked)).toBe(true);
  });

  it("partial link → status unchanged, only linked item updated", () => {
    const result = applyVinculacoes([makePedido()], 'p1', { item1: 'prod-X' });
    expect(result[0].status).toBe('A Vincular');
    expect(result[0].items[0].linked).toBe(true);
    expect(result[0].items[1].linked).toBe(false);
  });

  it("unknown pedidoId → returns array unchanged (no mutation)", () => {
    const original = [makePedido()];
    const result = applyVinculacoes(original, 'nonexistent', { item1: 'prod-X' });
    expect(result).toEqual(original);
  });

  it("pedido not in array → returns as-is", () => {
    const result = applyVinculacoes([], 'p1', { item1: 'prod-X' });
    expect(result).toEqual([]);
  });
});
