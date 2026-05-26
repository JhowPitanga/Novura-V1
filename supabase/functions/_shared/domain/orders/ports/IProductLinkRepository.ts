/** Immutable permanent link between SKU/listing and catalog product. */
export interface OrderItemLink {
  readonly organizationId: string;
  readonly sku: string;
  readonly productId: string;
  readonly marketplace: "mercado_livre" | "shopee" | "any";
  readonly marketplaceItemId: string | null;
  readonly variationId: string | null;
}

/** Query para verificar vínculo de um item de pedido. */
export interface OrderItemLinkQuery {
  readonly marketplaceItemId: string;
  readonly variationId: string;
  readonly sellerSku: string;
}

/** Resultado da verificação de vínculo. */
export interface ProductLinkResult {
  readonly marketplaceItemId: string;
  readonly variationId: string;
  readonly productId: string | null;
  readonly source: "permanent" | "ephemeral" | "sku" | null;
}

/** Port for product-link queries used by status and linking use cases. */
export interface IProductLinkRepository {
  findLink(organizationId: string, sku: string): Promise<OrderItemLink | null>;

  listLinks(
    organizationId: string,
    skus: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<OrderItemLink>>;

  checkLinks(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<ReadonlyArray<ProductLinkResult>>;

  upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
  }): Promise<void>;

  countUnlinkedItems(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly orderId: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<number>;
}
