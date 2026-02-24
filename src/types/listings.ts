export interface MarketplaceNavItem {
    title: string;
    path: string;
    description?: string;
    displayName?: string;
}

export interface ShippingCaps {
    flex?: boolean;
    envios?: boolean;
    correios?: boolean;
    full?: boolean;
}

export interface PublicationCosts {
    currency: string;
    commission: number;
    shippingCost: number;
    tax: number;
    total: number;
}

export interface PublicationFeeDetails {
    currency: string;
    percentage: number | null;
    fixedFee: number | null;
    grossAmount: number | null;
}

/** Parsed/enriched listing item ready for display */
export interface ListingItem {
    id: string;
    title: string;
    sku: string;
    marketplace: string;
    price: number;
    originalPrice: number | null;
    promoPrice: number | null;
    status: string;
    visits: number;
    questions: number;
    sales: number;
    likes: number;
    stock: number;
    marketplaceId: string;
    image: string;
    shippingTags: string[];
    quality: number;
    qualityLevel: any;
    performanceData: any;
    conversion: number;
    pauseReason: string | null;
    publicationType: string | null;
    publicationCosts: PublicationCosts;
    publicationFeeDetails: PublicationFeeDetails;
    permalink: string | null;
}

/** Variation data formatted for display */
export interface VariationData {
    id: string | number;
    sku: string;
    available_quantity: number;
    seller_stock_total: number;
    types: Array<{ name: string; value: string }>;
    price: number;
    current_price?: number;
    original_price?: number;
    image: string;
}

/** Draft listing from marketplace_drafts table */
export interface ListingDraft {
    id: string;
    title: string | null;
    site_id: string | null;
    marketplace_name: string | null;
    updated_at: string;
    organizations_id: string;
    status: string;
}

export type SortKey = 'sales' | 'visits' | 'price' | 'quality' | 'margin';
export type SortDir = 'asc' | 'desc';
