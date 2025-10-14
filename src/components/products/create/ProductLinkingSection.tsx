
import { Link, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProductVariation, ProductType } from "@/types/products";

interface ProductLinkingSectionProps {
  productType: ProductType | "";
  variations: ProductVariation[];
  onNavigateToAds: () => void;
}

export function ProductLinkingSection({ 
  productType, 
  variations, 
  onNavigateToAds 
}: ProductLinkingSectionProps) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-6">Vincular Anúncios</h3>
        <p className="text-gray-600 mb-8 text-lg">
          Seu produto foi salvo com sucesso! Agora você pode vinculá-lo aos marketplaces ou criar novos anúncios.
        </p>
        
        <div className="grid grid-cols-2 gap-8">
          {/* Card 1: Link Advertisement */}
          <Drawer>
            <DrawerTrigger asChild>
              <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary">
                <CardContent className="p-8 text-center">
                  <Link className="w-20 h-20 text-primary mx-auto mb-6" />
                  <h4 className="text-xl font-semibold mb-3">Vincular Anúncio</h4>
                  <p className="text-gray-600">
                    Conectar este produto a anúncios existentes nos marketplaces
                  </p>
                </CardContent>
              </Card>
            </DrawerTrigger>
            <DrawerContent className="max-h-[80vh]">
              <DrawerHeader>
                <DrawerTitle>Vincular Anúncio</DrawerTitle>
                <DrawerDescription>
                  {productType === "variation" 
                    ? "Selecione anúncios existentes para vincular às variações deste produto"
                    : "Selecione anúncios existentes para vincular a este produto"
                  }
                </DrawerDescription>
              </DrawerHeader>
              <div className="p-6 overflow-y-auto">
                <div className="space-y-6">
                  {/* Filters */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <Label>Marketplace</Label>
                      <Select>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Selecione o marketplace" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mercadolivre">Mercado Livre</SelectItem>
                          <SelectItem value="amazon">Amazon</SelectItem>
                          <SelectItem value="shopee">Shopee</SelectItem>
                          <SelectItem value="magazineluiza">Magazine Luiza</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Busca</Label>
                      <Input placeholder="Busque por SKU, ID ou descrição..." className="mt-2" />
                    </div>
                  </div>
                  
                  {productType === "variation" && variations.length > 0 && (
                    <div>
                      <Label className="text-base font-medium">Vincular por Variação</Label>
                      <div className="mt-4 space-y-3">
                        {variations.map((variation) => (
                          <Card key={variation.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                {variation.color && (
                                  <div
                                    className="w-8 h-8 rounded-full border-2 border-gray-300"
                                    style={{ backgroundColor: variation.color.toLowerCase() }}
                                  />
                                )}
                                <div>
                                  <span className="font-medium">{variation.name}</span>
                                  <p className="text-sm text-gray-500">SKU: {variation.sku}</p>
                                </div>
                              </div>
                              <Select>
                                <SelectTrigger className="w-64">
                                  <SelectValue placeholder="Selecione o anúncio" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="anuncio1">Produto Similar - ML123456</SelectItem>
                                  <SelectItem value="anuncio2">Produto de Teste - AMZ789012</SelectItem>
                                  <SelectItem value="anuncio3">Produto Exemplo - SHP345678</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="border rounded-lg p-8 bg-gray-50">
                    <div className="text-center">
                      <p className="text-gray-500 mb-4">
                        Selecione um marketplace e pesquise para encontrar anúncios
                      </p>
                      <Button variant="outline" className="text-blue-600 border-blue-200">
                        Pesquisar Anúncios
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t">
                    <Button variant="outline" className="flex-1">
                      Cancelar
                    </Button>
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700">
                      Confirmar Vínculos
                    </Button>
                  </div>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          {/* Card 2: Create Advertisement */}
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
            onClick={onNavigateToAds}
          >
            <CardContent className="p-8 text-center">
              <ExternalLink className="w-20 h-20 text-primary mx-auto mb-6" />
              <h4 className="text-xl font-semibold mb-3">Criar Anúncio</h4>
              <p className="text-gray-600">
                Crie um novo anúncio para este produto nos marketplaces
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
