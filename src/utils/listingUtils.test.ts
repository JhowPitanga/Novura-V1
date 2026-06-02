import { describe, expect, it } from "vitest";
import { marketplaceDisplayNameFromSlug } from "@/utils/listingUtils";

describe("marketplaceDisplayNameFromSlug", () => {
  it("maps Mercado Livre slug variants", () => {
    expect(marketplaceDisplayNameFromSlug("mercado-livre")).toBe("Mercado Livre");
    expect(marketplaceDisplayNameFromSlug("mercado_livre")).toBe("Mercado Livre");
    expect(marketplaceDisplayNameFromSlug("mercado")).toBe("Mercado Livre");
  });

  it("maps shopee slug", () => {
    expect(marketplaceDisplayNameFromSlug("shopee")).toBe("Shopee");
  });

  it("title-cases hyphenated slugs", () => {
    expect(marketplaceDisplayNameFromSlug("minha-loja")).toBe("Minha Loja");
  });

  it("returns empty string for empty input", () => {
    expect(marketplaceDisplayNameFromSlug("")).toBe("");
  });
});
