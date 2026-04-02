/**
 * Immutable link record between a marketplace listing and a catalog product.
 */
export interface OrderItemLink {
  readonly organizationId: string;
  readonly sku: string;
  readonly productId: string;
  readonly marketplace: "mercado_livre" | "shopee" | "any";
  readonly marketplaceItemId: string | null;
  readonly variationId: string | null;
}

/**
 * Query para verificar vínculo de um item de pedido.
 */
export interface OrderItemLinkQuery {
  readonly marketplaceItemId: string;
  readonly variationId: string;
  readonly sellerSku: string;
}

/**
 * Resultado da verificação de vínculo.
 */
export interface ProductLinkResult {
  readonly marketplaceItemId: string;
  readonly variationId: string;
  readonly productId: string | null;
  readonly source: 'permanent' | 'ephemeral' | 'sku' | null;
}

/**
 * Port for product-link queries used by status and linking use cases.
 *
 * Implementations must be idempotent and stable under retries.
 */
export interface IProductLinkRepository {
  /**
   * Finds a permanent link by organization and sku.
   * Returns null when no link exists.
   */
  findLink(organizationId: string, sku: string): Promise<OrderItemLink | null>;

  /**
   * Batch version of findLink for performance-sensitive flows.
   *
   * Returned list should contain all matches for the provided skus and must be
   * safe for repeated executions with the same inputs.
   */
  listLinks(
    organizationId: string,
    skus: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<OrderItemLink>>;

  /**
   * Verifica vínculos para múltiplos itens.
   * Item com sellerSku não vazio é considerado vinculado por SKU.
   * Chamado pelo RecalculateOrderStatusUseCase para determinar ProductLinkState.
   */
  checkLinks(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<ReadonlyArray<ProductLinkResult>>;

  /**
   * Cria ou atualiza vínculo permanente (idempotente via ON CONFLICT).
   * Chamado pelo LinkProductToOrderItemUseCase quando isPermanent=true.
   */
  upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly marketplaceItemId: string;
    readonly variationId: string;
    readonly productId: string;
  }): Promise<void>;

  /**
   * Conta itens sem vínculo num pedido.
   * Usado para determinar se o status deve ser UNLINKED.
   */
  countUnlinkedItems(params: {
    readonly organizationId: string;
    readonly marketplace: string;
    readonly orderId: string;
    readonly items: ReadonlyArray<OrderItemLinkQuery>;
  }): Promise<number>;
}
