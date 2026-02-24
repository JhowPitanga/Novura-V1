import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StepShipping } from "@/components/listings/StepShipping";
import type { EditListingStepShippingProps } from "./editListing.types";

/**
 * Wrapper for the shipping step in EditListingML: renders StepShipping,
 * optional Flex block, and the save button. State and callbacks come from parent.
 */
export function EditListingStepShippingWrapper({
  shipping,
  availableLogisticTypes,
  selectedLogisticType,
  canUseFlex,
  preferFlex,
  mandatoryFreeShipping,
  savingKey,
  onShippingChange,
  onSelectLogisticType,
  onToggleFlex,
  onConfirmShipping,
}: EditListingStepShippingProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Configuração de Envio</h3>
      </div>
      <StepShipping
        shipping={shipping}
        setShipping={onShippingChange}
        freeShippingMandatory={mandatoryFreeShipping}
        availableLogisticTypes={availableLogisticTypes}
        selectedLogisticType={selectedLogisticType}
        setSelectedLogisticType={onSelectLogisticType}
      />
      {canUseFlex && (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">Flex</div>
          <div
            className={`mt-2 border rounded-xl p-3 bg-white cursor-default transition-all ${
              preferFlex ? "border-novura-primary" : "border-gray-300 hover:border-novura-primary hover:bg-novura-light"
            } w-[320px] md:w-[360px] shrink-0`}
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-novura-primary">Flex</div>
              {preferFlex ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-novura-primary text-white">Selecionado</span>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1">
              {[
                "O custo de entrega é igual ao definido pelo Envios no Mercado Livre.",
                "Se você oferece frete grátis, o custo do frete é por sua conta.",
                "Se você não oferecer frete grátis, vai receber até R$15,90 por envio.",
              ].map((tip, i) => (
                <li key={i} className="flex items-start text-xs text-gray-700">
                  <span className="mt-1 mr-2 inline-block w-2 h-2 rounded-full bg-novura-primary" />
                  {tip}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center space-x-2">
              <Checkbox checked={preferFlex} onCheckedChange={(checked) => onToggleFlex(checked === true)} />
              <span className="text-xs">Usar flex</span>
            </div>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={onConfirmShipping} disabled={savingKey === "shipping"}>
          {savingKey === "shipping" ? "Salvando..." : "Salvar Envio"}
        </Button>
      </div>
    </div>
  );
}
