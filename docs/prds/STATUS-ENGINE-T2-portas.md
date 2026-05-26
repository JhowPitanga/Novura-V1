# STATUS-ENGINE-T2 — Ports (Interfaces): Contratos da Arquitetura Hexagonal

**Ciclo:** Motor de Status de Pedidos
**Status:** ✅ Implementado
**Depende de:** [T1 — Camada de Domínio](./STATUS-ENGINE-T1-dominio.md)
**Bloqueia:** T4 (adapters), T5, T6, T7 (use cases)

---

## 1. Visão Geral (para não-técnicos)

Imagine que você tem um sistema de som em casa. O aparelho de som não sabe se os alto-falantes são da Sony ou da JBL — ele só sabe que precisa de algo que receba sinal de áudio e emita som. O "conector de alto-falante" (aquele plug laranja/vermelho) é o "port" — uma interface padrão que qualquer alto-falante compatível pode usar.

Esta task cria os "conectores" do nosso sistema: as interfaces que definem **o que o sistema precisa fazer**, sem especificar **como** fazer. Por exemplo:

- "Preciso buscar um pedido pelo ID" → `IOrderRepository.findById()`
- "Preciso verificar se um item tem vínculo permanente" → `IProductLinkRepository.findLink()`
- "Preciso reservar estoque para um pedido" → `IInventoryPort.reserveStock()`

As implementações reais (que usam Supabase) são criadas em T4. Os use cases (T5, T6, T7) dependem apenas destas interfaces — nunca do Supabase diretamente. Isso torna os testes muito mais fáceis (basta criar uma implementação falsa/mock para testar).

---

## 2. Por que Isso é Necessário (Inversão de Dependência)

### Problema atual
```typescript
// linked_products_item/index.ts — acoplamento direto ao banco:
const { data } = await supabase
  .from('marketplace_orders_presented_new')
  .select('linked_products')
  .eq('id', orderId);
// Impossível testar sem banco real
```

### Solução com ports
```typescript
// Use case depende apenas da interface:
class LinkProductToOrderItemUseCase {
  constructor(
    private orderRepo: IOrderRepository,        // interface
    private linkRepo: IProductLinkRepository,   // interface
    private inventory: IInventoryPort           // interface
  ) {}
  // Totalmente testável com mocks
}
```

---

## 3. Arquivos Implementados

> **Nota de path:** Os ports foram colocados DENTRO do pacote de domínio (não em pasta `ports/` separada), seguindo a convenção de que interfaces de domínio pertencem ao domínio. Caminho real: `supabase/functions/_shared/domain/orders/ports/`

### 3.1 `supabase/functions/_shared/domain/orders/ports/IOrderRepository.ts`

**Responsabilidade:** Contrato para persistência e leitura de pedidos.

```typescript
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { OrderStatus } from '../OrderStatus.ts';
import type { OrderStatusChangedEvent } from '../OrderDomainEvents.ts';

/** Immutable order item payload used by status workflows. */
export interface OrderRecordItem {
  readonly id: string;
  readonly productId: string | null;
  readonly marketplaceItemId: string | null;
  readonly quantity: number;
}

/** Immutable aggregate used by the application layer to recalculate status. */
export interface OrderRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly marketplace: 'mercado_livre' | 'shopee';
  readonly marketplaceOrderId: string;
  readonly currentStatus: OrderStatus | null;
  readonly marketplaceSignals: MarketplaceSignals;
  readonly items: ReadonlyArray<OrderRecordItem>;
}

/** Immutable status update metadata returned by repository writes. */
export interface StatusUpdateResult {
  readonly orderId: string;
  readonly previousStatus: OrderStatus | null;
  readonly newStatus: OrderStatus;
  readonly updatedAt: string;
}

/** Port for order persistence and status transitions. */
export interface IOrderRepository {
  /** Returns full immutable order DTO or null when not found. */
  findById(orderId: string): Promise<OrderRecord | null>;

  /**
   * Updates order status with optimistic locking using currentStatus.
   * Implementations must be idempotent for safe retries.
   */
  updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void>;

  /** Persists product links on order items; retries must be safe. */
  updateOrderItemsProductId(
    orderId: string,
    items: ReadonlyArray<{ readonly id: string; readonly productId: string }>,
  ): Promise<void>;

  /**
   * Updates internal status-driving flags (e.g., print/pickup markers).
   * Implementations must be idempotent for repeated writes.
   */
  updateInternalFlags(
    orderId: string,
    flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>,
  ): Promise<void>;

  /** Appends immutable audit history; duplicate retries must not double-write. */
  addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void>;
}
```

**Diferenças em relação ao rascunho inicial:**
- `findByMarketplaceOrderId` e `markLabelPrinted` **não implementados** — use cases derivam essas operações de outros métodos
- `updateStatus` usa **Optimistic Concurrency Control** via `currentStatus` (não tem `source` no parâmetro)
- `updateInternalFlags` substitui o `markLabelPrinted` original
- `addStatusHistory` separado do `updateStatus` para permitir auditoria independente
- `OrderRecord` inclui `items: ReadonlyArray<OrderRecordItem>` (necessário para contar itens não vinculados sem consulta adicional)
- Todos os campos são `readonly` (imutabilidade)

**Testes necessários:** Nenhum diretamente (é interface). Testada via mock em T5, T6.

---

### 3.2 `supabase/functions/_shared/domain/orders/ports/IProductLinkRepository.ts`

**Responsabilidade:** Contrato para verificar e persistir vínculos entre anúncios de marketplace e produtos do catálogo ERP.

```typescript
/** Single permanent link entry from marketplace_item_product_links. */
export interface OrderItemLink {
  readonly organizationId: string;
  readonly marketplaceItemId: string;
  readonly productId: string;
}

/** Port for product-link persistence. */
export interface IProductLinkRepository {
  /**
   * Returns the permanent link for a given (organizationId, SKU) pair, or null.
   * Used to auto-link items when the seller has previously linked the listing.
   */
  findLink(organizationId: string, sku: string): Promise<OrderItemLink | null>;

  /**
   * Returns all permanent links for the given list of SKUs in one batch query.
   * Minimises round-trips when an order has multiple items.
   */
  listLinks(
    organizationId: string,
    skus: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<OrderItemLink>>;

  /**
   * Creates or updates a permanent link between a marketplace listing and a product.
   * Uses ON CONFLICT DO UPDATE — safe to call multiple times with the same data.
   */
  upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplaceItemId: string;
    readonly productId: string;
  }): Promise<void>;
}
```

**Diferenças em relação ao rascunho inicial:**
- `checkLinks` e `countUnlinkedItems` **não implementados** — a contagem de não-vinculados é feita diretamente em `OrderRecord.items` (campo `productId === null`)
- `findLink` e `listLinks` substituem `checkLinks` com assinatura mais simples
- `upsertPermanentLink` não inclui `variationId` nem `marketplace` (simplificado)

---

### 3.3 `supabase/functions/_shared/domain/orders/ports/IInventoryPort.ts`

**Responsabilidade:** Contrato para operações de estoque relacionadas ao ciclo de vida de um pedido.

```typescript
export interface InventoryItem {
  readonly productId: string;
  readonly quantity: number;
}

/**
 * Port: inventory operations driven by order status transitions.
 *
 * All methods must be idempotent — calling them multiple times with the
 * same arguments must not create duplicate inventory movements.
 */
export interface IInventoryPort {
  /**
   * Synchronously reserves stock for linked order items.
   * Called when status transitions to INVOICE_PENDING, READY_TO_PRINT, or AWAITING_PICKUP.
   * Propagates errors — a reservation failure blocks the status write.
   */
  reserveStockNow(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void>;

  /**
   * Enqueues a job to consume (permanently deduct) reserved stock.
   * Called when status transitions to SHIPPED.
   * Errors are swallowed and logged — does not block status write.
   */
  enqueueConsumeStock(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void>;

  /**
   * Enqueues a job to refund (return to available) reserved stock.
   * Called when status transitions to CANCELLED or RETURNED.
   * Errors are swallowed and logged — does not block status write.
   */
  enqueueRefundStock(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void>;
}
```

**Diferenças em relação ao rascunho inicial:**
- Nomes: `reserveStock` → `reserveStockNow`, `consumeReservedStock` → `enqueueConsumeStock`, `refundReservedStock` → `enqueueRefundStock`
- Os métodos recebem `items: ReadonlyArray<InventoryItem>` diretamente (não `orderId`+`organizationId`) — desacoplamento total do banco
- Semântica de erro diferenciada: `reserveStockNow` propaga erros; `enqueue*` absorvem (ver T7)

---

## 4. Estrutura de Diretórios

```
supabase/functions/_shared/domain/orders/ports/
├── IOrderRepository.ts        ← OrderRecord, OrderRecordItem, StatusUpdateResult, IOrderRepository
├── IProductLinkRepository.ts  ← OrderItemLink, IProductLinkRepository
└── IInventoryPort.ts          ← InventoryItem, IInventoryPort
```

> **Decisão de arquitetura:** Os ports vivem dentro de `domain/orders/ports/` porque são contratos do domínio (não de infraestrutura). Os adapters de infraestrutura (T4) importam dessas interfaces, nunca o contrário.

---

## 5. Testes

Ports (interfaces) não são testados diretamente. Eles são testados indiretamente:

1. **Em T4 (adapters):** os adapters Supabase implementam os ports e têm testes de integração
2. **Em T5, T6, T7 (use cases):** os use cases usam mocks dos ports para testes unitários

### Como criar um mock de um port (exemplo para T5/T6):

```typescript
// Used in use case unit tests — no Supabase required
import type { IOrderRepository, OrderRecord } from '../domain/orders/ports/IOrderRepository.ts';
import type { OrderStatusChangedEvent } from '../domain/orders/OrderDomainEvents.ts';
import { OrderStatus } from '../domain/orders/OrderStatus.ts';

export class MockOrderRepository implements IOrderRepository {
  constructor(private order: OrderRecord) {}
  public statusUpdates = 0;
  public historyWrites = 0;
  public flagsUpdated: Record<string, unknown>[] = [];

  async findById(_orderId: string): Promise<OrderRecord | null> {
    return this.order;
  }

  async updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void> {
    this.statusUpdates += 1;
    this.order = { ...this.order, currentStatus: params.newStatus };
  }

  async updateOrderItemsProductId(
    _orderId: string,
    items: ReadonlyArray<{ readonly id: string; readonly productId: string }>,
  ): Promise<void> {
    const patch = new Map(items.map((i) => [i.id, i.productId]));
    this.order = {
      ...this.order,
      items: this.order.items.map((it) =>
        patch.has(it.id) ? { ...it, productId: patch.get(it.id)! } : it
      ),
    };
  }

  async updateInternalFlags(
    _orderId: string,
    flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>,
  ): Promise<void> {
    this.flagsUpdated.push(flags);
  }

  async addStatusHistory(_orderId: string, _event: OrderStatusChangedEvent): Promise<void> {
    this.historyWrites += 1;
  }
}
```

---

## 6. Definition of Done

- [x] Arquivo `IOrderRepository.ts` criado em `domain/orders/ports/` com 5 métodos documentados
- [x] Arquivo `IProductLinkRepository.ts` criado em `domain/orders/ports/` com 3 métodos documentados
- [x] Arquivo `IInventoryPort.ts` criado em `domain/orders/ports/` com 3 métodos documentados
- [x] Cada método tem JSDoc explicando: propósito, idempotência, e quando é chamado
- [x] Cada arquivo tem no máximo 150 linhas
- [x] Nenhuma importação de Supabase — apenas imports de outros arquivos de domínio
- [x] Tipos exportados: `OrderRecord`, `OrderRecordItem`, `StatusUpdateResult`, `OrderItemLink`, `InventoryItem`
- [x] Todos os campos de `OrderRecord` são `readonly` (imutabilidade de domínio)
- [x] Código TypeScript compila sem erros (`deno check`)
