/**
 * Characterization tests for source_ref format contract (B+C linchpin).
 */
import { describe, it, expect } from "vitest";
import {
  buildAdjustSourceRef,
  buildTransferSourceRef,
  parseSourceRefActor,
  parseSourceRefObservation,
} from "@/services/inventory/source-ref";

describe("buildAdjustSourceRef", () => {
  it("formats actor only with move type", () => {
    expect(buildAdjustSourceRef("Alice", "", "ENTRADA")).toBe("Alice[ENTRADA]");
  });

  it("formats actor, note, and move type", () => {
    expect(buildAdjustSourceRef("Alice", "inv adj", "SAIDA")).toBe("Alice - inv adj[SAIDA]");
  });
});

describe("buildTransferSourceRef", () => {
  it("formats actor only with direction", () => {
    expect(buildTransferSourceRef("Bob", "", "OUT")).toBe("Bob[OUT]");
  });

  it("formats actor, note, and direction", () => {
    expect(buildTransferSourceRef("Bob", "restock", "IN")).toBe("Bob - restock[IN]");
  });
});

describe("parseSourceRefActor", () => {
  it("extracts actor without note", () => {
    expect(parseSourceRefActor("Alice[ENTRADA]")).toBe("Alice");
  });

  it("extracts actor with note", () => {
    expect(parseSourceRefActor("Alice - inv adj[SAIDA]")).toBe("Alice");
  });

  it("extracts actor from transfer ref", () => {
    expect(parseSourceRefActor("Bob - restock[IN]")).toBe("Bob");
  });
});

describe("parseSourceRefObservation", () => {
  it("returns empty when no note segment", () => {
    expect(parseSourceRefObservation("Alice[ENTRADA]")).toBe("");
  });

  it("returns note segment", () => {
    expect(parseSourceRefObservation("Alice - inv adj[SAIDA]")).toBe("inv adj");
  });

  it("joins multi-segment notes with dash", () => {
    expect(parseSourceRefObservation("Bob - a - b[OUT]")).toBe("a - b");
  });
});

describe("source_ref round-trip", () => {
  it("round-trips adjust actor", () => {
    expect(parseSourceRefActor(buildAdjustSourceRef("Maria", "nota", "ENTRADA"))).toBe("Maria");
  });

  it("round-trips transfer observation", () => {
    expect(parseSourceRefObservation(buildTransferSourceRef("Maria", "nota", "OUT"))).toBe("nota");
  });
});
