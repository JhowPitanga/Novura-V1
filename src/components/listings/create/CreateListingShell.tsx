import { useCallback, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/products/create/StepIndicator';
import { ListingNavigationButtons } from '@/components/listings/shared/ListingNavigationButtons';
import { useCreateListingAttributes } from '@/hooks/useCreateListingAttributes';
import { useCreateListingCategories } from '@/hooks/useCreateListingCategories';
import { Step1Marketplace } from './steps/Step1Marketplace';
import { Step2TitleCategory } from './steps/Step2TitleCategory';
import { Step3Attributes } from './steps/Step3Attributes';
import { Step4Variations } from './steps/Step4Variations';
import { Step5TechSpecs } from './steps/Step5TechSpecs';
import { Step6Pricing } from './steps/Step6Pricing';
import { Step7Shipping } from './steps/Step7Shipping';
import { Step8Review } from './steps/Step8Review';
import type { MarketplaceAdapter } from '@/adapters/listings/types';
import type { CreateListingFlowState } from '@/hooks/useCreateListingFlow';

interface CreateListingShellProps {
  adapter: MarketplaceAdapter | null;
  flow: CreateListingFlowState;
  organizationId: string;
  marketplaceSelection: string;
  onMarketplaceSelect: (name: string, adapter: MarketplaceAdapter) => void;
  onPublish: () => void;
}

export function CreateListingShell({
  adapter,
  flow,
  organizationId,
  marketplaceSelection,
  onMarketplaceSelect,
  onPublish,
}: CreateListingShellProps) {
  const [showAllTechAttrs, setShowAllTechAttrs] = useState(false);
  const [primaryVariationIndex, setPrimaryVariationIndex] = useState<number | null>(null);

  const isShopeeMode = adapter?.channel === 'shopee';

  const steps = useMemo(() => {
    if (isShopeeMode) {
      return [
        { id: 1, title: 'Marketplace', description: 'Escolha o marketplace' },
        { id: 2, title: 'Título e Categoria', description: 'Defina título e categoria' },
        { id: 3, title: 'Mídia e Descrição', description: 'Fotos e descrição' },
        { id: 4, title: 'Ficha técnica', description: 'Ficha técnica' },
        { id: 5, title: 'Informações de Vendas', description: 'Simples ou Variantes' },
        { id: 7, title: 'Envio', description: 'Envio e dimensões' },
        { id: 8, title: 'Revisão', description: 'Revisão e publicação' },
      ];
    }
    return adapter?.getCreateSteps() ?? [
      { id: 1, title: 'Marketplace', description: 'Escolha o marketplace' },
      { id: 2, title: 'Categoria', description: 'Defina Categoria' },
      { id: 3, title: 'Atributos', description: 'Dados obrigatórios' },
      { id: 4, title: 'Variações', description: 'Variações e Mídia' },
      { id: 5, title: 'Ficha Técnica', description: 'Ficha técnica' },
      { id: 6, title: 'Preço e Publicação', description: 'Preço e publicação' },
      { id: 7, title: 'Envio', description: 'Envio e dimensões' },
      { id: 8, title: 'Revisão', description: 'Revisão e publicação' },
    ];
  }, [adapter, isShopeeMode]);

  const { filteredAttrs } = useCreateListingAttributes({
    attrsMeta: flow.attrsMeta,
    conditionalRequiredIds: flow.conditionalRequiredIds,
    techSpecsInput: flow.techSpecsInput,
  });

  const categories = useCreateListingCategories({
    adapter: adapter ?? undefined,
    organizationId,
    siteId: flow.siteId,
    title: flow.title,
    categoryId: flow.categoryId,
    setCategoryId: flow.setCategoryId,
    currentStep: flow.currentStep,
  });

  const categoryPath =
    categories.pathsByCategoryId[String(flow.categoryId || '')] || String(flow.categoryId || '');

  const canProceed = useCallback((): boolean => {
    if (flow.currentStep === 3 && !isShopeeMode) {
      const reqIds = new Set<string>(filteredAttrs.required.map((a: any) => String(a.id)));
      const filled = new Set<string>(
        (flow.attributes || []).map((a: any) => String(a.id)).filter(Boolean),
      );
      const missing = Array.from(reqIds).filter((id) => !filled.has(id));
      if (missing.length > 0 || !flow.description.trim()) return false;
    }
    if (flow.currentStep === 4 && !isShopeeMode) {
      return flow.variations.length > 0;
    }
    return flow.canProceedCheck();
  }, [flow, filteredAttrs.required, isShopeeMode]);

  const showVariations =
    (isShopeeMode && flow.currentStep === 5) || (!isShopeeMode && flow.currentStep === 4);
  const showTechSpecs =
    (isShopeeMode && flow.currentStep === 4) || (!isShopeeMode && flow.currentStep === 5);

  const renderStep = () => {
    if (flow.currentStep === 1) {
      return (
        <Step1Marketplace
          connectedApps={flow.connectedApps}
          selectedName={marketplaceSelection}
          onSelect={onMarketplaceSelect}
        />
      );
    }

    if (!adapter) return null;

    if (flow.currentStep === 2) {
      return (
        <Step2TitleCategory
          adapter={adapter}
          organizationId={organizationId}
          siteId={flow.siteId}
          title={flow.title}
          setTitle={flow.setTitle}
          categoryId={flow.categoryId}
          setCategoryId={flow.setCategoryId}
        />
      );
    }

    if (flow.currentStep === 3) {
      return (
        <Step3Attributes
          adapter={adapter}
          attrsMeta={flow.attrsMeta}
          conditionalRequiredIds={flow.conditionalRequiredIds}
          techSpecsInput={flow.techSpecsInput}
          attributes={flow.attributes}
          setAttributes={flow.setAttributes}
          pictures={flow.pictures}
          setPictures={flow.setPictures as (v: string[]) => void}
          video={flow.video}
          setVideo={flow.setVideo}
          description={flow.description}
          setDescription={flow.setDescription}
          loadingAttrs={flow.loading}
        />
      );
    }

    if (showVariations) {
      return (
        <Step4Variations
          adapter={adapter}
          attrsMeta={flow.attrsMeta}
          conditionalRequiredIds={flow.conditionalRequiredIds}
          techSpecsInput={flow.techSpecsInput}
          brandList={flow.brandList}
          attributes={flow.attributes}
          setAttributes={flow.setAttributes}
          pictures={flow.pictures}
          variations={flow.variations}
          setVariations={flow.setVariations}
          variationsEnabled={flow.variationsEnabled}
          setVariationsEnabled={flow.setVariationsEnabled}
          primaryVariationIndex={primaryVariationIndex}
          setPrimaryVariationIndex={setPrimaryVariationIndex}
          availableQuantity={flow.availableQuantity}
          setAvailableQuantity={flow.setAvailableQuantity}
        />
      );
    }

    if (showTechSpecs) {
      return (
        <Step5TechSpecs
          adapter={adapter}
          attrsMeta={flow.attrsMeta}
          conditionalRequiredIds={flow.conditionalRequiredIds}
          techSpecsInput={flow.techSpecsInput}
          techSpecsOutput={flow.techSpecsOutput}
          setTechSpecsOutput={flow.setTechSpecsOutput}
          showAllTechAttrs={showAllTechAttrs}
          setShowAllTechAttrs={setShowAllTechAttrs}
          attributes={flow.attributes}
          setAttributes={flow.setAttributes}
          brandList={flow.brandList}
          loadingAttrs={flow.loading}
        />
      );
    }

    if (flow.currentStep === 6) {
      return (
        <Step6Pricing
          price={flow.price}
          setPrice={flow.setPrice}
          listingTypeId={flow.listingTypeId}
          setListingTypeId={flow.setListingTypeId}
          listingTypes={flow.listingTypes}
          listingPriceOptions={flow.listingPriceOptions}
          saleTermsMeta={flow.saleTermsMeta}
          saleTerms={flow.saleTerms}
          setSaleTerms={flow.setSaleTerms}
          currencyId={flow.currencyId}
          loadingListing={flow.loadingListing}
        />
      );
    }

    if (flow.currentStep === 7) {
      return (
        <Step7Shipping
          shipping={flow.shipping}
          setShipping={flow.setShipping}
          freeShippingMandatory={flow.freeShippingMandatory}
          availableLogisticTypes={flow.availableLogisticTypes}
          selectedLogisticType={flow.selectedLogisticType}
          setSelectedLogisticType={flow.setSelectedLogisticType}
        />
      );
    }

    if (flow.currentStep === 8) {
      return (
        <Step8Review
          title={flow.title}
          setTitle={flow.setTitle}
          listingTypeId={flow.listingTypeId}
          listingTypes={flow.listingTypes}
          selectedLogisticType={flow.selectedLogisticType}
          categoryPath={categoryPath}
          variations={flow.variations}
          pictures={flow.pictures}
          onBack={flow.prevStep}
          onPublish={onPublish}
        />
      );
    }

    return null;
  };

  return (
    <>
      <StepIndicator
        steps={steps}
        currentStep={flow.currentStep}
        clickable
        maxVisitedStep={flow.maxVisitedStep}
        onStepClick={(id) => {
          if (id <= flow.maxVisitedStep) flow.goToStep(id);
        }}
        errorSteps={flow.errorSteps}
      />

      <Card className="mt-6 border border-gray-200 shadow-sm">
        <CardContent className="p-6 space-y-6">{renderStep()}</CardContent>
      </Card>

      {flow.currentStep !== 8 && (
        <div className="mt-4">
          <ListingNavigationButtons
            currentStep={flow.currentStep}
            maxSteps={flow.maxSteps}
            canProceed={canProceed}
            loading={flow.loading || flow.loadingListing}
            onNext={flow.nextStep}
            onBack={flow.prevStep}
            saveLabel={flow.currentStep === 7 ? 'Avançar' : undefined}
          />
        </div>
      )}
    </>
  );
}
