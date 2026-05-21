import { useState } from 'react';
import { StepTechSpecs } from '@/components/listings/StepTechSpecs';
import { useCreateListingAttributes } from '@/hooks/useCreateListingAttributes';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface Step5TechSpecsProps {
  adapter: MarketplaceAdapter;
  attrsMeta: any[];
  conditionalRequiredIds: string[];
  techSpecsInput: any;
  techSpecsOutput: any;
  setTechSpecsOutput: (v: any) => void;
  showAllTechAttrs: boolean;
  setShowAllTechAttrs: (v: boolean) => void;
  attributes: any[];
  setAttributes: (v: any[]) => void;
  brandList: any[];
  loadingAttrs: boolean;
}

export function Step5TechSpecs({
  adapter,
  attrsMeta,
  conditionalRequiredIds,
  techSpecsInput,
  techSpecsOutput,
  setTechSpecsOutput,
  showAllTechAttrs,
  setShowAllTechAttrs,
  attributes,
  setAttributes,
  brandList,
  loadingAttrs,
}: Step5TechSpecsProps) {
  const isShopeeMode = adapter.channel === 'shopee';
  const [attrTab, setAttrTab] = useState<'required' | 'tech'>('required');

  const { filteredAttrs } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds,
    techSpecsInput,
  });

  const supportsTech = adapter.capabilities.supportsTechSpecsInput;
  if (!supportsTech && !attrsMeta.length) {
    return (
      <div className="text-sm text-gray-500 py-4">
        Nenhuma especificação técnica disponível para esta categoria.
      </div>
    );
  }

  return (
    <StepTechSpecs
      isShopeeMode={isShopeeMode}
      filteredAttrs={filteredAttrs}
      attributes={attributes}
      setAttributes={setAttributes}
      techSpecsInput={techSpecsInput}
      techSpecsOutput={techSpecsOutput}
      setTechSpecsOutput={setTechSpecsOutput}
      attrTab={attrTab}
      setAttrTab={setAttrTab}
      showAllTechAttrs={showAllTechAttrs}
      setShowAllTechAttrs={setShowAllTechAttrs}
      loadingAttrs={loadingAttrs}
      shopeeBrandList={brandList}
    />
  );
}
