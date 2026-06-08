import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { uploadLogoFromFile, fetchCompany, fetchConnectedStores, companyKeys, mapCompanyRowToForm } from "@/services/company.service";
import type { EmpresaData, ConnectedStore } from "@/services/company.service";
import { useCnpjLookup } from "@/hooks/useCnpjLookup";
import { useCertVerification } from "@/hooks/useCertVerification";
import { useCompanyWizard } from "@/hooks/useCompanyWizard";
import { useCompanySave } from "@/hooks/useCompanySave";
import { useAuth } from "@/hooks/useAuth";
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { NavigationButtons } from "@/components/products/create/NavigationButtons";
import { CompanyStep1 } from "@/components/settings/company/CompanyStep1";
import { CompanyStep2 } from "@/components/settings/company/CompanyStep2";
import { CompanyStep3 } from "@/components/settings/company/CompanyStep3";
import { CompanyStep4 } from "@/components/settings/company/CompanyStep4";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { GlobalHeader } from "@/components/GlobalHeader";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const steps = [
  { id: 1, title: "Configuração", description: "Dados da empresa" },
  { id: 2, title: "Certificado A1", description: "Certificado digital" },
  { id: 3, title: "NF-e", description: "Configurações fiscais" },
  { id: 4, title: "Associações", description: "Lojas integradas" },
];

const INITIAL_EMPRESA: EmpresaData = {
  razao_social: "", cnpj: "", tipo_empresa: "", tributacao: "",
  inscricao_estadual: "", email: "", cep: "", cidade: "", estado: "",
  endereco: "", numero: "", bairro: "", complemento: "", logo_url: "",
  lojas_associadas: [], numero_serie: "", proxima_nfe: 0, situacao_cnpj: "",
};

export function NovaEmpresa() {
  const { organizationId, user, session } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editCompanyId = searchParams.get("companyId");
  const logoFileRef = useRef<File | null>(null);
  const [empresaData, setEmpresaData] = useState<EmpresaData>(INITIAL_EMPRESA);
  const updateEmpresaData = (data: Partial<EmpresaData>) =>
    setEmpresaData(prev => ({ ...prev, ...data }));

  const { data: companyRow } = useQuery({
    queryKey: companyKeys.detail(editCompanyId || '', organizationId || ''),
    queryFn: () => fetchCompany(editCompanyId!, organizationId!),
    enabled: !!editCompanyId && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: connectedStores = [], isLoading: loadingStores } = useQuery<ConnectedStore[]>({
    queryKey: companyKeys.connectedStores(organizationId || ''),
    queryFn: () => fetchConnectedStores(organizationId!),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
  const { cnpjBlocked, cnpjBlockMessage, isCnpjLoading, triggerLookup, lastFetchedRef } =
    useCnpjLookup({ onResult: updateEmpresaData });
  useEffect(() => { triggerLookup(empresaData.cnpj); }, [empresaData.cnpj]); // eslint-disable-line
  useEffect(() => {
    if (!companyRow) return;
    lastFetchedRef.current = String(companyRow.cnpj || '').replace(/\D/g, '');
    setEmpresaData(prev => ({ ...prev, ...mapCompanyRowToForm(companyRow as Record<string, unknown>, prev) }));
  }, [companyRow]); // eslint-disable-line
  const { certVerifyStatus, pfxFileRef, handlePfxSelected, handleVerifyCertPassword } =
    useCertVerification({
      senha: empresaData.certificado_senha || '',
      onValidityFound: (dateBR) => updateEmpresaData({ certificado_validade: dateBR }),
    });
  const handleLogoSelected = async (file: File | null) => {
    logoFileRef.current = file;
    if (!file) { updateEmpresaData({ logo_url: '' }); return; }
    try {
      updateEmpresaData({ logo_url: URL.createObjectURL(file) });
      const publicUrl = await uploadLogoFromFile(file, organizationId);
      if (publicUrl) updateEmpresaData({ logo_url: publicUrl });
    } catch { /* mantém preview */ }
  };
  const { handleSave, loading } = useCompanySave({
    empresaData, editCompanyId, organizationId: organizationId || null,
    session: session || null, pfxFileRef, user: user || null,
  });
  const { currentStep, setCurrentStep, showErrors, handleNext, handleBack, canProceed, closeDialogOpen, setCloseDialogOpen } =
    useCompanyWizard({ empresaData, cnpjBlocked, certVerifyStatus, pfxFileRef, handleSave });
  // Apply ?step=N URL param on mount
  useEffect(() => {
    const s = parseInt(searchParams.get('step') || '', 10);
    if (!isNaN(s) && s >= 1 && s <= 4) setCurrentStep(s);
  }, []); // eslint-disable-line

  // ── Step renderer (intentional swap: case3→CompanyStep4, case4→CompanyStep3) ─
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <CompanyStep1 data={empresaData} updateData={updateEmpresaData} showErrors={showErrors} cnpjBlocked={cnpjBlocked} onLogoSelected={handleLogoSelected} />;
      case 2:
        return (
          <CompanyStep2
            data={empresaData}
            updateData={updateEmpresaData}
            onPfxSelected={(file) => handlePfxSelected(file, () => updateEmpresaData({ certificado_validade: '' }))}
            onCertPasswordChange={(pwd) => updateEmpresaData({ certificado_senha: pwd })}
            onVerifyPassword={handleVerifyCertPassword}
            verifyStatus={certVerifyStatus}
          />
        );
      case 3:
        return <CompanyStep4 data={empresaData} updateData={updateEmpresaData} />; // NF-e agora no Step 3
      case 4:
        return <CompanyStep3 data={empresaData} updateData={updateEmpresaData} connectedStores={connectedStores} loadingStores={loadingStores} />;
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{editCompanyId ? 'Editar Empresa' : 'Adicionar Nova Empresa'}</h1>
                    <p className="text-gray-600">{editCompanyId ? 'Atualize os dados da empresa e renove o certificado A1' : 'Configure uma nova empresa para emissão de notas fiscais'}</p>
                  </div>
                  <Button variant="outline" onClick={() => setCloseDialogOpen(true)}>Fechar formulário</Button>
                </div>
              </div>

              <StepIndicator steps={steps} currentStep={currentStep} clickable={true} maxVisitedStep={4} onStepClick={(id) => setCurrentStep(id)} />

              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 relative">
                {isCnpjLoading && (
                  <div className="absolute inset-0 bg-novura-primary/10 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex items-center gap-3 text-novura-primary">
                      <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                      <span>Consultando dados do CNPJ...</span>
                    </div>
                  </div>
                )}
                {cnpjBlocked && (
                  <div className="mb-6 rounded-md border border-red-300 bg-red-50 p-4">
                    <p className="text-red-700 font-medium">CNPJ em situação {empresaData.situacao_cnpj || ""}</p>
                    <p className="text-red-700 text-sm">{cnpjBlockMessage} Não podemos prosseguir com a emissão de NF-e com este CNPJ.</p>
                  </div>
                )}
                {renderCurrentStep()}
                <div className="mt-8 flex items-center justify-between">
                  <NavigationButtons currentStep={currentStep} maxSteps={4} productType="company" loading={loading}
                    onNext={handleNext} onBack={handleBack} onSave={handleSave} canProceedCompany={canProceed}
                    saveLabel={editCompanyId ? "Salvar alterações" : "Salvar Empresa"} />
                </div>
              </div>
              <AlertDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fechar formulário?</AlertDialogTitle>
                    <AlertDialogDescription>Deseja salvar os dados antes de sair do formulário?</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continuar editando</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => navigate('/configuracoes')}>Sair sem salvar</AlertDialogAction>
                    <AlertDialogAction onClick={handleSave}>Salvar e sair</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default NovaEmpresa;
