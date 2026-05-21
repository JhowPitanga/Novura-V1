// ─── Channel slugs ────────────────────────────────────────────────────────────

export type ChannelSlug = 'mercado-livre' | 'shopee';

// ─── Editable fields for the edit flow ────────────────────────────────────────

export type EditableFieldKey =
  | 'title'
  | 'description'
  | 'price'
  | 'listing_type'
  | 'shipping'
  | 'variations'
  | 'pictures'
  | 'video'
  | 'attributes'
  | 'status';

// ─── Capabilities ─────────────────────────────────────────────────────────────

export interface AdapterCapabilities {
  maxImages: number;
  maxVideos: number;
  maxTitleLength: number;
  descriptionFormat: 'plain' | 'html';
  supportsListingTypes: boolean;
  supportsTechSpecsInput: boolean;
  supportsSaleTerms: boolean;
  supportsFlex: boolean;
  supportsConditionalAttributes: boolean;
  supportsFreeShippingMandatoryRule: boolean;
  supportsVariationPicturesPerVariation: boolean;
  supportsLocalPickup: boolean;
  supportsDomainSuggestions: boolean;
  titleLockedAfterFirstSale: boolean;
  shippingWeightUnit: 'g' | 'kg';
  editableFields: ReadonlyArray<EditableFieldKey>;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export interface CategoryNode {
  id: string;
  name: string;
}

export interface CategorySuggestionDTO {
  suggestions: Array<{ category_id: string; category_name: string; path_from_root?: Array<{ id: string; name: string }> }>;
  domainSuggestions: Array<{ category_id: string; category_name: string; domain_name?: string; domain_id?: string }>;
  shopeeCategoriesRaw?: any[];
  roots?: CategoryNode[];
  nameById?: Record<string, string>;
  /** Shopee edge fn success flag (defaults to true when omitted). */
  ok?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

// ─── Attributes ───────────────────────────────────────────────────────────────

export interface AttributeValue {
  id: string;
  name: string;
}

export type AttributeValueType = 'string' | 'number' | 'number_unit' | 'list' | 'boolean';

export interface AdapterAttribute {
  id: string;
  name: string;
  values: AttributeValue[];
  value_type: AttributeValueType;
  tags: { required?: boolean; allow_variations?: boolean; multivalued?: boolean; repeated?: boolean };
  allowed_units?: Array<{ id: string; name: string }>;
  default_unit?: string;
}

export interface BrandOption {
  id: string;
  name: string;
}

// ─── Tech Specs ───────────────────────────────────────────────────────────────

export interface TechSpecsInput {
  [key: string]: any;
}

// ─── Sale Terms ───────────────────────────────────────────────────────────────

export interface SaleTermMeta {
  id: string;
  name?: string;
  values?: AttributeValue[];
  allowed_units?: Array<{ id: string; name: string }>;
  default_unit?: string;
}

// ─── Listing Types & Prices ───────────────────────────────────────────────────

export interface ListingType {
  id: string;
  name: string;
}

export interface ListingPriceOption {
  listing_type_id: string;
  currency_id?: string;
  listing_exposure?: string;
  requires_picture?: boolean;
  sale_fee_details?: {
    percentage_fee?: number;
    meli_percentage_fee?: number;
    fixed_fee?: number;
    gross_amount?: number;
  };
  sale_fee_amount?: number;
}

// ─── Shipping ─────────────────────────────────────────────────────────────────

export interface ShippingPreferences {
  modesAvailable: string[];
  logisticsByMode: Record<string, string[]>;
  logisticsDefaults: Record<string, string>;
  availableLogisticTypes: string[];
  preferredMode: string;
  freeShippingMandatoryCfg: boolean;
  freeShippingMandatory: boolean;
  freeConfigDefault: boolean;
  defaultShippingMode: string;
}

// ─── Normalized Draft (Criação) ───────────────────────────────────────────────

export interface NormalizedVariation {
  id?: string | number;
  sku?: string | null;
  attribute_combinations: Array<{ id: string; name: string; value_id?: string; value_name?: string }>;
  attributes?: Array<{ id: string; name: string; value_id?: string; value_name?: string | null; value_struct?: any }>;
  available_quantity: number;
  price?: string | number;
  pictureFiles?: (File | string)[];
}

export interface NormalizedDraft {
  channel: ChannelSlug;
  siteId: string;
  title: string;
  categoryId: string;
  currencyId: string;
  attributes: Array<{ id: string; name: string; value_id?: string; value_name?: string | null; value_struct?: any }>;
  variations: NormalizedVariation[];
  pictures: (string | File)[];
  video?: File | string | null;
  price: string;
  listingTypeId: string;
  shipping: any;
  saleTerms: any[];
  description: string;
  availableQuantity: number;
  variationsEnabled: boolean;
  listingPriceOptions?: ListingPriceOption[];
  shippingModesAvailable?: string[];
  variationAttrs?: AdapterAttribute[];
  variationRequiredIds?: string[];
  preferFlex?: boolean;
  currentDraftId?: string | null;
}

// ─── Normalized Listing Item (Edição) ─────────────────────────────────────────

export interface NormalizedListingItem {
  id: string;
  marketplace: ChannelSlug;
  title: string;
  description: string;
  price: string;
  status: string;
  categoryId: string;
  listing_type_id?: string;
  attributes: Array<{ id: string; name: string; value_id?: string; value_name?: string | null; value_struct?: any }>;
  variations: Array<{
    id: string | number;
    sku?: string | null;
    available_quantity: number;
    price: number;
    attribute_combinations: Array<{ id: string; name: string; value_id?: string; value_name?: string }>;
    image?: string | null;
    pictureFiles?: (File | string)[];
    attributes?: any[];
  }>;
  pictures: (string | File)[];
  shipping: any;
  soldQty: number;
  videoId?: string;
  permalink?: string | null;
  raw: any;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errorStepId?: number;
  errorField?: string;
  errorMessage?: string;
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishResult {
  success: boolean;
  errorStepId?: number;
  errorField?: string;
  errorMessage?: string;
}

// ─── Error mapping ────────────────────────────────────────────────────────────

export interface AdapterError {
  message: string;
  causes?: string[];
  raw?: any;
}

// ─── Steps ───────────────────────────────────────────────────────────────────

export interface StepDescriptor {
  id: number;
  title: string;
  description: string;
}

// ─── MarketplaceAdapter interface ─────────────────────────────────────────────

export interface MarketplaceAdapter {
  channel: ChannelSlug;
  displayName: string;
  capabilities: AdapterCapabilities;

  // Step descriptors
  getCreateSteps(): StepDescriptor[];
  getEditSteps(): StepDescriptor[];

  // Category operations
  predictCategories(orgId: string, title: string): Promise<CategorySuggestionDTO>;
  loadCategoryRoots(orgId: string, ctx?: { shopeeCategoriesRaw?: any[] }): Promise<{ roots: CategoryNode[]; shopeeCategoriesRaw?: any[] }>;
  loadCategoryChildren(orgId: string, parentId: string, ctx?: { shopeeCategoriesRaw?: any[] }): Promise<{ children: CategoryNode[]; pathById?: Record<string, string> }>;
  getCategoryPath(orgId: string, categoryId: string): Promise<string>;

  // Attribute & metadata fetchers
  fetchAttributes(orgId: string, categoryId: string): Promise<{ attrs: AdapterAttribute[]; brandList?: BrandOption[] }>;
  fetchTechSpecsInput?(orgId: string, categoryId: string): Promise<TechSpecsInput | null>;
  fetchSaleTermsMeta?(orgId: string, categoryId: string): Promise<SaleTermMeta[]>;
  evaluateConditionalRequired?(orgId: string, categoryId: string, attrs: any[]): Promise<string[]>;

  // Listing type & price fetchers (optional — only ML)
  fetchListingTypes?(orgId: string, categoryId: string, siteId: string): Promise<ListingType[]>;
  fetchListingPriceOptions?(orgId: string, categoryId: string, price: number, siteId: string): Promise<ListingPriceOption[]>;
  fetchShippingPreferences?(orgId: string, siteId: string): Promise<ShippingPreferences>;

  // Publish flow
  validateForPublish(draft: NormalizedDraft): ValidationResult;
  buildPublishPayload(draft: NormalizedDraft): unknown;
  publish(orgId: string, draft: NormalizedDraft): Promise<PublishResult>;

  // Error mapping (step numbers are relative to this adapter's step order)
  mapErrorToStep(error: AdapterError): { stepId: number; field: string };

  // Edit flow
  loadItem(orgId: string, itemId: string): Promise<NormalizedListingItem>;
  updateFields(orgId: string, itemId: string, patch: Partial<NormalizedListingItem>): Promise<void>;
  updateStatus(orgId: string, itemId: string, status: 'active' | 'paused' | 'closed'): Promise<void>;
}
