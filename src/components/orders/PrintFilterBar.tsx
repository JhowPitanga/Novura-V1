import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileBadge, ListChecks, Scan, Search, Settings } from "lucide-react";
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

interface PrintFilterBarProps {
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
  selectedPedidosImpressao: string[];
  pedidos: any[];
  onPrintLabels: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PrintFilterBar({
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
  selectedPedidosImpressao,
  pedidos,
  onPrintLabels,
  currentPage,
  totalPages,
  onPageChange,
}: PrintFilterBarProps) {
  const impressaoPedidos = baseFiltered.filter(p => matchStatus(p, 'impressao'));

  const marketplaceOptions = (() => {
    const mkSet = new Set<string>();
    impressaoPedidos.forEach(p => {
      const id = normalizeMarketplaceId(String(p.marketplace || ''));
      if (id) mkSet.add(id);
    });
    return Array.from(mkSet);
  })();

  const shippingTypeOptions = (() => {
    const shSet = new Set<string>();
    impressaoPedidos.forEach(p => {
      const id = normalizeShippingType(String(p?.tipoEnvio ?? ''));
      if (id) shSet.add(id);
    });
    return Array.from(shSet);
  })();

  const hasLabelData = selectedPedidosImpressao.length > 0 && selectedPedidosImpressao.some(id => {
    const p = pedidos.find(pp => pp.id === id);
    return Boolean(p?.label?.pdf_base64 || p?.label?.content_base64 || p?.label?.zpl2_base64);
  });

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
      <div className="flex items-center gap-4 flex-wrap">
        {/* Ordenação específica da aba Impressão */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="link"
              className="h-12 px-0 text-purple-600 hover:text-purple-700 no-underline"
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
              className={sortKey === 'sla' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('sla'); onSortDirChange('asc'); }}
            >
              SLA próximo
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortKey === 'recent' ? 'text-novura-primary font-medium' : ''}
              onSelect={(e) => { e.preventDefault(); onSortKeyChange('recent'); onSortDirChange('desc'); }}
            >
              Mais recente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Filtro Marketplace */}
        <div className="w-[200px]">
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
        {/* Filtro Tipo de Envio */}
        <div className="w-[200px]">
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
        <div className="relative">
          <Button
            size="icon"
            className="h-12 w-12 rounded-2xl bg-primary text-white shadow-lg disabled:opacity-50 disabled:pointer-events-none"
            disabled
            aria-label="Lista de separação (Em breve)"
          >
            <ListChecks className="w-5 h-5" />
          </Button>
          <span className="absolute -top-1 -right-1 text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-700">Em breve</span>
        </div>
        <Button
          size="icon"
          className={`h-12 w-12 rounded-2xl ${hasLabelData ? 'bg-primary text-white' : 'bg-gray-300 text-gray-600'} shadow-lg disabled:opacity-50 disabled:pointer-events-none`}
          onClick={onPrintLabels}
          disabled={!hasLabelData}
          aria-label={`Imprimir etiquetas (${selectedPedidosImpressao.length})`}
        >
          <FileBadge className="w-5 h-5" />
        </Button>
        <div className="relative">
          <Button size="icon" variant="outline" className="h-12 w-12 rounded-2xl bg-white text-gray-800 shadow-lg ring-1 ring-gray-200/60" disabled aria-label="Scanner (Em breve)">
            <Scan className="w-5 h-5" />
          </Button>
          <span className="absolute -top-1 -right-1 text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-700">Em breve</span>
        </div>
        <div className="relative">
          <Button variant="outline" size="icon" className="rounded-2xl" disabled aria-label="Configurações (Em breve)">
            <Settings className="w-4 h-4" />
          </Button>
          <span className="absolute -top-1 -right-1 text-[10px] px-1 py-0.5 rounded bg-gray-200 text-gray-700">Em breve</span>
        </div>
        <div className="flex items-center gap-0.5 select-none">
          <Button
            variant="outline"
            className={`h-10 w-8 p-0 rounded-2xl ${currentPage > 1 ? 'text-primary' : 'text-gray-300'}`}
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium w-[40px] text-center">{currentPage}/{totalPages}</div>
          <Button
            variant="outline"
            className={`h-10 w-8 p-0 rounded-2xl ${currentPage < totalPages ? 'text-primary' : 'text-gray-300'}`}
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            aria-label="Próxima página"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
