import { describe, expect, it } from "vitest";
import { calendarEndOfDaySPEpochMs, calendarStartOfDaySPEpochMs } from "@/lib/datetime";
import type { DateRange } from "react-day-picker";

/** Mirrors performance.service.ts lines 125–145 until C2 extracts shared-helpers. */
function toISOs(dateRange: DateRange | undefined): { fromISO: string | undefined; toISO: string | undefined } {
    const from = dateRange?.from;
    const to = dateRange?.to || dateRange?.from;
    const fromISO = from ? new Date(calendarStartOfDaySPEpochMs(from)).toISOString() : undefined;
    const toISO = to ? new Date(calendarEndOfDaySPEpochMs(to)).toISOString() : undefined;
    return { fromISO, toISO };
}

function normalizeMarketplace(m: string | undefined): string | undefined {
    if (!m || m === "todos") return undefined;
    return m;
}

function marketplaceKey(value: string | undefined): string {
    return String(value || "").toLowerCase().replace(/[_\s-]/g, "");
}

function normalizeImageUrl(url: string | null | undefined): string {
    const value = String(url || "").trim();
    return /^https?:\/\//i.test(value) ? value : "";
}

describe("performance shared helpers (monolith baseline)", () => {
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
