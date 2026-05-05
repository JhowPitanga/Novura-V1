
import { useState } from "react";
import { Link, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ProductVariation, ProductType } from "@/types/products";
import { ProductAdLinkingPanel } from "@/components/products/ProductAdLinkingPanel";

interface ProductLinkingSectionProps {
  productType: ProductType | "";
  variations: ProductVariation[];
  onCreateAdRequest: () => void;
}

export function ProductLinkingSection({
  productType,
  variations,
  onCreateAdRequest,
}: ProductLinkingSectionProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Vincular Anúncios</h3>
        <p className="text-gray-600 mb-8 text-lg">
          Revise anúncios já sincronizados no módulo Anúncios ou crie um novo anúncio após salvar o produto.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card
            className="cursor-pointer border-2 transition-shadow hover:border-violet-300 hover:shadow-lg"
            onClick={() => setIsDrawerOpen(true)}
          >
            <CardContent className="p-8 text-center">
              <Link className="mx-auto mb-6 h-20 w-20 text-violet-700" />
              <h4 className="mb-3 text-xl font-semibold">Vincular anúncio</h4>
              <p className="text-gray-600">
                Mesmo painel da listagem e da edição: filtros por marketplace e busca nos anúncios cadastrados
              </p>
            </CardContent>
          </Card>

          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen} direction="right">
            <DrawerContent className="fixed inset-y-0 right-0 flex h-full w-full max-w-[520px] flex-col overflow-hidden rounded-none border-l bg-white sm:rounded-l-[20px]">
              <DrawerHeader className="shrink-0 border-b pb-4">
                <DrawerTitle className="flex items-center gap-2 text-violet-900">
                  <Link className="h-5 w-5 text-violet-600" />
                  Vincular anúncio
                </DrawerTitle>
                <DrawerDescription>
                  {productType === "variation"
                    ? "Após salvar o produto, você poderá vincular cada variação na edição. Aqui você só consulta os anúncios disponíveis."
                    : "Após salvar, volte em Produtos > Editar para confirmar vínculos. Enquanto isso, você pode localizar o anúncio correto aqui."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 p-4">
                <ProductAdLinkingPanel productId={null} allowMutations={false} />
              </div>
            </DrawerContent>
          </Drawer>

          <Card
            className="cursor-pointer border-2 transition-shadow hover:border-violet-300 hover:shadow-lg"
            onClick={onCreateAdRequest}
          >
            <CardContent className="p-8 text-center">
              <ExternalLink className="mx-auto mb-6 h-20 w-20 text-violet-700" />
              <h4 className="mb-3 text-xl font-semibold">Criar anúncio</h4>
              <p className="text-gray-600">Salvar produto e ir ao módulo de anúncios</p>
            </CardContent>
          </Card>
        </div>

        {productType === "variation" && variations.length > 0 && (
          <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/30 p-4">
            <p className="text-sm font-medium text-violet-800">
              Produto com variações: {variations.length} variação(ões) configurada(s)
            </p>
            <p className="mt-1 text-xs text-violet-700">
              Após salvar, vincule anúncios por variação na tela de edição do produto (mesmo drawer de vínculo).
            </p>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Dica: este passo é opcional. Você pode salvar agora e fazer os vínculos depois na listagem ou na edição do
          produto.
        </div>
      </div>
    </div>
  );
}
