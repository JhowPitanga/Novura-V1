import { describe, it, expect } from "vitest";
import {
  mapTipoEnvioLabel,
  normalizeShippingType,
  ensureHttpUrl,
  normalizeMarketplaceId,
  formatMarketplaceLabel,
  isAbortLikeError,
  mapStatusFocusToBadge,
  buildLabelInfo,
  resolveLinkedSku,
  buildFinancials,
  getStatusColor,
  formatShipmentStatus,
  getShipmentStatusColor,
} from "../orderUtils";

describe("mapTipoEnvioLabel", () => {
  it("maps 'full' to 'Full'", () => {
    expect(mapTipoEnvioLabel("full")).toBe("Full");
  });

  it("maps 'fulfillment' to 'Full'", () => {
    expect(mapTipoEnvioLabel("fulfillment")).toBe("Full");
  });

  it("maps 'fbm' to 'Full'", () => {
    expect(mapTipoEnvioLabel("fbm")).toBe("Full");
  });

  it("maps 'flex' to 'Flex'", () => {
    expect(mapTipoEnvioLabel("flex")).toBe("Flex");
  });

  it("maps 'self_service' to 'Flex'", () => {
    expect(mapTipoEnvioLabel("self_service")).toBe("Flex");
  });

  it("maps 'envios' to 'Envios'", () => {
    expect(mapTipoEnvioLabel("envios")).toBe("Envios");
  });

  it("maps 'me2' to 'Envios'", () => {
    expect(mapTipoEnvioLabel("me2")).toBe("Envios");
  });

  it("maps 'xd_drop_off' to 'Envios'", () => {
    expect(mapTipoEnvioLabel("xd_drop_off")).toBe("Envios");
  });

  it("maps 'cross_docking' to 'Envios'", () => {
    expect(mapTipoEnvioLabel("cross_docking")).toBe("Envios");
  });

  it("maps 'custom' to 'Envios'", () => {
    expect(mapTipoEnvioLabel("custom")).toBe("Envios");
  });

  it("maps 'correios' to 'Correios'", () => {
    expect(mapTipoEnvioLabel("correios")).toBe("Correios");
  });

  it("maps 'drop_off' to 'Correios'", () => {
    expect(mapTipoEnvioLabel("drop_off")).toBe("Correios");
  });

  it("maps 'no_shipping' to 'Sem Envio'", () => {
    expect(mapTipoEnvioLabel("no_shipping")).toBe("Sem Envio");
  });

  it("returns '—' for empty/undefined", () => {
    expect(mapTipoEnvioLabel(undefined)).toBe("—");
    expect(mapTipoEnvioLabel("")).toBe("—");
  });

  it("returns lowercased value for unknown types", () => {
    expect(mapTipoEnvioLabel("express")).toBe("express");
  });

  it("is case-insensitive", () => {
    expect(mapTipoEnvioLabel("FULL")).toBe("Full");
    expect(mapTipoEnvioLabel("Envios")).toBe("Envios");
  });
});

describe("normalizeShippingType", () => {
  it("normalizes 'full' variants to 'full'", () => {
    expect(normalizeShippingType("full")).toBe("full");
    expect(normalizeShippingType("fulfillment")).toBe("full");
    expect(normalizeShippingType("fbm")).toBe("full");
  });

  it("normalizes 'flex' variants to 'flex'", () => {
    expect(normalizeShippingType("flex")).toBe("flex");
    expect(normalizeShippingType("self_service")).toBe("flex");
  });

  it("normalizes 'envios' variants to 'envios'", () => {
    expect(normalizeShippingType("envios")).toBe("envios");
    expect(normalizeShippingType("me2")).toBe("envios");
    expect(normalizeShippingType("xd_drop_off")).toBe("envios");
    expect(normalizeShippingType("cross_docking")).toBe("envios");
    expect(normalizeShippingType("custom")).toBe("envios");
  });

  it("normalizes 'correios' variants to 'correios'", () => {
    expect(normalizeShippingType("correios")).toBe("correios");
    expect(normalizeShippingType("drop_off")).toBe("correios");
  });

  it("normalizes 'no_shipping' to 'no_shipping'", () => {
    expect(normalizeShippingType("no_shipping")).toBe("no_shipping");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(normalizeShippingType(null)).toBe("");
    expect(normalizeShippingType(undefined)).toBe("");
    expect(normalizeShippingType("")).toBe("");
  });

  it("returns lowercased input for unknown types", () => {
    expect(normalizeShippingType("Express")).toBe("express");
  });
});

describe("ensureHttpUrl", () => {
  it("returns null for null/undefined/empty", () => {
    expect(ensureHttpUrl(null)).toBeNull();
    expect(ensureHttpUrl(undefined)).toBeNull();
    expect(ensureHttpUrl("")).toBeNull();
  });

  it("preserves URLs with https", () => {
    expect(ensureHttpUrl("https://example.com")).toBe("https://example.com");
  });

  it("preserves URLs with http", () => {
    expect(ensureHttpUrl("http://example.com")).toBe("http://example.com");
  });

  it("prepends https:// to bare domains", () => {
    expect(ensureHttpUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("trims whitespace", () => {
    expect(ensureHttpUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("is case-insensitive for protocol check", () => {
    expect(ensureHttpUrl("HTTPS://example.com")).toBe("HTTPS://example.com");
    expect(ensureHttpUrl("HTTP://example.com")).toBe("HTTP://example.com");
  });
});

describe("normalizeMarketplaceId", () => {
  it("normalizes accented characters", () => {
    expect(normalizeMarketplaceId("Mercado Livre")).toBe("mercado-livre");
  });

  it("replaces spaces and underscores with hyphens", () => {
    expect(normalizeMarketplaceId("mercado_livre")).toBe("mercado-livre");
    expect(normalizeMarketplaceId("mercado livre")).toBe("mercado-livre");
  });

  it("lowercases everything", () => {
    expect(normalizeMarketplaceId("SHOPEE")).toBe("shopee");
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeMarketplaceId(null)).toBe("");
    expect(normalizeMarketplaceId(undefined)).toBe("");
  });

  it("handles multiple spaces/underscores", () => {
    expect(normalizeMarketplaceId("mercado  livre")).toBe("mercado-livre");
    expect(normalizeMarketplaceId("mercado__livre")).toBe("mercado-livre");
  });
});

describe("formatMarketplaceLabel", () => {
  it("formats hyphenated id to title case", () => {
    expect(formatMarketplaceLabel("mercado-livre")).toBe("Mercado Livre");
  });

  it("capitalizes single word", () => {
    expect(formatMarketplaceLabel("shopee")).toBe("Shopee");
  });

  it("returns 'Marketplace' for empty string", () => {
    expect(formatMarketplaceLabel("")).toBe("Marketplace");
  });

  it("handles multi-word names", () => {
    expect(formatMarketplaceLabel("amazon-prime-video")).toBe("Amazon Prime Video");
  });
});

describe("isAbortLikeError", () => {
  it("detects abort errors", () => {
    expect(isAbortLikeError(new DOMException("AbortError"))).toBe(true);
    expect(isAbortLikeError({ message: "The operation was aborted" })).toBe(true);
  });

  it("detects fetch failures", () => {
    expect(isAbortLikeError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("detects ERR_ABORTED", () => {
    expect(isAbortLikeError({ message: "ERR_ABORTED" })).toBe(true);
  });

  it("returns false for regular errors", () => {
    expect(isAbortLikeError(new Error("Something else went wrong"))).toBe(false);
  });

  it("handles null/undefined gracefully", () => {
    expect(isAbortLikeError(null)).toBe(false);
    expect(isAbortLikeError(undefined)).toBe(false);
  });

  it("handles string errors", () => {
    expect(isAbortLikeError("abort")).toBe(true);
    expect(isAbortLikeError("some error")).toBe(false);
  });
});

describe("mapStatusFocusToBadge", () => {
  it("maps 'autorizado' to Autorizada with green badge", () => {
    const result = mapStatusFocusToBadge("autorizado");
    expect(result.label).toBe("Autorizada");
    expect(result.className).toContain("bg-green");
  });

  it("maps 'autorizada' to Autorizada", () => {
    expect(mapStatusFocusToBadge("autorizada").label).toBe("Autorizada");
  });

  it("maps 'processando_autorizacao' to Processando with blue badge", () => {
    const result = mapStatusFocusToBadge("processando_autorizacao");
    expect(result.label).toBe("Processando");
    expect(result.className).toContain("blue");
  });

  it("maps 'pendente' to Pendente with yellow badge", () => {
    const result = mapStatusFocusToBadge("pendente");
    expect(result.label).toBe("Pendente");
    expect(result.className).toContain("yellow");
  });

  it("maps 'cancelado'/'cancelada' to Cancelada with red badge", () => {
    expect(mapStatusFocusToBadge("cancelado").label).toBe("Cancelada");
    expect(mapStatusFocusToBadge("cancelada").label).toBe("Cancelada");
    expect(mapStatusFocusToBadge("cancelado").className).toContain("red");
  });

  it("maps 'rejeitado'/'rejeitada' to Rejeitada", () => {
    expect(mapStatusFocusToBadge("rejeitado").label).toBe("Rejeitada");
    expect(mapStatusFocusToBadge("rejeitada").label).toBe("Rejeitada");
  });

  it("maps 'denegado'/'denegada' to Denegada", () => {
    expect(mapStatusFocusToBadge("denegado").label).toBe("Denegada");
    expect(mapStatusFocusToBadge("denegada").label).toBe("Denegada");
  });

  it("maps 'erro'/'error' to Erro", () => {
    expect(mapStatusFocusToBadge("erro").label).toBe("Erro");
    expect(mapStatusFocusToBadge("error").label).toBe("Erro");
  });

  it("returns status as label for unknown statuses", () => {
    expect(mapStatusFocusToBadge("custom_status").label).toBe("custom_status");
    expect(mapStatusFocusToBadge("custom_status").className).toContain("gray");
  });

  it("returns 'Indefinido' for undefined/empty", () => {
    expect(mapStatusFocusToBadge(undefined).label).toBe("Indefinido");
    expect(mapStatusFocusToBadge("").label).toBe("Indefinido");
  });
});

describe("buildLabelInfo", () => {
  it("returns cached=true when label_content_base64 is present", () => {
    const o = { label_content_base64: "abc123" };
    const result = buildLabelInfo(o);
    expect(result.cached).toBe(true);
    expect(result.content_base64).toBe("abc123");
  });

  it("returns cached=true when label_pdf_base64 is present", () => {
    const o = { label_pdf_base64: "pdfdata" };
    const result = buildLabelInfo(o);
    expect(result.cached).toBe(true);
    expect(result.pdf_base64).toBe("pdfdata");
    expect(result.content_type).toBe("application/pdf");
  });

  it("returns cached=true when label_zpl2_base64 is present", () => {
    const o = { label_zpl2_base64: "zpldata" };
    const result = buildLabelInfo(o);
    expect(result.cached).toBe(true);
    expect(result.zpl2_base64).toBe("zpldata");
    expect(result.content_type).toBe("text/plain");
  });

  it("returns cached=false when no label data", () => {
    const result = buildLabelInfo({});
    expect(result.cached).toBe(false);
    expect(result.content_base64).toBeNull();
  });

  it("uses label_cached flag", () => {
    const result = buildLabelInfo({ label_cached: true });
    expect(result.cached).toBe(true);
  });

  it("reads response_type from row", () => {
    const result = buildLabelInfo({ label_response_type: "pdf" });
    expect(result.response_type).toBe("pdf");
  });

  it("reads size_bytes as number", () => {
    const result = buildLabelInfo({ label_size_bytes: 1024 });
    expect(result.size_bytes).toBe(1024);
  });

  it("converts string size_bytes to number", () => {
    const result = buildLabelInfo({ label_size_bytes: "2048" });
    expect(result.size_bytes).toBe(2048);
  });
});

describe("resolveLinkedSku", () => {
  it("returns null when no linked_products", () => {
    expect(resolveLinkedSku({}, [])).toBeNull();
  });

  it("matches by marketplace_item_id and variation_id", () => {
    const o = { first_item_id: "MLB123", first_item_variation_id: "456" };
    const links = [
      { marketplace_item_id: "MLB123", variation_id: "456", sku: "SKU-MATCH" },
      { marketplace_item_id: "MLB123", variation_id: "789", sku: "SKU-OTHER" },
    ];
    expect(resolveLinkedSku(o, links)).toBe("SKU-MATCH");
  });

  it("falls back to match by marketplace_item_id only", () => {
    const o = { first_item_id: "MLB123", first_item_variation_id: "999" };
    const links = [
      { marketplace_item_id: "MLB123", variation_id: "456", sku: "SKU-FALLBACK" },
    ];
    expect(resolveLinkedSku(o, links)).toBe("SKU-FALLBACK");
  });

  it("falls back to first link if no ID match", () => {
    const o = { first_item_id: "UNKNOWN" };
    const links = [
      { marketplace_item_id: "MLB999", sku: "SKU-FIRST" },
    ];
    expect(resolveLinkedSku(o, links)).toBe("SKU-FIRST");
  });

  it("extracts numeric ID from permalink for alt matching", () => {
    const o = { first_item_id: "", first_item_permalink: "https://www.mercadolivre.com.br/MLB-12345" };
    const links = [
      { marketplace_item_id: "12345", sku: "SKU-PERMALINK" },
    ];
    expect(resolveLinkedSku(o, links)).toBe("SKU-PERMALINK");
  });

  it("treats variation_id '0' as empty", () => {
    const o = { first_item_id: "MLB123", first_item_variation_id: "0" };
    const links = [
      { marketplace_item_id: "MLB123", variation_id: "0", sku: "SKU-ZERO" },
    ];
    expect(resolveLinkedSku(o, links)).toBe("SKU-ZERO");
  });
});

describe("buildFinancials", () => {
  it("calculates financial summary from items", () => {
    const items = [
      { valor: 50, quantidade: 2 },
      { valor: 30, quantidade: 1 },
    ];
    const result = buildFinancials(items, 130, 15, 10, "PAC");
    expect(result.valorPedido).toBe(130);
    expect(result.freteRecebido).toBe(15);
    expect(result.taxaMarketplace).toBe(10);
    expect(result.envioMetodo).toBe("PAC");
    expect(result.liquido).toBe(130 + 15 - 10);
  });

  it("falls back to orderTotal when items sum is 0", () => {
    const items: any[] = [];
    const result = buildFinancials(items, 200, 0, 0, null);
    expect(result.valorPedido).toBe(200);
    expect(result.liquido).toBe(200);
  });

  it("handles all-zero values", () => {
    const result = buildFinancials([], 0, 0, 0, null);
    expect(result.valorPedido).toBe(0);
    expect(result.liquido).toBe(0);
    expect(result.freteRecebido).toBe(0);
  });
});

describe("getStatusColor", () => {
  it("returns yellow for 'Pendente'", () => {
    expect(getStatusColor("Pendente")).toContain("yellow");
  });

  it("returns yellow for 'A vincular'", () => {
    expect(getStatusColor("A vincular")).toContain("yellow");
  });

  it("returns orange for 'Emissao NF'", () => {
    expect(getStatusColor("Emissao NF")).toContain("orange");
  });

  it("returns purple for 'Impressao'", () => {
    expect(getStatusColor("Impressao")).toContain("purple");
  });

  it("returns green for 'Enviado'", () => {
    expect(getStatusColor("Enviado")).toContain("green");
  });

  it("returns red for 'Cancelado'", () => {
    expect(getStatusColor("Cancelado")).toContain("red");
  });

  it("returns gray for unknown status", () => {
    expect(getStatusColor("unknown")).toContain("gray");
  });

  it("is case-insensitive", () => {
    expect(getStatusColor("ENVIADO")).toContain("green");
  });
});

describe("formatShipmentStatus", () => {
  it("translates 'delivered' to 'entregue'", () => {
    expect(formatShipmentStatus("delivered")).toBe("entregue");
  });

  it("translates 'shipped' to 'enviado'", () => {
    expect(formatShipmentStatus("shipped")).toBe("enviado");
  });

  it("translates 'in_transit' to 'em trânsito'", () => {
    expect(formatShipmentStatus("in_transit")).toBe("em trânsito");
  });

  it("returns empty string for empty/undefined", () => {
    expect(formatShipmentStatus("")).toBe("");
    expect(formatShipmentStatus(undefined)).toBe("");
  });

  it("replaces underscores for unknown statuses", () => {
    expect(formatShipmentStatus("some_unknown_status")).toBe("some unknown status");
  });
});

describe("getShipmentStatusColor", () => {
  it("returns yellow for 'pending'", () => {
    expect(getShipmentStatusColor("pending")).toContain("yellow");
  });

  it("returns blue for 'in_transit'", () => {
    expect(getShipmentStatusColor("in_transit")).toContain("blue");
  });

  it("returns green for 'delivered'", () => {
    expect(getShipmentStatusColor("delivered")).toContain("green");
  });

  it("returns red for 'canceled'", () => {
    expect(getShipmentStatusColor("canceled")).toContain("red");
  });

  it("returns gray for unknown status", () => {
    expect(getShipmentStatusColor("unknown")).toContain("gray");
  });
});
