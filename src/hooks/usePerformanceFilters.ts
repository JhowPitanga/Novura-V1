import { useState, useCallback } from "react";
import type { DateRange } from "react-day-picker";

const SESSION_KEY = "novura:perf:produto:filters";

interface PerformanceFiltersState {
    dateRange: DateRange | undefined;
    tempDateRange: DateRange | undefined;
    marketplace: string;
    searchTerm: string;
    activeQuick: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null;
    isDateOpen: boolean;
}

function buildDefaultRange(): DateRange {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from, to: now };
}

function loadSaved(): Partial<PerformanceFiltersState> {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return {
            marketplace: parsed.marketplace ?? "todos",
            searchTerm: parsed.searchTerm ?? "",
        };
    } catch {
        return {};
    }
}

function persist(state: Pick<PerformanceFiltersState, "marketplace" | "searchTerm">) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch { /* ignore quota errors */ }
}

export function usePerformanceFilters() {
    const saved = loadSaved();
    const defaultRange = buildDefaultRange();

    const [dateRange, setDateRange] = useState<DateRange | undefined>(defaultRange);
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(defaultRange);
    const [marketplace, setMarketplaceRaw] = useState<string>(saved.marketplace ?? "todos");
    const [searchTerm, setSearchTermRaw] = useState<string>(saved.searchTerm ?? "");
    const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null>("7dias");
    const [isDateOpen, setIsDateOpen] = useState(false);

    const setMarketplace = useCallback((val: string) => {
        setMarketplaceRaw(val);
        persist({ marketplace: val, searchTerm });
    }, [searchTerm]);

    const setSearchTerm = useCallback((val: string) => {
        setSearchTermRaw(val);
        persist({ marketplace, searchTerm: val });
    }, [marketplace]);

    const applyQuickRange = useCallback((key: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual") => {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        if (key === "hoje") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            setTempDateRange({ from: start, to: endOfToday });
        } else if (key === "mesAtual") {
            const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            setTempDateRange({ from: start, to: endOfToday });
        } else {
            const from = new Date(now);
            const days = key === "7dias" ? 6 : key === "15dias" ? 14 : key === "30dias" ? 29 : 89;
            from.setDate(from.getDate() - days);
            setTempDateRange({ from, to: endOfToday });
        }
        setActiveQuick(key);
    }, []);

    const handleApply = useCallback(() => {
        setDateRange(tempDateRange);
        setActiveQuick(null);
        setIsDateOpen(false);
    }, [tempDateRange]);

    const handleOpenChange = useCallback((open: boolean) => {
        setIsDateOpen(open);
        if (open) setTempDateRange(dateRange);
    }, [dateRange]);

    return {
        dateRange,
        tempDateRange,
        marketplace,
        searchTerm,
        activeQuick,
        isDateOpen,
        setTempDateRange,
        setMarketplace,
        setSearchTerm,
        applyQuickRange,
        handleApply,
        handleOpenChange,
    };
}
