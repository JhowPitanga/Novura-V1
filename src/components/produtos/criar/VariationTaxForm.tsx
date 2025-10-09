
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Variacao } from "./types";
import { BulkTaxDrawer } from "./BulkTaxDrawer";

interface VariationTaxFormProps {
  variacoes: Variacao[];
  onVariacoesChange: (variacoes: Variacao[]) => void;
  showErrors?: boolean;
}

export function VariationTaxForm({ variacoes, onVariacoesChange, showErrors = false }: VariationTaxFormProps) {
  const updateVariacao = (variacaoId: string, field: string, value: string) => {
    onVariacoesChange(variacoes.map(v => 
      v.id === variacaoId ? { ...v, [field]: value } : v
    ));
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-2">Informações Fiscais por Variação</h3>
        <p className="text-gray-600">Configure as informações fiscais para cada variação</p>
      </div>

      <BulkTaxDrawer variacoes={variacoes} onVariacoesChange={onVariacoesChange} />

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
                    {variacao.ncm ? "✓ Completo" : "Pendente"}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`ncm-${variacao.id}`}>
                        NCM <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id={`ncm-${variacao.id}`}
                        value={variacao.ncm || ""}
                        onChange={(e) => updateVariacao(variacao.id, "ncm", e.target.value)}
                        placeholder="00000000"
                        className={`mt-2 ${showErrors && !variacao.ncm ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                        required
                      />
                      {showErrors && !variacao.ncm && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`cest-${variacao.id}`}>CEST</Label>
                      <Input
                        id={`cest-${variacao.id}`}
                        value={variacao.cest || ""}
                        onChange={(e) => updateVariacao(variacao.id, "cest", e.target.value)}
                        placeholder="0000000"
                        className="mt-2"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor={`unidade-${variacao.id}`}>Unidade de Medida</Label>
                      <Select
                        value={variacao.unidade || ""}
                        onValueChange={(value) => updateVariacao(variacao.id, "unidade", value)}
                      >
                        <SelectTrigger className={`mt-2 ${showErrors && !variacao.unidade ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
                          <SelectValue placeholder="Selecione a unidade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UN">Unidade (UN)</SelectItem>
                          <SelectItem value="KG">Quilograma (KG)</SelectItem>
                          <SelectItem value="PAR">Par (PAR)</SelectItem>
                          <SelectItem value="KIT">Kit (KIT)</SelectItem>
                        </SelectContent>
                      </Select>
                      {showErrors && !variacao.unidade && (
                        <p className="text-red-600 text-sm mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor={`origem-${variacao.id}`}>Origem</Label>
                      <Select
                        value={variacao.origem || ""}
                        onValueChange={(value) => updateVariacao(variacao.id, "origem", value)}
                      >
                        <SelectTrigger className={`mt-2 ${showErrors && !variacao.origem ? 'border-red-500 focus-visible:ring-red-500' : ''}`}>
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0 - Nacional</SelectItem>
                          <SelectItem value="1">1 - Estrangeira - Importação direta</SelectItem>
                          <SelectItem value="2">2 - Estrangeira - Adquirida no mercado interno</SelectItem>
                          <SelectItem value="3">3 - Nacional - Conteúdo de importação superior a 40%</SelectItem>
                          <SelectItem value="4">4 - Nacional - Produção em conformidade com processos produtivos básicos</SelectItem>
                          <SelectItem value="5">5 - Nacional - Conteúdo de importação inferior ou igual a 40%</SelectItem>
                          <SelectItem value="6">6 - Estrangeira - Importação direta sem similar nacional</SelectItem>
                          <SelectItem value="7">7 - Estrangeira - Adquirida no mercado interno sem similar nacional</SelectItem>
                        </SelectContent>
                      </Select>
                      {showErrors && !variacao.origem && (
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
