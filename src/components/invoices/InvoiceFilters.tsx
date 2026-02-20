import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InvoiceFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  selectedStatus: string;
  onStatusChange: (value: string) => void;
  placeholder?: string;
  showAddButton?: boolean;
}

export function InvoiceFilters({
  searchTerm,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  placeholder = "Buscar por número, tipo ou marketplace",
  showAddButton = false,
}: InvoiceFiltersProps) {
  return (
    <div className="flex items-center space-x-4">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={selectedStatus} onValueChange={onStatusChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os status</SelectItem>
          <SelectItem value="autorizada">Autorizada</SelectItem>
          <SelectItem value="pendente">Pendente</SelectItem>
          <SelectItem value="cancelada">Cancelada</SelectItem>
        </SelectContent>
      </Select>
      {showAddButton && (
        <Button className="bg-novura-primary hover:bg-novura-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Nova Nota Fiscal
        </Button>
      )}
    </div>
  );
}
