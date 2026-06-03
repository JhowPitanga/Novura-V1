import { describe, expect, it } from "vitest";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs } from "@/lib/datetime";
import {
    marketplaceKey,
    normalizeImageUrl,
    normalizeMarketplace,
    toISOs,
} from "../shared-helpers";

describe("performance shared helpers", () => {
    it("toISOs(undefined) returns undefined ISO pair", () => {
        expect(toISOs(undefined)).toEqual({ fromISO: undefined, toISO: undefined });
    });

    it("toISOs({ from }) produces SP calendar day ISO bounds", () => {
        const { fromISO, toISO } = toISOs({ from: new Date("2025-01-01") });
        expect(fromISO).toBe(new Date(calendarStartOfDaySPEpochMs(new Date("2025-01-01"))).toISOString());
        expect(toISO).toBe(new Date(calendarEndOfDaySPEpochMs(new Date("2025-01-01"))).toISOString());
    });

    it("normalizeMarketplace handles todos and passthrough", () => {
        expect(normalizeMarketplace("todos")).toBeUndefined();
        expect(normalizeMarketplace(undefined)).toBeUndefined();
        expect(normalizeMarketplace("Mercado_Livre")).toBe("Mercado_Livre");
    });

    it("marketplaceKey normalizes keys", () => {
        expect(marketplaceKey("Mercado_Livre")).toBe("mercadolivre");
        expect(marketplaceKey("SHOP EE")).toBe("shopee");
    });

    it("normalizeImageUrl accepts absolute URLs only", () => {
        expect(normalizeImageUrl("https://a.com/x.jpg")).toBe("https://a.com/x.jpg");
        expect(normalizeImageUrl(null)).toBe("");
        expect(normalizeImageUrl("relative/path.jpg")).toBe("");
    });
});
