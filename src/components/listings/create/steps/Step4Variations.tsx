import { StepVariations } from '@/components/listings/StepVariations';
import { useCreateListingAttributes } from '@/hooks/useCreateListingAttributes';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface Step4VariationsProps {
  adapter: MarketplaceAdapter;
  attrsMeta: any[];
  conditionalRequiredIds: string[];
  techSpecsInput: any;
  brandList: any[];
  attributes: any[];
  setAttributes: (v: any[]) => void;
  pictures: (string | File)[];
  variations: any[];
  setVariations: (v: any[]) => void;
  variationsEnabled: boolean;
  setVariationsEnabled: (v: boolean) => void;
  primaryVariationIndex: number | null;
  setPrimaryVariationIndex: (v: number | null) => void;
  availableQuantity: number;
  setAvailableQuantity: (v: number) => void;
}

export function Step4Variations({
  adapter,
  attrsMeta,
  conditionalRequiredIds,
  techSpecsInput,
  brandList,
  attributes,
  setAttributes,
  pictures,
  variations,
  setVariations,
  variationsEnabled,
  setVariationsEnabled,
  primaryVariationIndex,
  setPrimaryVariationIndex,
  availableQuantity,
  setAvailableQuantity,
}: Step4VariationsProps) {
  const isShopeeMode = adapter.channel === 'shopee';
  const { variationAttrs, allowVariationAttrs, variationRequiredIds } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds,
    techSpecsInput,
  });

  const pictureUrls = pictures.map((p) => (typeof p === 'string' ? p : ''));

  return (
    <StepVariations
      isShopeeMode={isShopeeMode}
      variations={variations}
      setVariations={setVariations}
      variationsEnabled={variationsEnabled}
      setVariationsEnabled={setVariationsEnabled}
      primaryVariationIndex={primaryVariationIndex}
      setPrimaryVariationIndex={setPrimaryVariationIndex}
      variationAttrs={variationAttrs}
      allowVariationAttrs={allowVariationAttrs}
      variationRequiredIds={variationRequiredIds}
      attributes={attributes}
      setAttributes={setAttributes}
      pictures={pictureUrls}
      shopeeBrandList={brandList}
      availableQuantity={availableQuantity}
      setAvailableQuantity={setAvailableQuantity}
    />
  );
}
