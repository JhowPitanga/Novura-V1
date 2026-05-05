import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePerformanceFilters } from "@/hooks/usePerformanceFilters";
import {
    useConnectedMarketplaces,
    useAbcProducts,
    useAbcListings,
    useProductSalesBreakdown,
    useProductPerformance,
    useListingsSold,
} from "@/hooks/usePerformance";
import { toDisplayMarketplaceName } from "@/services/performance.service";
import type { AbcCriterion, AbcTag, SoldListing } from "@/services/performance.service";
import { computeAbc } from "@/utils/abc";
import { AbcCurveSection } from "@/components/performance/AbcCurveSection";
import { ProductPerformanceFilterBar } from "./ProductPerformanceFilterBar";
import { ProductsSubTab } from "./ProductsSubTab";
import { AnunciosSubTab } from "./AnunciosSubTab";

const SUB_TABS = [
    { key: "produtos", label: "Produtos" },
    { key: "anuncios", label: "Anúncios" },
] as const;

export function PorProduto() {
    const { organizationId } = useAuth();
    const [activeTab, setActiveTab] = useState<"produtos" | "anuncios">("produtos");
    const [abcCriterion, setAbcCriterion] = useState<AbcCriterion>("valor");
    const [selectedAbcTag, setSelectedAbcTag] = useState<AbcTag | null>(null);

    const {
        dateRange, tempDateRange, marketplace, searchTerm, activeQuick, isDateOpen,
        setTempDateRange, setMarketplace, setSearchTerm, applyQuickRange, handleApply, handleOpenChange,
    } = usePerformanceFilters();

    const marketplaceDisplay = marketplace === "todos" ? "todos" : toDisplayMarketplaceName(marketplace);

    const { data: connectedMarketplaces = [] } = useConnectedMarketplaces(organizationId);
    const { data: abcProducts = [], isLoading: loadingProducts } = useAbcProducts(dateRange, marketplaceDisplay, organizationId, abcCriterion);
    const { data: abcListings = [] } = useAbcListings(dateRange, marketplaceDisplay, organizationId, abcCriterion);
    const { data: soldListings = [], isLoading: loadingSoldListings } = useListingsSold(dateRange, marketplaceDisplay, organizationId);
    const { data: channelMixes = [] } = useProductSalesBreakdown(dateRange, marketplaceDisplay, organizationId);
    const { data: ppData, isLoading: loadingPP } = useProductPerformance(organizationId, dateRange, marketplaceDisplay);

    const productModelsByProduct = ppData?.productModelsByProduct ?? {};

    const linkedProducts = useMemo(
        () => abcProducts.filter((product) => !String(product.id || "").startsWith("item:")),
        [abcProducts],
    );

    const scoredListings = useMemo<SoldListing[]>(() => {
        const abcRows = computeAbc(
            soldListings.map((listing) => ({
                id: listing.id,
                label: listing.titulo,
                valor: listing.valor,
                unidades: listing.unidades,
            })),
            abcCriterion,
        );
        const abcById = Object.fromEntries(abcRows.map((row) => [row.id, row]));

        return soldListings
            .map((listing) => {
                const abc = abcById[listing.id];
                return {
                    ...listing,
                    pct: abc?.pct ?? 0,
                    cum_pct: abc?.cum_pct ?? 0,
                    tag: abc?.tag ?? "C",
                };
            })
            .sort((a, b) => (abcCriterion === "valor" ? b.valor - a.valor : b.unidades - a.unidades));
    }, [soldListings, abcCriterion]);

    const summaryRows = activeTab === "produtos" ? linkedProducts : scoredListings;
    const filteredProducts = selectedAbcTag
        ? linkedProducts.filter((product) => product.tag === selectedAbcTag)
        : linkedProducts;
    const filteredListings = selectedAbcTag
        ? scoredListings.filter((listing) => listing.tag === selectedAbcTag)
        : scoredListings;

    return (
        <div className="space-y-5">
            <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200/80 shadow-sm -mx-6 px-6 py-3">
                <ProductPerformanceFilterBar
                    appliedDateRange={dateRange}
                    tempDateRange={tempDateRange}
                    activeQuick={activeQuick}
                    isDateOpen={isDateOpen}
                    connectedMarketplaces={connectedMarketplaces}
                    marketplace={marketplace}
                    searchTerm={searchTerm}
                    onOpenChange={handleOpenChange}
                    onTempDateRangeChange={setTempDateRange}
                    onApply={handleApply}
                    onQuickRange={applyQuickRange}
                    onMarketplaceChange={setMarketplace}
                    onSearchChange={setSearchTerm}
                />
            </div>

            <AbcCurveSection
                rows={summaryRows}
                isLoading={activeTab === "produtos" ? loadingProducts : loadingSoldListings}
                criterion={abcCriterion}
                onCriterionChange={setAbcCriterion}
                selectedTag={selectedAbcTag}
                onSelectedTagChange={setSelectedAbcTag}
                subjectLabel={activeTab === "produtos" ? "produtos" : "anúncios"}
            />

            {/* Sub-tabs */}
            <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
                {SUB_TABS.map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`rounded-xl px-5 py-2 text-sm font-medium transition-all ${
                            activeTab === t.key
                                ? "bg-violet-600 text-white shadow-sm"
                                : "text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === "produtos" ? (
                <ProductsSubTab
                    products={filteredProducts}
                    allListings={abcListings}
                    channelMixes={channelMixes}
                    productModelsByProduct={productModelsByProduct}
                    isLoading={loadingProducts || loadingPP}
                    searchTerm={searchTerm}
                />
            ) : (
                <AnunciosSubTab
                    listings={filteredListings}
                    isLoading={loadingSoldListings}
                    searchTerm={searchTerm}
                />
            )}
        </div>
    );
}
