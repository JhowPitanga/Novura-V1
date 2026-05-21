import { NavigationButtons } from '@/components/products/create/NavigationButtons';

interface ListingNavigationButtonsProps {
  currentStep: number;
  maxSteps: number;
  canProceed: () => boolean;
  loading?: boolean;
  onNext: () => void;
  onBack: () => void;
  onSave?: () => void;
  saveLabel?: string;
}

/** Navigation footer for listing create/edit flows (same UI as product forms). */
export function ListingNavigationButtons({
  currentStep,
  maxSteps,
  canProceed,
  loading = false,
  onNext,
  onBack,
  onSave,
  saveLabel,
}: ListingNavigationButtonsProps) {
  return (
    <NavigationButtons
      currentStep={currentStep}
      maxSteps={maxSteps}
      productType="ml"
      variationEtapa=""
      canProceedVariation={() => true}
      canProceedExternal={canProceed}
      loading={loading}
      onNext={onNext}
      onBack={onBack}
      onSave={onSave ?? onNext}
      kitEtapa=""
      saveLabel={saveLabel}
    />
  );
}
