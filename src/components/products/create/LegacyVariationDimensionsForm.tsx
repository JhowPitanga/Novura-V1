
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Variacao } from "./types";
import { BulkDimensionsDrawer } from "./BulkDimensionsDrawer";

interface VariationDimensionsFormProps {
  variacoes: Variacao[];
  onVariacoesChange: (variacoes: Variacao[]) => void;
  showErrors?: boolean;
}

export function VariationDimensionsForm({ variacoes, onVariacoesChange, showErrors = false }: VariationDimensionsFormProps) {
  const updateVariacao = (variacaoId: string, field: string, value: string) => {
    onVariacoesChange(variacoes.map(v => 
      v.id === variacaoId ? { ...v, [field]: value } : v
    ));
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-2">Dimensões por Variação</h3>
        <p className="text-gray-600">Configure as dimensões e peso para cada variação</p>
      </div>

      <BulkDimensionsDrawer variacoes={variacoes} onVariacoesChange={onVariacoesChange} />

      {variacoes.length > 0 && (
        <Accordion type="single" collapsible className="space-y-4">
          {variacoes.map((variacao) => (
            <AccordionItem key={variacao.id} value={variacao.id} className="border rounded-lg">
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-4">
                    {variacao.cor && (
                      <div
                        className="w-6 h-6 rounded-full border-2 border-gray-300"
                        style={{ backgroundColor: variacao.cor.toLowerCase() }}
                      />
                    )}
                    <span className="font-medium text-left">{variacao.nome}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {variacao.altura && variacao.largura ? "✓ Completo" : "Pendente"}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`altura-${variacao.id}`}>Altura (cm)</Label>
                      <Input
                        id={`altura-${variacao.id}`}
                        type="number"
                        step="0.01"
                        value={variacao.altura || ""}
                        onChange={(e) => updateVariacao(variacao.id, "altura", e.target.value)}
                        placeholder="0,00"
                        className={`mt-2 ${showErrors && !variacao.altura ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {showErrors && !variacao.altura && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`largura-${variacao.id}`}>Largura (cm)</Label>
                      <Input
                        id={`largura-${variacao.id}`}
                        type="number"
                        step="0.01"
                        value={variacao.largura || ""}
                        onChange={(e) => updateVariacao(variacao.id, "largura", e.target.value)}
                        placeholder="0,00"
                        className={`mt-2 ${showErrors && !variacao.largura ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {showErrors && !variacao.largura && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`comprimento-${variacao.id}`}>Comprimento (cm)</Label>
                      <Input
                        id={`comprimento-${variacao.id}`}
                        type="number"
                        step="0.01"
                        value={variacao.comprimento || ""}
                        onChange={(e) => updateVariacao(variacao.id, "comprimento", e.target.value)}
                        placeholder="0,00"
                        className={`mt-2 ${showErrors && !variacao.comprimento ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {showErrors && !variacao.comprimento && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`peso-${variacao.id}`}>Peso (kg)</Label>
                      <Input
                        id={`peso-${variacao.id}`}
                        type="number"
                        step="0.001"
                        value={variacao.peso || ""}
                        onChange={(e) => updateVariacao(variacao.id, "peso", e.target.value)}
                        placeholder="0,000"
                        className={`mt-2 ${showErrors && !variacao.peso ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                      />
                      {showErrors && !variacao.peso && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
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
