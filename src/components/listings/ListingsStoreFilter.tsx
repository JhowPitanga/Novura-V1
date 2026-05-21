import { ChevronDown, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { MarketplaceStoreOption } from "@/services/listings.service";

interface ListingsStoreFilterProps {
    stores: MarketplaceStoreOption[];
    selectedIntegrationIds: Set<string>;
    onSelectedIntegrationIdsChange: (ids: Set<string>) => void;
}

function storeLabel(store: MarketplaceStoreOption): string {
    return store.store_name?.trim() || store.marketplace_name || "Loja";
}

function getTriggerLabel(
    stores: MarketplaceStoreOption[],
    selectedIntegrationIds: Set<string>,
): string {
    if (selectedIntegrationIds.size === 0) return "Todas as lojas";
    if (selectedIntegrationIds.size === 1) {
        const match = stores.find((s) => selectedIntegrationIds.has(s.id));
        return match ? storeLabel(match) : "1 loja";
    }
    return `${selectedIntegrationIds.size} lojas`;
}

export function ListingsStoreFilter({
    stores,
    selectedIntegrationIds,
    onSelectedIntegrationIdsChange,
}: ListingsStoreFilterProps) {
    if (stores.length === 0) return null;

    const allStores = selectedIntegrationIds.size === 0;
    const triggerLabel = getTriggerLabel(stores, selectedIntegrationIds);
    const isFiltering = selectedIntegrationIds.size > 0;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
                >
                    <Store className="w-4 h-4 mr-2 text-novura-primary" />
                    <span className="max-w-[160px] truncate">{triggerLabel}</span>
                    {isFiltering ? (
                        <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-novura-primary px-1.5 text-xs font-medium text-white">
                            {selectedIntegrationIds.size}
                        </span>
                    ) : null}
                    <ChevronDown className="w-4 h-4 ml-2 text-novura-primary" />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-64 rounded-2xl border-0 bg-white p-2 shadow-lg ring-1 ring-gray-200/60"
            >
                <div className="max-h-72 overflow-y-auto py-1">
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-novura-primary/5">
                        <Checkbox
                            checked={allStores}
                            onCheckedChange={() => onSelectedIntegrationIdsChange(new Set())}
                            className="border-gray-300 data-[state=checked]:bg-novura-primary data-[state=checked]:border-novura-primary"
                        />
                        <span className="text-sm font-medium text-gray-900">Todas as lojas</span>
                    </label>
                    <div className="my-1 h-px bg-gray-100" />
                    {stores.map((store) => {
                        const checked = selectedIntegrationIds.has(store.id);
                        return (
                            <label
                                key={store.id}
                                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-novura-primary/5"
                            >
                                <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) => {
                                        const next = new Set(selectedIntegrationIds);
                                        if (value === true) {
                                            next.add(store.id);
                                        } else {
                                            next.delete(store.id);
                                        }
                                        onSelectedIntegrationIdsChange(next);
                                    }}
                                    className="border-gray-300 data-[state=checked]:bg-novura-primary data-[state=checked]:border-novura-primary"
                                />
                                <span className="text-sm text-gray-800 truncate">{storeLabel(store)}</span>
                            </label>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}
