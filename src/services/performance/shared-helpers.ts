import { calendarStartOfDaySPEpochMs, calendarEndOfDaySPEpochMs } from "@/lib/datetime";
import type { DateRange } from "react-day-picker";

// Keep the backend RPC contract ready, but use table fallbacks until the
// migrations are present in the remote Supabase schema cache.
export const PERF_RPC_ENABLED = false;

export function toISOs(dateRange: DateRange | undefined): { fromISO: string | undefined; toISO: string | undefined } {
    const from = dateRange?.from;
    const to = dateRange?.to || dateRange?.from;
    const fromISO = from ? new Date(calendarStartOfDaySPEpochMs(from)).toISOString() : undefined;
    const toISO = to ? new Date(calendarEndOfDaySPEpochMs(to)).toISOString() : undefined;
    return { fromISO, toISO };
}

export function normalizeMarketplace(m: string | undefined): string | undefined {
    if (!m || m === 'todos') return undefined;
    return m;
}

export function marketplaceKey(value: string | undefined): string {
    return String(value || "").toLowerCase().replace(/[_\s-]/g, "");
}

export function normalizeImageUrl(url: string | null | undefined): string {
    const value = String(url || "").trim();
    return /^https?:\/\//i.test(value) ? value : "";
}

export const STATE_NAMES: Record<string, string> = {
    AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
    DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
    MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
    PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
    RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
    SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export type ScopedOrder = {
    id: string;
    marketplace: string;
    marketplace_fee: number;
    shipping_cost: number;
};

export type ScopedItem = {
    order_id: string;
    product_id: string | null;
    marketplace_item_id: string | null;
    quantity: number;
    unit_price: number;
    unit_cost: number | null;
    title: string | null;
    image_url: string | null;
    sku: string | null;
};
