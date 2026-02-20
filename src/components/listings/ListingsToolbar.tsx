import { Plus, Search, Filter, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { SortKey, SortDir } from "@/types/listings";

interface ListingsToolbarProps {
    searchTerm: string;
    onSearchChange: (term: string) => void;
    sortKey: SortKey;
    sortDir: SortDir;
    onSort: (key: SortKey, dir: SortDir) => void;
    syncing: boolean;
    selectedCount: number;
    onSyncAll: () => void;
    onSyncSelected: () => void;
    onCreateListing: () => void;
}

export function ListingsToolbar({
    searchTerm,
    onSearchChange,
    sortKey,
    sortDir,
    onSort,
    syncing,
    selectedCount,
    onSyncAll,
    onSyncSelected,
    onCreateListing,
}: ListingsToolbarProps) {
    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder="Buscar por título, SKU ou ID do anúncio..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 min-w-[300px]"
                    />
                </div>
                <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filtros
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="text-novura-primary">
                            {sortDir === 'asc'
                                ? <ChevronUp className="w-4 h-4 mr-2 text-novura-primary" />
                                : <ChevronDown className="w-4 h-4 mr-2 text-novura-primary" />}
                            Ordenar
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        <DropdownMenuItem
                            className={sortKey === 'sales' ? 'text-novura-primary font-medium' : ''}
                            onSelect={(e) => { e.preventDefault(); onSort('sales', 'desc'); }}
                        >
                            Mais vendidos
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={sortKey === 'visits' ? 'text-novura-primary font-medium' : ''}
                            onSelect={(e) => { e.preventDefault(); onSort('visits', 'desc'); }}
                        >
                            Mais visitas
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={sortKey === 'price' ? 'text-novura-primary font-medium' : ''}
                            onSelect={(e) => { e.preventDefault(); onSort('price', 'desc'); }}
                        >
                            Maior preço
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={sortKey === 'quality' ? 'text-novura-primary font-medium' : ''}
                            onSelect={(e) => { e.preventDefault(); onSort('quality', 'desc'); }}
                        >
                            Maior qualidade
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={sortKey === 'margin' ? 'text-novura-primary font-medium' : ''}
                            onSelect={(e) => { e.preventDefault(); onSort('margin', 'desc'); }}
                        >
                            Maior margem
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="flex items-center space-x-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="bg-white text-novura-primary border-gray-300" disabled={syncing}>
                            {syncing ? 'Sincronizando...' : 'Sincronizar'}
                            <ChevronDown className="w-4 h-4 ml-2 text-novura-primary" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onSyncAll(); }}>
                            Sincronizar todos anúncios
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={(e) => { e.preventDefault(); onSyncSelected(); }}
                            disabled={selectedCount === 0}
                        >
                            Sincronizar selecionados ({selectedCount})
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button className="bg-novura-primary hover:bg-novura-primary/90" onClick={onCreateListing}>
                    <Plus className="w-4 h-4 mr-2" />
                    Criar um anúncio
                </Button>
            </div>
        </div>
    );
}
