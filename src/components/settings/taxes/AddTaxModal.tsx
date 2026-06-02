// §1 SIZE EXCEPTION (ENGINEERING_STANDARDS.md): ~720 LOC thin compositor retaining
// full wizard step markup; renderIcmsQuadro stays private (8+ ICMS state deps per Change Intent).
import { useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTaxRulesCatalog } from "@/hooks/useTaxRulesCatalog";
import { useIcmsState } from "@/hooks/useIcmsState";
import { useTaxWizardState } from "@/hooks/useTaxWizardState";
import { saveCompanyTaxConfig } from "@/services/tax.service";
import {
  buildTaxPayload,
  type CompanyOption,
  type DentroFora,
  type IcmsConfig,
  type Pessoa,
  type TaxRecord,
} from "@/components/settings/taxes/tax-payload";

export type { CompanyOption, TaxRecord };

interface AdicionarImpostoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companies: CompanyOption[];
  initialData?: TaxRecord | null;
  onSave: (record: TaxRecord) => void;
}

const steps = [
  { id: 1, title: "Informações", description: "Básicas" },
  { id: 2, title: "ICMS", description: "Regras" },
  { id: 3, title: "IPI", description: "Configuração" },
  { id: 4, title: "PIS", description: "Configuração" },
  { id: 5, title: "COFINS", description: "Configuração" },
  { id: 6, title: "Adicionais", description: "Observações" },
];

// Catálogo de regras tributárias é carregado dinamicamente do banco (tax_rules_catalog).
// Removidos arrays estáticos (CSOSN ICMS, CST IPI, CST PIS/COFINS) e geração de ID local.

function buildInitialSaidaExtras(initialData?: TaxRecord | null) {
  const extras = initialData?.payload?.icmsExtras as
    | { saidaPF?: unknown[]; saidaPJ?: unknown[] }
    | undefined;
  const pf = (extras?.saidaPF || []).map((e) => ({ ...(e as object), pessoa: "PF" as const }));
  const pj = (extras?.saidaPJ || []).map((e) => ({ ...(e as object), pessoa: "PJ" as const }));
  return [...pf, ...pj];
}

export function AddTaxModal({ open, onOpenChange, companies, initialData, onSave }: AdicionarImpostoModalProps) {
  const { organizationId, user } = useAuth();
  const { csosnICMSOptions, cstIPIOptions, cstPISOptions, cstCOFINSOptions } = useTaxRulesCatalog();

  const wizard = useTaxWizardState(open, companies, initialData);
  const {
    currentStep,
    handleNext,
    handleBack,
    canProceed,
    selectedCompanyId,
    setSelectedCompanyId,
    selectedCompany,
    isDefaultForCompany,
    setIsDefaultForCompany,
    naturezaSaida,
    setNaturezaSaida,
    naturezaEntrada,
    setNaturezaEntrada,
    observacao,
    setObservacao,
    ipiPF,
    setIpiPF,
    ipiPJ,
    setIpiPJ,
    pisPF,
    setPisPF,
    pisPJ,
    setPisPJ,
    cofinsPF,
    setCofinsPF,
    cofinsPJ,
    setCofinsPJ,
    infoFisco,
    setInfoFisco,
    infoComplementar,
    setInfoComplementar,
  } = wizard;

  const icmsHook = useIcmsState(
    (initialData?.payload?.icms as Record<string, IcmsConfig>) || {},
    buildInitialSaidaExtras(initialData),
    (initialData?.payload?.icmsExtras as { entrada?: unknown[] })?.entrada || []
  );
  const {
    icms,
    icmsSaidaExtras,
    icmsEntradaExtras,
    icmsDefaultCardSelection,
    setIcmsField,
    updateDefaultCardSelection,
    copiarCSOSNParaTodos,
    addIcmsExtra,
    setIcmsExtraField,
    removeIcmsExtra,
    resetIcms,
  } = icmsHook;

  useEffect(() => {
    if (!open) return;
    resetIcms(
      (initialData?.payload?.icms as Record<string, IcmsConfig>) || {},
      buildInitialSaidaExtras(initialData),
      (initialData?.payload?.icmsExtras as { entrada?: unknown[] })?.entrada || []
    );
  }, [open, initialData, resetIcms]);

  const handleSave = async () => {
    try {
      if (!organizationId) {
        toast.error("Organização não encontrada. Faça login novamente.");
        return;
      }

      if (!selectedCompany?.id) {
        toast.error("Selecione uma empresa para vincular o imposto.");
        return;
      }

      const recordPayload = buildTaxPayload({
        selectedCompany,
        isDefaultForCompany,
        naturezaSaida,
        naturezaEntrada,
        observacao,
        icms,
        icmsSaidaExtras,
        icmsEntradaExtras,
        ipiPF,
        ipiPJ,
        pisPF,
        pisPJ,
        cofinsPF,
        cofinsPJ,
        infoFisco,
        infoComplementar,
      });

      const isEditing = Boolean(initialData?.id);
      const inserted = await saveCompanyTaxConfig({
        organizationId,
        userId: user?.id,
        companyId: selectedCompany.id,
        observacao,
        isDefault: isDefaultForCompany,
        recordPayload,
        naturezaSaida,
        naturezaEntrada,
        ipiPF,
        ipiPJ,
        pisPF,
        pisPJ,
        cofinsPF,
        cofinsPJ,
        infoFisco,
        infoComplementar,
        icms,
        existingId: initialData?.id,
      });

      toast.success(isEditing ? "Imposto atualizado com sucesso" : "Imposto salvo com sucesso no banco de dados");
      const resultRecord = {
        id: inserted.id,
        companyId: selectedCompany?.id,
        companyName: selectedCompany?.razao_social,
        cnpj: selectedCompany?.cnpj,
        isDefault: isDefaultForCompany,
        observacao,
        payload: recordPayload,
        createdAt: inserted.created_at,
      } as TaxRecord;

      onSave(resultRecord);
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      const message = e?.message || "Não foi possível salvar o imposto";
      toast.error(message);
    }
  };

  const renderIcmsQuadro = (tipo: "saida" | "entrada", pessoa: Pessoa) => (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {["dentro", "fora"].map((abr) => {
        const baseKey = `${tipo}_${pessoa}_${abr as DentroFora}`;
        const sel = icmsDefaultCardSelection[baseKey] || { pessoa, abrang: abr as DentroFora };
        const selPessoa = sel.pessoa;
        const selAbrang = sel.abrang;
        const activeKey = `${tipo}_${selPessoa}_${selAbrang}`;
        const title = `${tipo === "saida" ? "Saída" : "Entrada"} - ${selAbrang === "dentro" ? "Dentro do estado" : "Fora do estado"} (${selPessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica"})`;
        const cfg = icms[activeKey] || {};
        return (
          <Card key={baseKey} className="border border-gray-200 min-w-[560px]">
            <CardContent className="p-4 space-y-4">
              <div className="text-sm font-medium text-gray-900">{title}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de pessoa</Label>
                  <Select value={selPessoa} onValueChange={(v) => updateDefaultCardSelection(baseKey, tipo, { pessoa: v as Pessoa })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PF">Pessoa Física</SelectItem>
                      <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Abrangência</Label>
                  <Select value={selAbrang} onValueChange={(v) => updateDefaultCardSelection(baseKey, tipo, { abrang: v as DentroFora })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dentro">Dentro do estado</SelectItem>
                      <SelectItem value="fora">Fora do estado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>CFOP</Label>
                  <Input value={cfg.cfop || ""} onChange={(e) => setIcmsField(tipo, selPessoa, selAbrang, "cfop", e.target.value)} placeholder="Ex.: 5102" />
                </div>
                <div>
                  <Label>Situação Tributária (CSOSN)</Label>
                  <Select value={cfg.csosn || ""} onValueChange={(v) => setIcmsField(tipo, selPessoa, selAbrang, "csosn", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {csosnICMSOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {selPessoa === "PJ" && (
                <div className="flex items-center space-x-2">
                  <Checkbox id={`${activeKey}_nao_contrib`} checked={!!cfg.pjNaoContribuinte} onCheckedChange={(v) => setIcmsField(tipo, selPessoa, selAbrang, "pjNaoContribuinte", !!v)} />
                  <Label htmlFor={`${activeKey}_nao_contrib`}>Pessoa Jurídica não contribuinte</Label>
                </div>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => copiarCSOSNParaTodos(activeKey)}>
                  Copiar CSOSN para todos os cenários
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[1200px] max-w-[95vw] h-[82vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{initialData ? "Editar Imposto" : "Adicionar Imposto"}</DialogTitle>
          <DialogDescription>Configure as regras fiscais seguindo as etapas</DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <StepIndicator steps={steps as any} currentStep={currentStep} />
        </div>

        {/* Conteúdo rolável por etapa */}
        <div className="px-6 pb-2 max-h-[64vh] overflow-y-auto">
          {currentStep === 1 && (
            <div className="space-y-6">
              {companies.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label>Empresa</Label>
                    <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.razao_social} — {c.cnpj}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center space-x-2 mt-3">
                      <Checkbox id="default_company" checked={isDefaultForCompany} onCheckedChange={(v) => setIsDefaultForCompany(!!v)} />
                      <Label htmlFor="default_company">Imposto padrão para empresa</Label>
                    </div>
                  </div>
                  <div>
                    <Label>Tipo de Tributação</Label>
                    <Input value={selectedCompany?.tributacao || ""} disabled placeholder="Automático pela empresa" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Natureza de Operação (Saída)</Label>
                  <Input value={naturezaSaida} onChange={(e) => setNaturezaSaida(e.target.value)} placeholder="Ex.: Venda de mercadorias" />
                </div>
                <div>
                  <Label>Natureza de Operação (Entrada)</Label>
                  <Input value={naturezaEntrada} onChange={(e) => setNaturezaEntrada(e.target.value)} placeholder="Ex.: Devolução de mercadoria" />
                </div>
              </div>

              <div>
                <Label>Observação (nome do imposto)</Label>
                <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: Regra Fiscal SP Varejo" />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-10">
              {/* SAÍDA - Quadros padrão em lista horizontal */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold">ICMS - Saída</h4>
                  <Button size="sm" variant="outline" onClick={() => addIcmsExtra("saida")}>Adicionar cenário</Button>
                </div>
                {/* Padrões PF e PJ em listas horizontais */}
                <div className="space-y-4">
                  {renderIcmsQuadro("saida", "PF")}
                  {renderIcmsQuadro("saida", "PJ")}
                </div>

                {/* Cenários adicionais de saída (lista horizontal com dropdowns de Pessoa e Abrangência) */}
                {icmsSaidaExtras.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">Cenários adicionais de saída</div>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {icmsSaidaExtras.map((sc, idx) => (
                        <Card key={`saida_extra_${idx}`} className="border border-gray-200 min-w-[560px]">
                          <CardContent className="p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="text-sm text-gray-700">Cenário adicional #{idx + 1}</div>
                              <Button size="sm" variant="ghost" onClick={() => removeIcmsExtra("saida", idx)}>Remover</Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label>Tipo de pessoa</Label>
                                <Select value={sc.pessoa || "PF"} onValueChange={(v) => setIcmsExtraField("saida", idx, "pessoa", v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PF">Pessoa Física</SelectItem>
                                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Abrangência</Label>
                                <Select value={sc.abrangencia || "dentro"} onValueChange={(v) => setIcmsExtraField("saida", idx, "abrangencia", v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="dentro">Dentro do estado</SelectItem>
                                    <SelectItem value="fora">Fora do estado</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label>CFOP</Label>
                                <Input value={sc.cfop || ""} onChange={(e) => setIcmsExtraField("saida", idx, "cfop", e.target.value)} placeholder="Ex.: 5102" />
                              </div>
                              <div>
                                <Label>Situação Tributária (CSOSN)</Label>
                                <Select value={sc.csosn || ""} onValueChange={(v) => setIcmsExtraField("saida", idx, "csosn", v)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {csosnICMSOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {(sc.pessoa || "PF") === "PJ" && (
                              <div className="flex items-center gap-2">
                                <Checkbox id={`saida_extra_pj_nao_contrib_${idx}`} checked={!!sc.pjNaoContribuinte} onCheckedChange={(v) => setIcmsExtraField("saida", idx, "pjNaoContribuinte", !!v)} />
                                <Label htmlFor={`saida_extra_pj_nao_contrib_${idx}`}>PJ não contribuinte</Label>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ENTRADA - apenas quadro com botão de cenários */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-semibold">ICMS - Entrada</h4>
                  <Button size="sm" variant="outline" onClick={() => addIcmsExtra("entrada")}>Adicionar cenário</Button>
                </div>
                {icmsEntradaExtras.length === 0 ? (
                  <Card className="border border-dashed">
                    <CardContent className="p-6 text-sm text-gray-500">Sem cenários de entrada adicionados</CardContent>
                  </Card>
                ) : (
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {icmsEntradaExtras.map((sc, idx) => (
                      <Card key={`entrada_extra_${idx}`} className="border border-gray-200 min-w-[560px]">
                        <CardContent className="p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-700">Cenário de entrada #{idx + 1}</div>
                            <Button size="sm" variant="ghost" onClick={() => removeIcmsExtra("entrada", idx)}>Remover</Button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label>Abrangência</Label>
                              <Select value={sc.abrangencia || "dentro"} onValueChange={(v) => setIcmsExtraField("entrada", idx, "abrangencia", v)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="dentro">Dentro do estado</SelectItem>
                                  <SelectItem value="fora">Fora do estado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>CFOP</Label>
                              <Input value={sc.cfop || ""} onChange={(e) => setIcmsExtraField("entrada", idx, "cfop", e.target.value)} placeholder="Ex.: 1102" />
                            </div>
                          </div>
                          <div>
                            <Label>Situação Tributária (CSOSN)</Label>
                            <Select value={sc.csosn || ""} onValueChange={(v) => setIcmsExtraField("entrada", idx, "csosn", v)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                {csosnICMSOptions.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">IPI - Pessoa Física</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Física" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (IPI)</Label>
                    <Select value={ipiPF.cst || ""} onValueChange={(v) => setIpiPF(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstIPIOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Código de enquadramento</Label>
                      <Input value={ipiPF.codigoEnquadramento || ""} onChange={(e) => setIpiPF(prev => ({ ...prev, codigoEnquadramento: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Alíquota (%)</Label>
                      <Input type="number" min="0" step="0.01" value={ipiPF.aliquota || ""} onChange={(e) => setIpiPF(prev => ({ ...prev, aliquota: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setIpiPJ(prev => ({ ...prev, cst: ipiPF.cst }))}>Copiar Situação Tributária para Pessoa Jurídica</Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">IPI - Pessoa Jurídica</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Jurídica" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (IPI)</Label>
                    <Select value={ipiPJ.cst || ""} onValueChange={(v) => setIpiPJ(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstIPIOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Código de enquadramento</Label>
                      <Input value={ipiPJ.codigoEnquadramento || ""} onChange={(e) => setIpiPJ(prev => ({ ...prev, codigoEnquadramento: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Alíquota (%)</Label>
                      <Input type="number" min="0" step="0.01" value={ipiPJ.aliquota || ""} onChange={(e) => setIpiPJ(prev => ({ ...prev, aliquota: e.target.value }))} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">PIS - Pessoa Física</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Física" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (PIS)</Label>
                    <Select value={pisPF.cst || ""} onValueChange={(v) => setPisPF(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstPISOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota (%)</Label>
                    <Input type="number" min="0" step="0.01" value={pisPF.aliquota || ""} onChange={(e) => setPisPF(prev => ({ ...prev, aliquota: e.target.value }))} />
                  </div>
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setPisPJ(prev => ({ ...prev, cst: pisPF.cst }))}>Copiar Situação Tributária para Pessoa Jurídica</Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">PIS - Pessoa Jurídica</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Jurídica" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (PIS)</Label>
                    <Select value={pisPJ.cst || ""} onValueChange={(v) => setPisPJ(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstPISOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota (%)</Label>
                    <Input type="number" min="0" step="0.01" value={pisPJ.aliquota || ""} onChange={(e) => setPisPJ(prev => ({ ...prev, aliquota: e.target.value }))} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">COFINS - Pessoa Física</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Física" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (COFINS)</Label>
                    <Select value={cofinsPF.cst || ""} onValueChange={(v) => setCofinsPF(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstCOFINSOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota (%)</Label>
                    <Input type="number" min="0" step="0.01" value={cofinsPF.aliquota || ""} onChange={(e) => setCofinsPF(prev => ({ ...prev, aliquota: e.target.value }))} />
                  </div>
                  <div>
                    <Button variant="outline" size="sm" onClick={() => setCofinsPJ(prev => ({ ...prev, cst: cofinsPF.cst }))}>Copiar Situação Tributária para Pessoa Jurídica</Button>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="text-sm font-medium">COFINS - Pessoa Jurídica</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cenário</Label>
                      <Input value="Padrão" disabled />
                    </div>
                    <div>
                      <Label>Tipo pessoa</Label>
                      <Input value="Pessoa Jurídica" disabled />
                    </div>
                  </div>
                  <div>
                    <Label>Situação Tributária (COFINS)</Label>
                    <Select value={cofinsPJ.cst || ""} onValueChange={(v) => setCofinsPJ(prev => ({ ...prev, cst: v }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cstCOFINSOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Alíquota (%)</Label>
                    <Input type="number" min="0" step="0.01" value={cofinsPJ.aliquota || ""} onChange={(e) => setCofinsPJ(prev => ({ ...prev, aliquota: e.target.value }))} />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <Label>Informações ao Fisco</Label>
                <Textarea value={infoFisco} onChange={(e) => setInfoFisco(e.target.value)} placeholder="Texto que será informado ao Fisco" />
              </div>
              <div>
                <Label>Informação Complementar</Label>
                <Textarea value={infoComplementar} onChange={(e) => setInfoComplementar(e.target.value)} placeholder="Observações adicionais ao cliente ou uso interno" />
              </div>
            </div>
          )}
        </div>

        {/* Barra de ações fixa abaixo do conteúdo rolável */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-500">
              {selectedCompany ? (
                <span>Empresa: {selectedCompany.razao_social} — CNPJ {selectedCompany.cnpj}</span>
              ) : (
                <span>{companies.length > 0 ? "Selecione uma empresa na etapa 1" : "Sem empresas cadastradas"}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <Button onClick={handleBack} variant="outline" size="lg">Voltar</Button>
              )}
              {currentStep < 6 ? (
                <Button onClick={handleNext} className="bg-novura-primary hover:bg-novura-primary/90" size="lg" disabled={!canProceed()}>Avançar</Button>
              ) : (
                <Button onClick={handleSave} className="bg-novura-primary hover:bg-novura-primary/90" size="lg" disabled={!canProceed()}>Salvar</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
