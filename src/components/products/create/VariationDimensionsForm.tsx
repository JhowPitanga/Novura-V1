
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductVariation } from "@/types/products";
import { BulkDimensionsDrawer } from "@/components/products/create/BulkDimensionsDrawer";

interface VariationDimensionsFormProps {
  variations?: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
  showErrors?: boolean;
}

export function VariationDimensionsForm({ variations, onVariationsChange, showErrors = false }: VariationDimensionsFormProps) {
  const safeVariations = Array.isArray(variations) ? variations : [];

  const updateVariation = (variationId: string, field: keyof ProductVariation, value: string) => {
    onVariationsChange(
      safeVariations.map((variation) =>
        variation.id === variationId ? { ...variation, [field]: value } : variation
      )
    );
  };

  const convertVariationsToPT = (list: ProductVariation[]) =>
    list.map((variation) => ({
      id: variation.id,
      nome: variation.name,
      cor: variation.color,
      tamanho: variation.size,
      voltagem: variation.voltage,
      tipoPersonalizado: variation.customType,
      valorPersonalizado: variation.customValue,
      sku: variation.sku,
      ean: variation.ean,
      precoCusto: variation.costPrice,
      imagens: variation.images,
      altura: variation.height,
      largura: variation.width,
      comprimento: variation.length,
      peso: variation.weight,
      ncm: variation.ncm,
      cest: variation.cest,
      codigoBarras: variation.barcode,
      unidade: variation.unit,
      origem: variation.origin,
    }));

  const convertVariationsFromPT = (list: any[]) =>
    list.map((variation) => ({
      id: variation.id,
      name: variation.nome,
      color: variation.cor,
      size: variation.tamanho,
      voltage: variation.voltagem,
      customType: variation.tipoPersonalizado,
      customValue: variation.valorPersonalizado,
      sku: variation.sku,
      ean: variation.ean,
      costPrice: variation.precoCusto,
      images: variation.imagens,
      height: variation.altura,
      width: variation.largura,
      length: variation.comprimento,
      weight: variation.peso,
      ncm: variation.ncm,
      cest: variation.cest,
      barcode: variation.codigoBarras,
      unit: variation.unidade,
      origin: variation.origem,
      stock: variation.estoque,
      storage: variation.armazem,
    }));

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-2">Dimensões por Variação</h3>
        <p className="text-gray-600">Configure as dimensões e peso para cada variação</p>
      </div>

      <BulkDimensionsDrawer
        variacoes={convertVariationsToPT(safeVariations)}
        onVariacoesChange={(list) => onVariationsChange(convertVariationsFromPT(list))}
      />

      {safeVariations.length > 0 && (
        <Accordion type="single" collapsible className="space-y-4">
          {safeVariations.map((variation) => (
            <AccordionItem key={variation.id} value={variation.id} className="border rounded-lg">
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium text-left">{variation.name}</span>
                  <div className="text-sm text-gray-500">
                    {variation.height && variation.width ? "✓ Completo" : "Pendente"}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`height-${variation.id}`}>Altura (cm)</Label>
                      <Input
                        id={`height-${variation.id}`}
                        type="number"
                        step="0.01"
                        value={variation.height || ""}
                        onChange={(e) => updateVariation(variation.id, "height", e.target.value)}
                        className={`mt-2 ${showErrors && !variation.height ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`width-${variation.id}`}>Largura (cm)</Label>
                      <Input
                        id={`width-${variation.id}`}
                        type="number"
                        step="0.01"
                        value={variation.width || ""}
                        onChange={(e) => updateVariation(variation.id, "width", e.target.value)}
                        className={`mt-2 ${showErrors && !variation.width ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`length-${variation.id}`}>Comprimento (cm)</Label>
                      <Input
                        id={`length-${variation.id}`}
                        type="number"
                        step="0.01"
                        value={variation.length || ""}
                        onChange={(e) => updateVariation(variation.id, "length", e.target.value)}
                        className={`mt-2 ${showErrors && !variation.length ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`weight-${variation.id}`}>Peso (kg)</Label>
                      <Input
                        id={`weight-${variation.id}`}
                        type="number"
                        step="0.001"
                        value={variation.weight || ""}
                        onChange={(e) => updateVariation(variation.id, "weight", e.target.value)}
                        className={`mt-2 ${showErrors && !variation.weight ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                      />
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
