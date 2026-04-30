# STATUS-ENGINE-T4 — Infrastructure Adapters: Implementações Supabase dos Ports

**Ciclo:** Motor de Status de Pedidos
**Status:** ✅ Implementado
**Depende de:** [T1 — Domínio](./STATUS-ENGINE-T1-dominio.md), [T2 — Ports](./STATUS-ENGINE-T2-portas.md)
**Bloqueia:** T5, T6, T7, T9

---

## 1. Visão Geral (para não-técnicos)

Esta task é o elo entre as regras de negócio (que não sabem nada de banco de dados) e o Supabase (o banco que de fato armazena os dados). É como uma camada de tradução: os use cases "falam" em termos de negócio ("busque o pedido X"), e os adapters traduzem isso em queries SQL específicas do Supabase.

Existem dois tipos de adapters aqui:

1. **Adapters de repositório** — leem e escrevem dados de pedidos, vínculos e estoque no banco
2. **Adapters de marketplace** — traduzem os dados brutos de uma API específica (ML ou Shopee) para o formato `MarketplaceSignals` que o engine entende

---

## 2. Arquivos a Criar

### 2.1 `supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts`

**Responsabilidade:** Implementação do `IOrderRepository` usando o cliente Supabase.

**O que este adapter faz:**
- Lê pedidos da tabela `orders` (não da `marketplace_orders_presented_new`)
- Escreve o `status` calculado na tabela `orders`
- Cria registros em `order_status_history` (append-only)
- Marca etiquetas como impressas via RPC existente ou query direta

**Dependência:** Recebe `supabaseAdmin` via construtor (injeção de dependência) — nunca cria o cliente internamente.

```typescript
// Imports reais do projeto — caminhos relativos ao arquivo adapter
import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IOrderRepository, OrderRecord, OrderRecordItem } from "../../domain/orders/ports/IOrderRepository.ts";
import type { MarketplaceSignals } from "../../domain/orders/MarketplaceSignals.ts";
import type { OrderStatusChangedEvent } from "../../domain/orders/OrderDomainEvents.ts";
import type { OrderStatus } from "../../domain/orders/OrderStatus.ts";

type OrderRow = {
  readonly id: string;
  readonly organization_id: string;
  readonly marketplace: "mercado_livre" | "shopee";
  readonly marketplace_order_id: string;
  readonly status: OrderStatus | null;
  readonly marketplace_status: string | null;
  readonly shipment_status: string | null;
  readonly shipment_substatus: string | null;
  readonly is_fulfillment: boolean | null;
  readonly is_cancelled: boolean | null;
  readonly is_refunded: boolean | null;
  readonly is_returned: boolean | null;
  readonly is_printed_label: boolean | null;
  readonly has_invoice: boolean | null;
  readonly is_pickup_done: boolean | null;
  readonly order_items: ReadonlyArray<{
    readonly id: string;
    readonly product_id: string | null;
    readonly marketplace_item_id: string | null;
    readonly quantity: number | null;
  }> | null;
};

export class SupabaseOrderRepository implements IOrderRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw new Error(`SupabaseOrderRepository.findById failed: ${error.message}`);
    if (!data) return null;
    return this.mapOrderRow(data as unknown as OrderRow);
  }

  async updateStatus(params: {
    readonly orderId: string;
    readonly currentStatus: OrderStatus | null;
    readonly newStatus: OrderStatus;
  }): Promise<void> {
    // Optimistic concurrency control: only update if status matches currentStatus
    const baseQuery = this.supabase
      .from("orders")
      .update({ status: params.newStatus, status_updated_at: new Date().toISOString() } as never)
      .eq("id", params.orderId);
    const query = params.currentStatus === null
      ? baseQuery.is("status", null).select("id")
      : baseQuery.eq("status", params.currentStatus).select("id");
    const { data, error } = await query;
    if (error) throw new Error(`SupabaseOrderRepository.updateStatus failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error("SupabaseOrderRepository.updateStatus concurrency conflict");
  }

  async updateOrderItemsProductId(
    orderId: string,
    items: ReadonlyArray<{ readonly id: string; readonly productId: string }>,
  ): Promise<void> {
    for (const item of items) {
      const { error } = await this.supabase
        .from("order_items")
        .update({ product_id: item.productId })
        .eq("order_id", orderId)
        .eq("id", item.id);
      if (error) throw new Error(`SupabaseOrderRepository.updateOrderItemsProductId failed: ${error.message}`);
    }
  }

  async updateInternalFlags(
    orderId: string,
    flags: Readonly<{ isPrintedLabel?: boolean; isPickupDone?: boolean }>,
  ): Promise<void> {
    const payload: { is_printed_label?: boolean; is_pickup_done?: boolean } = {};
    if (flags.isPrintedLabel !== undefined) payload.is_printed_label = flags.isPrintedLabel;
    if (flags.isPickupDone !== undefined) payload.is_pickup_done = flags.isPickupDone;
    if (Object.keys(payload).length === 0) return;
    const { error } = await this.supabase.from("orders").update(payload as never).eq("id", orderId);
    if (error) throw new Error(`SupabaseOrderRepository.updateInternalFlags failed: ${error.message}`);
  }

  async addStatusHistory(orderId: string, event: OrderStatusChangedEvent): Promise<void> {
    const { error } = await this.supabase.from("order_status_history").insert({
      order_id: orderId,
      from_status: event.previousStatus,
      to_status: event.newStatus,
      changed_at: event.changedAt,
      source: event.source,
    });
    if (error) throw new Error(`SupabaseOrderRepository.addStatusHistory failed: ${error.message}`);
  }

  private mapOrderRow(row: OrderRow): OrderRecord {
    const signals: MarketplaceSignals = {
      organizationId: row.organization_id,
      marketplaceOrderId: row.marketplace_order_id,
      marketplace: row.marketplace,
      marketplaceStatus: row.marketplace_status ?? "",
      shipmentStatus: row.shipment_status ?? undefined,
      shipmentSubstatus: row.shipment_substatus ?? undefined,
      isFulfillment: row.is_fulfillment ?? false,
      isCancelled: row.is_cancelled ?? false,
      isRefunded: row.is_refunded ?? false,
      isReturned: row.is_returned ?? false,
      isPrintedLabel: row.is_printed_label ?? false,
      hasInvoice: row.has_invoice ?? false,
      isPickupDone: row.is_pickup_done ?? undefined,
    };
    const items: ReadonlyArray<OrderRecordItem> = (row.order_items ?? []).map((it) => ({
      id: it.id,
      productId: it.product_id,
      marketplaceItemId: it.marketplace_item_id,
      quantity: it.quantity ?? 0,
    }));
    return {
      id: row.id,
      organizationId: row.organization_id,
      marketplace: row.marketplace,
      marketplaceOrderId: row.marketplace_order_id,
      currentStatus: row.status,
      marketplaceSignals: signals,
      items,
    };
  }
}
```

**Tamanho real:** ~105 linhas

**Diferenças em relação ao rascunho inicial:**
- `SupabaseClient` importado de `../infra/supabase-client.ts` (não de `esm.sh`) — evita conflitos com tipos gerados
- Ports importados de `../../domain/orders/ports/` (não de `../../ports/orders/`)
- `findByMarketplaceOrderId` **não implementado** (não necessário nos use cases)
- `updateStatus` usa **OCC** com campo `currentStatus` no filtro — lança erro em conflito de concorrência
- `markLabelPrinted` **substituído** por `updateInternalFlags` (mais genérico)
- `addStatusHistory` recebe `OrderStatusChangedEvent` completo (não campos separados)
- `findById` inclui `order_items` via join (`"*, order_items(*)"`)
- `OrderRow` tipada com `readonly` para imutabilidade

---

### 2.2 `supabase/functions/_shared/adapters/orders/SupabaseProductLinkRepository.ts`

**Responsabilidade:** Implementação do `IProductLinkRepository` usando Supabase.

**O que este adapter faz:**
- Busca vínculos permanentes em `marketplace_item_product_links`
- Cria/atualiza vínculos permanentes (upsert idempotente)
- Conta itens não vinculados de um pedido dado a lista de itens

**Lógica de "item vinculado":**
Um item é considerado vinculado se:
1. Tem `seller_sku` não-vazio (vínculo implícito por SKU), OU
2. Existe registro em `marketplace_item_product_links` para o par `(marketplace_item_id, variation_id)` da organização

```typescript
import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IProductLinkRepository, OrderItemLink } from "../../domain/orders/ports/IProductLinkRepository.ts";

export class SupabaseProductLinkRepository implements IProductLinkRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findLink(organizationId: string, sku: string): Promise<OrderItemLink | null> {
    const { data, error } = await (this.supabase as unknown as {
      from: (t: string) => { select: (f: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: { marketplace_item_id: string; product_id: string } | null; error: { message: string } | null }> } } } };
    }).from("marketplace_item_product_links")
      .select("marketplace_item_id, product_id")
      .eq("organizations_id", organizationId)
      .eq("marketplace_item_id", sku)
      .maybeSingle();
    if (error) throw new Error(`SupabaseProductLinkRepository.findLink failed: ${error.message}`);
    if (!data) return null;
    return { organizationId, marketplaceItemId: data.marketplace_item_id, productId: data.product_id };
  }

  async listLinks(
    organizationId: string,
    skus: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<OrderItemLink>> {
    if (skus.length === 0) return [];
    const { data, error } = await (this.supabase as unknown as {
      from: (t: string) => { select: (f: string) => { eq: (c: string, v: string) => { in: (c: string, v: ReadonlyArray<string>) => Promise<{ data: Array<{ marketplace_item_id: string; product_id: string }> | null; error: { message: string } | null }> } } };
    }).from("marketplace_item_product_links")
      .select("marketplace_item_id, product_id")
      .eq("organizations_id", organizationId)
      .in("marketplace_item_id", skus);
    if (error) throw new Error(`SupabaseProductLinkRepository.listLinks failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      organizationId,
      marketplaceItemId: row.marketplace_item_id,
      productId: row.product_id,
    }));
  }

  async upsertPermanentLink(params: {
    readonly organizationId: string;
    readonly marketplaceItemId: string;
    readonly productId: string;
  }): Promise<void> {
    const { error } = await (this.supabase as unknown as {
      from: (t: string) => { upsert: (v: object, o: object) => Promise<{ error: { message: string } | null }> };
    }).from("marketplace_item_product_links").upsert({
      organizations_id: params.organizationId,
      marketplace_item_id: params.marketplaceItemId,
      product_id: params.productId,
    }, { onConflict: "organizations_id,marketplace_item_id" });
    if (error) throw new Error(`SupabaseProductLinkRepository.upsertPermanentLink failed: ${error.message}`);
  }
}
```

**Diferenças em relação ao rascunho inicial:**
- Ports importados de `../../domain/orders/ports/` (não de `../../ports/orders/`)
- `SupabaseClient` de `../infra/supabase-client.ts`
- `checkLinks` e `countUnlinkedItems` **removidos** — contagem de não-vinculados feita via `order.items.filter(it => it.productId === null)` nos use cases
- `findLink` e `listLinks` implementam a nova interface de T2
- `upsertPermanentLink` sem `variationId` nem `marketplace` (esquema simplificado)

**Tamanho real:** ~55 linhas

---

### 2.3 `supabase/functions/_shared/adapters/orders/SupabaseInventoryAdapter.ts`

**Responsabilidade:** Implementação do `IInventoryPort` usando Supabase.

**O que este adapter faz:**
- Insere jobs em `inventory_jobs` (reservar, consumir, devolver estoque)
- Usa `ON CONFLICT DO NOTHING` para garantir idempotência
- NÃO executa o job diretamente — apenas enfileira para o `inventory-jobs-worker`

**Por que não executar direto:** O processamento de estoque pode ser lento (múltiplos updates). Enfileirar e processar assincronamente evita timeouts na edge function.

```typescript
import type { SupabaseClient } from "../infra/supabase-client.ts";
import type { IInventoryPort, InventoryItem } from "../../domain/orders/ports/IInventoryPort.ts";

type InventoryJobType = "reserve" | "consume" | "refund";

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async reserveStockNow(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void> {
    await this.enqueueJob(orderId, "reserve", items);
  }

  async enqueueConsumeStock(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void> {
    await this.enqueueJob(orderId, "consume", items);
  }

  async enqueueRefundStock(orderId: string, items: ReadonlyArray<InventoryItem>): Promise<void> {
    await this.enqueueJob(orderId, "refund", items);
  }

  private async enqueueJob(
    orderId: string,
    jobType: InventoryJobType,
    items: ReadonlyArray<InventoryItem>,
  ): Promise<void> {
    const rows = items.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      quantity: item.quantity,
      job_type: jobType,
      status: "pending",
    }));
    const { error } = await (this.supabase as unknown as {
      from: (t: string) => { insert: (v: object[]) => { select: () => Promise<{ error: { message: string } | null }> } };
    }).from("inventory_jobs").insert(rows).select();
    if (error && !error.message.includes("duplicate")) {
      throw new Error(`enqueueJob(${jobType}) failed for order ${orderId}: ${error.message}`);
    }
  }
}
```

**Diferenças em relação ao rascunho inicial:**
- Ports importados de `../../domain/orders/ports/` (não de `../../ports/orders/`)
- Nomes dos métodos: `reserveStock` → `reserveStockNow`, `consumeReservedStock` → `enqueueConsumeStock`, `refundReservedStock` → `enqueueRefundStock`
- Métodos recebem `items: ReadonlyArray<InventoryItem>` diretamente (não `organizationId`) — um job por item de produto
- `enqueueJob` agora insere linhas por item (não por pedido)

**Tamanho real:** ~45 linhas

---

### 2.4 `supabase/functions/_shared/adapters/orders/MlMarketplaceSignalsAdapter.ts`

**Responsabilidade:** Extrai `MarketplaceSignals` a partir dos dados brutos de um pedido do Mercado Livre.

**O que é isso:** O `NormalizedOrder` (produzido pelo `MlOrderNormalizeService`) contém os dados do pedido ML. Este adapter extrai apenas os campos relevantes para o cálculo de status, traduzindo a terminologia ML para o `MarketplaceSignals` neutro.

```typescript
import type { MarketplaceSignals } from '../../domain/orders/MarketplaceSignals.ts';

/**
 * Campos do NormalizedOrder (ou da tabela orders) relevantes para o cálculo de status ML.
 * Subconjunto do tipo completo — não precisa de todos os campos.
 */
export interface MlOrderData {
  organizationId: string;
  marketplaceOrderId: string;
  marketplaceStatus: string;
  shipmentStatus?: string;
  shipmentSubstatus?: string;
  logisticType?: string; // 'fulfillment' para ML Full
  isCancelled?: boolean;
  isRefunded?: boolean;
  paymentStatus?: string; // 'refunded' indica reembolso
  isPrintedLabel?: boolean;
  hasInvoice?: boolean;
}

/**
 * Converte dados brutos de um pedido ML em MarketplaceSignals normalizados.
 *
 * Função pura — sem side effects.
 */
export function buildMlSignals(
  data: MlOrderData
): MarketplaceSignals {
  const isCancelled = data.isCancelled
    ?? ['cancelled', 'pending_cancel'].includes(data.marketplaceStatus?.toLowerCase() ?? '');
  const isRefunded = data.isRefunded
    ?? data.paymentStatus?.toLowerCase() === 'refunded';
  const isReturned = data.marketplaceStatus?.toLowerCase() === 'returned_to_warehouse';
  const isFulfillment = data.logisticType?.toLowerCase() === 'fulfillment';

  return {
    organizationId: data.organizationId,
    marketplaceOrderId: data.marketplaceOrderId,
    marketplace: 'mercado_livre',
    marketplaceStatus: data.marketplaceStatus ?? '',
    shipmentStatus: data.shipmentStatus,
    shipmentSubstatus: data.shipmentSubstatus,
    isFulfillment,
    isCancelled,
    isRefunded,
    isReturned,
    isPrintedLabel: data.isPrintedLabel ?? false,
    hasInvoice: data.hasInvoice ?? false,
  };
}
```

**Tamanho esperado:** ~55 linhas

---

### 2.5 `supabase/functions/_shared/adapters/orders/ShopeeMarketplaceSignalsAdapter.ts`

**Responsabilidade:** Extrai `MarketplaceSignals` a partir dos dados brutos de um pedido da Shopee.

```typescript
import type { MarketplaceSignals } from '../../domain/orders/MarketplaceSignals.ts';

export interface ShopeeOrderData {
  organizationId: string;
  marketplaceOrderId: string;
  orderStatus: string;
  logisticsStatus?: string;
  isFulfillmentReady?: boolean; // Shopee Full
  hasInvoice?: boolean;
  isPickupDone?: boolean;
}

const SHOPEE_CANCELLED_STATUSES = new Set(['cancelled', 'in_cancel']);
const SHOPEE_RETURNED_STATUSES = new Set(['to_return']);

/**
 * Converte dados brutos de um pedido Shopee em MarketplaceSignals normalizados.
 *
 * Função pura — sem side effects.
 */
export function buildShopeeSignals(data: ShopeeOrderData): MarketplaceSignals {
  const status = data.orderStatus?.toLowerCase() ?? '';
  const isCancelled = SHOPEE_CANCELLED_STATUSES.has(status);
  const isReturned = SHOPEE_RETURNED_STATUSES.has(status);
  // Shopee Full: isFulfillmentReady indica que é managed pelo marketplace
  const isFulfillment = data.isFulfillmentReady ?? false;

  return {
    organizationId: data.organizationId,
    marketplaceOrderId: data.marketplaceOrderId,
    marketplace: 'shopee',
    marketplaceStatus: data.orderStatus ?? '',
    // Shopee: logisticsStatus é tratado como shipmentStatus para uniformidade
    shipmentStatus: data.logisticsStatus ?? data.orderStatus,
    isFulfillment,
    isCancelled,
    isRefunded: false, // Shopee não usa 'refunded' como status separado
    isReturned,
    isPrintedLabel: false, // Shopee não usa printed_label — usa retry_ship
    hasInvoice: data.hasInvoice ?? false,
    isPickupDone: data.isPickupDone ?? false,
  };
}
```

**Tamanho esperado:** ~50 linhas

---

## 3. Testes de Integração

Adapters precisam de testes de integração (com banco real ou mock do Supabase).

### Estratégia recomendada

Para testes locais, usar o Supabase local (`supabase start`). Para CI, usar um banco de testes isolado.

### Arquivo: `__tests__/adapters/SupabaseProductLinkRepository.test.ts`

```typescript
// Teste de integração — requer banco de dados
// Execute com: deno test --allow-net --allow-env

Deno.test("listLinks: retorna vínculos permanentes para os SKUs fornecidos", async () => {
  const repo = new SupabaseProductLinkRepository(testSupabase);
  const links = await repo.listLinks('test-org', ['SKU-123', 'SKU-456']);
  // Retorna apenas os SKUs que têm vínculo permanente no banco
  assertEquals(Array.isArray(links), true);
});

Deno.test("listLinks: retorna array vazio para lista vazia de SKUs", async () => {
  const repo = new SupabaseProductLinkRepository(testSupabase);
  const links = await repo.listLinks('test-org', []);
  assertEquals(links.length, 0);
});
```

### Arquivo: `__tests__/adapters/MlMarketplaceSignalsAdapter.test.ts`

Testes unitários (funções puras, sem banco):

```typescript
Deno.test("buildMlSignals: detecta fulfillment por logisticType", () => {
  const signals = buildMlSignals({ ..., logisticType: 'fulfillment' });
  assertEquals(signals.isFulfillment, true);
});

Deno.test("buildMlSignals: detecta cancelamento por paymentStatus refunded", () => {
  const signals = buildMlSignals({ ..., isCancelled: false, paymentStatus: 'refunded' });
  assertEquals(signals.isRefunded, true);
});
```

---

## 4. Arquivos Adicionais (Aliases Kebab-case)

Para compatibilidade com o bundler Deno usado na edge function `orders-queue-worker`, foram criados dois arquivos de reexport com nomes em kebab-case:

```
supabase/functions/_shared/adapters/orders/supabase-order-repository.ts
supabase/functions/_shared/adapters/orders/supabase-inventory-adapter.ts
```

Cada arquivo contém apenas `export { X } from './X.ts'` e permite que o bundler resolva os imports sem conflito.

---

## 5. Definition of Done

- [x] `SupabaseOrderRepository` implementa todos os 5 métodos de `IOrderRepository`
- [x] `SupabaseProductLinkRepository` implementa todos os 3 métodos de `IProductLinkRepository` (v2: `findLink`, `listLinks`, `upsertPermanentLink`)
- [x] `SupabaseInventoryAdapter` implementa todos os 3 métodos de `IInventoryPort` (`reserveStockNow`, `enqueueConsumeStock`, `enqueueRefundStock`)
- [x] `buildMlSignals()` exportado de `MlMarketplaceSignalsAdapter.ts`
- [x] `buildShopeeSignals()` exportado de `ShopeeMarketplaceSignalsAdapter.ts`
- [x] Todos os imports de ports usam o caminho `../../domain/orders/ports/` (não `../../ports/orders/`)
- [x] `SupabaseClient` importado de `../infra/supabase-client.ts` (não de `esm.sh`)
- [x] Todos os métodos que fazem queries lançam `Error` com mensagem descritiva em caso de falha
- [x] `updateStatus` usa OCC (Optimistic Concurrency Control) — lança erro em conflito
- [x] `SupabaseInventoryAdapter.enqueueJob()` é tolerante a conflitos UNIQUE (idempotente)
- [x] Testes unitários para ambos os adapters de sinais (funções puras — sem banco)
- [x] Aliases kebab-case criados para compatibilidade com bundler Deno
- [x] Nenhum arquivo excede 150 linhas
- [x] Todos os adapters recebem `SupabaseClient` via construtor (não criam o cliente internamente)
