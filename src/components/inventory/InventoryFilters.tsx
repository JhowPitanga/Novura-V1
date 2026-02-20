
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin } from "lucide-react";
import { useStorage } from "@/hooks/useStorage";

interface EstoqueFiltersProps {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedGalpao: string;
  setSelectedGalpao: (value: string) => void;
}

export function InventoryFilters({
  searchTerm,
  setSearchTerm,
  selectedGalpao,
  setSelectedGalpao
}: EstoqueFiltersProps) {
  const { storageLocations, loading: storageLoading } = useStorage();

  return (
    <div className="flex items-center space-x-4 mt-6 mb-6">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Buscar por SKU, nome do produto ou EAN..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>
      <Select value={selectedGalpao} onValueChange={setSelectedGalpao}>
        <SelectTrigger className="w-48">
          <MapPin className="w-4 h-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos os Galpões</SelectItem>
          {!storageLoading && storageLocations.map((storage) => (
            <SelectItem key={storage.id} value={storage.name}>
              {storage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
