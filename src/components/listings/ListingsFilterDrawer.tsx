import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
    Drawer,
    DrawerContent,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import type {
    ListingAppliedFilters,
    ListingLinkFilter,
    ListingLogisticFilter,
    ListingStatusFilter,
    ListingStockFilter,
} from "@/types/listings";

function FilterChip({
    active,
    label,
    count,
    onClick,
}: {
    active: boolean;
    label: string;
    count?: number;
    onClick: () => void;
}) {
    return (
        <Button
            type="button"
            variant="outline"
            className={`h-9 rounded-full px-3 ${
                active
                    ? "border-novura-primary text-novura-primary bg-novura-primary/5"
                    : "border-gray-200 text-gray-700 bg-white"
            }`}
            onClick={onClick}
        >
            {label}
            {typeof count === "number" ? ` (${count})` : ""}
        </Button>
    );
}

function FilterSection({
    title,
    children,
}: {
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <div className="flex flex-wrap gap-2">{children}</div>
        </div>
    );
}

const LOGISTIC_OPTIONS: { id: ListingLogisticFilter; label: string }[] = [
    { id: "full", label: "Full" },
    { id: "flex", label: "Flex" },
    { id: "envios", label: "Envios" },
    { id: "correios", label: "Correios" },
    { id: "xpress", label: "Xpress" },
    { id: "retire", label: "Retirada" },
];

const STATUS_OPTIONS: { id: ListingStatusFilter; label: string }[] = [
    { id: "active", label: "Ativo" },
    { id: "inactive", label: "Inativo" },
];

const STOCK_OPTIONS: { id: ListingStockFilter; label: string }[] = [
    { id: "out_of_stock", label: "Sem estoque" },
];

const LINK_OPTIONS: { id: ListingLinkFilter; label: string }[] = [
    { id: "linked", label: "Vinculados" },
    { id: "unlinked", label: "Não vinculados" },
];

export interface ListingsFilterCounts {
    logistic: Record<Exclude<ListingLogisticFilter, "all">, number>;
    link: Record<Exclude<ListingLinkFilter, "all">, number>;
    status: Record<Exclude<ListingStatusFilter, "all">, number>;
    stock: Record<Exclude<ListingStockFilter, "all">, number>;
}

interface ListingsFilterDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    draft: ListingAppliedFilters;
    onDraftChange: (filters: ListingAppliedFilters) => void;
    onConfirm: () => void;
    counts: ListingsFilterCounts;
}

export function ListingsFilterDrawer({
    open,
    onOpenChange,
    draft,
    onDraftChange,
    onConfirm,
    counts,
}: ListingsFilterDrawerProps) {
    const toggleLogistic = (id: ListingLogisticFilter) => {
        onDraftChange({
            ...draft,
            logistic: draft.logistic === id ? "all" : id,
        });
    };

    const toggleLink = (id: ListingLinkFilter) => {
        onDraftChange({
            ...draft,
            link: draft.link === id ? "all" : id,
        });
    };

    const toggleStatus = (id: ListingStatusFilter) => {
        onDraftChange({
            ...draft,
            status: draft.status === id ? "all" : id,
        });
    };

    const toggleStock = (id: ListingStockFilter) => {
        onDraftChange({
            ...draft,
            stock: draft.stock === id ? "all" : id,
        });
    };

    return (
        <Drawer open={open} onOpenChange={onOpenChange} direction="right">
            <DrawerContent className="h-full w-full max-w-md fixed right-0">
                <DrawerHeader className="text-left border-b border-gray-100 pb-4">
                    <DrawerTitle>Filtros de anúncios</DrawerTitle>
                    <p className="text-sm text-gray-500 font-normal">
                        Selecione os critérios e confirme para aplicar à lista.
                    </p>
                </DrawerHeader>

                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                    <FilterSection title="Logística">
                        {LOGISTIC_OPTIONS.map((f) => (
                            <FilterChip
                                key={f.id}
                                active={draft.logistic === f.id}
                                label={f.label}
                                count={counts.logistic[f.id]}
                                onClick={() => toggleLogistic(f.id)}
                            />
                        ))}
                    </FilterSection>

                    <FilterSection title="Status">
                        {STATUS_OPTIONS.map((f) => (
                            <FilterChip
                                key={f.id}
                                active={draft.status === f.id}
                                label={f.label}
                                count={counts.status[f.id]}
                                onClick={() => toggleStatus(f.id)}
                            />
                        ))}
                    </FilterSection>

                    <FilterSection title="Estoque">
                        {STOCK_OPTIONS.map((f) => (
                            <FilterChip
                                key={f.id}
                                active={draft.stock === f.id}
                                label={f.label}
                                count={counts.stock[f.id]}
                                onClick={() => toggleStock(f.id)}
                            />
                        ))}
                    </FilterSection>

                    <FilterSection title="Produto">
                        {LINK_OPTIONS.map((f) => (
                            <FilterChip
                                key={f.id}
                                active={draft.link === f.id}
                                label={f.label}
                                count={counts.link[f.id]}
                                onClick={() => toggleLink(f.id)}
                            />
                        ))}
                    </FilterSection>
                </div>

                <DrawerFooter className="flex-row justify-end gap-2 border-t border-gray-100">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button
                        className="bg-novura-primary hover:bg-novura-primary/90"
                        onClick={onConfirm}
                    >
                        Confirmar filtros
                    </Button>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    );
}
