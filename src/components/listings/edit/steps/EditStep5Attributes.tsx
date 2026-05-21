import { EditListingStepAttributes } from '@/components/listings/EditListingStepAttributes';
import { useCreateListingAttributes } from '@/hooks/useCreateListingAttributes';
import type { MarketplaceAdapter } from '@/adapters/listings/types';

interface EditStep5AttributesProps {
  adapter: MarketplaceAdapter;
  attrsMeta: any[];
  attributes: any[];
  setAttributes: (v: any[]) => void;
  loadingAttrs: boolean;
  saving: string | null;
  showAllTechAttrs: boolean;
  setShowAllTechAttrs: (v: boolean) => void;
  onSaveAttributes: () => Promise<void>;
}

export function EditStep5Attributes({
  adapter,
  attrsMeta,
  attributes,
  setAttributes,
  loadingAttrs,
  saving,
  showAllTechAttrs,
  setShowAllTechAttrs,
  onSaveAttributes,
}: EditStep5AttributesProps) {
  const { filteredAttrs } = useCreateListingAttributes({
    attrsMeta,
    conditionalRequiredIds: [],
    techSpecsInput: null,
  });

  const onChangeAttribute = (attr: any) => {
    setAttributes((prev: any[]) => {
      const idx = prev.findIndex((a) => String(a?.id) === String(attr?.id));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = attr;
        return next;
      }
      return [...prev, attr];
    });
  };

  return (
    <EditListingStepAttributes
      marketplaceLabel={adapter.displayName}
      filteredAttrs={filteredAttrs}
      attributes={attributes}
      showAllTechAttrs={showAllTechAttrs}
      loadingAttrs={loadingAttrs}
      savingKey={saving}
      onToggleShowAllTechAttrs={() => setShowAllTechAttrs(!showAllTechAttrs)}
      onChangeAttribute={onChangeAttribute}
      onConfirmAttributes={onSaveAttributes}
    />
  );
}
