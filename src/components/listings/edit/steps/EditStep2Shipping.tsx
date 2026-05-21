import { EditListingStepShippingWrapper } from "@/components/listings/EditListingStepShippingWrapper";
import { EditListingShippingDimensions } from "@/components/listings/edit/EditListingShippingDimensions";
import type { MarketplaceAdapter } from "@/adapters/listings/types";
import { Button } from "@/components/ui/button";

interface EditStep2ShippingProps {
  adapter: MarketplaceAdapter;
  shipping: any;
  setShipping: (v: any | ((prev: any) => any)) => void;
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  setSelectedLogisticType: (v: string) => void;
  preferFlex: boolean;
  setPreferFlex: (v: boolean) => void;
  canUseFlex: boolean;
  itemRow: any;
  saving: string | null;
  onSaveShipping: () => Promise<void>;
}

export function EditStep2Shipping({
  adapter,
  shipping,
  setShipping,
  availableLogisticTypes,
  selectedLogisticType,
  setSelectedLogisticType,
  preferFlex,
  setPreferFlex,
  canUseFlex,
  itemRow,
  saving,
  onSaveShipping,
}: EditStep2ShippingProps) {
  const isML = adapter.channel === 'mercado-livre';
  const weightUnit = adapter.capabilities.shippingWeightUnit;

  if (isML) {
    return (
      <EditListingStepShippingWrapper
        shipping={shipping}
        availableLogisticTypes={availableLogisticTypes}
        selectedLogisticType={selectedLogisticType}
        canUseFlex={canUseFlex}
        preferFlex={preferFlex}
        mandatoryFreeShipping={!!(itemRow as any)?.mandatory_free_shipping}
        savingKey={saving}
        onShippingChange={setShipping}
        onSelectLogisticType={setSelectedLogisticType}
        onToggleFlex={setPreferFlex}
        onConfirmShipping={onSaveShipping}
      />
    );
  }

  return (
    <div className="space-y-6">
      <EditListingShippingDimensions
        shipping={shipping}
        setShipping={setShipping}
        weightUnit={weightUnit}
        weightLabel={`Peso (${weightUnit})`}
      />
      <Button onClick={onSaveShipping} disabled={saving === "shipping"} size="sm">
        {saving === "shipping" ? "Salvando..." : "Salvar envio"}
      </Button>
    </div>
  );
}
