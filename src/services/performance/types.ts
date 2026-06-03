export interface ProductPerformanceItem {
    id: string;
    nome: string;
    pedidos: number;
    unidades: number;
    valor: number;
    vinculos: number;
}

export interface ListingPerformanceItem {
    id: string;
    titulo: string;
    marketplace: string;
    vendas: number;
    valor: number;
    image_url: string;
}

export interface ProductPerformanceResult {
    produtosData: ProductPerformanceItem[];
    anunciosData: ListingPerformanceItem[];
    productModelsByProduct: Record<string, string[]>;
}

export interface ConnectedMarketplace {
    display: string;
    slug: string;
}

export interface StateSale {
    uf: string;
    state_name: string;
    pedidos: number;
    unidades: number;
    total: number;
    ticket_medio: number;
    pct_total: number;
}

export type AbcTag = 'A' | 'B' | 'C';

export interface AbcProductRow {
    id: string;
    nome: string;
    sku?: string;
    image_url?: string;
    pedidos?: number;
    valor: number;
    unidades: number;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
    margin_pct?: number | null;
    margin_brl?: number | null;
}

export interface AbcListingRow {
    id: string;
    titulo: string;
    marketplace: string;
    valor: number;
    unidades: number;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
}

export interface ProductChannelMix {
    product_id: string;
    marketplace: string;
    valor: number;
    unidades: number;
    pct_within_product: number;
}

export interface SoldListing {
    id: string;
    titulo: string;
    sku: string;
    marketplace: string;
    image_url: string;
    pedidos: number;
    unidades: number;
    valor: number;
    margin_pct: number | null;
    margin_brl: number | null;
    pct: number;
    cum_pct: number;
    tag: AbcTag;
}

export type AbcCriterion = 'valor' | 'unidades';

export interface FinancialOverview {
    total_revenue: number;
    net_revenue: number;
    tax_amount: number;
    marketplace_fee: number;
    shipping_cost: number;
    product_cost: number;
    total_spent: number;
    pct_revenue: number;
    orders_count: number;
    by_marketplace?: Array<{
        marketplace: string;
        revenue: number;
        marketplace_fee: number;
        shipping_cost: number;
        product_cost: number;
        tax_amount: number;
        total_spent: number;
        tax_rate_pct: number;
    }>;
}
