import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InvoiceFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedStatus: string;
  onStatusChange: (value: string) => void;
  selectedMarketplace: string;
  onMarketplaceChange: (value: string) => void;
  selectedTipo: string;
  onTipoChange: (value: string) => void;
  marketplaceOptions: string[];
  placeholder?: string;
  showAddButton?: boolean;
  showTipoFilter?: boolean;
}

export function InvoiceFilters({
  searchTerm,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  selectedMarketplace,
  onMarketplaceChange,
  selectedTipo,
  onTipoChange,
  marketplaceOptions,
  placeholder = "Buscar por número, tipo ou marketplace",
  showAddButton = false,
  showTipoFilter = true,
}: InvoiceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="relative w-full md:w-[360px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-12 w-full pl-10 pr-4 rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedStatus} onValueChange={onStatusChange}>
          <SelectTrigger className="h-12 w-[190px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="authorized">Autorizadas</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="processing">Processando</SelectItem>
            <SelectItem value="queued">Na fila</SelectItem>
            <SelectItem value="canceled">Canceladas</SelectItem>
            <SelectItem value="rejected">Rejeitadas</SelectItem>
            <SelectItem value="error">Com erro</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedMarketplace} onValueChange={onMarketplaceChange}>
          <SelectTrigger className="h-12 w-[190px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
            <SelectValue placeholder="Canal de venda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os canais</SelectItem>
            {marketplaceOptions.map((marketplace) => (
              <SelectItem key={marketplace} value={marketplace}>{marketplace}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showTipoFilter && (
          <Select value={selectedTipo} onValueChange={onTipoChange}>
            <SelectTrigger className="h-12 w-[170px] rounded-2xl border-0 bg-white shadow-lg ring-1 ring-gray-200/60">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="Saída">Saída</SelectItem>
              <SelectItem value="Entrada">Entrada</SelectItem>
              <SelectItem value="Compra">Compra</SelectItem>
            </SelectContent>
          </Select>
        )}

        {showAddButton && (
          <Button className="h-12 rounded-2xl bg-novura-primary hover:bg-novura-primary/90 shadow-lg">
            <Plus className="w-4 h-4 mr-2" />
            Nova Nota Fiscal
          </Button>
        )}
      </div>
    </div>
  );
}
