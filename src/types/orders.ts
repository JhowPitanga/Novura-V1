export interface OrderItem {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  linked?: boolean;
  marketplace?: string;
  scanned?: boolean;
  imageUrl?: string;
  marketplaceItemId?: string | null;
  variationId?: string | number | null;
  permalink?: string | null;
  variationLabel?: string | null;
}

export interface OrderFinancialInfo {
  orderAmount: number;
  shippingCost: number;
  marketplaceFee: number;
  couponAmount: number;
  taxAmount: number;
  netAmount: number;
  marginPercent: number;
  shippingReceived?: number;
  shippingNetReceived?: number;
  saleFee?: number;
  shippingFeeBuyer?: number;
  productCost?: number;
  extraCosts?: number;
}

export interface Order {
  id: string;
  marketplace: string;
  /** Marketplace order id (ML/Shopee) */
  marketplaceOrderId: string | null;
  /** First item title (for list views) */
  productTitle: string;
  sku: string | null;
  /** Customer name */
  customerName: string;
  /** Total amount shown in the UI (usually gross_amount) */
  totalAmount: number;
  /** Base creation date (ISO string) */
  createdAt: string;
  /** Payment date, when available (ISO string) */
  paidAt?: string | null;
  /** UI status (internal workflow status) */
  status: string;
  /** Raw internal status from backend, before normalization */
  internalStatus?: string | null;
  /** Additional sub-status (e.g. NF emission errors) */
  subStatus?: string;
  /** Normalized shipping type (full, flex, envios, correios, no_shipping) */
  shippingType: string;
  /** Pack id or platform id shown as order number */
  platformId: string;
  /** Total quantity of items in the order */
  totalQuantity: number;
  /** Main image used in list views */
  imageUrl: string;
  /** Item list mapped for the UI */
  items: OrderItem[];
  /** Financial breakdown used in financeiro components */
  financial: OrderFinancialInfo;
  /** Shipping city */
  shippingCity?: string | null;
  /** Shipping state name (e.g. São Paulo) */
  shippingStateName?: string | null;
  /** Shipping state UF (e.g. SP, RJ) */
  shippingStateUf?: string | null;
  /** Indicates if label has been printed */
  labelPrinted: boolean;
  /** Indicates if picking list has been printed */
  pickingListPrinted: boolean;
  /** Linked SKU derived from linked products */
  linkedSku?: string | null;
  /** Cached label information used for printing */
  label?: unknown;
  /** Raw linked products payload from backend */
  linkedProducts?: unknown;
  /** True if there are items not yet linked to internal products */
  hasUnlinkedItems?: boolean;
  /** Raw shipment status from marketplace */
  shipmentStatus?: string | null;
  /** SLA information for shipping / dispatch */
  shippingSla?: {
    status: string | null;
    service: string | null;
    expectedDate: string | null;
    lastUpdated: string | null;
  };
  /** Detailed shipping delay information, when present */
  shippingDelays?: unknown;
}

export interface PrintingSettings {
  pickingList: {
    groupByProduct: boolean;
    includeOrderNumber: boolean;
    includeBarcode: boolean;
  };
  label: {
    labelSize: "10x15" | "A4";
    separateLabelPerItem: boolean;
  };
}

export interface OrderColumn {
  id: string;
  name: string;
  enabled: boolean;
  alwaysVisible?: boolean;
  render: (order: Order) => JSX.Element | string;
}