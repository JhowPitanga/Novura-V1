# STATUS-ENGINE-T4 — Infrastructure Adapters: Implementações Supabase dos Ports

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
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
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  IOrderRepository,
  OrderRecord,
  StatusUpdateResult
} from '../../ports/orders/IOrderRepository.ts';
import type { MarketplaceSignals } from '../../domain/orders/MarketplaceSignals.ts';
import { OrderStatus } from '../../domain/orders/OrderStatus.ts';

export class SupabaseOrderRepository implements IOrderRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findById(orderId: string): Promise<OrderRecord | null> {
    const { data, error } = await this.supabase
      .from('orders')
      .select(`
        id, organization_id, marketplace, marketplace_order_id,
        status, marketplace_status, shipment_status, shipment_substatus,
        is_fulfillment, is_cancelled, is_refunded, is_returned,
        is_printed_label, has_invoice
      `)
      .eq('id', orderId)
      .maybeSingle();
    if (error) throw new Error(`findById failed: ${error.message}`);
    if (!data) return null;
    return this.mapRowToRecord(data);
  }

  async findByMarketplaceOrderId(params: {
    organizationId: string;
    marketplace: string;
    marketplaceOrderId: string;
  }): Promise<OrderRecord | null> {
    const { data, error } = await this.supabase
      .from('orders')
      .select('id, organization_id, marketplace, marketplace_order_id, status, marketplace_status')
      .eq('organization_id', params.organizationId)
      .eq('marketplace', params.marketplace)
      .eq('marketplace_order_id', params.marketplaceOrderId)
      .maybeSingle();
    if (error) throw new Error(`findByMarketplaceOrderId failed: ${error.message}`);
    if (!data) return null;
    return this.mapRowToRecord(data);
  }

  async updateStatus(params: {
    orderId: string;
    newStatus: OrderStatus;
    source: 'webhook' | 'user_action' | 'sync';
  }): Promise<StatusUpdateResult> {
    // Busca status atual antes de atualizar
    const current = await this.findById(params.orderId);
    const previousStatus = current?.currentStatus ?? null;

    // Atualiza o status na tabela orders
    const { error: updateError } = await this.supabase
      .from('orders')
      .update({ status: params.newStatus, status_updated_at: new Date().toISOString() })
      .eq('id', params.orderId);
    if (updateError) throw new Error(`updateStatus failed: ${updateError.message}`);

    // Registra no histórico (append-only)
    await this.appendStatusHistory({
      orderId: params.orderId,
      fromStatus: previousStatus,
      toStatus: params.newStatus,
      source: params.source,
    });

    return {
      orderId: params.orderId,
      previousStatus,
      newStatus: params.newStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  async markLabelPrinted(params: {
    orderIds: string[];
    organizationId: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('orders')
      .update({ is_printed_label: true, label_printed_at: new Date().toISOString() })
      .in('id', params.orderIds)
      .eq('organization_id', params.organizationId);
    if (error) throw new Error(`markLabelPrinted failed: ${error.message}`);
  }

  private async appendStatusHistory(params: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    source: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('order_status_history').insert({
      order_id: params.orderId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      changed_at: new Date().toISOString(),
      source: params.source,
    });
    if (error) throw new Error(`appendStatusHistory failed: ${error.message}`);
  }

  private mapRowToRecord(row: any): OrderRecord {
    const signals: MarketplaceSignals = {
      organizationId: row.organization_id,
      marketplaceOrderId: row.marketplace_order_id,
      marketplace: row.marketplace,
      marketplaceStatus: row.marketplace_status ?? '',
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
    return {
      id: row.id,
      organizationId: row.organization_id,
      marketplace: row.marketplace,
      marketplaceOrderId: row.marketplace_order_id,
      currentStatus: row.status ?? null,
      marketplaceSignals: signals,
    };
  }
}
```

**Tamanho esperado:** ~100 linhas
**Nota:** Se exceder 150 linhas, extraia `appendStatusHistory` e `mapRowToRecord` para helpers privados em arquivo separado.

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
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  IProductLinkRepository,
  OrderItemLinkQuery,
  ProductLinkResult
} from '../../ports/orders/IProductLinkRepository.ts';

export class SupabaseProductLinkRepository implements IProductLinkRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async checkLinks(params: {
    organizationId: string;
    marketplace: string;
    items: OrderItemLinkQuery[];
  }): Promise<ProductLinkResult[]> {
    // Items com SKU não precisam de query — já são considerados vinculados
    const itemsWithoutSku = params.items.filter(item => !item.sellerSku);
    if (itemsWithoutSku.length === 0) {
      return params.items.map(item => ({
        marketplaceItemId: item.marketplaceItemId,
        variationId: item.variationId,
        productId: 'sku_resolved', // placeholder — tem SKU
        source: 'sku' as const,
      }));
    }

    // Busca vínculos permanentes para os items sem SKU
    const { data, error } = await this.supabase
      .from('marketplace_item_product_links')
      .select('marketplace_item_id, variation_id, product_id')
      .eq('organizations_id', params.organizationId)
      .eq('marketplace_name', params.marketplace)
      .in('marketplace_item_id', itemsWithoutSku.map(i => i.marketplaceItemId));
    if (error) throw new Error(`checkLinks failed: ${error.message}`);

    const linkMap = new Map<string, string>(
      (data ?? []).map(row => [`${row.marketplace_item_id}:${row.variation_id}`, row.product_id])
    );

    return params.items.map(item => {
      if (item.sellerSku) {
        return { marketplaceItemId: item.marketplaceItemId, variationId: item.variationId, productId: 'sku_resolved', source: 'sku' };
      }
      const key = `${item.marketplaceItemId}:${item.variationId}`;
      const productId = linkMap.get(key) ?? null;
      return { marketplaceItemId: item.marketplaceItemId, variationId: item.variationId, productId, source: productId ? 'permanent' : null };
    });
  }

  async upsertPermanentLink(params: {
    organizationId: string;
    marketplace: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('marketplace_item_product_links')
      .upsert({
        organizations_id: params.organizationId,
        marketplace_name: params.marketplace,
        marketplace_item_id: params.marketplaceItemId,
        variation_id: params.variationId,
        product_id: params.productId,
      }, { onConflict: 'organizations_id,marketplace_name,marketplace_item_id,variation_id' });
    if (error) throw new Error(`upsertPermanentLink failed: ${error.message}`);
  }

  async countUnlinkedItems(params: {
    organizationId: string;
    marketplace: string;
    orderId: string;
    items: OrderItemLinkQuery[];
  }): Promise<number> {
    const results = await this.checkLinks({
      organizationId: params.organizationId,
      marketplace: params.marketplace,
      items: params.items,
    });
    return results.filter(r => r.productId === null).length;
  }
}
```

**Tamanho esperado:** ~90 linhas

---

### 2.3 `supabase/functions/_shared/adapters/orders/SupabaseInventoryAdapter.ts`

**Responsabilidade:** Implementação do `IInventoryPort` usando Supabase.

**O que este adapter faz:**
- Insere jobs em `inventory_jobs` (reservar, consumir, devolver estoque)
- Usa `ON CONFLICT DO NOTHING` para garantir idempotência
- NÃO executa o job diretamente — apenas enfileira para o `inventory-jobs-worker`

**Por que não executar direto:** O processamento de estoque pode ser lento (múltiplos updates). Enfileirar e processar assincronamente evita timeouts na edge function.

```typescript
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { IInventoryPort } from '../../ports/orders/IInventoryPort.ts';

type InventoryJobType = 'reserve' | 'consume' | 'refund';

export class SupabaseInventoryAdapter implements IInventoryPort {
  constructor(private readonly supabase: SupabaseClient) {}

  async reserveStock(params: { orderId: string; organizationId: string }): Promise<void> {
    await this.enqueueJob(params.orderId, 'reserve');
  }

  async consumeReservedStock(params: { orderId: string; organizationId: string }): Promise<void> {
    await this.enqueueJob(params.orderId, 'consume');
  }

  async refundReservedStock(params: { orderId: string; organizationId: string }): Promise<void> {
    await this.enqueueJob(params.orderId, 'refund');
  }

  private async enqueueJob(orderId: string, jobType: InventoryJobType): Promise<void> {
    const { error } = await this.supabase
      .from('inventory_jobs')
      .insert({ order_id: orderId, job_type: jobType, status: 'pending' })
      .select() // necessário para o ON CONFLICT funcionar via PostgREST
    // Se já existe job do mesmo tipo para este pedido, ignora silenciosamente
    // (a constraint UNIQUE em inventory_jobs garante idempotência)
    if (error && !error.message.includes('duplicate')) {
      throw new Error(`enqueueJob(${jobType}) failed for order ${orderId}: ${error.message}`);
    }
  }
}
```

**Tamanho esperado:** ~45 linhas

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

Deno.test("checkLinks: item com seller_sku é considerado vinculado", async () => {
  const repo = new SupabaseProductLinkRepository(testSupabase);
  const results = await repo.checkLinks({
    organizationId: 'test-org',
    marketplace: 'mercado_livre',
    items: [{ marketplaceItemId: 'item-1', variationId: '', sellerSku: 'SKU-123' }],
  });
  assertEquals(results[0].source, 'sku');
  assertNotEquals(results[0].productId, null);
});

Deno.test("countUnlinkedItems: retorna 0 quando todos têm SKU", async () => {
  const repo = new SupabaseProductLinkRepository(testSupabase);
  const count = await repo.countUnlinkedItems({
    organizationId: 'test-org',
    marketplace: 'shopee',
    orderId: 'order-test',
    items: [
      { marketplaceItemId: 'a', variationId: '', sellerSku: 'SKU-A' },
      { marketplaceItemId: 'b', variationId: '', sellerSku: 'SKU-B' },
    ],
  });
  assertEquals(count, 0);
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

## 4. Definition of Done

- [ ] `SupabaseOrderRepository` criado e implementa todos os métodos de `IOrderRepository`
- [ ] `SupabaseProductLinkRepository` criado e implementa todos os métodos de `IProductLinkRepository`
- [ ] `SupabaseInventoryAdapter` criado e implementa todos os métodos de `IInventoryPort`
- [ ] `buildMlSignals()` exportado de `MlMarketplaceSignalsAdapter.ts`
- [ ] `buildShopeeSignals()` exportado de `ShopeeMarketplaceSignalsAdapter.ts`
- [ ] Todos os métodos que fazem queries lançam `Error` com mensagem descritiva em caso de falha
- [ ] `SupabaseInventoryAdapter.enqueueJob()` é tolerante a conflitos (idempotente)
- [ ] Testes unitários para ambos os adapters de sinais (funções puras — sem banco)
- [ ] Testes de integração para `SupabaseProductLinkRepository` (com banco local)
- [ ] Nenhum arquivo excede 150 linhas
- [ ] Todos os adapters recebem `SupabaseClient` via construtor (não criam o cliente internamente)
