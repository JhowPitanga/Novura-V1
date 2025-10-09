
import { useEffect, useState } from "react";
import { ProductFilters } from "../ProductFilters";
import { KitsAccordion } from "../KitsAccordion";
import { useCategories } from "@/hooks/useCategories";
import { useKits } from "@/hooks/useKits";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function ProdutosKits() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const { categories, createCategory } = useCategories();
  const { kits, loading } = useKits();
  const [list, setList] = useState<any[]>([]);
  const [confirmDeleteOpen1, setConfirmDeleteOpen1] = useState(false);
  const [confirmDeleteOpen2, setConfirmDeleteOpen2] = useState(false);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [targetCategory, setTargetCategory] = useState<string>("");

  useEffect(() => {
    setList(kits || []);
  }, [kits]);
  
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  const handleAddCategory = async (newCategory: { name: string; parent_id?: string }) => {
    try {
      await createCategory(newCategory.name);
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  // Filtrar kits pela categoria selecionada e termo de busca
  const filteredKits = (list || [])
    .filter(kit => {
      if (!selectedCategory) return true;
      return kit.category_id === selectedCategory;
    })
    .filter(kit => {
      if (!searchTerm) return true;
      return (
        kit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        kit.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  
  return (
    <div className="space-y-6">
      <ProductFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        categories={categories.map(cat => ({ id: cat.id, name: cat.name, children: [] }))}
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        onAddCategory={handleAddCategory}
        placeholder="Buscar kits..."
        selectedCount={selectedIds.length}
        onBulkActionSelect={(action) => {
          if (action === "excluir-selecionado") {
            setConfirmDeleteOpen1(true);
          }
          if (action === "categorizar") {
            setTargetCategory("");
            setCategorizeOpen(true);
          }
        }}
      />

      <KitsAccordion
        kits={filteredKits}
        loading={loading}
        selectedIds={selectedIds}
        onToggleSelect={(kitId, checked) => {
          setSelectedIds(prev => (checked ? [...prev, kitId] : prev.filter(id => id !== kitId)));
        }}
      />

      {/* Confirmação em duas etapas para exclusão em massa */}
      <AlertDialog open={confirmDeleteOpen1} onOpenChange={setConfirmDeleteOpen1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedIds.length} kit(s). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDeleteOpen1(false); setConfirmDeleteOpen2(true); }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteOpen2} onOpenChange={setConfirmDeleteOpen2}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão permanente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza absoluta? Os kits selecionados serão removidos da listagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                for (const id of selectedIds) {
                  try {
                    await supabase.from('products').delete().eq('id', id);
                  } catch (e) {
                    // ignore errors; local update below
                  }
                  setList((prev) => prev.filter((p) => p.id !== id));
                }
                setSelectedIds([]);
                setConfirmDeleteOpen2(false);
              }}
            >
              Excluir selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para Categorizar selecionados */}
      <Dialog open={categorizeOpen} onOpenChange={setCategorizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Categorizar selecionados</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={targetCategory} onValueChange={setTargetCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCategorizeOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  if (!targetCategory) return;
                  setList((prev) => prev.map((p) => selectedIds.includes(p.id) ? { ...p, category_id: targetCategory } : p));
                  setCategorizeOpen(false);
                }}
                disabled={!targetCategory}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
