
import { useEffect, useState } from "react";
import { MoreHorizontal, Edit, Copy, Trash2, Link } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ProductCoverImage } from "@/components/products/ProductCoverImage";
import { ProductAdLinker } from "@/components/products/ProductAdLinker";
import { supabase } from "@/integrations/supabase/client";

interface ProductTableProps {
  products: any[];
  loading: boolean;
  onDeleteProduct: (productId: string) => void;
  onDuplicateProduct?: (productId: string) => void;
  selectedIds?: string[];
  onToggleSelect?: (productId: string, checked: boolean) => void;
  onSelectAll?: (allIds: string[], checked: boolean) => void;
}

export function ProductTable({ products, loading, onDeleteProduct, onDuplicateProduct, selectedIds = [], onToggleSelect, onSelectAll }: ProductTableProps) {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [linksByProduct, setLinksByProduct] = useState<Record<string, Array<{ marketplace_name: string; marketplace_item_id: string }>>>({});
  const [linksDrawerProduct, setLinksDrawerProduct] = useState<any | null>(null);
  const [isLinksDrawerOpen, setIsLinksDrawerOpen] = useState(false);
  const [linksVersion, setLinksVersion] = useState(0);

  const allPageIds = products.map((p) => p.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.includes(id));
  const someSelected = allPageIds.some((id) => selectedIds.includes(id)) && !allSelected;

  useEffect(() => {
    const productIds = products.map((p) => p.id).filter(Boolean);
    if (productIds.length === 0) {
      setLinksByProduct({});
      return;
    }

    let isCancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("marketplace_item_product_links")
        .select("product_id, marketplace_name, marketplace_item_id")
        .in("product_id", productIds);
      if (error || isCancelled) return;

      const grouped: Record<string, Array<{ marketplace_name: string; marketplace_item_id: string }>> = {};
      (Array.isArray(data) ? data : []).forEach((row: any) => {
        const pid = String(row.product_id || "");
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push({
          marketplace_name: String(row.marketplace_name || ""),
          marketplace_item_id: String(row.marketplace_item_id || ""),
        });
      });
      setLinksByProduct(grouped);
    })();

    return () => {
      isCancelled = true;
    };
  }, [products, linksVersion]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="w-12 h-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow className="border-b border-gray-100">
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Selecionar todos da página"
                    checked={allSelected}
                    ref={(el) => { if (el) (el as any).indeterminate = someSelected; }}
                    onCheckedChange={(checked) => {
                      onSelectAll?.(allPageIds, !!checked);
                    }}
                  />
                </TableHead>
                <TableHead className="w-20">Imagem</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Custo de Compra</TableHead>
                <TableHead>Estoque</TableHead>
                <TableHead>Vínculos</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    Nenhum produto encontrado
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product) => {
                  // Calculate total stock from all storage locations
                  const totalStock = Array.isArray(product.products_stock) 
                    ? product.products_stock.reduce((sum, stock) => sum + (stock.current || 0), 0)
                    : (product.products_stock?.current || 0);
                  
                  const categoryName = product.categories?.name || 'Sem categoria';
                  const imageUrl = Array.isArray(product.image_urls) ? product.image_urls[0] : undefined;
                  
                  return (
                    <TableRow 
                      key={product.id} 
                      className="hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => navigate(`/produtos/editar/${product.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.includes(product.id)}
                          onCheckedChange={(checked) => onToggleSelect?.(product.id, !!checked)}
                          aria-label={`Selecionar ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <ProductCoverImage imageUrl={imageUrl} alt={product.name} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-sm text-gray-500">SKU: {product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{categoryName}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">R$ {(product.cost_price || 0).toFixed(2)}</span>
                      </TableCell>
                      <TableCell>
                        <span className={totalStock < 10 ? "text-red-600 font-medium" : "text-gray-900"}>
                          {totalStock} unidades
                        </span>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const productLinks = linksByProduct[product.id] || [];
                          return (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          type="button"
                          className="text-violet-700 hover:text-violet-800"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLinksDrawerProduct(product);
                            setIsLinksDrawerOpen(true);
                          }}
                        >
                          <Link className="w-4 h-4 mr-1" />
                              {productLinks.length} vínculo{productLinks.length === 1 ? "" : "s"}
                        </Button>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/produtos/editar/${product.id}`);
                            }}>
                              <Edit className="w-4 h-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              if (onDuplicateProduct) {
                                onDuplicateProduct(product.id);
                              }
                            }}>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicar
                            </DropdownMenuItem>
                           <DropdownMenuItem 
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                setProductToDelete(product);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto "{productToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (productToDelete) {
                  onDeleteProduct(productToDelete.id);
                  setDeleteDialogOpen(false);
                  setProductToDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {linksDrawerProduct?.id ? (
        <ProductAdLinker
          key={linksDrawerProduct.id}
          productId={linksDrawerProduct.id}
          hideOuterChrome
          drawerOpen={isLinksDrawerOpen}
          onDrawerOpenChange={(open) => {
            setIsLinksDrawerOpen(open);
            if (!open) setLinksDrawerProduct(null);
          }}
          onLinksMutation={() => setLinksVersion((v) => v + 1)}
        />
      ) : null}
    </>
  );
}
