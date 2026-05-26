# STATUS-ENGINE-T1 — Camada de Domínio: Entidades e Value Objects

**Ciclo:** Motor de Status de Pedidos
**Status:** ✅ Implementado
**Depende de:** Nada (é a base de tudo)
**Bloqueia:** T2, T3, T5, T6, T7

---

## 1. Visão Geral (para não-técnicos)

Esta task cria o "vocabulário" que o sistema usa para falar sobre pedidos. É como criar um dicionário antes de escrever um livro — sem definir claramente o que cada palavra significa, o código fica ambíguo e propenso a bugs.

Hoje o sistema usa strings como `'A vincular'`, `'Impressao'`, `'Emissao NF'` espalhadas em SQL, TypeScript e até no banco de dados. Um erro de digitação em qualquer lugar causa um bug silencioso. Com esta task, todos esses valores viram um enum TypeScript com verificação em tempo de compilação.

Também definimos o que é um "sinal do marketplace" (os dados brutos que o ML ou Shopee enviam) e o que é "estado de vinculação" (se os itens do pedido já foram ligados a produtos do catálogo). Essas duas informações são as únicas entradas necessárias para calcular o status de um pedido.

> **Decisão de design (EN slugs):** Os valores do enum `OrderStatus` usam slugs em inglês (ex: `'unlinked'`, `'shipped'`) para consistência com os status dos marketplaces (ML e Shopee já fornecem seus status em inglês). Os rótulos em português para o usuário final são providos exclusivamente pela função `getOrderStatusLabel()`. Nunca usar os slugs EN diretamente no frontend — sempre passar pelo mapeamento de labels.

---

## 2. Por que Isso é Necessário

### Problema atual
```typescript
// Hoje — strings mágicas em três lugares diferentes:
// Em mercado-livre-process-presented/index.ts:
if (hasUnlinkedItems) statusInterno = "A vincular";

// Em shopee-process-presented/index.ts:
const statusInterno = hasUnlinkedItems ? "A vincular" : ...

// Em SQL (process_marketplace_order_presented_new):
v_status_interno := 'A vincular';
```

Se alguém escrever `'A Vincular'` (V maiúsculo) em qualquer lugar, nada quebra na compilação, mas o filtro no frontend para de funcionar.

### Solução
```typescript
// Com enum TypeScript — erro de compilação garante consistência:
// Slugs em EN para compatibilidade direta com os valores dos marketplaces.
// Labels em PT-BR são fornecidos por getOrderStatusLabel().
export enum OrderStatus {
  UNLINKED = 'unlinked',
  // ...
}
```

---

## 3. Arquivos a Criar

### 3.1 `supabase/functions/_shared/domain/orders/OrderStatus.ts`

**Responsabilidade:** Enum com todos os status internos possíveis de um pedido no Novura.

**O que é isso:** Um status de pedido representa onde o pedido está no pipeline de atendimento, do ponto de vista do vendedor. É diferente do status do marketplace (que é em inglês e cada marketplace tem os seus).

```typescript
/**
 * Internal order status for Novura.
 *
 * Represents the current stage of the order in the seller's fulfillment pipeline.
 * This enum is the single source of truth — every other place that needs an order
 * status must import from here.
 *
 * Priority order (for calculation): see OrderStatusEngine.ts
 *
 * NOTE: Values are canonical English slugs for persistence and integrations.
 * Using EN slugs ensures direct alignment with marketplace-provided status strings
 * (ML and Shopee already deliver their statuses in English).
 * UI labels in pt-BR are provided by getOrderStatusLabel().
 */
export enum OrderStatus {
  /** Order cancelled by the marketplace or refunded */
  CANCELLED = 'cancelled',

  /** Order returned by the buyer */
  RETURNED = 'returned',

  /**
   * At least one order item is not yet linked to a catalog product.
   * BLOCKING status — prevents the order from advancing in the pipeline.
   */
  UNLINKED = 'unlinked',

  /**
   * Invoice (NF-e) must be issued before the order is dispatched.
   * ML: shipment_substatus = 'invoice_pending'
   * Shopee: ready_to_ship without invoice_number
   */
  INVOICE_PENDING = 'invoice_pending',

  /** Order is ready to print the shipping label */
  READY_TO_PRINT = 'ready_to_print',

  /** Label printed, awaiting carrier pickup */
  AWAITING_PICKUP = 'awaiting_pickup',

  /**
   * Order shipped / in transit / delivered.
   * Also covers fulfillment orders (ML Full / Shopee Full).
   */
  SHIPPED = 'shipped',

  /** Initial state — order arrived but no more specific condition applies */
  PENDING = 'pending',
}

/**
 * Maps an OrderStatus enum value to its display label in pt-BR.
 *
 * Used by the OrderStatusBadge frontend component.
 * Guaranteed to be exhaustive — TypeScript will error if a new enum member is
 * added without a corresponding label entry.
 *
 * IMPORTANT: Never use the raw EN slug values directly in the UI.
 * Always call this function to get the pt-BR label for display.
 */
export function getOrderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.CANCELLED]: 'Cancelado',
    [OrderStatus.RETURNED]: 'Devolução',
    [OrderStatus.UNLINKED]: 'A vincular',
    [OrderStatus.INVOICE_PENDING]: 'Emissão NF',
    [OrderStatus.READY_TO_PRINT]: 'Impressão',
    [OrderStatus.AWAITING_PICKUP]: 'Aguardando Coleta',
    [OrderStatus.SHIPPED]: 'Enviado',
    [OrderStatus.PENDING]: 'Pendente',
  };
  return labels[status];
}
```

**Tamanho esperado:** ~50 linhas
**Testes necessários:** `getOrderStatusLabel` retorna string correto para cada valor do enum

---

### 3.2 `supabase/functions/_shared/domain/orders/MarketplaceSignals.ts`

**Responsabilidade:** Value object que representa os sinais normalizados de um marketplace (ML ou Shopee) para um pedido específico.

**O que é isso:** Um "sinal do marketplace" é a informação bruta que o Mercado Livre ou a Shopee enviam sobre um pedido. O problema é que cada marketplace usa terminologia diferente — o ML usa `shipment_status = 'shipped'`, a Shopee usa `order_status = 'SHIPPED'`.

Este value object cria uma **linguagem neutra** que tanto o ML quanto a Shopee conseguem "falar", e que o `OrderStatusEngine` sabe interpretar. Pense nisso como um tradutor universal.

**Importante:** Este objeto NÃO precisa conter todos os dados do pedido — apenas os dados necessários para decidir o status. Dados como nome do comprador, endereço e valores monetários ficam em outros lugares.

```typescript
/**
 * Sinais normalizados de um marketplace usados para calcular o status interno.
 *
 * Esta é a entrada principal do OrderStatusEngine. Deve ser construída por
 * adapters específicos de cada marketplace (MlMarketplaceSignalsAdapter,
 * ShopeeMarketplaceSignalsAdapter).
 *
 * Todos os campos são opcionais para suportar casos onde o marketplace
 * não fornece determinada informação.
 */
export interface MarketplaceSignals {
  /** ID interno da organização Novura */
  organizationId: string;

  /** ID do pedido no marketplace (ex: "12345678" no ML, "250330ABCD" na Shopee) */
  marketplaceOrderId: string;

  /** Nome do marketplace (normalizado para minúsculas) */
  marketplace: 'mercado_livre' | 'shopee';

  /** Status bruto do pedido no marketplace */
  marketplaceStatus: string;

  /** Status do envio/logística (se disponível) */
  shipmentStatus?: string;

  /** Substatus do envio — detalhe adicional ao shipmentStatus */
  shipmentSubstatus?: string;

  /** Verdadeiro se o pedido é fulfillment (ML Full, Shopee Full).
   *  Pedidos fulfillment vão direto para SHIPPED sem passar por outros status. */
  isFulfillment: boolean;

  /** Verdadeiro se o pedido está cancelado (qualquer fonte de verdade) */
  isCancelled: boolean;

  /** Verdadeiro se o pagamento foi reembolsado */
  isRefunded: boolean;

  /** Verdadeiro se o pedido foi devolvido pelo comprador */
  isReturned: boolean;

  /** Verdadeiro se a etiqueta de envio já foi marcada como impressa */
  isPrintedLabel: boolean;

  /** Verdadeiro se a NF-e foi emitida (tem número de NF) */
  hasInvoice: boolean;

  /** Status do pickup/coleta (específico Shopee) */
  isPickupDone?: boolean;
}
```

**Tamanho esperado:** ~60 linhas
**Testes necessários:** Nenhum (é apenas uma interface TypeScript — a validação é em tempo de compilação)

---

### 3.3 `supabase/functions/_shared/domain/orders/ProductLinkState.ts`

**Responsabilidade:** Value object que representa o estado de vinculação dos itens de um pedido.

**O que é isso:** Cada pedido tem um ou mais itens (produtos vendidos). Para o Novura processar o pedido (reservar estoque, emitir NF), ele precisa saber qual produto do catálogo interno corresponde a cada item do marketplace. Esta vinculação pode ser:
- **Automática por SKU:** o anúncio já tem o SKU do vendedor preenchido
- **Automática por vínculo permanente:** o vendedor já vinculou este anúncio antes
- **Manual:** o vendedor precisa vincular manualmente

Este value object encapsula o resultado dessa verificação.

```typescript
/**
 * Estado de vinculação dos itens de um pedido.
 *
 * Construído consultando marketplace_item_product_links e verificando
 * seller_sku para cada item do pedido.
 *
 * Se unlinkedCount > 0, o pedido deve receber status UNLINKED (bloqueante).
 */
export interface ProductLinkState {
  /** Quantidade de itens sem vínculo com produto do catálogo */
  unlinkedCount: number;

  /** Verdadeiro se todos os itens estão vinculados */
  get isFullyLinked(): boolean; // implementar como: unlinkedCount === 0
}

/**
 * Cria um ProductLinkState com validação.
 * Usar esta factory function em vez de criar o objeto diretamente.
 */
export function createProductLinkState(unlinkedCount: number): ProductLinkState {
  if (unlinkedCount < 0) throw new Error('unlinkedCount não pode ser negativo');
  return {
    unlinkedCount,
    get isFullyLinked() { return this.unlinkedCount === 0; },
  };
}

/** Convenience: todos os itens estão vinculados */
export const FULLY_LINKED: ProductLinkState = createProductLinkState(0);
```

**Tamanho esperado:** ~35 linhas
**Testes necessários:**
- `createProductLinkState(0).isFullyLinked === true`
- `createProductLinkState(2).isFullyLinked === false`
- `createProductLinkState(-1)` lança erro

---

### 3.4 `supabase/functions/_shared/domain/orders/OrderDomainEvents.ts`

**Responsabilidade:** Define os eventos de domínio que o sistema emite quando o status de um pedido muda. Esses eventos são usados para desacoplar os side effects (estoque, notificações) do cálculo de status.

**O que é isso:** Em vez de calcular o status e imediatamente chamar a função de reservar estoque (gerando acoplamento), o sistema apenas "anuncia" que um status mudou. Outros componentes que se importam com essa mudança (como o use case de estoque) reagem ao evento.

**Por que isso importa:** Torna cada parte do sistema independente. Se amanhã precisarmos enviar um email quando um pedido for para "Impressão", basta criar um novo handler de evento — sem tocar no código de cálculo de status.

```typescript
/**
 * Eventos de domínio emitidos pelo sistema de status de pedidos.
 *
 * Estes eventos são o mecanismo de desacoplamento entre o cálculo de status
 * e os side effects (estoque, notificações, etc.).
 *
 * IMPORTANTE: Estes tipos são imutáveis após criação (readonly em todos os campos).
 */

export type OrderStatusChangedEvent = {
  readonly type: 'ORDER_STATUS_CHANGED';
  readonly orderId: string;
  readonly organizationId: string;
  readonly previousStatus: string | null;
  readonly newStatus: string;
  readonly changedAt: string; // ISO 8601
  readonly source: 'webhook' | 'user_action' | 'sync';
};

export type ProductLinkedEvent = {
  readonly type: 'PRODUCT_LINKED';
  readonly orderId: string;
  readonly organizationId: string;
  readonly orderItemId: string;
  readonly productId: string;
  readonly isPermanent: boolean;
  readonly linkedAt: string; // ISO 8601
};

export type LabelPrintedEvent = {
  readonly type: 'LABEL_PRINTED';
  readonly orderId: string;
  readonly organizationId: string;
  readonly printedAt: string; // ISO 8601
};

/** Union type de todos os eventos possíveis */
export type OrderDomainEvent =
  | OrderStatusChangedEvent
  | ProductLinkedEvent
  | LabelPrintedEvent;

/** Factory functions para criar eventos com defaults seguros */
export function createStatusChangedEvent(params: {
  orderId: string;
  organizationId: string;
  previousStatus: string | null;
  newStatus: string;
  source: OrderStatusChangedEvent['source'];
}): OrderStatusChangedEvent {
  return { type: 'ORDER_STATUS_CHANGED', ...params, changedAt: new Date().toISOString() };
}
```

**Tamanho esperado:** ~60 linhas
**Testes necessários:**
- `createStatusChangedEvent(...)` cria objeto com `type = 'ORDER_STATUS_CHANGED'`
- `changedAt` é string ISO válida

---

### 3.5 `supabase/functions/_shared/domain/orders/OrderStatusRule.ts`

**Responsabilidade:** Interface que toda regra de status deve implementar. É o contrato do padrão Chain of Responsibility.

**O que é isso:** Cada status de pedido tem condições diferentes para se aplicar. A interface `OrderStatusRule` garante que todas as regras falam a mesma "língua" e podem ser compostas pelo engine. É como um contrato que diz: "se você é uma regra, você sabe dizer se é aplicável e qual status retorna".

```typescript
import type { MarketplaceSignals } from './MarketplaceSignals.ts';
import type { ProductLinkState } from './ProductLinkState.ts';
import type { OrderStatus } from './OrderStatus.ts';

/**
 * Interface que toda regra de cálculo de status deve implementar.
 *
 * O OrderStatusEngine percorre as regras em ordem de prioridade.
 * A primeira regra cujo appliesTo() retornar true "ganha" e determina o status.
 *
 * Padrão: Chain of Responsibility
 *
 * Como criar uma nova regra:
 *   1. Crie um arquivo em rules/ implementando esta interface
 *   2. Escreva testes unitários cobrindo todos os casos
 *   3. Registre a regra em OrderStatusEngine.ts na posição de prioridade correta
 */
export interface OrderStatusRule {
  /**
   * Nome legível da regra — usado em logs e mensagens de erro.
   * Exemplo: 'CancelledRule', 'UnlinkedItemsRule'
   */
  readonly name: string;

  /**
   * Verifica se esta regra se aplica ao pedido dado os sinais e estado de vinculação.
   *
   * Deve ser uma função pura — sem side effects, sem chamadas ao banco.
   *
   * @param signals Sinais normalizados do marketplace
   * @param linkState Estado de vinculação dos itens
   * @returns true se esta regra deve ser aplicada
   */
  appliesTo(signals: MarketplaceSignals, linkState: ProductLinkState): boolean;

  /**
   * O status que esta regra retorna quando aplicável.
   * Só é chamado se appliesTo() retornar true.
   */
  readonly status: OrderStatus;
}
```

**Tamanho esperado:** ~45 linhas
**Testes necessários:** Nenhum (é apenas uma interface)

---

## 4. Estrutura de Diretórios

```
supabase/functions/_shared/domain/orders/
├── OrderStatus.ts          ← enum (EN slugs) + getOrderStatusLabel() (PT-BR)
├── MarketplaceSignals.ts   ← interface MarketplaceSignals
├── ProductLinkState.ts     ← interface + createProductLinkState()
├── OrderDomainEvents.ts    ← tipos de eventos + factories
├── OrderStatusRule.ts      ← interface Chain of Responsibility
└── rules/                  ← implementações (criadas em T3)
    ├── CancelledRule.ts
    ├── ReturnedRule.ts
    ├── FulfillmentRule.ts
    ├── UnlinkedRule.ts      ← (nota: implementado como UnlinkedRule, não UnlinkedItemsRule)
    ├── InvoicePendingRule.ts
    ├── ReadyToPrintRule.ts
    ├── AwaitingPickupRule.ts
    ├── ShippedRule.ts
    └── PendingRule.ts
```

---

## 5. Testes

Todos os testes ficam em `supabase/functions/_shared/domain/orders/__tests__/`.

### Arquivo: `OrderStatus.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { OrderStatus, getOrderStatusLabel } from "../OrderStatus.ts";

Deno.test("getOrderStatusLabel retorna label correto para UNLINKED", () => {
  assertEquals(getOrderStatusLabel(OrderStatus.UNLINKED), 'A vincular');
});

Deno.test("getOrderStatusLabel retorna label correto para INVOICE_PENDING", () => {
  assertEquals(getOrderStatusLabel(OrderStatus.INVOICE_PENDING), 'Emissão NF');
});

// Cobrir todos os 8 valores do enum
```

### Arquivo: `ProductLinkState.test.ts`

```typescript
import { assertEquals, assertThrows } from "https://deno.land/std/testing/asserts.ts";
import { createProductLinkState, FULLY_LINKED } from "../ProductLinkState.ts";

Deno.test("isFullyLinked é true quando unlinkedCount é 0", () => {
  const state = createProductLinkState(0);
  assertEquals(state.isFullyLinked, true);
});

Deno.test("isFullyLinked é false quando unlinkedCount > 0", () => {
  const state = createProductLinkState(3);
  assertEquals(state.isFullyLinked, false);
});

Deno.test("createProductLinkState lança erro para count negativo", () => {
  assertThrows(() => createProductLinkState(-1));
});

Deno.test("FULLY_LINKED é conveniência para count 0", () => {
  assertEquals(FULLY_LINKED.isFullyLinked, true);
});
```

### Arquivo: `OrderDomainEvents.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { createStatusChangedEvent } from "../OrderDomainEvents.ts";

Deno.test("createStatusChangedEvent cria evento com type correto", () => {
  const event = createStatusChangedEvent({
    orderId: 'order-1',
    organizationId: 'org-1',
    previousStatus: 'pending',   // EN slug
    newStatus: 'shipped',        // EN slug
    source: 'webhook',
  });
  assertEquals(event.type, 'ORDER_STATUS_CHANGED');
});

Deno.test("createStatusChangedEvent define changedAt como ISO string", () => {
  const event = createStatusChangedEvent({
    orderId: 'o', organizationId: 'org', previousStatus: null, newStatus: 'pending', source: 'sync',
  });
  // Deve ser parsável como Date válida
  const date = new Date(event.changedAt);
  assertEquals(isNaN(date.getTime()), false);
});
```

---

## 6. Definition of Done

- [x] Arquivo `OrderStatus.ts` criado com enum `OrderStatus` contendo 8 valores
- [x] **Valores do enum usam EN slugs** (`'cancelled'`, `'returned'`, `'unlinked'`, `'invoice_pending'`, `'ready_to_print'`, `'awaiting_pickup'`, `'shipped'`, `'pending'`) — alinhados com os status dos marketplaces
- [x] Arquivo `OrderStatus.ts` exporta `getOrderStatusLabel()` com mapeamento para pt-BR (separação clara: persiste EN, exibe PT-BR)
- [x] Arquivo `MarketplaceSignals.ts` criado com interface completa (13 campos)
- [x] Arquivo `ProductLinkState.ts` criado com interface + `createProductLinkState()` + `FULLY_LINKED`
- [x] Arquivo `OrderDomainEvents.ts` criado com 3 tipos de evento + factory `createStatusChangedEvent()`
- [x] Arquivo `OrderStatusRule.ts` criado com interface `OrderStatusRule`
- [x] Diretório `rules/` preenchido com 9 regras (ver T3)
- [x] Todos os testes unitários passam com `deno test`
- [x] Nenhum arquivo excede 150 linhas
- [x] Nenhuma importação de Supabase nos arquivos de domínio
- [x] Cada tipo/interface tem JSDoc explicando seu propósito
- [x] **Regra de compatibilidade frontend:** `src/hooks/useOrderFiltering.ts` e `src/utils/orderUtils.ts` devem mapear os EN slugs para exibição PT-BR via `getOrderStatusLabel()` ou equivalente
