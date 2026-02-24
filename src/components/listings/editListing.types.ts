export type EditListingStepId = 1 | 2 | 3 | 4 | 5;

export interface VariationLite {
  id: string | number;
  sku?: string | null;
  available_quantity: number;
  image?: string | null;
  attribute_combinations?: any[];
  price?: number;
  pictureFiles?: (File | string)[];
  attributes?: any[];
}

export interface EditListingStepPriceProps {
  price: string;
  priceEditable: boolean;
  savingKey: string | null;
  loadingListing: boolean;
  listingTypes: any[];
  listingTypeId: string;
  listingPriceOptions: any[];
  itemRow: any;
  onPriceChange: (value: string) => void;
  onConfirmPrice: () => void;
  onListingTypeChange: (id: string) => void;
  onConfirmListingType: () => void;
}

export interface EditListingStepShippingProps {
  shipping: any;
  availableLogisticTypes: string[];
  selectedLogisticType: string;
  canUseFlex: boolean;
  preferFlex: boolean;
  mandatoryFreeShipping: boolean;
  savingKey: string | null;
  onShippingChange: (next: any) => void;
  onSelectLogisticType: (type: string) => void;
  onToggleFlex: (next: boolean) => void;
  onConfirmShipping: () => void;
}

export interface EditListingStepTitleDescriptionProps {
  title: string;
  description: string;
  canEditTitle: boolean;
  savingKey: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onConfirmTitle: () => void;
  onConfirmDescription: () => void;
}

export interface EditListingStepVariationsMediaProps {
  variations: VariationLite[];
  allowVariationAttrs: any[];
  pictures: (string | File)[];
  videoFile: File | null;
  videoId: string;
  primaryVariationIndex: number | null;
  price: string;
  savingKey: string | null;
  getVariationPreviewUrl: (v: VariationLite) => string;
  onAddVariation: () => void;
  onRemoveVariation: (index: number) => void;
  onUpdateVariation: (index: number, next: Partial<VariationLite>) => void;
  onSetPrimaryVariation: (index: number) => void;
  onUpdateVariationPictures: (index: number, files: (File | string)[]) => void;
  onUpdatePictures: (files: (File | string)[]) => void;
  onConfirmVariations: () => void;
  onConfirmPictures: () => void;
  onVideoChange: (value: File | string | null) => void;
  onConfirmVideo: () => void;
}

export interface EditListingStepAttributesProps {
  filteredAttrs: { required: any[]; tech: any[] };
  attributes: any[];
  showAllTechAttrs: boolean;
  loadingAttrs: boolean;
  savingKey: string | null;
  onToggleShowAllTechAttrs: () => void;
  onChangeAttribute: (attr: {
    id: string;
    name: string;
    value_id?: string;
    value_name?: string | null;
  }) => void;
  onConfirmAttributes: () => void;
}

