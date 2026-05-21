import { StepShipping } from '@/components/listings/StepShipping';

interface Step7ShippingProps {
  shipping: any;
  setShipping: (v: any) => void;
  freeShippingMandatory: boolean;
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  setSelectedLogisticType: (v: string) => void;
}

export function Step7Shipping({
  shipping,
  setShipping,
  freeShippingMandatory,
  availableLogisticTypes,
  selectedLogisticType,
  setSelectedLogisticType,
}: Step7ShippingProps) {
  return (
    <StepShipping
      shipping={shipping}
      setShipping={setShipping}
      freeShippingMandatory={freeShippingMandatory}
      availableLogisticTypes={availableLogisticTypes}
      selectedLogisticType={selectedLogisticType}
      setSelectedLogisticType={setSelectedLogisticType}
    />
  );
}
