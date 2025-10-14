import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { EmpresaStep1 } from "@/components/configuracoes/empresa/EmpresaStep1";
import { EmpresaStep2 } from "@/components/configuracoes/empresa/EmpresaStep2";
import { EmpresaStep3 } from "@/components/configuracoes/empresa/EmpresaStep3";
import { EmpresaStep4 } from "@/components/configuracoes/empresa/EmpresaStep4";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";

const steps = [
  { id: 1, title: "Configuração", description: "Dados da empresa" },
  { id: 2, title: "Certificado A1", description: "Certificado digital" },
  { id: 3, title: "Associações", description: "Lojas integradas" },
  { id: 4, title: "NF-e", description: "Configurações fiscais" }
];

interface EmpresaData {
  razao_social: string;
  cnpj: string;
  tipo_empresa: string;
  tributacao: string;
  inscricao_estadual: string;
  email: string;
  cep: string;
  cidade: string;
  estado: string;
  endereco: string;
  numero: string;
  bairro: string;
  complemento?: string;
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
  lojas_associadas: string[];
  numero_serie: string;
  proxima_nfe: number;
  situacao_cnpj?: string; // novo campo para validação de situação
}

export function NovaEmpresa() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isCnpjLoading, setIsCnpjLoading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [cnpjBlocked, setCnpjBlocked] = useState(false);
  const [cnpjBlockMessage, setCnpjBlockMessage] = useState("");
  const debounceRef = useRef<number | null>(null);
  const lastFetchedRef = useRef<string>("");
  const [empresaData, setEmpresaData] = useState<EmpresaData>({
    razao_social: "",
    cnpj: "",
    tipo_empresa: "",
    tributacao: "",
    inscricao_estadual: "",
    email: "",
    cep: "",
    cidade: "",
    estado: "",
    endereco: "",
    numero: "",
    bairro: "",
    complemento: "",
    lojas_associadas: [],
    numero_serie: "",
    proxima_nfe: 1,
    situacao_cnpj: "",
  });
  const navigate = useNavigate();

  const updateEmpresaData = (data: Partial<EmpresaData>) => {
    setEmpresaData(prev => ({ ...prev, ...data }));
  };

  // Validação de dígito verificador de CNPJ
  const isValidCNPJ = (cnpj: string) => {
    const digits = (cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(digits)) return false; // rejeita todos os dígitos iguais
  
    const calcDV = (length: number) => {
      const weights = length === 12
        ? [5,4,3,2,9,8,7,6,5,4,3,2]
        : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      let sum = 0;
      for (let i = 0; i < weights.length; i++) {
        sum += parseInt(digits[i], 10) * weights[i];
      }
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
  
    const dv1 = calcDV(12);
    if (dv1 !== parseInt(digits[12], 10)) return false;
    const dv2 = calcDV(13);
    if (dv2 !== parseInt(digits[13], 10)) return false;
    return true;
  };

  // Normaliza texto da situação
  const normalizeSituacao = (s: string) => {
    const noAccents = String(s || "").normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return noAccents.trim().toUpperCase();
  };

  const getCnpjBlockInfo = (situacao: string) => {
    const norm = normalizeSituacao(situacao);
    const rules: { re: RegExp; msg: string }[] = [
      { re: /BAIXAD[OA]/, msg: "Empresa foi encerrada. Um CNPJ baixado não pode ser reativado." },
      { re: /\bNULA\b/, msg: "CNPJ inválido ou anulado pela Receita Federal, geralmente por fraude ou duplicidade." },
      { re: /SUSPENS[OA]/, msg: "Empresa com pendências cadastrais/fiscais. É necessário regularizar para voltar a operar." },
      { re: /INAPT[OA]/, msg: "CNPJ declarado inapto por omissão prolongada de declarações ou irregularidades." },
      // Bloqueio total conforme solicitado
      { re: /ATIVA.*NAO.*REGULAR/, msg: "CNPJ ATIVA NÃO REGULAR. Bloqueio total até regularização cadastral." },
      { re: /PROCESSO.*BAIXA/, msg: "CNPJ EM PROCESSO DE BAIXA. Bloqueio total para emissão de NF-e." },
      { re: /SITUACAO.*ESPECIAL/, msg: "CNPJ em SITUAÇÃO ESPECIAL. Bloqueio total até normalização." },
    ];
    for (const r of rules) {
      if (r.re.test(norm)) return r.msg;
    }
    return null;
  };

  // Busca automática de dados pelo CNPJ via Edge Function
  const fetchCompanyDataFromCNPJ = async (cnpjDigits: string): Promise<Partial<EmpresaData> | null> => {
    setIsCnpjLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("cnpj-lookup", {
        body: { cnpj: cnpjDigits, days: 365 },
      });
      if (error) {
        throw new Error(typeof error === "string" ? error : (error.message || "Erro na função cnpj-lookup"));
      }
      if (data?.ok && data?.data) {
        return data.data as Partial<EmpresaData>;
      }
      throw new Error(data?.error || "Resposta inesperada da função cnpj-lookup");
    } catch (err: any) {
      console.error("Falha na consulta do CNPJ:", err);
      const msg = String(err?.message || err);
      if (msg.includes("Failed to send a request")) {
        toast.error("Falha de rede ao acessar a Edge Function. Verifique se 'cnpj-lookup' está implantada no seu projeto Supabase.");
      } else {
        toast.error("Não foi possível consultar o CNPJ agora. Tente novamente.");
      }
      return null;
    } finally {
      setIsCnpjLoading(false);
    }
  };

  useEffect(() => {
    const digits = (empresaData.cnpj || "").replace(/\D/g, "");
    if (digits.length === 14) {
      if (!isValidCNPJ(digits)) {
        // Evita chamadas desnecessárias quando o CNPJ é inválido
        toast.error("CNPJ inválido. Verifique os dígitos e tente novamente.");
        return;
      }
      if (digits !== lastFetchedRef.current) {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(async () => {
          const result = await fetchCompanyDataFromCNPJ(digits);
          if (result) {
            updateEmpresaData(result);
            lastFetchedRef.current = digits;
            // Avalia situação e aplica bloqueio se necessário
            const situRaw = String((result as any).situacao_cnpj || empresaData.situacao_cnpj || "");
            const norm = normalizeSituacao(situRaw);
            const msg = getCnpjBlockInfo(situRaw);
            console.log("[CNPJ] avaliação situação", { situRaw, norm, msg });
            if (msg) {
              setCnpjBlocked(true);
              setCnpjBlockMessage(msg);
            } else {
              setCnpjBlocked(false);
              setCnpjBlockMessage("");
            }
            toast.success("Dados do CNPJ carregados automaticamente");
          }
        }, 600);
      }
    }
    // Cleanup do debounce quando cnpj muda ou componente desmonta
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [empresaData.cnpj]);

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        if (cnpjBlocked) return false;
        return empresaData.razao_social && empresaData.cnpj && empresaData.tipo_empresa && 
               empresaData.tributacao && empresaData.email && empresaData.cep && 
               empresaData.cidade && empresaData.estado && empresaData.endereco && 
               empresaData.numero && empresaData.bairro;
      case 2:
        return true; // Certificado é opcional
      case 3:
        return true; // Lojas são opcionais
      case 4:
        return empresaData.numero_serie && empresaData.proxima_nfe;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      setShowErrors(true);
      const baseMsg = cnpjBlocked
        ? `CNPJ em situação '${empresaData.situacao_cnpj || ""}'. Não é possível prosseguir.`
        : "Preencha todos os campos obrigatórios antes de prosseguir.";
      toast.error(baseMsg);
      return;
    }
    setShowErrors(false);
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    } else if (currentStep === 4) {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('companies')
        .insert([{ ...empresaData, user_id: user.id, is_active: true } as any]);

      if (error) throw error;

      toast.success('Empresa cadastrada com sucesso!');
      navigate('/configuracoes');
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
      toast.error('Erro ao salvar empresa');
    } finally {
      setLoading(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <EmpresaStep1 data={empresaData} updateData={updateEmpresaData} showErrors={showErrors} cnpjBlocked={cnpjBlocked} />;
      case 2:
        return <EmpresaStep2 data={empresaData} updateData={updateEmpresaData} />;
      case 3:
        return <EmpresaStep3 data={empresaData} updateData={updateEmpresaData} />;
      case 4:
        return <EmpresaStep4 data={empresaData} updateData={updateEmpresaData} />;
      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <GlobalHeader />
          <main className="flex-1 p-6 overflow-auto">
            <div className="p-8 max-w-4xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Adicionar Nova Empresa</h1>
                <p className="text-gray-600">Configure uma nova empresa para emissão de notas fiscais</p>
              </div>
  
              <StepIndicator steps={steps} currentStep={currentStep} />
  
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 relative">
                {isCnpjLoading && (
                  <div className="absolute inset-0 bg-novura-primary/10 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex items-center gap-3 text-novura-primary">
                      {/* Simple SVG spinner */}
                      <svg className="animate-spin h-6 w-6 text-novura-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <span>Consultando dados do CNPJ na ReceitaWS...</span>
                    </div>
                  </div>
                )}

                {cnpjBlocked && (
                  <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4">
                    <p className="text-red-700 font-medium">
                      CNPJ em situação {empresaData.situacao_cnpj || ""}
                    </p>
                    <p className="text-red-700 text-sm">
                      {cnpjBlockMessage} Não podemos prosseguir com a emissão de NF-e com este CNPJ.
                    </p>
                  </div>
                )}

                {renderCurrentStep()}

                <div className="mt-8 flex items-center justify-between">
                  <NavigationButtons
                    currentStep={currentStep}
                    maxSteps={4}
                    productType="company"
                    loading={loading}
                    onNext={handleNext}
                    onBack={handleBack}
                    onSave={handleSave}
                    canProceedCompany={canProceed}
                  />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default NovaEmpresa;