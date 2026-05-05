import { useMemo, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { CleanNavigation } from "@/components/CleanNavigation";
import { Routes, Route } from "react-router-dom";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/hooks/useAuth";
import {
    useConnectedMarketplaces,
    useOrdersMetrics,
    useSalesByState,
    useFinancialOverview,
    useAbcProducts,
    useListingsSold,
} from "@/hooks/usePerformance";
import { toDisplayMarketplaceName } from "@/services/performance.service";
import { OverviewFilterBar } from "@/components/performance/OverviewFilterBar";
import { MetricCardsGrid } from "@/components/performance/MetricCardsGrid";
import { SalesChart } from "@/components/performance/SalesChart";
import { SalesSourceSection } from "@/components/performance/SalesSourceSection";
import { StatesRankingTable } from "@/components/performance/StatesRankingTable";
import { Top10ProductsRanking } from "@/components/performance/Top10ProductsRanking";
import { PorProduto } from "@/components/performance/produto/PorProduto";
import { FinanceiroOverviewCards } from "@/components/performance/financeiro/FinanceiroOverviewCards";

const navigationItems = [
    { title: "Visão Geral", path: "", description: "Métricas principais" },
    { title: "Por Produto", path: "/produtos", description: "Desempenho individual" },
    { title: "Financeiro", path: "/financeiro", description: "Custos e taxas" },
];

function buildDefaultRange(): DateRange {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from, to: now };
}

function buildPreviousRange(range: DateRange | undefined): DateRange | undefined {
    if (!range?.from) return undefined;
    const from = range.from;
    const to = range.to || range.from;
    const dayMs = 24 * 60 * 60 * 1000;
    const durationDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1);
    const previousTo = new Date(from);
    previousTo.setDate(previousTo.getDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setDate(previousFrom.getDate() - durationDays + 1);
    return { from: previousFrom, to: previousTo };
}

function pctChange(current?: number | null, previous?: number | null): number | null {
    if (current == null || previous == null) return null;
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
}

function VisaoGeral() {
    const { organizationId } = useAuth();
    const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null>("30dias");
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    const [selectedMarketplace, setSelectedMarketplace] = useState("todos");
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["vendas"]);

    const selectedMarketplaceDisplay = useMemo(() => {
        if (!selectedMarketplace || selectedMarketplace === "todos") return "todos";
        return toDisplayMarketplaceName(selectedMarketplace);
    }, [selectedMarketplace]);

    const { data: connectedMarketplaces = [] } = useConnectedMarketplaces(organizationId);
    const { data: metricsData } = useOrdersMetrics(appliedDateRange, selectedMarketplaceDisplay, organizationId);
    const previousDateRange = useMemo(() => buildPreviousRange(appliedDateRange), [appliedDateRange]);
    const { data: previousMetricsData } = useOrdersMetrics(previousDateRange, selectedMarketplaceDisplay, organizationId);
    const { data: statesData = [], isLoading: loadingStates } = useSalesByState(appliedDateRange, selectedMarketplaceDisplay, organizationId);
    const { data: financialOverview } = useFinancialOverview(appliedDateRange, selectedMarketplaceDisplay, organizationId);
    const { data: previousFinancialOverview } = useFinancialOverview(previousDateRange, selectedMarketplaceDisplay, organizationId);
    const { data: abcProducts = [], isLoading: loadingTop10 } = useAbcProducts(appliedDateRange, selectedMarketplaceDisplay, organizationId, "valor");
    const { data: soldListings = [], isLoading: loadingTop10Listings } = useListingsSold(appliedDateRange, selectedMarketplaceDisplay, organizationId);

    const totals = {
        ...(metricsData?.totals ?? { vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0, margem_pct: null }),
        receitaLiquida: financialOverview?.net_revenue ?? null,
    };
    const series = metricsData?.series ?? [];
    const salesSources = (metricsData?.byMarketplace ?? []).map((m) => {
        const mktName = m.marketplace;
        const store = connectedMarketplaces.find((cm) =>
            mktName && cm.display && cm.display.toLowerCase().includes(mktName.toLowerCase())
        );
        const storeName = store?.display?.split(" - ").slice(1).join(" - ") || store?.display || "";
        return { name: mktName, storeName, value: m.total };
    });
    const byLogistic = metricsData?.byLogistic ?? [];
    const growth = {
        vendas: pctChange(metricsData?.totals.vendas, previousMetricsData?.totals.vendas),
        pedidos: pctChange(metricsData?.totals.pedidos, previousMetricsData?.totals.pedidos),
        unidades: pctChange(metricsData?.totals.unidades, previousMetricsData?.totals.unidades),
        ticketMedio: pctChange(metricsData?.totals.ticketMedio, previousMetricsData?.totals.ticketMedio),
        margem_pct: pctChange(metricsData?.totals.margem_pct, previousMetricsData?.totals.margem_pct),
        receitaLiquida: pctChange(financialOverview?.net_revenue, previousFinancialOverview?.net_revenue),
    };

    const isSingleDay =
        !!appliedDateRange?.from &&
        !!appliedDateRange?.to &&
        appliedDateRange.from.toDateString() === appliedDateRange.to.toDateString();

    const applyQuickRange = (key: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual") => {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        if (key === "hoje") {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            setTempDateRange({ from: startOfToday, to: endOfToday });
        } else if (key === "mesAtual") {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            setTempDateRange({ from: startOfMonth, to: endOfToday });
        } else {
            const from = new Date(now);
            const days = key === "7dias" ? 6 : key === "15dias" ? 14 : key === "30dias" ? 29 : 89;
            from.setDate(from.getDate() - days);
            setTempDateRange({ from, to: endOfToday });
        }
        setActiveQuick(key);
    };

    const handleApply = () => {
        setAppliedDateRange(tempDateRange);
        setActiveQuick(null);
        setIsDatePopoverOpen(false);
    };

    const handleOpenChange = (open: boolean) => {
        setIsDatePopoverOpen(open);
        if (open) setTempDateRange(appliedDateRange);
    };

    const toggleMetric = (metric: string) =>
        setSelectedMetrics((prev) =>
            prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
        );

    return (
        <div>
            <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200/80 shadow-sm -mx-6 px-6 py-3 mb-5">
                <OverviewFilterBar
                    appliedDateRange={appliedDateRange}
                    tempDateRange={tempDateRange}
                    activeQuick={activeQuick}
                    isDatePopoverOpen={isDatePopoverOpen}
                    connectedMarketplaces={connectedMarketplaces}
                    selectedMarketplace={selectedMarketplace}
                    onOpenChange={handleOpenChange}
                    onTempDateRangeChange={setTempDateRange}
                    onApply={handleApply}
                    onQuickRange={applyQuickRange}
                    onMarketplaceChange={setSelectedMarketplace}
                />
            </div>
            <div className="space-y-5">
                <MetricCardsGrid totals={totals} growth={growth} selectedMetrics={selectedMetrics} onToggle={toggleMetric} />
                <SalesChart
                    series={series}
                    selectedMetrics={selectedMetrics}
                    onToggle={toggleMetric}
                    isSingleDay={isSingleDay}
                />
                <SalesSourceSection salesSources={salesSources} byLogistic={byLogistic} />
                <StatesRankingTable data={statesData} isLoading={loadingStates} />
                <Top10ProductsRanking
                    products={abcProducts}
                    listings={soldListings}
                    isLoadingProducts={loadingTop10}
                    isLoadingListings={loadingTop10Listings}
                />
            </div>
        </div>
    );
}

function FinanceiroPage() {
    const { organizationId } = useAuth();
    const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual" | null>("30dias");
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    const [selectedMarketplace, setSelectedMarketplace] = useState("todos");

    const selectedMarketplaceDisplay = useMemo(() => {
        if (!selectedMarketplace || selectedMarketplace === "todos") return "todos";
        return toDisplayMarketplaceName(selectedMarketplace);
    }, [selectedMarketplace]);

    const { data: connectedMarketplaces = [] } = useConnectedMarketplaces(organizationId);
    const { data: overview, isLoading } = useFinancialOverview(appliedDateRange, selectedMarketplaceDisplay, organizationId);
    const previousDateRange = useMemo(() => buildPreviousRange(appliedDateRange), [appliedDateRange]);
    const { data: previousOverview } = useFinancialOverview(previousDateRange, selectedMarketplaceDisplay, organizationId);

    const applyQuickRange = (key: "hoje" | "7dias" | "15dias" | "30dias" | "90dias" | "mesAtual") => {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        if (key === "hoje") {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            setTempDateRange({ from: startOfToday, to: endOfToday });
        } else if (key === "mesAtual") {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
            setTempDateRange({ from: startOfMonth, to: endOfToday });
        } else {
            const from = new Date(now);
            const days = key === "7dias" ? 6 : key === "15dias" ? 14 : key === "30dias" ? 29 : 89;
            from.setDate(from.getDate() - days);
            setTempDateRange({ from, to: endOfToday });
        }
        setActiveQuick(key);
    };

    const handleApply = () => {
        setAppliedDateRange(tempDateRange);
        setActiveQuick(null);
        setIsDatePopoverOpen(false);
    };

    return (
        <div>
            <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200/80 shadow-sm -mx-6 px-6 py-3 mb-5">
                <OverviewFilterBar
                    appliedDateRange={appliedDateRange}
                    tempDateRange={tempDateRange}
                    activeQuick={activeQuick}
                    isDatePopoverOpen={isDatePopoverOpen}
                    connectedMarketplaces={connectedMarketplaces}
                    selectedMarketplace={selectedMarketplace}
                    onOpenChange={(open) => {
                        setIsDatePopoverOpen(open);
                        if (open) setTempDateRange(appliedDateRange);
                    }}
                    onTempDateRangeChange={setTempDateRange}
                    onApply={handleApply}
                    onQuickRange={applyQuickRange}
                    onMarketplaceChange={setSelectedMarketplace}
                />
            </div>
            <FinanceiroOverviewCards
                overview={overview}
                isLoading={isLoading}
                growth={{
                    total_spent: pctChange(overview?.total_spent, previousOverview?.total_spent),
                    marketplace_fee: pctChange(overview?.marketplace_fee, previousOverview?.marketplace_fee),
                    shipping_cost: pctChange(overview?.shipping_cost, previousOverview?.shipping_cost),
                    product_cost: pctChange(overview?.product_cost, previousOverview?.product_cost),
                    net_revenue: pctChange(overview?.net_revenue, previousOverview?.net_revenue),
                }}
            />
        </div>
    );
}

const Desempenho = () => {
    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <GlobalHeader />
                    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-gray-200/80 shadow-sm">
                        <CleanNavigation items={navigationItems} basePath="/desempenho" />
                    </div>
                    <main className="flex-1 p-6 overflow-auto">
                        <Routes>
                            <Route path="" element={<VisaoGeral />} />
                            <Route path="/produtos" element={<PorProduto />} />
                            <Route path="/financeiro" element={<FinanceiroPage />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
};

export default Desempenho;