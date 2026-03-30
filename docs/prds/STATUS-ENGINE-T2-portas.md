# STATUS-ENGINE-T2 — Ports (Interfaces): Contratos da Arquitetura Hexagonal

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
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

## 3. Arquivos a Criar

### 3.1 `supabase/functions/_shared/ports/orders/IOrderRepository.ts`

**Responsabilidade:** Contrato para persistência e leitura de pedidos.

**O que é isso:** Define as operações que o sistema pode fazer com pedidos no banco de dados, sem saber qual banco é esse. O use case de recalcular status usa este port para atualizar o status de um pedido — mas não sabe se estamos usando Supabase, PostgreSQL direto, ou uma lista em memória (para testes).

```typescript
import type { OrderStatus } from '../../domain/orders/OrderStatus.ts';
import type { MarketplaceSignals } from '../../domain/orders/MarketplaceSignals.ts';

/**
 * Representa um pedido minimal para operações de status.
 * Não é o pedido completo — apenas os campos necessários para o motor de status.
 */
export interface OrderRecord {
  id: string;
  organizationId: string;
  marketplace: string;
  marketplaceOrderId: string;
  currentStatus: OrderStatus | null;
  marketplaceSignals: MarketplaceSignals;
}

/**
 * Resultado de uma operação de atualização de status.
 */
export interface StatusUpdateResult {
  orderId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  updatedAt: string;
}

/**
 * Port: operações de repositório para pedidos.
 *
 * A implementação concreta (SupabaseOrderRepository) lê e escreve
 * na tabela `orders`. Os use cases só conhecem este contrato.
 */
export interface IOrderRepository {
  /**
   * Busca um pedido pelo ID interno.
   * Retorna null se não encontrado.
   */
  findById(orderId: string): Promise<OrderRecord | null>;

  /**
   * Busca um pedido pelo ID do marketplace.
   */
  findByMarketplaceOrderId(params: {
    organizationId: string;
    marketplace: string;
    marketplaceOrderId: string;
  }): Promise<OrderRecord | null>;

  /**
   * Atualiza o status interno de um pedido.
   * Escreve também em order_status_history (append-only).
   *
   * @param source Quem causou a mudança ('webhook' | 'user_action' | 'sync')
   * @returns O resultado com status anterior e novo
   */
  updateStatus(params: {
    orderId: string;
    newStatus: OrderStatus;
    source: 'webhook' | 'user_action' | 'sync';
  }): Promise<StatusUpdateResult>;

  /**
   * Marca a etiqueta de envio como impressa e seta status para AWAITING_PICKUP.
   * Operação atômica: atualiza `printed_label = true` e `status`.
   */
  markLabelPrinted(params: {
    orderIds: string[];
    organizationId: string;
  }): Promise<void>;
}
```

**Tamanho esperado:** ~70 linhas
**Testes necessários:** Nenhum diretamente (é interface). Testada via mock em T5, T6.

---

### 3.2 `supabase/functions/_shared/ports/orders/IProductLinkRepository.ts`

**Responsabilidade:** Contrato para verificar e persistir vínculos entre anúncios de marketplace e produtos do catálogo ERP.

**O que é isso:** Um "vínculo de produto" é a ligação entre um anúncio no ML/Shopee e um produto no catálogo interno do Novura. Esta interface define como verificar se essa ligação existe e como criar uma nova. Existem dois tipos de vínculo:
- **Permanente:** salvo em `marketplace_item_product_links`, vale para todos os pedidos futuros
- **Efêmero:** temporário, para um único pedido

```typescript
/**
 * Representa um item de pedido que pode ou não estar vinculado.
 */
export interface OrderItemLinkQuery {
  /** ID do item no marketplace (ex: ID do anúncio no ML) */
  marketplaceItemId: string;

  /** ID da variação (tamanho, cor) — vazio se o item não tem variação */
  variationId: string;

  /** SKU do vendedor no marketplace — se preenchido, item é considerado vinculado por SKU */
  sellerSku: string;
}

/**
 * Resultado da verificação de vínculo de um item.
 */
export interface ProductLinkResult {
  marketplaceItemId: string;
  variationId: string;
  /** ID do produto no catálogo Novura, ou null se não vinculado */
  productId: string | null;
  /** Como o vínculo foi encontrado */
  source: 'permanent' | 'ephemeral' | 'sku' | null;
}

/**
 * Port: operações de vínculo anúncio ↔ produto.
 */
export interface IProductLinkRepository {
  /**
   * Para cada item na lista, verifica se existe vínculo permanente
   * em marketplace_item_product_links.
   *
   * Um item é considerado "vinculado" se:
   * - Existe registro em marketplace_item_product_links, OU
   * - O sellerSku não está vazio (vínculo implícito por SKU)
   *
   * @returns Lista com o resultado para cada item. Preserva a ordem.
   */
  checkLinks(params: {
    organizationId: string;
    marketplace: string;
    items: OrderItemLinkQuery[];
  }): Promise<ProductLinkResult[]>;

  /**
   * Cria ou atualiza um vínculo permanente entre anúncio e produto.
   * Usa ON CONFLICT DO UPDATE para garantir idempotência.
   */
  upsertPermanentLink(params: {
    organizationId: string;
    marketplace: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
  }): Promise<void>;

  /**
   * Conta quantos itens de um pedido estão sem vínculo.
   * Usado pelo OrderStatusEngine para determinar se o status é UNLINKED.
   */
  countUnlinkedItems(params: {
    organizationId: string;
    marketplace: string;
    orderId: string;
    items: OrderItemLinkQuery[];
  }): Promise<number>;
}
```

**Tamanho esperado:** ~75 linhas

---

### 3.3 `supabase/functions/_shared/ports/orders/IInventoryPort.ts`

**Responsabilidade:** Contrato para operações de estoque relacionadas ao ciclo de vida de um pedido.

**O que é isso:** Conforme um pedido avança no pipeline, o estoque dos produtos vinculados deve ser movimentado. Este port define as três operações possíveis:
- **Reservar:** quando o pedido está em Emissão NF / Impressão / Aguardando Coleta
- **Consumir:** quando o pedido é enviado (baixa definitiva no estoque)
- **Devolver:** quando o pedido é cancelado (devolve a reserva)

**Importante — sem transação distribuída:** Estas operações são chamadas após a atualização do status ter sido salva. Se uma operação de estoque falhar, o status do pedido já foi salvo. Isso é intencional — é melhor ter o status correto e um job de estoque com retry do que sacrificar o status por causa de um timeout no estoque.

```typescript
/**
 * Port: operações de estoque para pedidos.
 *
 * Estas operações devem ser idempotentes — chamá-las múltiplas vezes
 * com os mesmos parâmetros não deve criar entradas duplicadas no estoque.
 * A idempotência é garantida pela constraint UNIQUE em inventory_jobs.
 */
export interface IInventoryPort {
  /**
   * Reserva estoque para os itens vinculados de um pedido.
   * Chamado quando o status muda para INVOICE_PENDING, READY_TO_PRINT
   * ou AWAITING_PICKUP.
   *
   * Idempotente: ON CONFLICT DO NOTHING na inventory_jobs.
   */
  reserveStock(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;

  /**
   * Confirma o consumo do estoque reservado.
   * Chamado quando o status muda para SHIPPED.
   * Reduz products_stock.current e products_stock.reserved.
   *
   * Idempotente: só processa se existe reserva prévia.
   */
  consumeReservedStock(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;

  /**
   * Devolve o estoque reservado para disponível.
   * Chamado quando o status muda para CANCELLED.
   * Reduz products_stock.reserved sem alterar products_stock.current.
   *
   * Idempotente: só processa se existe reserva.
   */
  refundReservedStock(params: {
    orderId: string;
    organizationId: string;
  }): Promise<void>;
}
```

**Tamanho esperado:** ~55 linhas

---

## 4. Estrutura de Diretórios

```
supabase/functions/_shared/ports/orders/
├── IOrderRepository.ts        ← operações de persistência de pedidos
├── IProductLinkRepository.ts  ← verificação e criação de vínculos
└── IInventoryPort.ts          ← reserva, consumo e devolução de estoque
```

---

## 5. Testes

Ports (interfaces) não são testados diretamente. Eles são testados indiretamente:

1. **Em T4 (adapters):** os adapters Supabase implementam os ports e têm testes de integração
2. **Em T5, T6, T7 (use cases):** os use cases usam mocks dos ports para testes unitários

### Como criar um mock de um port (exemplo para T5/T6):

```typescript
// mock-order-repository.ts — usado em testes de use cases
import type { IOrderRepository, OrderRecord, StatusUpdateResult } from '../ports/orders/IOrderRepository.ts';
import { OrderStatus } from '../domain/orders/OrderStatus.ts';

export class MockOrderRepository implements IOrderRepository {
  private orders: Map<string, OrderRecord> = new Map();
  public updatedStatuses: StatusUpdateResult[] = [];

  seed(order: OrderRecord): void {
    this.orders.set(order.id, order);
  }

  async findById(orderId: string): Promise<OrderRecord | null> {
    return this.orders.get(orderId) ?? null;
  }

  async findByMarketplaceOrderId(params: any): Promise<OrderRecord | null> {
    return null;
  }

  async updateStatus(params: {
    orderId: string;
    newStatus: OrderStatus;
    source: string;
  }): Promise<StatusUpdateResult> {
    const order = this.orders.get(params.orderId)!;
    const result: StatusUpdateResult = {
      orderId: params.orderId,
      previousStatus: order.currentStatus,
      newStatus: params.newStatus,
      updatedAt: new Date().toISOString(),
    };
    this.updatedStatuses.push(result);
    order.currentStatus = params.newStatus;
    return result;
  }

  async markLabelPrinted(params: any): Promise<void> {}
}
```

---

## 6. Definition of Done

- [ ] Arquivo `IOrderRepository.ts` criado com 4 métodos documentados
- [ ] Arquivo `IProductLinkRepository.ts` criado com 3 métodos documentados
- [ ] Arquivo `IInventoryPort.ts` criado com 3 métodos documentados
- [ ] Cada método tem JSDoc explicando: propósito, idempotência, e quando é chamado
- [ ] Cada arquivo tem no máximo 150 linhas
- [ ] Nenhuma importação de Supabase — apenas imports de outros arquivos de domínio
- [ ] Os tipos `OrderRecord`, `StatusUpdateResult`, `OrderItemLinkQuery`, `ProductLinkResult` estão todos exportados
- [ ] Código TypeScript compila sem erros (`deno check`)
