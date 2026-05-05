
import { Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategoryDropdown } from "./CategoryDropdown";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface ProductFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  categories: any[];
  selectedCategories: string[];
  onCategoriesChange: (categoryIds: string[]) => void;
  onAddCategory: (newCategory: { name: string; parent_id?: string }) => void;
  onUpdateCategory?: (categoryId: string, name: string) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onLinkCategory?: (categoryId: string, parentId: string | null) => void;
  placeholder?: string;
  selectedCount?: number;
  onBulkActionSelect?: (action: string) => void;
}

export function ProductFilters({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategories,
  onCategoriesChange,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onLinkCategory,
  placeholder = "Buscar produtos...",
  selectedCount = 0,
  onBulkActionSelect,
}: ProductFiltersProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-12 rounded-2xl border-0 bg-white pl-10 shadow-lg ring-1 ring-gray-200/60 focus-visible:ring-violet-500"
            />
          </div>
          <div className="min-w-[240px]">
            <CategoryDropdown
              categories={categories}
              selectedCategories={selectedCategories}
              onCategoriesChange={onCategoriesChange}
              onAddCategory={onAddCategory}
              onUpdateCategory={onUpdateCategory}
              onDeleteCategory={onDeleteCategory}
              onLinkCategory={onLinkCategory}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedCount <= 0}
                className="h-12 rounded-2xl border border-violet-300 bg-violet-50/50 px-3 text-violet-800 shadow-lg ring-1 ring-violet-200/70 hover:bg-violet-100/70 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
              >
                Ações em Massa
                <ChevronDown className="ml-1 w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => onBulkActionSelect?.("categorizar")}>Categorizar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkActionSelect?.("duplicar")}>Duplicar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onBulkActionSelect?.("transformar-em-kit")}>Transformar em Kit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={() => onBulkActionSelect?.("excluir-selecionado")}>Excluir selecionado</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </div>
    </div>
  );
}
