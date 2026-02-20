import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface CanceledFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  sortKey: string;
  sortDir: string;
  onSortKeyChange: (v: string) => void;
  onSortDirChange: (v: string) => void;
  marketplaceFilter: string;
  onMarketplaceFilterChange: (v: string) => void;
}

export function CanceledFilterBar({
  searchTerm,
  onSearchTermChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  marketplaceFilter,
  onMarketplaceFilterChange,
}: CanceledFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6 w-full">
      <div className="relative w-full md:w-1/4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder="Buscar por ID, cliente, SKU ou produto..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
        />
      </div>
      <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
            >
              {sortDir === 'asc' ? (
                <ChevronUp className="w-4 h-4 mr-2" />
              ) : (
                <ChevronDown className="w-4 h-4 mr-2" />
              )}
              Ordenar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('recent'); onSortDirChange('desc'); }}
            >
              Mais recente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-[160px]">
          <Select value={marketplaceFilter} onValueChange={onMarketplaceFilterChange}>
            <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
              <span className={`text-sm ${marketplaceFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                {marketplaceFilter !== 'all' ? (marketplaceFilter === 'mercado-livre' ? 'Mercado Livre' : '') : 'Marketplace'}
              </span>
              <span className="sr-only">
                <SelectValue placeholder="Marketplace" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mercado-livre">Mercado Livre</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
