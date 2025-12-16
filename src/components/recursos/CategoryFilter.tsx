
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Category {
  id: string;
  nome: string;
  count: number;
  children?: Category[];
  subcategorias?: Category[];
}

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  className?: string;
}

export function CategoryFilter({ categories, activeCategory, onCategoryChange, className }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string>(activeCategory || "");

  const organized = (cats: Category[]) => {
    return cats.map(c => ({
      ...c,
      children: c.children || c.subcategorias || []
    }));
  };

  const selectedLabel =
    (categories.find(c => c.id === activeCategory)?.nome) || "Todas as categorias";

  return (
    <div className={`space-y-2 ${className || ""}`}>
      <h3 className="text-center text-base font-semibold">Categorias</h3>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setPending(activeCategory || ""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span>{selectedLabel}</span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-80 p-3">
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Selecionar categoria</div>
            <ScrollArea className="max-h-72 pr-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                  <Checkbox
                    checked={pending === ""}
                    onCheckedChange={(checked) => { if (checked) setPending(""); }}
                  />
                  <span className="text-sm">Todas as categorias</span>
                </div>
                {organized(categories).map((cat) => {
                  const children = cat.children || [];
                  return (
                    <div key={cat.id} className="px-2 py-1">
                      <div className="flex items-center gap-2 rounded hover:bg-gray-50">
                        <Checkbox
                          checked={pending === cat.id}
                          onCheckedChange={(checked) => { if (checked) setPending(cat.id); }}
                        />
                        <span className="text-sm font-medium">{cat.nome}</span>
                        <span className="ml-auto text-xs text-gray-500">{cat.count} itens</span>
                      </div>
                      {children.length > 0 && (
                        <div className="ml-6 mt-1 space-y-1">
                          {children.map((child) => (
                            <div key={child.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50">
                              <Checkbox
                                checked={pending === child.id}
                                onCheckedChange={(checked) => { if (checked) setPending(child.id); }}
                              />
                              <span className="text-sm">{child.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" size="sm" onClick={() => { setPending(activeCategory || ""); setOpen(false); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => { onCategoryChange(pending); setOpen(false); }}>
                Salvar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
