# STATUS-ENGINE-T3 — OrderStatusEngine: Calculadora de Status com Chain of Responsibility

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** [T1 — Camada de Domínio](./STATUS-ENGINE-T1-dominio.md)
**Bloqueia:** T5, T6, T9

---

## 1. Visão Geral (para não-técnicos)

Hoje a lógica de "qual status deve ter este pedido?" está numa função SQL de ~500 linhas que ninguém consegue testar sem um banco de dados real. Esta task a substitui por um conjunto de classes TypeScript pequenas, cada uma com uma única responsabilidade.

Pense assim: em vez de um guarda de segurança que conhece todas as regras de cabeça (e pode esquecer alguma), criamos uma fila de guardas onde cada um verifica UMA regra específica. O primeiro que diz "sim, este caso é meu" resolve a situação. Os outros nem precisam ser consultados.

Por exemplo:
- Guarda 1 (CancelledRule): "O pedido está cancelado? Se sim: status = Cancelado"
- Guarda 2 (ReturnedRule): "O pedido foi devolvido? Se sim: status = Devolução"
- ...e assim por diante até o último guardeiro...
- Guarda 9 (PendingRule): "Nenhum dos outros se aplicou? status = Pendente"

**Benefício prático:** cada "guarda" pode ser testado separadamente, sem banco de dados.

---

## 2. Arquivos a Criar

### 2.1 Regras de Status — 9 classes em `rules/`

Cada regra é uma classe que implementa a interface `OrderStatusRule` (definida em T1).

#### `rules/CancelledRule.ts`

**Quando se aplica:** pedido com qualquer sinal de cancelamento — status do marketplace, reembolso, ou envio cancelado.

**Prioridade:** 1 (mais alta) — um pedido cancelado nunca pode ter outro status.

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Regra de mais alta prioridade: detecta cancelamentos.
 *
 * Um pedido está cancelado quando:
 * - O marketplace reportou cancelamento (signals.isCancelled = true)
 * - O pagamento foi reembolsado (signals.isRefunded = true)
 *
 * Esta regra tem prioridade absoluta sobre todas as outras — se aplicável,
 * nenhuma outra regra é consultada.
 */
export class CancelledRule implements OrderStatusRule {
  readonly name = 'CancelledRule';
  readonly status = OrderStatus.CANCELLED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isCancelled || signals.isRefunded;
  }
}
```

---

#### `rules/ReturnedRule.ts`

**Quando se aplica:** pedido devolvido pelo comprador.

**Prioridade:** 2

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Detecta pedidos devolvidos pelo comprador.
 *
 * ML: status = 'returned_to_warehouse'
 * Shopee: order_status = 'to_return'
 *
 * Prioridade 2: só perde para CancelledRule.
 */
export class ReturnedRule implements OrderStatusRule {
  readonly name = 'ReturnedRule';
  readonly status = OrderStatus.RETURNED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isReturned;
  }
}
```

---

#### `rules/FulfillmentRule.ts`

**Quando se aplica:** pedido de fulfillment (ML Full, Shopee Full) — o marketplace gerencia o estoque e o envio.

**Prioridade:** 3

**Importante:** pedidos fulfillment vão direto para SHIPPED, mesmo se tiverem itens não vinculados. Isso é intencional — o ML/Shopee está gerenciando o envio, o vendedor não precisa fazer nada.

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Pedidos de fulfillment (ML Full, Shopee Full) vão direto para SHIPPED.
 *
 * Fulfillment = o marketplace gerencia estoque e envio internamente.
 * O vendedor não precisa imprimir etiqueta nem confirmar envio.
 *
 * Prioridade 3: fica antes de UnlinkedItemsRule — pedidos Full não são
 * bloqueados por falta de vinculação (o estoque é do ML/Shopee).
 */
export class FulfillmentRule implements OrderStatusRule {
  readonly name = 'FulfillmentRule';
  readonly status = OrderStatus.SHIPPED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return signals.isFulfillment;
  }
}
```

---

#### `rules/UnlinkedItemsRule.ts`

**Quando se aplica:** pedido com pelo menos um item sem vínculo com produto do catálogo ERP.

**Prioridade:** 4 — BLOQUEANTE. Se aplicável, o pedido não avança no pipeline.

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Status BLOQUEANTE: detecta pedidos com itens não vinculados.
 *
 * Um pedido fica em UNLINKED enquanto existir pelo menos um item do pedido
 * que não foi associado a um produto do catálogo Novura.
 *
 * Um item é considerado "não vinculado" quando:
 * - Não existe registro em marketplace_item_product_links para o par (item_id, variation_id)
 * - O anúncio não tem seller_sku preenchido (se tem SKU, assume-se que o item é identificável)
 *
 * Esta regra é verificada pelo IProductLinkRepository antes de chegar aqui.
 * O ProductLinkState.unlinkedCount já está calculado.
 *
 * Prioridade 4: fica antes de todos os status de workflow (NF, Impressão, etc.)
 */
export class UnlinkedItemsRule implements OrderStatusRule {
  readonly name = 'UnlinkedItemsRule';
  readonly status = OrderStatus.UNLINKED;

  appliesTo(_signals: MarketplaceSignals, linkState: ProductLinkState): boolean {
    return !linkState.isFullyLinked;
  }
}
```

---

#### `rules/InvoicePendingRule.ts`

**Quando se aplica:** NF-e ainda não foi emitida e o marketplace exige antes do despacho.

**Prioridade:** 5

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Detecta quando a NF-e precisa ser emitida antes do despacho.
 *
 * ML: shipmentStatus = 'ready_to_ship' E shipmentSubstatus = 'invoice_pending'
 * Shopee: shipmentStatus inclui 'ready_to_ship' E não tem NF emitida (hasInvoice = false)
 *
 * Prioridade 5: fica depois de UnlinkedItemsRule — um pedido não vinculado
 * não pode pedir NF (não sabemos o produto para declarar).
 */
export class InvoicePendingRule implements OrderStatusRule {
  readonly name = 'InvoicePendingRule';
  readonly status = OrderStatus.INVOICE_PENDING;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    const isMl = signals.marketplace === 'mercado_livre';
    const isShopee = signals.marketplace === 'shopee';

    if (isMl) {
      return signals.shipmentStatus === 'ready_to_ship'
        && signals.shipmentSubstatus === 'invoice_pending';
    }
    if (isShopee) {
      const readyStatuses = ['ready_to_ship', 'logistics_ready', 'logistics_request_created'];
      const isReadyToShip = readyStatuses.includes(signals.shipmentStatus?.toLowerCase() ?? '');
      return isReadyToShip && !signals.hasInvoice;
    }
    return false;
  }
}
```

---

#### `rules/ReadyToPrintRule.ts`

**Quando se aplica:** pedido pronto para impressão da etiqueta de envio.

**Prioridade:** 6

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Detecta pedidos prontos para impressão de etiqueta.
 *
 * ML (dois casos):
 * - shipmentStatus = 'pending' E shipmentSubstatus = 'buffered'
 *   (pedido confirmado mas ML ainda não pediu NF — janela curta)
 * - shipmentStatus = 'ready_to_ship' E shipmentSubstatus = 'ready_to_print'
 *   (ML liberou para impressão após NF)
 *
 * Shopee:
 * - order_status = 'ready_to_ship' (com NF emitida — verificado antes por InvoicePendingRule)
 * - order_status = 'processed'
 * - logistics_status inclui 'logistics_ready' ou 'logistics_request_created' (com NF)
 *
 * Prioridade 6: fica depois de InvoicePendingRule.
 */
export class ReadyToPrintRule implements OrderStatusRule {
  readonly name = 'ReadyToPrintRule';
  readonly status = OrderStatus.READY_TO_PRINT;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    const isMl = signals.marketplace === 'mercado_livre';
    if (isMl) {
      const isBuffered = signals.shipmentStatus === 'pending'
        && signals.shipmentSubstatus === 'buffered';
      const isReadyToPrint = signals.shipmentStatus === 'ready_to_ship'
        && signals.shipmentSubstatus === 'ready_to_print';
      return isBuffered || isReadyToPrint;
    }

    const readyStatuses = ['ready_to_ship', 'processed', 'logistics_ready', 'logistics_request_created'];
    return readyStatuses.includes(signals.shipmentStatus?.toLowerCase() ?? '')
      || readyStatuses.includes(signals.marketplaceStatus?.toLowerCase() ?? '');
  }
}
```

---

#### `rules/AwaitingPickupRule.ts`

**Quando se aplica:** etiqueta já foi impressa, aguardando coleta pela transportadora.

**Prioridade:** 7

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Detecta pedidos aguardando coleta pela transportadora.
 *
 * ML: etiqueta marcada como impressa pelo usuário (isPrintedLabel = true)
 * Shopee: order_status = 'retry_ship' (Shopee usa este status após impressão)
 *
 * ATENÇÃO: No ML, a transição para este status é acionada por ação do usuário
 * (botão "Imprimir etiquetas" na tela), não por webhook. O campo isPrintedLabel
 * é setado pelo MarkOrderLabelPrintedUseCase (T6) antes do recálculo.
 *
 * Prioridade 7.
 */
export class AwaitingPickupRule implements OrderStatusRule {
  readonly name = 'AwaitingPickupRule';
  readonly status = OrderStatus.AWAITING_PICKUP;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.marketplace === 'mercado_livre') {
      return signals.isPrintedLabel && signals.shipmentStatus === 'ready_to_ship';
    }
    return signals.marketplaceStatus?.toLowerCase() === 'retry_ship';
  }
}
```

---

#### `rules/ShippedRule.ts`

**Quando se aplica:** pedido em trânsito, entregue, ou pickup concluído.

**Prioridade:** 8

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

const ML_SHIPPED_STATUSES = new Set([
  'shipped', 'dropped_off', 'in_transit', 'handed_to_carrier',
  'on_route', 'out_for_delivery', 'delivery_in_progress',
  'collected', 'delivered',
]);

const SHOPEE_SHIPPED_STATUSES = new Set([
  'shipped', 'to_confirm_receive', 'completed',
]);

/**
 * Detecta pedidos enviados/em trânsito/entregues.
 *
 * ML: shipmentStatus em ML_SHIPPED_STATUSES, ou dropped_off + pago
 * Shopee: marketplaceStatus em SHOPEE_SHIPPED_STATUSES, ou isPickupDone = true
 *
 * Prioridade 8: fica antes apenas de PendingRule (o fallback).
 */
export class ShippedRule implements OrderStatusRule {
  readonly name = 'ShippedRule';
  readonly status = OrderStatus.SHIPPED;

  appliesTo(signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    if (signals.marketplace === 'mercado_livre') {
      const shipStatus = signals.shipmentStatus?.toLowerCase() ?? '';
      return ML_SHIPPED_STATUSES.has(shipStatus);
    }
    const status = signals.marketplaceStatus?.toLowerCase() ?? '';
    return SHOPEE_SHIPPED_STATUSES.has(status) || (signals.isPickupDone ?? false);
  }
}
```

---

#### `rules/PendingRule.ts`

**Quando se aplica:** nenhuma outra regra se aplicou. É o fallback obrigatório.

**Prioridade:** 9 (mais baixa)

```typescript
import type { OrderStatusRule } from '../OrderStatusRule.ts';
import type { MarketplaceSignals } from '../MarketplaceSignals.ts';
import type { ProductLinkState } from '../ProductLinkState.ts';
import { OrderStatus } from '../OrderStatus.ts';

/**
 * Regra fallback — sempre se aplica.
 *
 * Deve ser a ÚLTIMA regra registrada no OrderStatusEngine.
 * Garantia que o engine sempre retorna um status válido.
 */
export class PendingRule implements OrderStatusRule {
  readonly name = 'PendingRule';
  readonly status = OrderStatus.PENDING;

  appliesTo(_signals: MarketplaceSignals, _linkState: ProductLinkState): boolean {
    return true; // sempre aplica
  }
}
```

---

### 2.2 `supabase/functions/_shared/application/orders/OrderStatusEngine.ts`

**Responsabilidade:** Orquestra as regras em cadeia de prioridade e retorna o primeiro status aplicável.

**O que é isso:** O engine é o "coordenador" que mantém a lista ordenada de regras e as consulta em sequência. É uma função pura — dado os mesmos sinais e estado de vinculação, sempre retorna o mesmo status. Zero efeitos colaterais.

```typescript
import type { MarketplaceSignals } from '../../domain/orders/MarketplaceSignals.ts';
import type { ProductLinkState } from '../../domain/orders/ProductLinkState.ts';
import type { OrderStatusRule } from '../../domain/orders/OrderStatusRule.ts';
import { OrderStatus } from '../../domain/orders/OrderStatus.ts';
import { CancelledRule } from '../../domain/orders/rules/CancelledRule.ts';
import { ReturnedRule } from '../../domain/orders/rules/ReturnedRule.ts';
import { FulfillmentRule } from '../../domain/orders/rules/FulfillmentRule.ts';
import { UnlinkedItemsRule } from '../../domain/orders/rules/UnlinkedItemsRule.ts';
import { InvoicePendingRule } from '../../domain/orders/rules/InvoicePendingRule.ts';
import { ReadyToPrintRule } from '../../domain/orders/rules/ReadyToPrintRule.ts';
import { AwaitingPickupRule } from '../../domain/orders/rules/AwaitingPickupRule.ts';
import { ShippedRule } from '../../domain/orders/rules/ShippedRule.ts';
import { PendingRule } from '../../domain/orders/rules/PendingRule.ts';

/**
 * Motor de cálculo de status de pedidos.
 *
 * Aplica regras em ordem de prioridade usando o padrão Chain of Responsibility.
 * A primeira regra cujo appliesTo() retornar true determina o status.
 *
 * Para adicionar suporte a um novo caso de status:
 * 1. Crie uma nova classe em domain/orders/rules/ implementando OrderStatusRule
 * 2. Adicione testes unitários para a nova regra
 * 3. Insira a regra na lista abaixo na posição de prioridade correta
 * 4. NUNCA modifique regras existentes — crie novas ou altere apenas a ordem
 */
export class OrderStatusEngine {
  private readonly rules: OrderStatusRule[];

  constructor(rules?: OrderStatusRule[]) {
    // Permite injetar regras customizadas para testes
    this.rules = rules ?? OrderStatusEngine.defaultRules();
  }

  /**
   * Calcula o status interno de um pedido.
   *
   * Função pura — sem side effects, sem chamadas ao banco.
   *
   * @param signals Sinais normalizados do marketplace (construídos pelo adapter específico)
   * @param linkState Estado de vinculação dos itens (calculado pelo IProductLinkRepository)
   * @returns O status interno mais adequado para o pedido
   */
  calculate(signals: MarketplaceSignals, linkState: ProductLinkState): OrderStatus {
    for (const rule of this.rules) {
      if (rule.appliesTo(signals, linkState)) {
        return rule.status;
      }
    }
    // Nunca chega aqui porque PendingRule sempre aplica
    return OrderStatus.PENDING;
  }

  private static defaultRules(): OrderStatusRule[] {
    return [
      new CancelledRule(),      // prioridade 1
      new ReturnedRule(),       // prioridade 2
      new FulfillmentRule(),    // prioridade 3
      new UnlinkedItemsRule(),  // prioridade 4 — bloqueante
      new InvoicePendingRule(), // prioridade 5
      new ReadyToPrintRule(),   // prioridade 6
      new AwaitingPickupRule(), // prioridade 7
      new ShippedRule(),        // prioridade 8
      new PendingRule(),        // prioridade 9 — fallback
    ];
  }
}
```

**Tamanho esperado:** ~60 linhas

---

## 3. Testes

Esta é a task com a maior cobertura de testes, pois é o núcleo do sistema.

### Arquivo: `__tests__/rules/CancelledRule.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { CancelledRule } from "../../rules/CancelledRule.ts";
import { FULLY_LINKED } from "../../ProductLinkState.ts";
import { OrderStatus } from "../../OrderStatus.ts";
import type { MarketplaceSignals } from "../../MarketplaceSignals.ts";

const baseSignals: MarketplaceSignals = {
  organizationId: 'org-1', marketplaceOrderId: '123', marketplace: 'mercado_livre',
  marketplaceStatus: 'paid', isFulfillment: false, isCancelled: false,
  isRefunded: false, isReturned: false, isPrintedLabel: false, hasInvoice: false,
};

const rule = new CancelledRule();

Deno.test("CancelledRule: não aplica quando pedido está ativo", () => {
  assertEquals(rule.appliesTo(baseSignals, FULLY_LINKED), false);
});

Deno.test("CancelledRule: aplica quando isCancelled = true", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isCancelled: true }, FULLY_LINKED), true);
});

Deno.test("CancelledRule: aplica quando isRefunded = true", () => {
  assertEquals(rule.appliesTo({ ...baseSignals, isRefunded: true }, FULLY_LINKED), true);
});

Deno.test("CancelledRule: status é CANCELLED", () => {
  assertEquals(rule.status, OrderStatus.CANCELLED);
});
```

### Arquivo: `__tests__/OrderStatusEngine.test.ts`

```typescript
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { OrderStatusEngine } from "../OrderStatusEngine.ts";
import { OrderStatus } from "../../domain/orders/OrderStatus.ts";
import { createProductLinkState, FULLY_LINKED } from "../../domain/orders/ProductLinkState.ts";

const engine = new OrderStatusEngine();

// Helper para criar sinais mínimos
const signals = (overrides: Partial<MarketplaceSignals>): MarketplaceSignals => ({
  organizationId: 'org-1', marketplaceOrderId: '123', marketplace: 'mercado_livre',
  marketplaceStatus: 'paid', isFulfillment: false, isCancelled: false,
  isRefunded: false, isReturned: false, isPrintedLabel: false, hasInvoice: false,
  ...overrides,
});

Deno.test("engine: pedido cancelado → CANCELLED (independente de outros campos)", () => {
  const result = engine.calculate(
    signals({ isCancelled: true, shipmentStatus: 'ready_to_ship' }),
    createProductLinkState(2) // tem itens não vinculados, mas cancelado tem prioridade
  );
  assertEquals(result, OrderStatus.CANCELLED);
});

Deno.test("engine: fulfillment ignora itens não vinculados → SHIPPED", () => {
  const result = engine.calculate(
    signals({ isFulfillment: true }),
    createProductLinkState(3) // items não vinculados — irrelevante para fulfillment
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

Deno.test("engine: item não vinculado → UNLINKED (bloqueia outros status)", () => {
  const result = engine.calculate(
    signals({ shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print' }),
    createProductLinkState(1) // 1 item não vinculado
  );
  assertEquals(result, OrderStatus.UNLINKED); // e não READY_TO_PRINT
});

Deno.test("engine: ML ready_to_ship + ready_to_print + vinculado → READY_TO_PRINT", () => {
  const result = engine.calculate(
    signals({ shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'ready_to_print' }),
    FULLY_LINKED
  );
  assertEquals(result, OrderStatus.READY_TO_PRINT);
});

Deno.test("engine: ML ready_to_ship + invoice_pending → INVOICE_PENDING", () => {
  const result = engine.calculate(
    signals({ shipmentStatus: 'ready_to_ship', shipmentSubstatus: 'invoice_pending' }),
    FULLY_LINKED
  );
  assertEquals(result, OrderStatus.INVOICE_PENDING);
});

Deno.test("engine: ML shipped → SHIPPED", () => {
  const result = engine.calculate(
    signals({ shipmentStatus: 'shipped' }),
    FULLY_LINKED
  );
  assertEquals(result, OrderStatus.SHIPPED);
});

Deno.test("engine: Shopee retry_ship → AWAITING_PICKUP", () => {
  const result = engine.calculate(
    signals({ marketplace: 'shopee', marketplaceStatus: 'retry_ship' }),
    FULLY_LINKED
  );
  assertEquals(result, OrderStatus.AWAITING_PICKUP);
});

Deno.test("engine: nenhuma condição específica → PENDING", () => {
  const result = engine.calculate(signals({ marketplaceStatus: 'unknown_state' }), FULLY_LINKED);
  assertEquals(result, OrderStatus.PENDING);
});

// Testes adicionais para cobrir todos os status e combinações ML+Shopee
```

---

## 4. Definition of Done

- [ ] 9 arquivos de regras criados em `domain/orders/rules/` (um por status)
- [ ] Cada regra tem no máximo 30 linhas
- [ ] Cada regra tem JSDoc explicando as condições exatas do ML e Shopee
- [ ] Arquivo `OrderStatusEngine.ts` criado em `application/orders/`
- [ ] `OrderStatusEngine.calculate()` é uma função pura (sem side effects, sem I/O)
- [ ] Testes unitários para cada regra individualmente
- [ ] Testes de integração do engine cobrindo ao menos 15 cenários distintos, incluindo:
  - [ ] Cancelado tem prioridade sobre itens não vinculados
  - [ ] Fulfillment ignora itens não vinculados
  - [ ] Itens não vinculados bloqueiam INVOICE_PENDING e READY_TO_PRINT
  - [ ] ML: pending/buffered → READY_TO_PRINT
  - [ ] ML: ready_to_ship/ready_to_print → READY_TO_PRINT
  - [ ] ML: ready_to_ship/invoice_pending → INVOICE_PENDING
  - [ ] ML: printed_label=true + ready_to_ship → AWAITING_PICKUP
  - [ ] ML: shipped/in_transit/delivered → SHIPPED
  - [ ] Shopee: ready_to_ship sem NF → INVOICE_PENDING
  - [ ] Shopee: ready_to_ship com NF → READY_TO_PRINT
  - [ ] Shopee: retry_ship → AWAITING_PICKUP
  - [ ] Shopee: shipped/completed → SHIPPED
  - [ ] Estado desconhecido → PENDING
- [ ] Todos os testes passam com `deno test`
- [ ] Nenhum arquivo excede 150 linhas
- [ ] Zero imports de Supabase no domínio ou engine
