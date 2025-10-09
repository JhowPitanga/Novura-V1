
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Palette, Ruler, Zap, Plus } from "lucide-react";`nimport { Variacao } from "./types";
import { VariationImageUpload } from "./VariationImageUpload";
import { VariationDetailsForm } from "./VariationDetailsForm";

interface VariationAccordionItemProps {
  variacao: Variacao;
  onImageUpload: (variacaoId: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (variacaoId: string, imageIndex: number) => void;
  onUpdate: (variacaoId: string, field: string, value: string) => void;
}

export function VariationAccordionItem({ 
  variacao, 
  onImageUpload, 
  onRemoveImage, 
  onUpdate 
}: VariationAccordionItemProps) {
  return (
    <AccordionItem value={variacao.id} className="border rounded-lg mb-4">
      <AccordionTrigger className="px-6 hover:no-underline">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center space-x-4">
                        <div
              className=\"w-6 h-6 rounded-full border-2 border-gray-300\"
              style={{ backgroundColor: (variacao.cor ? variacao.cor.toLowerCase() : \"#e5e7eb\") }}
            />
            <span className=\"font-medium text-left\">{variacao.nome}</span>            <div className=\"flex flex-wrap gap-2 ml-4\">
              {typeof variacao.cor !== 'undefined' && (
                <div className=\"flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full\">
                  <Palette className=\"w-4 h-4\" />
                  <span className=\"text-sm font-medium\">Cor</span>
                </div>
              )}
              {typeof variacao.tamanho !== 'undefined' && (
                <div className=\"flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full\">
                  <Ruler className=\"w-4 h-4\" />
                  <span className=\"text-sm font-medium\">Tamanho</span>
                </div>
              )}
              {typeof variacao.voltagem !== 'undefined' && (
                <div className=\"flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full\">
                  <Zap className=\"w-4 h-4\" />
                  <span className=\"text-sm font-medium\">Voltagem</span>
                </div>
              )}
              {variacao.tipoPersonalizado && (
                <div className=\"flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full\">
                  <Plus className=\"w-4 h-4\" />
                  <span className=\"text-sm font-medium\">{variacao.tipoPersonalizado}</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {variacao.imagens?.length || 0}/1 capa
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-6 pb-6">
        <div className="space-y-6">
          <VariationImageUpload
            variacao={variacao}
            onImageUpload={onImageUpload}
            onRemoveImage={onRemoveImage}
          />
          <VariationDetailsForm
            variacao={variacao}
            onUpdate={onUpdate}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}


