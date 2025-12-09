import { useState, useEffect, useId, useRef } from "react";
import { Minus, Package, Plus, Settings, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStorage } from "@/hooks/useStorage";
import { useAuth } from "@/hooks/useAuth";

interface EstoqueProduct {
  id: string;
  produto: string;
  sku: string;
  galpao?: string;
  estoque: number;
  reservado: number;
  disponivel: number;
  status: string;
  valor?: number;
  stock_by_location?: Array<{
    storage_id: string;
    storage_name: string;
    current: number;
    reserved: number;
    available: number;
  }>;
}

interface EstoqueManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  product: EstoqueProduct | null;
  onUpdateStock: (productId: string, newStock: number) => void;
  onStockAdjusted?: () => void;
}

export function EstoqueManagementDrawer({
  isOpen,
  onClose,
  product,
  onUpdateStock,
  onStockAdjusted,
}: EstoqueManagementDrawerProps) {
  const [adjustmentQuantity, setAdjustmentQuantity] = useState<number>(0);
  const [operationType, setOperationType] = useState<"entrada" | "saida">("entrada");
  const [loading, setLoading] = useState(false);
  const [selectedStorageId, setSelectedStorageId] = useState<string | undefined>(
    product?.stock_by_location && product.stock_by_location.length > 0
      ? product.stock_by_location[0].storage_id
      : undefined
  );
  const { storageLocations, loading: storageLoading } = useStorage();
  const { toast } = useToast();
  const { organizationId } = useAuth();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (isOpen) {
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && !contentRef.current?.contains(activeEl)) {
        activeEl.blur();
      }
      setTimeout(() => {
        const autofocusEl = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
        const firstFocusable =
          autofocusEl ||
          contentRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          contentRef.current?.focus();
        }
      }, 0);
    }
  }, [isOpen]);

  if (!product) return null;

  const handleQuickAdjustment = (amount: number) => {
    setAdjustmentQuantity(Math.abs(amount));
    setOperationType(amount > 0 ? "entrada" : "saida");
  };

  const handleSaveAdjustment = async () => {
    if (adjustmentQuantity === 0) {
      toast({
        title: "Erro",
        description: "Por favor, insira uma quantidade válida para ajuste.",
        variant: "destructive",
      });
      return;
    }

    let quantity = adjustmentQuantity;
    if (operationType === "saida") {
      quantity = -Math.abs(quantity);
    } else {
      quantity = Math.abs(quantity);
    }

    setLoading(true);
    try {
      // Use selected storage or fallback to first available on the product
      const targetStorageId = selectedStorageId
        || (product.stock_by_location && product.stock_by_location.length > 0
          ? product.stock_by_location[0].storage_id
          : null);

      if (!targetStorageId) {
        toast({
          title: "Erro",
          description: "Armazém não especificado para o ajuste. Verifique a configuração.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase.rpc('upsert_product_stock', {
        p_product_id: product.id,
        p_storage_id: targetStorageId,
        p_quantity: quantity,
        p_reserved: 0,
        p_in_transit: 0
      });

      if (error) {
        console.error('Erro ao ajustar estoque:', error.message);
        toast({
          title: "Erro",
          description: "Erro ao ajustar estoque: " + error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sucesso",
          description: `${operationType === "entrada" ? "Entrada" : "Saída"} de ${adjustmentQuantity} unidades para ${product.produto}`,
        });

        try {
          const { data: userRes } = await supabase.auth.getUser();
          const userId = userRes?.user?.id || null;
          let displayName: string | null = null;
          if (userId) {
            const { data: up } = await (supabase as any)
              .from('user_profiles')
              .select('display_name')
              .eq('id', userId)
              .limit(1)
              .maybeSingle();
            displayName = up?.display_name || null;
            if (!displayName) displayName = userRes?.user?.email || null;
          }
          const moveType = operationType === 'entrada' ? 'ENTRADA' : 'SAIDA';
          const qtyChange = operationType === 'entrada' ? Math.abs(adjustmentQuantity || 0) : -Math.abs(adjustmentQuantity || 0);
          const orgId = organizationId ? String(organizationId) : null;
          let prodCompanyId: string | null = null;
          const { data: prod } = await (supabase as any)
            .from('products')
            .select('company_id')
            .eq('id', product.id)
            .limit(1)
            .maybeSingle();
          prodCompanyId = prod?.company_id || null;
          await (supabase as any)
            .from('inventory_transactions')
            .insert({
              organizations_id: orgId,
              company_id: prodCompanyId,
              product_id: product.id,
              storage_id: targetStorageId,
              movement_type: moveType,
              quantity_change: qtyChange,
              source_ref: `${displayName || 'Usuario'}[${moveType}]`,
            });
        } catch (_) {}

        // Reset form
        setAdjustmentQuantity(0);
        setOperationType("entrada");
        
        // Callback para recarregar dados
        if (onStockAdjusted) {
          onStockAdjusted();
        }
        
        onClose();
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast({
        title: "Erro",
        description: "Ocorreu um erro inesperado ao salvar o ajuste.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Badge de status padronizado (mesmas cores/labels da listagem)
  const renderStatusBadge = (status: string) => {
    const base = "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium";
    switch (status) {
      case "Sem estoque":
        return <span className={`${base} bg-red-600 text-white`}>Sem estoque</span>;
      case "Crítico":
        return <span className={`${base} bg-red-500 text-white`}>Crítico</span>;
      case "Baixo":
        return <span className={`${base} bg-orange-500 text-white`}>Baixo</span>;
      case "Médio":
        return <span className={`${base} bg-yellow-500 text-white`}>Médio</span>;
      case "Suficiente":
        return <span className={`${base} bg-green-600 text-white`}>Suficiente</span>;
      default:
        return <span className={`${base} bg-gray-500 text-white`}>Médio</span>;
    }
  };

  const getUpdatedStatus = (currentStock: number, reserved: number) => {
    const available = currentStock - reserved;
    if (available <= 0) return "Sem estoque";
    if (available <= 2) return "Crítico";
    if (available < 5) return "Baixo";
    if (available < 10) return "Médio";
    return "Suficiente";
  };

  // Calculate the status for the current stock state
  const currentStatus = getUpdatedStatus(product.estoque, product.reservado);

  // Calculate the status for the preview (if there's an adjustment)
  const previewStock = adjustmentQuantity > 0 ? 
    product.estoque + (operationType === "entrada" ? adjustmentQuantity : -adjustmentQuantity) : 
    product.estoque;
  const previewStatus = getUpdatedStatus(previewStock, product.reservado);


  const handleCloseDrawer = () => {
    // Reset form when closing
    setAdjustmentQuantity(0);
    setOperationType("entrada");
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => { if (!open) handleCloseDrawer(); }} direction="right">
      <DrawerContent
        ref={contentRef}
        className="fixed inset-y-0 right-0 flex h-full w-3/5 flex-col max-h-screen"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <DrawerHeader className="border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <DrawerTitle id={titleId} className="text-lg">Ajustar Estoque</DrawerTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseDrawer}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DrawerDescription id={descriptionId}>
            {product.produto} ({product.sku})
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Informações do Produto */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Informações do Produto</h3>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <p className="font-medium">{product.produto}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SKU</Label>
                  <p className="font-medium">{product.sku}</p>
                </div>
                {product.galpao && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Armazém</Label>
                    <p className="font-medium">{product.galpao}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  {renderStatusBadge(currentStatus)}
                </div>
              </div>
            </div>

            <Separator />

            {/* Informações de Estoque Atual */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Estoque Atual</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-primary">{product.estoque}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-orange-500">{product.reservado}</p>
                  <p className="text-xs text-muted-foreground">Reservado</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold text-green-500">{product.disponivel}</p>
                  <p className="text-xs text-muted-foreground">Disponível</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Seleção de Armazém para Ajuste */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Armazém para Ajuste</h3>
              <div>
                <Label htmlFor="ajuste-galpao">Armazém</Label>
                <Select
                  value={selectedStorageId}
                  onValueChange={(value) => setSelectedStorageId(value)}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecione o armazém" />
                  </SelectTrigger>
                  <SelectContent>
                    {storageLoading && (
                      <SelectItem value="__loading" disabled>Carregando armazéns...</SelectItem>
                    )}
                    {!storageLoading && storageLocations.length === 0 && (
                      <SelectItem value="__empty" disabled>Nenhum armazém cadastrado</SelectItem>
                    )}
                    {!storageLoading && storageLocations.map((storage) => (
                      <SelectItem key={storage.id} value={storage.id}>
                        {storage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Estoque por Localização */}
            {product.stock_by_location && product.stock_by_location.length > 0 && (
              <>
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Estoque por Localização</h3>
                  
                  <div className="space-y-3">
                    {product.stock_by_location.map((location) => (
                      <div key={location.storage_id} className="p-3 bg-muted rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-medium">{location.storage_name}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Atual</p>
                            <p className="font-bold">{location.current}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Reservado</p>
                            <p className="font-bold text-orange-500">{location.reserved}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Disponível</p>
                            <p className="font-bold text-green-500">{location.available}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Ajuste de Estoque */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Ajuste de Estoque</h3>

              {/* Botões de Ajuste Rápido */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">Ajustes Rápidos</Label>
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAdjustment(1)}
                    className="h-8"
                  >
                    +1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAdjustment(10)}
                    className="h-8"
                  >
                    +10
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAdjustment(-1)}
                    className="h-8"
                  >
                    -1
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickAdjustment(-10)}
                    className="h-8"
                  >
                    -10
                  </Button>
                </div>
              </div>

              {/* Tipo de Operação */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tipo de Operação</Label>
                <div className="flex gap-2">
                  <Button
                    variant={operationType === "entrada" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("entrada")}
                    className="flex-1"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Entrada
                  </Button>
                  <Button
                    variant={operationType === "saida" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOperationType("saida")}
                    className="flex-1"
                  >
                    <Minus className="w-4 h-4 mr-1" />
                    Saída
                  </Button>
                </div>
              </div>

              {/* Quantidade de Ajuste */}
              <div className="space-y-2">
                <Label htmlFor="adjustment-quantity" className="text-xs text-muted-foreground">
                  Quantidade de Ajuste
                </Label>
                <Input
                  id="adjustment-quantity"
                  type="number"
                  min="0"
                  value={adjustmentQuantity || ""}
                  onChange={(e) => setAdjustmentQuantity(Number(e.target.value))}
                  placeholder="Digite a quantidade"
                  data-autofocus
                />
              </div>

              {/* Preview do Resultado */}
              {adjustmentQuantity > 0 && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Novo estoque após ajuste:</p>
                    {renderStatusBadge(previewStatus)}
                  </div>
                  <p className="text-lg font-bold text-primary">
                    {previewStock} unidades
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border p-6 flex-shrink-0">
          <Button 
            onClick={handleSaveAdjustment} 
            className="w-full"
            disabled={loading}
          >
            <Settings className="w-4 h-4 mr-2" />
            {loading ? "Salvando..." : "Salvar Ajuste"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
