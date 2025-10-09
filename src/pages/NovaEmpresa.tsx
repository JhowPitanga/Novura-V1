import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StepIndicator } from "@/components/produtos/criar/StepIndicator";
import { NavigationButtons } from "@/components/produtos/criar/NavigationButtons";
import { EmpresaStep1 } from "@/components/configuracoes/empresa/EmpresaStep1";
import { EmpresaStep2 } from "@/components/configuracoes/empresa/EmpresaStep2";
import { EmpresaStep3 } from "@/components/configuracoes/empresa/EmpresaStep3";
import { EmpresaStep4 } from "@/components/configuracoes/empresa/EmpresaStep4";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  certificado_a1_url?: string;
  certificado_senha?: string;
  certificado_validade?: string;
  lojas_associadas: string[];
  numero_serie: string;
  proxima_nfe: number;
}

export function NovaEmpresa() {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
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
    lojas_associadas: [],
    numero_serie: "",
    proxima_nfe: 1
  });
  const navigate = useNavigate();

  const updateEmpresaData = (data: Partial<EmpresaData>) => {
    setEmpresaData(prev => ({ ...prev, ...data }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
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
    if (canProceed() && currentStep < 4) {
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
        return <EmpresaStep1 data={empresaData} updateData={updateEmpresaData} />;
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
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Adicionar Nova Empresa</h1>
        <p className="text-gray-600">Configure uma nova empresa para emissão de notas fiscais</p>
      </div>

      <StepIndicator steps={steps} currentStep={currentStep} />

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        {renderCurrentStep()}

        <NavigationButtons
          currentStep={currentStep}
          maxSteps={4}
          productType="company"
          loading={loading}
          onNext={handleNext}
          onBack={handleBack}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}