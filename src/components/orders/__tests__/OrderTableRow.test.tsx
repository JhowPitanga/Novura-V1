import { describe, it, expect, vi } from "vitest";
import { getStatusColor } from "@/utils/orderUtils";
import { normStatus } from "@/hooks/useOrderFiltering";

// ---------------------------------------------------------------------------
// Badge color tests (T10 §6 — "Testes de snapshot/componente não regressão")
// These tests validate that getStatusColor returns the correct Tailwind class
// for every status value, both legacy (PT-BR with spaces) and new (EN slugs).
// ---------------------------------------------------------------------------

describe("getStatusColor — new enum slugs (EN)", () => {
  it("returns yellow for 'unlinked'", () => {
    expect(getStatusColor("unlinked")).toContain("yellow");
  });

  it("returns yellow for 'a_vincular'", () => {
    expect(getStatusColor("a_vincular")).toContain("yellow");
  });

  it("returns yellow for 'pending'", () => {
    expect(getStatusColor("pending")).toContain("yellow");
  });

  it("returns orange for 'invoice_pending'", () => {
    expect(getStatusColor("invoice_pending")).toContain("orange");
  });

  it("returns purple for 'ready_to_print'", () => {
    expect(getStatusColor("ready_to_print")).toContain("purple");
  });

  it("returns blue for 'awaiting_pickup'", () => {
    expect(getStatusColor("awaiting_pickup")).toContain("blue");
  });

  it("returns green for 'shipped'", () => {
    expect(getStatusColor("shipped")).toContain("green");
  });

  it("returns red for 'cancelled'", () => {
    expect(getStatusColor("cancelled")).toContain("red");
  });

  it("returns gray for 'returned'", () => {
    expect(getStatusColor("returned")).toContain("gray");
  });
});

describe("getStatusColor — legacy strings (PT-BR with spaces)", () => {
  it("returns yellow for 'Pendente'", () => {
    expect(getStatusColor("Pendente")).toContain("yellow");
  });

  it("returns yellow for 'A vincular' (legacy with space)", () => {
    // normStatus converts 'A vincular' → 'a_vincular' before getStatusColor sees it
    expect(getStatusColor(normStatus("A vincular"))).toContain("yellow");
  });

  it("returns orange for 'Emissao NF' (legacy)", () => {
    expect(getStatusColor(normStatus("Emissao NF"))).toContain("orange");
  });

  it("returns purple for 'Impressao' (legacy)", () => {
    expect(getStatusColor("Impressao")).toContain("purple");
  });

  it("returns blue for 'Aguardando Coleta' (legacy)", () => {
    expect(getStatusColor(normStatus("Aguardando Coleta"))).toContain("blue");
  });

  it("returns green for 'Enviado' (legacy)", () => {
    expect(getStatusColor("Enviado")).toContain("green");
  });

  it("returns red for 'Cancelado' (legacy)", () => {
    expect(getStatusColor("Cancelado")).toContain("red");
  });
});

// ---------------------------------------------------------------------------
// normStatus helper tests
// ---------------------------------------------------------------------------

describe("normStatus — normalisation rules", () => {
  it("converts spaces to underscores", () => {
    expect(normStatus("a vincular")).toBe("a_vincular");
  });

  it("strips accents", () => {
    expect(normStatus("Emissão NF")).toBe("emissao_nf");
  });

  it("lowercases", () => {
    expect(normStatus("ENVIADO")).toBe("enviado");
  });

  it("preserves slugs already normalised", () => {
    expect(normStatus("invoice_pending")).toBe("invoice_pending");
  });

  it("handles empty string", () => {
    expect(normStatus("")).toBe("");
  });
});
