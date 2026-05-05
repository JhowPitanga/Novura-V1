// Product→Ad linking: same drawer + panel as listagem / cadastro / edição.
import { useState, useEffect } from "react";
import { Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ProductAdLinkingPanel } from "@/components/products/ProductAdLinkingPanel";

export interface ProductAdLinkerProps {
  productId: string | null;
  className?: string;
  /** Parent-controlled drawer (e.g. tabela de produtos) */
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** Hide the summary row + “Vincular” button (drawer only controlled externally) */
  hideOuterChrome?: boolean;
  onLinksMutation?: () => void;
}

export function ProductAdLinker({
  productId,
  className = "",
  drawerOpen: controlledOpen,
  onDrawerOpenChange,
  hideOuterChrome = false,
  onLinksMutation,
}: ProductAdLinkerProps) {
  const { organizationId } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [linkCount, setLinkCount] = useState(0);

  const isControlled = controlledOpen !== undefined;
  const drawerOpen = isControlled ? !!controlledOpen : internalOpen;
  const setDrawerOpen = (open: boolean) => {
    onDrawerOpenChange?.(open);
    if (!isControlled) setInternalOpen(open);
  };

  const refreshLinkCount = () => {
    if (!productId || !organizationId) {
      setLinkCount(0);
      return;
    }
    supabase
      .from("marketplace_item_product_links" as any)
      .select("marketplace_item_id")
      .eq("product_id", productId)
      .eq("organizations_id", organizationId)
      .then(({ data }) => {
        setLinkCount(Array.isArray(data) ? data.length : 0);
      });
  };

  useEffect(() => {
    refreshLinkCount();
  }, [productId, organizationId, drawerOpen]);

  return (
    <div className={`space-y-4 ${className}`}>
      {!hideOuterChrome && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Vínculos de Anúncios</h3>
            <p className="text-sm text-gray-500">{linkCount} vínculo(s) ativo(s)</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            className="gap-2 border-violet-200 text-violet-800 hover:bg-violet-50"
          >
            <Link className="w-4 h-4" />
            Vincular anúncio
          </Button>
        </div>
      )}

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="fixed inset-y-0 right-0 flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-none border-l bg-white sm:rounded-l-[20px]">
          <DrawerHeader className="shrink-0 border-b pb-4">
            <DrawerTitle className="flex items-center gap-2 text-violet-900">
              <Link className="w-5 h-5 text-violet-600" />
              Vincular anúncio ao produto
            </DrawerTitle>
            <DrawerDescription>
              Anúncios sincronizados no módulo Anúncios. Filtre por marketplace e busque por título, SKU ou ID.
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 p-4">
            <ProductAdLinkingPanel
              productId={productId}
              allowMutations={!!productId}
              onLinksMutation={() => {
                refreshLinkCount();
                onLinksMutation?.();
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
