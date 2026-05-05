
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CategoryTreeSelect } from "../CategoryTreeSelect";

export function ProdutosKits() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { categories, createCategory, linkCategory } = useCategories();
  const { kits, loading, deleteKit } = useKits();
  const [list, setList] = useState<any[]>([]);
  const [confirmDeleteOpen1, setConfirmDeleteOpen1] = useState(false);
  const [confirmDeleteOpen2, setConfirmDeleteOpen2] = useState(false);
  const [singleDeleteOpen1, setSingleDeleteOpen1] = useState(false);
  const [singleDeleteOpen2, setSingleDeleteOpen2] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [targetCategory, setTargetCategory] = useState<string>("");

  useEffect(() => {
    setList(kits || []);
  }, [kits]);
  
  const handleCategoriesChange = (categoryIds: string[]) => {
    setSelectedCategories(Array.isArray(categoryIds) ? categoryIds : []);
  };

  const handleAddCategory = async (newCategory: { name: string; parent_id?: string }) => {
    try {
      await createCategory(newCategory.name);
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };
 
  const handleLinkCategory = async (categoryId: string, parentId: string | null) => {
    try {
      await linkCategory(categoryId, parentId);
    } catch (error) {
      console.error("Error linking category:", error);
    }
  };

  // Filtrar kits pela categoria selecionada e termo de busca
  const filteredKits = (list || [])
    .filter(kit => {
      if (!selectedCategories || selectedCategories.length === 0) return true;
      return selectedCategories.includes(kit.category_id);
    })
    .filter(kit => {
      if (!searchTerm) return true;
      const normalizedTerm = searchTerm.toLowerCase();
      const name = String(kit?.name ?? "").toLowerCase();
      const sku = String(kit?.sku ?? "").toLowerCase();
      return name.includes(normalizedTerm) || sku.includes(normalizedTerm);
    });
  
  return (
    <div className="space-y-6">
      <ProductFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        categories={categories.map(cat => ({ id: cat.id, name: cat.name, parent_id: (cat as any).parent_id }))}
        selectedCategories={selectedCategories}
        onCategoriesChange={handleCategoriesChange}
        onAddCategory={handleAddCategory}
        onLinkCategory={handleLinkCategory}
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
        onDeleteKit={async (kitId) => {
          const found = list.find((k) => k.id === kitId);
          setSingleDeleteTarget({ id: kitId, name: found?.name || "Kit" });
          setSingleDeleteOpen1(true);
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

      {/* Confirmação em duas etapas para exclusão individual */}
      <AlertDialog
        open={singleDeleteOpen1}
        onOpenChange={(open) => {
          setSingleDeleteOpen1(open);
          if (!open && !singleDeleteOpen2) setSingleDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir kit</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir o kit <strong className="text-foreground">&quot;{singleDeleteTarget?.name || "-"}&quot;</strong>. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSingleDeleteOpen1(false);
                setSingleDeleteOpen2(true);
              }}
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={singleDeleteOpen2}
        onOpenChange={(open) => {
          setSingleDeleteOpen2(open);
          if (!open) setSingleDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão permanente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não poderá ser desfeita. Confirma excluir este kit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!singleDeleteTarget?.id) return;
                try {
                  await deleteKit(singleDeleteTarget.id);
                  setList((prev) => prev.filter((p) => p.id !== singleDeleteTarget.id));
                  setSelectedIds((prev) => prev.filter((id) => id !== singleDeleteTarget.id));
                } catch {
                  // toast handled in hook
                } finally {
                  setSingleDeleteOpen2(false);
                  setSingleDeleteTarget(null);
                }
              }}
            >
              Excluir kit
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
                    await deleteKit(id);
                  } catch {
                    // toast handled in hook
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
            <DialogDescription>Escolha uma categoria para aplicar aos itens selecionados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <CategoryTreeSelect
              value={targetCategory || null}
              onChange={(categoryId) => setTargetCategory(categoryId || "")}
              placeholder="Escolha a categoria"
            />
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
