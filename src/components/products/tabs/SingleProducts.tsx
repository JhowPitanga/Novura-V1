import { useState, useEffect } from "react";
import { ProductTable } from "../ProductTable";
import { ProductFilters } from "../ProductFilters";
import { ConvertToKitDrawer } from "../ConvertToKitDrawer";
import { DuplicateProductDialog } from "../DuplicateProductDialog";
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from "@/hooks/useCategories";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

export function ProdutosUnicos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const { products, loading } = useProducts();
  const { categories, createCategory, updateCategory, deleteCategory, linkCategory } = useCategories();
  const { toast } = useToast();

  const [list, setList] = useState<any[]>([]);
  const [confirmDeleteOpen1, setConfirmDeleteOpen1] = useState(false);
  const [confirmDeleteOpen2, setConfirmDeleteOpen2] = useState(false);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [convertToKitOpen, setConvertToKitOpen] = useState(false);
  const [duplicateDialogProduct, setDuplicateDialogProduct] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    setList(products || []);
  }, [products]);
  
  const handleCategoriesChange = (categoryIds: string[]) => {
    setSelectedCategories(Array.isArray(categoryIds) ? categoryIds : []);
  };

  const handleAddCategory = async (newCategory: { name: string; parent_id?: string }) => {
    try {
      await createCategory(newCategory.name, newCategory.parent_id);
    } catch (error) {
      console.error("Error creating category:", error);
    }
  };

  const handleUpdateCategory = async (categoryId: string, name: string) => {
    try {
      await updateCategory(categoryId, name);
    } catch (error) {
      console.error("Error updating category:", error);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };
 
  const handleLinkCategory = async (categoryId: string, parentId: string | null) => {
    try {
      await linkCategory(categoryId, parentId);
    } catch (error) {
      console.error("Error linking category:", error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      setList((prev) => prev.filter((p) => p.id !== productId));

      toast({
        title: "Sucesso",
        description: "Produto excluído com sucesso",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao excluir produto';
      toast({
        title: "Erro",
        description: message,
        variant: "destructive",
      });
    }
  };

  // Filtrar produtos únicos pela categoria selecionada e termo de busca
  const filteredProducts = (list || [])
    .filter(product => product.type === 'UNICO')
    .filter(product => {
      if (!selectedCategories || selectedCategories.length === 0) return true;
      return selectedCategories.includes(product.category_id);
    })
    .filter(product => {
      if (!searchTerm) return true;
      const normalizedTerm = searchTerm.toLowerCase();
      const name = String(product?.name ?? "").toLowerCase();
      const sku = String(product?.sku ?? "").toLowerCase();
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
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        onLinkCategory={handleLinkCategory}
        placeholder="Buscar produtos únicos..."
        selectedCount={selectedIds.length}
        onBulkActionSelect={(action) => {
          if (action === "excluir-selecionado") {
            setConfirmDeleteOpen1(true);
          }
          if (action === "categorizar") {
            setTargetCategory("");
            setCategorizeOpen(true);
          }
          if (action === "transformar-em-kit") {
            if (selectedIds.length < 2) {
              toast({ title: "Selecione pelo menos 2 produtos", description: "Para criar um kit você precisa selecionar no mínimo 2 produtos únicos.", variant: "destructive" });
              return;
            }
            setConvertToKitOpen(true);
          }
        }}
      />

      <ProductTable 
        products={filteredProducts} 
        loading={loading} 
        selectedIds={selectedIds}
        onToggleSelect={(productId, checked) => {
          setSelectedIds(prev => (checked ? [...prev, productId] : prev.filter(id => id !== productId)));
        }}
        onSelectAll={(allIds, checked) => {
          setSelectedIds(prev =>
            checked
              ? Array.from(new Set([...prev, ...allIds]))
              : prev.filter(id => !allIds.includes(id))
          );
        }}
        onDeleteProduct={handleDeleteProduct}
        onDuplicateProduct={(productId) => {
          const product = list.find((p) => p.id === productId);
          if (product) setDuplicateDialogProduct({ id: productId, name: product.name });
        }}
      />

      {/* Confirmação em duas etapas para exclusão em massa */}
      <AlertDialog open={confirmDeleteOpen1} onOpenChange={setConfirmDeleteOpen1}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedIds.length} produto(s). Esta ação não pode ser desfeita.
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
              Tem certeza absoluta? Os produtos selecionados serão removidos da listagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                for (const id of selectedIds) {
                  await handleDeleteProduct(id);
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

      {/* Convert to kit drawer */}
      <ConvertToKitDrawer
        open={convertToKitOpen}
        onOpenChange={setConvertToKitOpen}
        selectedProducts={list.filter((p) => selectedIds.includes(p.id)).map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          image_urls: p.image_urls,
        }))}
        onSuccess={() => setSelectedIds([])}
      />

      {/* Duplicate dialog */}
      {duplicateDialogProduct && (
        <DuplicateProductDialog
          productId={duplicateDialogProduct.id}
          productName={duplicateDialogProduct.name}
          open={!!duplicateDialogProduct}
          onOpenChange={(v) => { if (!v) setDuplicateDialogProduct(null); }}
        />
      )}
    </div>
  );
}
