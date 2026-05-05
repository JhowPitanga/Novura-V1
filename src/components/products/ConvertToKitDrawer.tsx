// T12 — Drawer to convert selected unique products into a Kit
// Requires: 2+ products of type UNICO selected in SingleProducts tab
import { useEffect, useMemo, useState } from "react";
import { Package, Plus, Minus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrMoneyInput } from "@/components/products/create/BrMoneyInput";

interface ProductForKit {
  id: string;
  name: string;
  sku: string;
  image_urls?: string[];
}

interface ConvertToKitDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProducts: ProductForKit[];
  onSuccess?: () => void;
}

interface KitItem {
  productId: string;
  name: string;
  sku: string;
  image?: string;
  quantity: number;
}

export function ConvertToKitDrawer({
  open,
  onOpenChange,
  selectedProducts,
  onSuccess,
}: ConvertToKitDrawerProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [kitName, setKitName] = useState("");
  const [kitSku, setKitSku] = useState(() => `KIT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
  const [kitSellPrice, setKitSellPrice] = useState("");
  const [items, setItems] = useState<KitItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setItems(
      selectedProducts.map((p) => ({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        image: p.image_urls?.[0],
        quantity: 1,
      }))
    );
    if (!kitName.trim()) {
      const seed = selectedProducts.slice(0, 2).map((p) => p.name).join(" + ");
      if (seed) setKitName(`Kit ${seed}`);
    }
  }, [open, selectedProducts]);

  const totalItens = useMemo(
    () => items.reduce((acc, item) => acc + item.quantity, 0),
    [items]
  );

  const validationErrors: string[] = [];
  if (!kitName.trim()) validationErrors.push("Nome do kit é obrigatório");
  if (!kitSku.trim()) validationErrors.push("SKU do kit é obrigatório");
  if (items.length < 2) validationErrors.push("Selecione pelo menos 2 produtos");
  if (items.some((i) => i.quantity < 1)) validationErrors.push("Quantidade mínima de 1 por item");

  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const handleCreate = async () => {
    if (validationErrors.length > 0) {
      toast({ title: "Campos inválidos", description: validationErrors[0], variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const kitProductId = await convertToKitFallback({
        productIds: items.map((i) => i.productId),
        kitName: kitName.trim(),
        kitSku: kitSku.trim(),
        sellPrice: kitSellPrice ? parseFloat(kitSellPrice) : null,
        kitItems: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      });
      if (!kitProductId) throw new Error("Não foi possível criar o kit.");

      toast({
        title: "Kit criado com sucesso!",
        description: `"${kitName}" foi criado. Redirecionando para edição...`,
      });

      onOpenChange(false);
      onSuccess?.();
      navigate(`/produtos/editar/${kitProductId}`);
    } catch (err: any) {
      toast({ title: "Erro ao criar kit", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const convertToKitFallback = async ({
    productIds,
    kitName,
    kitSku,
    sellPrice,
    kitItems,
  }: {
    productIds: string[];
    kitName: string;
    kitSku: string;
    sellPrice: number | null;
    kitItems: Array<{ product_id: string; quantity: number }>;
  }): Promise<string> => {
    if (productIds.length < 2) {
      throw new Error("Selecione pelo menos 2 produtos para criar um kit.");
    }

    const { data: productsBase, error: baseError } = await supabase
      .from("products")
      .select(`
        id,
        organizations_id,
        company_id,
        user_id,
        type,
        deleted_at,
        category_id,
        brand_id,
        cost_price,
        sell_price,
        barcode,
        ncm,
        cest,
        tax_origin_code,
        weight,
        weight_type,
        package_length,
        package_width,
        package_height,
        image_urls
      `)
      .in("id", productIds);
    if (baseError) throw baseError;
    if (!productsBase || productsBase.length !== productIds.length) {
      throw new Error("Alguns produtos selecionados não foram encontrados.");
    }

    const orgId = productsBase[0]?.organizations_id;
    const companyId = productsBase[0]?.company_id;
    const invalid = productsBase.some(
      (p) =>
        p.deleted_at !== null ||
        p.type !== "UNICO" ||
        p.organizations_id !== orgId ||
        p.company_id !== companyId
    );
    if (invalid || !orgId) {
      throw new Error("Os produtos devem ser do tipo Único e da mesma organização.");
    }
    const baseProduct = productsBase[0];
    const kitCostPrice = productsBase.reduce((acc, product) => {
      const quantity = kitItems.find((item) => item.product_id === product.id)?.quantity ?? 1;
      return acc + Number(product.cost_price || 0) * quantity;
    }, 0);
    const inferredSellPrice = productsBase.reduce((acc, product) => {
      const quantity = kitItems.find((item) => item.product_id === product.id)?.quantity ?? 1;
      return acc + Number(product.sell_price || 0) * quantity;
    }, 0);

    const { data: createdKitProduct, error: createProductError } = await supabase
      .from("products")
      .insert({
        organizations_id: orgId,
        company_id: companyId,
        user_id: baseProduct.user_id,
        type: "KIT",
        name: kitName,
        sku: kitSku,
        category_id: baseProduct.category_id,
        brand_id: baseProduct.brand_id,
        cost_price: kitCostPrice,
        sell_price: sellPrice ?? inferredSellPrice,
        barcode: 0,
        ncm: Number(baseProduct.ncm || 0),
        cest: baseProduct.cest ?? null,
        tax_origin_code: Number(baseProduct.tax_origin_code || 0),
        weight: baseProduct.weight ?? null,
        weight_type: baseProduct.weight_type ?? null,
        package_length: Number(baseProduct.package_length || 0),
        package_width: Number(baseProduct.package_width || 0),
        package_height: Number(baseProduct.package_height || 0),
        image_urls: Array.isArray(baseProduct.image_urls) ? baseProduct.image_urls : [],
        parent_id: null,
      } as any)
      .select("id")
      .single();
    if (createProductError) throw createProductError;
    if (!createdKitProduct?.id) throw new Error("Falha ao criar produto KIT.");

    const insertItems = productIds.map((pid) => ({
      kit_id: createdKitProduct.id,
      product_id: pid,
      quantity: kitItems.find((i) => i.product_id === pid)?.quantity ?? 1,
    }));

    const { error: createItemsError } = await supabase
      .from("product_kit_items")
      .insert(insertItems as any[]);
    if (createItemsError) {
      await supabase.from("products").delete().eq("id", createdKitProduct.id);
      throw createItemsError;
    }

    return createdKitProduct.id;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="fixed inset-y-0 right-0 h-full w-full max-w-[520px] rounded-none sm:rounded-l-[20px]">
        <DrawerHeader className="border-b pb-4">
          <DrawerTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-violet-600" />
            Transformar em Kit
          </DrawerTitle>
          <DrawerDescription>
            Criando um kit com {items.length} produto{items.length > 1 ? "s" : ""} selecionado{items.length > 1 ? "s" : ""}.
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-4 space-y-4">
            <Card className="border-violet-200 bg-violet-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-violet-900">Resumo da transformação</CardTitle>
                <CardDescription>
                  {items.length} produto{items.length !== 1 ? "s" : ""} selecionado{items.length !== 1 ? "s" : ""} com {totalItens} unidade{totalItens !== 1 ? "s" : ""} no kit.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-violet-200/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-violet-900">Informações do Kit</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="kit-name">
                    Nome <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="kit-name"
                    placeholder="Ex: Kit Escritório Premium"
                    value={kitName}
                    onChange={(e) => setKitName(e.target.value)}
                    className={!kitName.trim() ? "border-red-300 focus-visible:ring-red-400" : ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kit-sku">
                    SKU <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="kit-sku"
                    placeholder="KIT-XXXXX"
                    value={kitSku}
                    onChange={(e) => setKitSku(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kit-price">Preço de Venda</Label>
                  <BrMoneyInput
                    id="kit-price"
                    placeholder="0,00"
                    value={kitSellPrice}
                    onChange={setKitSellPrice}
                  />
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card className="border-violet-200/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-violet-900">Itens do Kit</CardTitle>
                <CardDescription>Ajuste a quantidade de cada produto no kit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-3 rounded-lg border border-violet-100 bg-violet-50/30 p-3"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-violet-100">
                        <Package className="h-5 w-5 text-violet-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-violet-200 text-violet-700 hover:bg-violet-100"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-medium text-violet-900">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-violet-200 text-violet-700 hover:bg-violet-100"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Validation warnings */}
            {validationErrors.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{validationErrors[0]}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <DrawerFooter className="border-t pt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-violet-700 hover:bg-violet-800 text-white"
              onClick={handleCreate}
              disabled={loading || validationErrors.length > 0}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Criando kit...
                </span>
              ) : (
                <>
                  <Package className="w-4 h-4 mr-2" />
                  Criar Kit
                </>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
