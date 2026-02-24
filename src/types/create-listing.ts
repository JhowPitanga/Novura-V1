// ─── Session-level in-memory cache ─────────────────────────────────────────

export interface SessionCache {
  attrsMetaByCategory: Record<string, any[]>;
  techInputByCategory: Record<string, any>;
  saleTermsMetaByCategory: Record<string, any[]>;
  listingTypesByCategory: Record<string, any[]>;
  listingPriceOptionsByKey: Record<string, any[]>;
  brandListByCategory: Record<string, any[]>;
}

export function makeSessionCache(): SessionCache {
  return {
    attrsMetaByCategory: {},
    techInputByCategory: {},
    saleTermsMetaByCategory: {},
    listingTypesByCategory: {},
    listingPriceOptionsByKey: {},
    brandListByCategory: {},
  };
}

// ─── Step fetch gates ────────────────────────────────────────────────────────

export interface FetchGate {
  s1: boolean;
  s3: boolean;
  s6: boolean;
  s7: boolean;
}

// ─── Draft persistence ───────────────────────────────────────────────────────

export interface DraftData {
  organizations_id?: string;
  marketplace_name?: string;
  site_id?: string;
  title?: string;
  category_id?: string;
  attributes?: any[];
  variations?: any[];
  pictures?: any[];
  price?: number;
  listing_type_id?: string;
  shipping?: any;
  sale_terms?: any[];
  description?: string;
  available_quantity?: number;
  last_step?: number;
  status?: string;
  api_cache?: {
    attrsMeta?: any[];
    techSpecsInput?: any;
    saleTermsMeta?: any[];
    listingTypes?: any[];
    listingPriceOptions?: any[];
  };
}

// ─── Shipping ────────────────────────────────────────────────────────────────

export interface ShippingModesResult {
  modesAvailable: string[];
  logisticsByMode: Record<string, string[]>;
  logisticsDefaults: Record<string, string>;
  availableLogisticTypes: string[];
  preferredMode: string;
  freeShippingMandatoryCfg: boolean;
  freeShippingMandatory: boolean;
  defaultFreeShipping: boolean;
}

// ─── Category prediction ─────────────────────────────────────────────────────

export interface CategorySuggestion {
  category_id: string;
  category_name: string;
  path_from_root?: Array<{ id: string; name: string }>;
}

export interface DomainSuggestion {
  category_id: string;
  category_name: string;
  domain_name?: string;
  domain_id?: string;
}

// ─── Attribute filtering ─────────────────────────────────────────────────────

export interface FilteredAttrs {
  required: any[];
  tech: any[];
}

// ─── Publish extras ──────────────────────────────────────────────────────────

export interface MLPublishExtras {
  description: string;
  uploadVariationFiles: any[][];
  sellerShippingPreferences?: { prefer_flex: boolean };
}

export interface BuildMLPayloadParams {
  siteId: string;
  title: string;
  categoryId: string;
  currencyId: string;
  attributes: any[];
  variations: any[];
  pictures: string[];
  price: string;
  listingTypeId: string;
  shipping: any;
  saleTerms: any[];
  availableQuantity: number;
  shippingModesAvailable: string[];
  preferFlex: boolean;
}

export interface BuildShopeePayloadParams {
  categoryId: string;
  title: string;
  attributes: any[];
  price: string;
  description: string;
  pictures: string[];
  shipping: any;
  variations: any[];
  variationAttrs: any[];
  variationsEnabled: boolean;
}

export interface PublishResult {
  success: boolean;
  errorStepId?: number;
  errorField?: string;
  errorMessage?: string;
}

export interface PublishListingParams {
  organizationId: string | null | undefined;
  isShopeeMode: boolean;
  siteId: string;
  title: string;
  categoryId: string;
  currencyId: string;
  attributes: any[];
  variations: any[];
  pictures: (string | File)[];
  price: string;
  listingTypeId: string;
  shipping: any;
  saleTerms: any[];
  description: string;
  availableQuantity: number;
  variationsEnabled: boolean;
  listingPriceOptions: any[];
  shippingModesAvailable: string[];
  variationAttrs: any[];
  variationRequiredIds: string[];
  preferFlex: boolean;
  currentDraftId: string | null | undefined;
}
