
import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategoryDropdown } from "./CategoryDropdown";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ProductFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  categories: any[];
  selectedCategory: string;
  onCategoryChange: (categoryId: string) => void;
  onAddCategory: (newCategory: { name: string; parent_id?: string }) => void;
  onUpdateCategory?: (categoryId: string, name: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  placeholder?: string;
  selectedCount?: number;
  onBulkActionSelect?: (action: string) => void;
}

export function ProductFilters({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  placeholder = "Buscar produtos...",
  selectedCount = 0,
  onBulkActionSelect
}: ProductFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>
      <div className="flex items-center gap-0">
        <div className="min-w-[180px]">
          <CategoryDropdown
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={onCategoryChange}
            onAddCategory={onAddCategory}
            onUpdateCategory={onUpdateCategory}
            onDeleteCategory={onDeleteCategory}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={selectedCount <= 0} className="gap-1 px-3">
              Ações em Massa
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onBulkActionSelect?.("categorizar")}>Categorizar</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => onBulkActionSelect?.("excluir-selecionado")}>Excluir selecionado</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
