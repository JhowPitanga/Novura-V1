import { Search, Filter, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
    ListingsFilterDrawer,
    type ListingsFilterCounts,
} from "@/components/listings/ListingsFilterDrawer";
import { ListingsStoreFilter } from "@/components/listings/ListingsStoreFilter";
import type { MarketplaceStoreOption } from "@/services/listings.service";
import type { ListingAppliedFilters, SortKey, SortDir } from "@/types/listings";
import { countActiveListingFilters, hasActiveListingFilters } from "@/types/listings";

const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string }[] = [
    { key: "sales", dir: "desc", label: "Mais vendidos" },
    { key: "visits", dir: "desc", label: "Mais visitas" },
    { key: "price", dir: "desc", label: "Maior preço" },
    { key: "price", dir: "asc", label: "Menor preço" },
    { key: "quality", dir: "desc", label: "Maior qualidade" },
    { key: "stock", dir: "desc", label: "Maior estoque" },
    { key: "title", dir: "asc", label: "Título (A–Z)" },
];

interface ListingsToolbarProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    sortKey: SortKey;
    sortDir: SortDir;
    onSort: (key: SortKey, dir: SortDir) => void;
    appliedFilters: ListingAppliedFilters;
    draftFilters: ListingAppliedFilters;
    onDraftFiltersChange: (filters: ListingAppliedFilters) => void;
    filterDrawerOpen: boolean;
    onFilterDrawerOpenChange: (open: boolean) => void;
    onConfirmFilters: () => void;
    onClearFilters: () => void;
    filterCounts: ListingsFilterCounts;
    stores: MarketplaceStoreOption[];
    selectedIntegrationIds: Set<string>;
    onSelectedIntegrationIdsChange: (ids: Set<string>) => void;
    syncing: boolean;
    selectedCount: number;
    onSyncAll: () => void;
    onSyncSelected: () => void;
}

export function ListingsToolbar({
    searchTerm,
    onSearchChange,
    sortKey,
    sortDir,
    onSort,
    appliedFilters,
    draftFilters,
    onDraftFiltersChange,
    filterDrawerOpen,
    onFilterDrawerOpenChange,
    onConfirmFilters,
    onClearFilters,
    filterCounts,
    stores,
    selectedIntegrationIds,
    onSelectedIntegrationIdsChange,
    syncing,
    selectedCount,
    onSyncAll,
    onSyncSelected,
}: ListingsToolbarProps) {
    const activeSortLabel =
        SORT_OPTIONS.find((o) => o.key === sortKey && o.dir === sortDir)?.label ?? "Ordenar";
    const activeFilterCount = countActiveListingFilters(appliedFilters);
    const showClearFilters = hasActiveListingFilters(appliedFilters);

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-4 w-full mb-6">
                <div className="relative w-full md:w-1/3 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <Input
                        placeholder="Buscar por título, SKU ou ID do anúncio..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <ListingsStoreFilter
                        stores={stores}
                        selectedIntegrationIds={selectedIntegrationIds}
                        onSelectedIntegrationIdsChange={onSelectedIntegrationIdsChange}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                        onClick={() => onFilterDrawerOpenChange(true)}
                    >
                        <Filter className="w-4 h-4 mr-2 text-novura-primary" />
                        Filtros
                        {activeFilterCount > 0 ? (
                            <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-novura-primary px-1.5 text-xs font-medium text-white">
                                {activeFilterCount}
                            </span>
                        ) : null}
                    </Button>
                    {showClearFilters ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="h-12 px-4 rounded-2xl border-novura-primary text-novura-primary bg-novura-primary/5 hover:bg-novura-primary/10"
                            onClick={onClearFilters}
                        >
                            Limpar filtros
                        </Button>
                    ) : null}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 text-novura-primary"
                            >
                                {sortDir === "asc" ? (
                                    <ChevronUp className="w-4 h-4 mr-2" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 mr-2" />
                                )}
                                {activeSortLabel}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {SORT_OPTIONS.map((opt) => (
                                <DropdownMenuItem
                                    key={`${opt.key}-${opt.dir}`}
                                    className={
                                        sortKey === opt.key && sortDir === opt.dir
                                            ? "text-novura-primary font-medium"
                                            : ""
                                    }
                                    onSelect={(e) => {
                                        e.preventDefault();
                                        onSort(opt.key, opt.dir);
                                    }}
                                >
                                    {opt.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                                disabled={syncing}
                            >
                                {syncing ? "Sincronizando..." : "Sincronizar"}
                                <ChevronDown className="w-4 h-4 ml-2 text-novura-primary" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    onSyncAll();
                                }}
                            >
                                Sincronizar todos anúncios
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    onSyncSelected();
                                }}
                                disabled={selectedCount === 0}
                            >
                                Sincronizar selecionados ({selectedCount})
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <ListingsFilterDrawer
                open={filterDrawerOpen}
                onOpenChange={onFilterDrawerOpenChange}
                draft={draftFilters}
                onDraftChange={onDraftFiltersChange}
                onConfirm={onConfirmFilters}
                counts={filterCounts}
            />
        </>
    );
}
