import { describe, expect, it } from "vitest";
import { formatBrDecimalDisplay, parseBrlMoneyToCanonical } from "./brNumericInput";

describe("parseBrlMoneyToCanonical", () => {
  it("parses comma as decimal (not 2590)", () => {
    expect(parseFloat(parseBrlMoneyToCanonical("25,90"))).toBe(25.9);
    expect(parseFloat(parseBrlMoneyToCanonical("25,9"))).toBe(25.9);
    expect(parseFloat(parseBrlMoneyToCanonical("0,09"))).toBe(0.09);
  });

  it("parses thousands with dot before comma", () => {
    expect(parseFloat(parseBrlMoneyToCanonical("1.234,56"))).toBe(1234.56);
    expect(parseFloat(parseBrlMoneyToCanonical("12.345,6"))).toBe(12345.6);
  });

  it("parses integer without comma", () => {
    expect(parseFloat(parseBrlMoneyToCanonical("450"))).toBe(450);
    expect(parseFloat(parseBrlMoneyToCanonical("1.234"))).toBe(1234);
  });

  it("treats single dot with short fraction as decimal", () => {
    expect(parseFloat(parseBrlMoneyToCanonical("25.90"))).toBe(25.9);
  });

  it("returns empty for invalid", () => {
    expect(parseBrlMoneyToCanonical("")).toBe("");
    expect(parseBrlMoneyToCanonical("  ")).toBe("");
  });

  it("handles trailing comma as integer part only", () => {
    expect(parseBrlMoneyToCanonical("25,")).toBe("25");
  });
});

describe("formatBrDecimalDisplay", () => {
  it("formats pt-BR with two decimals", () => {
    expect(formatBrDecimalDisplay("450.00", 2)).toMatch(/450,00/);
    expect(formatBrDecimalDisplay("1234.56", 2)).toMatch(/1\.234,56/);
  });
});
