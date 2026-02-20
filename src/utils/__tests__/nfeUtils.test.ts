import { describe, it, expect } from "vitest";
import {
  extractXmlMeta,
  extractXmlTotal,
  normalizeTipo,
  padLeftNum,
  normalizeFocusUrl,
  resolveNotaStatusLabel,
  resolveNotaValor,
} from "../nfeUtils";

describe("extractXmlMeta", () => {
  it("extracts nfeNumber from <nNF> tag", () => {
    const xml = '<nNF>123456</nNF>';
    expect(extractXmlMeta(xml)).toEqual({ nfeNumber: "123456", nfeKey: undefined });
  });

  it("extracts nfeKey from Id attribute", () => {
    const key = "12345678901234567890123456789012345678901234";
    const xml = `Id="NFe${key}"`;
    expect(extractXmlMeta(xml)).toEqual({ nfeNumber: undefined, nfeKey: key });
  });

  it("extracts nfeKey from <chNFe> tag as fallback", () => {
    const key = "12345678901234567890123456789012345678901234";
    const xml = `<chNFe>${key}</chNFe>`;
    expect(extractXmlMeta(xml)).toEqual({ nfeNumber: undefined, nfeKey: key });
  });

  it("extracts both nfeNumber and nfeKey", () => {
    const key = "12345678901234567890123456789012345678901234";
    const xml = `<nNF>999</nNF> Id="NFe${key}"`;
    const result = extractXmlMeta(xml);
    expect(result.nfeNumber).toBe("999");
    expect(result.nfeKey).toBe(key);
  });

  it("returns empty object for xml without NFe data", () => {
    expect(extractXmlMeta("<root></root>")).toEqual({ nfeNumber: undefined, nfeKey: undefined });
  });

  it("handles empty string", () => {
    expect(extractXmlMeta("")).toEqual({ nfeNumber: undefined, nfeKey: undefined });
  });
});

describe("extractXmlTotal", () => {
  it("extracts decimal value from <vNF> tag", () => {
    expect(extractXmlTotal("<vNF>1234,56</vNF>")).toBe(1234.56);
  });

  it("handles value with thousand separator", () => {
    expect(extractXmlTotal("<vNF>1.234,56</vNF>")).toBe(1234.56);
  });

  it("handles simple integer value", () => {
    expect(extractXmlTotal("<vNF>100</vNF>")).toBe(100);
  });

  it("returns undefined when no <vNF> tag", () => {
    expect(extractXmlTotal("<root></root>")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractXmlTotal("")).toBeUndefined();
  });
});

describe("normalizeTipo", () => {
  it("normalizes 'saida' to 'Saída'", () => {
    expect(normalizeTipo("saida")).toBe("Saída");
  });

  it("normalizes 'saída' to 'Saída'", () => {
    expect(normalizeTipo("saída")).toBe("Saída");
  });

  it("normalizes 'entrada' to 'Entrada'", () => {
    expect(normalizeTipo("entrada")).toBe("Entrada");
  });

  it("normalizes 'compra' to 'Compra'", () => {
    expect(normalizeTipo("compra")).toBe("Compra");
  });

  it("returns original value for unknown types", () => {
    expect(normalizeTipo("devolução")).toBe("devolução");
  });

  it("returns '-' for empty string", () => {
    expect(normalizeTipo("")).toBe("-");
  });

  it("is case-insensitive", () => {
    expect(normalizeTipo("SAIDA")).toBe("Saída");
    expect(normalizeTipo("Entrada")).toBe("Entrada");
  });
});

describe("padLeftNum", () => {
  it("pads number to specified size", () => {
    expect(padLeftNum("42", 9)).toBe("000000042");
  });

  it("pads string number to specified size", () => {
    expect(padLeftNum("1", 3)).toBe("001");
  });

  it("returns zeros for empty string", () => {
    expect(padLeftNum("", 3)).toBe("000");
  });

  it("strips non-digit characters", () => {
    expect(padLeftNum("abc123", 6)).toBe("000123");
  });

  it("handles number input", () => {
    expect(padLeftNum(7, 3)).toBe("007");
  });

  it("does not truncate if already longer", () => {
    expect(padLeftNum("123456789", 3)).toBe("123456789");
  });
});

describe("normalizeFocusUrl", () => {
  it("returns empty string for null/undefined", () => {
    expect(normalizeFocusUrl(null)).toBe("");
    expect(normalizeFocusUrl(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeFocusUrl("")).toBe("");
  });

  it("preserves full https URLs", () => {
    const url = "https://api.focusnfe.com.br/v2/nfe/123";
    expect(normalizeFocusUrl(url)).toBe(url);
  });

  it("preserves full http URLs", () => {
    const url = "http://example.com/path";
    expect(normalizeFocusUrl(url)).toBe(url);
  });

  it("prepends base URL for relative paths", () => {
    const result = normalizeFocusUrl("/v2/nfe/123");
    expect(result).toBe("https://api.focusnfe.com.br/v2/nfe/123");
  });
});

describe("resolveNotaStatusLabel", () => {
  it("returns 'Cancelada' when status is cancelada", () => {
    expect(resolveNotaStatusLabel({ status: "cancelada" })).toBe("Cancelada");
  });

  it("returns 'Cancelada' when status is cancelado", () => {
    expect(resolveNotaStatusLabel({ status: "cancelado" })).toBe("Cancelada");
  });

  it("returns 'Autorizada' when status_focus is autorizado", () => {
    expect(resolveNotaStatusLabel({ status_focus: "autorizado" })).toBe("Autorizada");
  });

  it("returns 'Pendente' when status_focus is pendente", () => {
    expect(resolveNotaStatusLabel({ status_focus: "pendente" })).toBe("Pendente");
  });

  it("capitalizes unknown status", () => {
    expect(resolveNotaStatusLabel({ status: "processando" })).toBe("Processando");
  });

  it("returns empty string for no status", () => {
    expect(resolveNotaStatusLabel({})).toBe("");
  });

  it("prioritizes status over status_focus for cancelada", () => {
    expect(resolveNotaStatusLabel({ status: "cancelada", status_focus: "autorizado" })).toBe("Cancelada");
  });
});

describe("resolveNotaValor", () => {
  it("returns total_value when it is a number", () => {
    expect(resolveNotaValor({ total_value: 199.90 })).toBe(199.90);
  });

  it("extracts value from xml_base64 when total_value is missing", () => {
    const xml = "<vNF>250,00</vNF>";
    const b64 = btoa(xml);
    expect(resolveNotaValor({ xml_base64: b64 })).toBe(250);
  });

  it("returns undefined when no value source available", () => {
    expect(resolveNotaValor({})).toBeUndefined();
  });
});
