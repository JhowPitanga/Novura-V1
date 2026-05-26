import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { StepIndicator } from "@/components/products/create/StepIndicator";
import { X } from "lucide-react";
import { EditStep1Price } from "./steps/EditStep1Price";
import { EditStep2Shipping } from "./steps/EditStep2Shipping";
import { EditStep3TitleDescription } from "./steps/EditStep3TitleDescription";
import { EditStep4VariationsMedia } from "./steps/EditStep4VariationsMedia";
import { EditStep5Attributes } from "./steps/EditStep5Attributes";
import type { MarketplaceAdapter, ListingType, ListingPriceOption } from "@/adapters/listings/types";
import type { EditListingFlowState } from "@/hooks/useEditListingFlow";

interface EditListingShellProps {
  adapter: MarketplaceAdapter;
  flow: EditListingFlowState;
  itemId: string;
  categoryPath: string;
  listingTypes: ListingType[];
  listingPriceOptions: ListingPriceOption[];
  loadingListing: boolean;
  priceEditable: boolean;
  attrsMeta: any[];
  loadingAttrs: boolean;
  allowVariationAttrs: any[];
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  setSelectedLogisticType: (v: string) => void;
  preferFlex: boolean;
  setPreferFlex: (v: boolean) => void;
  canUseFlex: boolean;
  onSavePrice: () => Promise<void>;
  onSaveListingType: () => Promise<void>;
  onSaveShipping: () => Promise<void>;
  onSaveTitle: () => Promise<void>;
  onSaveDescription: () => Promise<void>;
  onSaveVariations: () => Promise<void>;
  onSavePictures: () => Promise<void>;
  onSaveVideo: () => Promise<void>;
  onSaveAttributes: () => Promise<void>;
  onToggleStatus: (active: boolean) => void;
  onClose: () => void;
}

export function EditListingShell({
  adapter,
  flow,
  itemId,
  categoryPath,
  listingTypes,
  listingPriceOptions,
  loadingListing,
  priceEditable,
  attrsMeta,
  loadingAttrs,
  allowVariationAttrs,
  availableLogisticTypes,
  selectedLogisticType,
  setSelectedLogisticType,
  preferFlex,
  setPreferFlex,
  canUseFlex,
  onSavePrice,
  onSaveListingType,
  onSaveShipping,
  onSaveTitle,
  onSaveDescription,
  onSaveVariations,
  onSavePictures,
  onSaveVideo,
  onSaveAttributes,
  onToggleStatus,
  onClose,
}: EditListingShellProps) {
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);

  const steps = adapter.getEditSteps();
  const itemRow = flow.itemRow?.raw;
  const permalink = String(itemRow?.permalink || flow.itemRow?.permalink || "");

  const coverSrc = (() => {
    const it = flow.pictures?.[0] as unknown;
    try {
      if (it instanceof File) return URL.createObjectURL(it);
      if (typeof it === "string") return it;
      if (it && typeof it === "object") {
        return String((it as { url?: string; secure_url?: string }).url || (it as { secure_url?: string }).secure_url || "");
      }
    } catch {
      return "";
    }
    return "";
  })();

  const renderStep = () => {
    if (flow.currentStep === 1) {
      return (
        <EditStep1Price
          adapter={adapter}
          price={flow.price}
          setPrice={flow.setPrice}
          listingTypeId={flow.listingTypeId}
          setListingTypeId={flow.setListingTypeId}
          listingTypes={listingTypes}
          listingPriceOptions={listingPriceOptions}
          loadingListing={loadingListing}
          saving={flow.saving}
          priceEditable={priceEditable}
          itemRow={itemRow}
          onSavePrice={onSavePrice}
          onSaveListingType={onSaveListingType}
        />
      );
    }

    if (flow.currentStep === 2) {
      return (
        <EditStep2Shipping
          adapter={adapter}
          shipping={flow.shipping}
          setShipping={flow.setShipping}
          availableLogisticTypes={availableLogisticTypes}
          selectedLogisticType={selectedLogisticType}
          setSelectedLogisticType={setSelectedLogisticType}
          preferFlex={preferFlex}
          setPreferFlex={setPreferFlex}
          canUseFlex={canUseFlex}
          itemRow={itemRow}
          saving={flow.saving}
          onSaveShipping={onSaveShipping}
        />
      );
    }

    if (flow.currentStep === 3) {
      return (
        <EditStep3TitleDescription
          adapter={adapter}
          title={flow.title}
          setTitle={flow.setTitle}
          description={flow.description}
          setDescription={flow.setDescription}
          soldQty={flow.soldQty}
          saving={flow.saving}
          onSaveTitle={onSaveTitle}
          onSaveDescription={onSaveDescription}
        />
      );
    }

    if (flow.currentStep === 4) {
      return (
        <EditStep4VariationsMedia
          adapter={adapter}
          variations={flow.variations}
          setVariations={flow.setVariations}
          pictures={flow.pictures}
          setPictures={flow.setPictures}
          videoId={flow.videoId}
          setVideoId={flow.setVideoId}
          primaryVariationIndex={primaryVariationIndex}
          setPrimaryVariationIndex={setPrimaryVariationIndex}
          allowVariationAttrs={allowVariationAttrs}
          price={flow.price}
          saving={flow.saving}
          onSaveVariations={onSaveVariations}
          onSavePictures={onSavePictures}
          onSaveVideo={onSaveVideo}
        />
      );
    }

    if (flow.currentStep === 5) {
      return (
        <EditStep5Attributes
          adapter={adapter}
          attrsMeta={attrsMeta}
          attributes={flow.attributes}
          setAttributes={flow.setAttributes}
          loadingAttrs={loadingAttrs}
          saving={flow.saving}
          showAllTechAttrs={showAllTechAttrs}
          setShowAllTechAttrs={setShowAllTechAttrs}
          onSaveAttributes={onSaveAttributes}
        />
      );
    }

    return null;
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100">
            {coverSrc ? (
              <img src={coverSrc} className="w-full h-full object-cover" alt="Capa" />
            ) : null}
          </div>
          <div>
            {permalink ? (
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-2xl font-bold text-novura-primary hover:underline"
              >
                {flow.title}
              </a>
            ) : (
              <h1 className="text-2xl font-bold text-gray-900">{flow.title}</h1>
            )}
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-gray-600">EM: {itemId}</span>
              <span className="text-sm text-novura-primary">{categoryPath}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>Status</span>
            <Switch
              checked={String(flow.status || "") === "active"}
              onCheckedChange={(c) => onToggleStatus(c)}
            />
          </label>
          <Button variant="ghost" className="text-gray-700" onClick={onClose}>
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <StepIndicator
        steps={steps}
        currentStep={flow.currentStep}
        clickable
        maxVisitedStep={flow.maxSteps}
        onStepClick={(id) => flow.setCurrentStep(id)}
        errorSteps={[]}
      />

      <Card className="mt-6 border border-gray-200 shadow-sm">
        <CardContent className="p-6 space-y-6">
          {flow.loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : (
            renderStep()
          )}
        </CardContent>
      </Card>
    </>
  );
}
