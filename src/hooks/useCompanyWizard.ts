import { useState } from 'react';
import { toast } from 'sonner';
import type { EmpresaData } from '@/services/company.service';
import type { CertVerifyStatus } from './useCertVerification';

interface UseCompanyWizardOptions {
  empresaData: EmpresaData;
  cnpjBlocked: boolean;
  certVerifyStatus: CertVerifyStatus;
  pfxFileRef: React.MutableRefObject<File | null>;
  handleSave: () => void;
}

interface UseCompanyWizardReturn {
  currentStep: number;
  setCurrentStep: (n: number) => void;
  showErrors: boolean;
  handleNext: () => void;
  handleBack: () => void;
  canProceed: () => boolean;
  closeDialogOpen: boolean;
  setCloseDialogOpen: (v: boolean) => void;
}

/**
 * Wizard step navigation, canProceed validation, and close-dialog state.
 * Preserves per-step required-field lists, cnpjBlocked hard-stop, and cert gate.
 */
export const useCompanyWizard = ({
  empresaData,
  cnpjBlocked,
  certVerifyStatus,
  pfxFileRef,
  handleSave,
}: UseCompanyWizardOptions): UseCompanyWizardReturn => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        if (cnpjBlocked) return false;
        return Boolean(
          empresaData.razao_social &&
          empresaData.cnpj &&
          empresaData.tipo_empresa &&
          empresaData.tributacao &&
          empresaData.email &&
          empresaData.cep &&
          empresaData.cidade &&
          empresaData.estado &&
          empresaData.endereco &&
          empresaData.numero &&
          empresaData.bairro
        );
      case 2:
        if (pfxFileRef.current) return certVerifyStatus === 'valid';
        return true;
      case 3:
        return Boolean(empresaData.numero_serie && empresaData.proxima_nfe);
      case 4:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      setShowErrors(true);
      const baseMsg = cnpjBlocked
        ? `CNPJ em situação '${empresaData.situacao_cnpj || ''}'. Não é possível prosseguir.`
        : 'Preencha todos os campos obrigatórios antes de prosseguir.';
      toast.error(baseMsg);
      return;
    }
    setShowErrors(false);
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else if (currentStep === 4) {
      handleSave();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  return {
    currentStep,
    setCurrentStep,
    showErrors,
    handleNext,
    handleBack,
    canProceed,
    closeDialogOpen,
    setCloseDialogOpen,
  };
};
