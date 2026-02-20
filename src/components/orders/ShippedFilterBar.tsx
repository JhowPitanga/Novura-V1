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
import { formatMarketplaceLabel, mapTipoEnvioLabel, normalizeMarketplaceId, normalizeShippingType } from "@/utils/orderUtils";

interface ShippedFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  sortKey: string;
  sortDir: string;
  onSortKeyChange: (v: string) => void;
  onSortDirChange: (v: string) => void;
  marketplaceFilter: string;
  onMarketplaceFilterChange: (v: string) => void;
  shippingTypeFilter: string;
  onShippingTypeFilterChange: (v: string) => void;
  baseFiltered: any[];
  matchStatus: (p: any, status: string) => boolean;
}

export function ShippedFilterBar({
  searchTerm,
  onSearchTermChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirChange,
  marketplaceFilter,
  onMarketplaceFilterChange,
  shippingTypeFilter,
  onShippingTypeFilterChange,
  baseFiltered,
  matchStatus,
}: ShippedFilterBarProps) {
  const enviadoPedidos = baseFiltered.filter(p => matchStatus(p, 'enviado'));

  const marketplaceOptions = (() => {
    const mkSet = new Set<string>();
    enviadoPedidos.forEach(p => {
      const id = normalizeMarketplaceId(String(p.marketplace || ''));
      if (id) mkSet.add(id);
    });
    return Array.from(mkSet);
  })();

  const shippingTypeOptions = (() => {
    const shSet = new Set<string>();
    enviadoPedidos.forEach(p => {
      const id = normalizeShippingType(String(p?.tipoEnvio ?? ''));
      if (id) shSet.add(id);
    });
    return Array.from(shSet);
  })();

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
        {/* Ordenação para Enviado */}
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
              className={sortKey === 'shipping' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('shipping'); onSortDirChange('asc'); }}
            >
              Tipo de envio
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('recent'); onSortDirChange('desc'); }}
            >
              Mais recente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Filtro Marketplace (aba Enviado) */}
        <div className="w-[140px]">
          <Select value={marketplaceFilter} onValueChange={onMarketplaceFilterChange}>
            <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
              <span className={`text-sm ${marketplaceFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                {marketplaceFilter === 'all' ? 'Marketplace' : formatMarketplaceLabel(marketplaceFilter)}
              </span>
              <span className="sr-only">
                <SelectValue placeholder="Marketplace" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {marketplaceOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{formatMarketplaceLabel(opt)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Filtro Tipo de Envio (aba Enviado) */}
        <div className="w-[140px]">
          <Select value={shippingTypeFilter} onValueChange={onShippingTypeFilterChange}>
            <SelectTrigger className="h-12 px-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60 justify-between">
              <span className={`text-sm ${shippingTypeFilter === 'all' ? 'text-gray-500' : 'text-gray-900'}`}>
                {shippingTypeFilter === 'all'
                  ? 'Tipo de Envio'
                  : mapTipoEnvioLabel(shippingTypeFilter)}
              </span>
              <span className="sr-only">
                <SelectValue placeholder="Tipo de envio" />
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {shippingTypeOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>{mapTipoEnvioLabel(opt)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
