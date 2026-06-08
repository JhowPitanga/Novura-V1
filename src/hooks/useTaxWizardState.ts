import { useEffect, useMemo, useState } from "react";
import type {
  CompanyOption,
  IpiConfig,
  PisCofinsConfig,
  TaxRecord,
} from "@/components/settings/taxes/tax-payload";

export function useTaxWizardState(
  open: boolean,
  companies: CompanyOption[],
  initialData?: TaxRecord | null
) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(
    initialData?.companyId
  );
  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );
  const [isDefaultForCompany, setIsDefaultForCompany] = useState<boolean>(
    initialData?.isDefault || false
  );
  const [naturezaSaida, setNaturezaSaida] = useState<string>(
    (initialData?.payload?.basics as { naturezaSaida?: string })?.naturezaSaida || ""
  );
  const [naturezaEntrada, setNaturezaEntrada] = useState<string>(
    (initialData?.payload?.basics as { naturezaEntrada?: string })?.naturezaEntrada || ""
  );
  const [observacao, setObservacao] = useState<string>(initialData?.observacao || "");

  const [ipiPF, setIpiPF] = useState<IpiConfig>(
    (initialData?.payload?.ipi as { pf?: IpiConfig })?.pf || {}
  );
  const [ipiPJ, setIpiPJ] = useState<IpiConfig>(
    (initialData?.payload?.ipi as { pj?: IpiConfig })?.pj || {}
  );
  const [pisPF, setPisPF] = useState<PisCofinsConfig>(
    (initialData?.payload?.pis as { pf?: PisCofinsConfig })?.pf || {}
  );
  const [pisPJ, setPisPJ] = useState<PisCofinsConfig>(
    (initialData?.payload?.pis as { pj?: PisCofinsConfig })?.pj || {}
  );
  const [cofinsPF, setCofinsPF] = useState<PisCofinsConfig>(
    (initialData?.payload?.cofins as { pf?: PisCofinsConfig })?.pf || {}
  );
  const [cofinsPJ, setCofinsPJ] = useState<PisCofinsConfig>(
    (initialData?.payload?.cofins as { pj?: PisCofinsConfig })?.pj || {}
  );
  const [infoFisco, setInfoFisco] = useState<string>(
    (initialData?.payload?.adicionais as { infoFisco?: string })?.infoFisco || ""
  );
  const [infoComplementar, setInfoComplementar] = useState<string>(
    (initialData?.payload?.adicionais as { infoComplementar?: string })?.infoComplementar || ""
  );

  useEffect(() => {
    if (!open) setCurrentStep(1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setCurrentStep(1);
    setSelectedCompanyId(initialData?.companyId);
    setIsDefaultForCompany(Boolean(initialData?.isDefault));
    setNaturezaSaida(
      (initialData?.payload?.basics as { naturezaSaida?: string })?.naturezaSaida || ""
    );
    setNaturezaEntrada(
      (initialData?.payload?.basics as { naturezaEntrada?: string })?.naturezaEntrada || ""
    );
    setObservacao(initialData?.observacao || "");
    setIpiPF((initialData?.payload?.ipi as { pf?: IpiConfig })?.pf || {});
    setIpiPJ((initialData?.payload?.ipi as { pj?: IpiConfig })?.pj || {});
    setPisPF((initialData?.payload?.pis as { pf?: PisCofinsConfig })?.pf || {});
    setPisPJ((initialData?.payload?.pis as { pj?: PisCofinsConfig })?.pj || {});
    setCofinsPF((initialData?.payload?.cofins as { pf?: PisCofinsConfig })?.pf || {});
    setCofinsPJ((initialData?.payload?.cofins as { pj?: PisCofinsConfig })?.pj || {});
    setInfoFisco(
      (initialData?.payload?.adicionais as { infoFisco?: string })?.infoFisco || ""
    );
    setInfoComplementar(
      (initialData?.payload?.adicionais as { infoComplementar?: string })?.infoComplementar || ""
    );
  }, [open, initialData]);

  const canProceed = () => {
    if (currentStep === 1) {
      if (!observacao || observacao.trim().length < 2) return false;
      if (!naturezaSaida || naturezaSaida.trim().length < 2) return false;
    }
    return true;
  };

  const handleNext = () => setCurrentStep((s) => Math.min(6, s + 1));
  const handleBack = () => setCurrentStep((s) => Math.max(1, s - 1));

  return {
    currentStep,
    setCurrentStep,
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
  };
}
