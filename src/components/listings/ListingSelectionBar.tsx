import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface ListingSelectionBarProps {
    activeStatus: string;
    // For listings
    isAllSelected: boolean;
    onToggleSelectAll: () => void;
    selectedCount: number;
    // For drafts
    isAllDraftsSelected: boolean;
    onToggleSelectAllDrafts: () => void;
    selectedDraftsCount: number;
    onBulkDeleteDrafts: () => void;
}

export function ListingSelectionBar({
    activeStatus,
    isAllSelected,
    onToggleSelectAll,
    selectedCount,
    isAllDraftsSelected,
    onToggleSelectAllDrafts,
    selectedDraftsCount,
    onBulkDeleteDrafts,
}: ListingSelectionBarProps) {
    if (activeStatus === 'rascunhos') {
        return (
            <>
                <label className="flex items-center space-x-2">
                    <Checkbox
                        size="sm"
                        indicatorStyle="square"
                        checked={isAllDraftsSelected}
                        onCheckedChange={onToggleSelectAllDrafts}
                    />
                    <span className="text-sm text-gray-700">Selecionar todos</span>
                </label>
                <div className="flex items-center gap-3">
                    {selectedDraftsCount > 0 && (
                        <span className="text-sm text-novura-primary">{selectedDraftsCount} selecionados</span>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-transparent p-0 h-auto"
                        disabled={selectedDraftsCount === 0}
                        onClick={onBulkDeleteDrafts}
                    >
                        Excluir selecionados
                    </Button>
                </div>
            </>
        );
    }

    return (
        <>
            <label className="flex items-center space-x-2">
                <Checkbox
                    size="sm"
                    indicatorStyle="square"
                    checked={isAllSelected}
                    onCheckedChange={onToggleSelectAll}
                />
                <span className="text-sm text-gray-700">Selecionar todos</span>
            </label>
            {selectedCount > 0 && (
                <span className="text-sm text-novura-primary">{selectedCount} selecionados</span>
            )}
        </>
    );
}
