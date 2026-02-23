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
    useListingsRanking,
    useProductPerformance,
} from "@/hooks/usePerformance";
import { toDisplayMarketplaceName } from "@/services/performance.service";
import { OverviewFilterBar } from "@/components/performance/OverviewFilterBar";
import { MetricCardsGrid } from "@/components/performance/MetricCardsGrid";
import { SalesChart } from "@/components/performance/SalesChart";
import { SalesSourceSection } from "@/components/performance/SalesSourceSection";
import { ListingsRankingTable } from "@/components/performance/ListingsRankingTable";
import { ProductPerformanceTable } from "@/components/performance/ProductPerformanceTable";

const navigationItems = [
    { title: "Visão Geral", path: "", description: "Métricas principais" },
    { title: "Por Produto", path: "/produtos", description: "Desempenho individual" },
];

function buildDefaultRange(): DateRange {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return { from, to: now };
}

function VisaoGeral() {
    const { organizationId } = useAuth();
    const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [tempDateRange, setTempDateRange] = useState<DateRange | undefined>(buildDefaultRange);
    const [activeQuick, setActiveQuick] = useState<"hoje" | "7dias" | "30dias" | null>("7dias");
    const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
    const [selectedMarketplace, setSelectedMarketplace] = useState("todos");
    const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["vendas"]);

    const selectedMarketplaceDisplay = useMemo(() => {
        if (!selectedMarketplace || selectedMarketplace === 'todos') return 'todos';
        return toDisplayMarketplaceName(selectedMarketplace);
    }, [selectedMarketplace]);

    const { data: connectedMarketplaces = [] } = useConnectedMarketplaces(organizationId);
    const { data: metricsData } = useOrdersMetrics(appliedDateRange, selectedMarketplaceDisplay, organizationId);
    const { data: topListings = [], isLoading: loadingTop } = useListingsRanking(appliedDateRange, selectedMarketplaceDisplay, organizationId);

    const totals = metricsData?.totals ?? { vendas: 0, unidades: 0, pedidos: 0, ticketMedio: 0 };
    const series = metricsData?.series ?? [];
    const salesSources = (metricsData?.byMarketplace ?? []).map((m) => ({ name: m.marketplace, value: m.total }));

    const isSingleDay =
        !!appliedDateRange?.from &&
        !!appliedDateRange?.to &&
        appliedDateRange.from.toDateString() === appliedDateRange.to.toDateString();

    const applyQuickRange = (key: "hoje" | "7dias" | "30dias") => {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        if (key === "hoje") {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            setTempDateRange({ from: startOfToday, to: endOfToday });
        } else {
            const from = new Date(now);
            from.setDate(from.getDate() - (key === "7dias" ? 6 : 29));
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
        setSelectedMetrics((prev) => prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]);

    return (
        <div className="space-y-6">
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
            <MetricCardsGrid totals={totals} selectedMetrics={selectedMetrics} onToggle={toggleMetric} />
            <SalesChart series={series} selectedMetrics={selectedMetrics} isSingleDay={isSingleDay} />
            <SalesSourceSection salesSources={salesSources} />
            <ListingsRankingTable listings={topListings} isLoading={loadingTop} />
        </div>
    );
}

function PorProduto() {
    const { organizationId } = useAuth();
    const [activeTab, setActiveTab] = useState("produtos");
    const [selectedMarketplace, setSelectedMarketplace] = useState("todos");
    const { data, isLoading } = useProductPerformance(organizationId);

    return (
        <ProductPerformanceTable
            activeTab={activeTab}
            onTabChange={setActiveTab}
            produtosData={data?.produtosData ?? []}
            anunciosData={data?.anunciosData ?? []}
            productModelsByProduct={data?.productModelsByProduct ?? {}}
            isLoading={isLoading}
            selectedMarketplace={selectedMarketplace}
            onMarketplaceChange={setSelectedMarketplace}
        />
    );
}

const Desempenho = () => {
    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full bg-gray-50">
                <AppSidebar />
                <div className="flex-1 flex flex-col">
                    <GlobalHeader />
                    <CleanNavigation items={navigationItems} basePath="/desempenho" />
                    <main className="flex-1 p-6 overflow-auto">
                        <Routes>
                            <Route path="" element={<VisaoGeral />} />
                            <Route path="/produtos" element={<PorProduto />} />
                        </Routes>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
};

export default Desempenho;
