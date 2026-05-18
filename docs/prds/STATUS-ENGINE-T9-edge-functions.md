# STATUS-ENGINE-T9 — Wiring: Integrar o Engine nas Edge Functions

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** T3, T4, T5, T6, T7, T8
**Bloqueia:** T10 (frontend) — o status precisa estar sendo calculado antes do frontend ler

---

## 1. Visão Geral (para não-técnicos)

As tasks anteriores criaram as peças do motor: as regras, os repositórios, os use cases. Esta task é o "encaixe" — conectar todas essas peças às edge functions que já existem, para que o motor realmente rode quando um pedido chega ou é atualizado.

São quatro pontos de integração:

1. **`orders-queue-worker`** — Principal. Após salvar o pedido normalizado, calcula o status e salva no banco
2. **`link-order-product`** — Nova endpoint que substitui `linked_products_item`. Chama o `LinkProductToOrderItemUseCase`
3. **`mark-labels-printed`** — Substitui a RPC SQL de impressão. Chama o `MarkOrderLabelPrintedUseCase`
4. **Remoção gradual** — Desativa `mercado-livre-process-presented`, `shopee-process-presented` e o trigger SQL (quando confirmado que o novo fluxo funciona)

---

## 2. Modificação 1: `orders-queue-worker`

**Arquivo:** `supabase/functions/orders-queue-worker/index.ts`

**O que muda:** Após o upsert das tabelas `orders`/`order_items`/`order_shipping`, chamar o `RecalculateOrderStatusUseCase` e o `HandleStockSideEffectsUseCase`.

**O que NÃO muda:** A lógica de consumir a fila, buscar tokens, fazer fetch nas APIs do marketplace, normalizar. Apenas adicionar as chamadas ao final do processamento de cada pedido.

```typescript
// Trecho a adicionar ao final do processamento de cada pedido em orders-queue-worker

import { SupabaseOrderRepository } from '../_shared/adapters/orders/SupabaseOrderRepository.ts';
import { SupabaseProductLinkRepository } from '../_shared/adapters/orders/SupabaseProductLinkRepository.ts';
import { SupabaseInventoryAdapter } from '../_shared/adapters/orders/SupabaseInventoryAdapter.ts';
import { RecalculateOrderStatusUseCase } from '../_shared/application/orders/RecalculateOrderStatusUseCase.ts';
import { HandleStockSideEffectsUseCase } from '../_shared/application/orders/HandleStockSideEffectsUseCase.ts';

/**
 * Instancia os use cases — deve ser feito uma vez por invocação da edge function,
 * fora do loop de processamento de mensagens para evitar overhead.
 */
function buildStatusUseCases(supabase: SupabaseClient) {
  const orderRepo = new SupabaseOrderRepository(supabase);
  const linkRepo = new SupabaseProductLinkRepository(supabase);
  const inventory = new SupabaseInventoryAdapter(supabase);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, linkRepo);
  const handleStock = new HandleStockSideEffectsUseCase(inventory);
  return { recalculate, handleStock };
}

/**
 * Após upsert bem-sucedido de um pedido, calcula e persiste o status.
 * Chamado para cada mensagem processada da fila orders_sync_queue.
 */
async function calculateAndPersistStatus(params: {
  orderId: string;
  organizationId: string;
  recalculate: RecalculateOrderStatusUseCase;
  handleStock: HandleStockSideEffectsUseCase;
}): Promise<void> {
  const result = await params.recalculate.execute({
    orderId: params.orderId,
    organizationId: params.organizationId,
    source: 'webhook',
  });

  if (result.statusChanged && result.event) {
    // Side effects de estoque são disparados apenas quando o status muda
    await params.handleStock.handle(result.event);
  }
}
```

**Onde exatamente inserir no worker:** Logo após a linha que chama `ordersUpsertAdapter.upsert(...)`, dentro do try/catch que já existe para cada mensagem. Se o `calculateAndPersistStatus` falhar, loggar o erro mas não relançar — o status de estoque pode ser retentado, mas o pedido foi salvo com sucesso.

**Ponto de atenção:** O `orders-queue-worker` atual também escreve em `marketplace_orders_raw` e chama o trigger legado. Esta modificação deve coexistir com o fluxo legado durante a transição. Só remover o fluxo legado em T9 quando confirmado que o novo fluxo está funcionando em produção.

---

## 3. Nova Edge Function: `link-order-product`

**Arquivo:** `supabase/functions/link-order-product/index.ts`

**Responsabilidade:** Endpoint HTTP que recebe a vinculação de um produto a itens de um pedido e orquestra via `LinkProductToOrderItemUseCase`.

**Substitui:** `supabase/functions/linked_products_item/index.ts`

**Por que criar nova em vez de modificar a existente:** A `linked_products_item` tem lógica legada misturada (atualiza `marketplace_order_items`, `marketplace_orders_presented_new`, chama `process-presented`). É mais seguro criar uma nova endpoint limpa e migrar o frontend para ela, depois desativar a antiga.

```typescript
// supabase/functions/link-order-product/index.ts
import { serve } from 'https://deno.land/std/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { LinkProductToOrderItemUseCase } from '../_shared/application/orders/LinkProductToOrderItemUseCase.ts';
import { RecalculateOrderStatusUseCase } from '../_shared/application/orders/RecalculateOrderStatusUseCase.ts';
import { HandleStockSideEffectsUseCase } from '../_shared/application/orders/HandleStockSideEffectsUseCase.ts';
import { SupabaseOrderRepository } from '../_shared/adapters/orders/SupabaseOrderRepository.ts';
import { SupabaseProductLinkRepository } from '../_shared/adapters/orders/SupabaseProductLinkRepository.ts';
import { SupabaseInventoryAdapter } from '../_shared/adapters/orders/SupabaseInventoryAdapter.ts';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { orderId, organizationId, marketplace, links } = body;

    if (!orderId || !organizationId || !marketplace || !links?.length) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const useCase = buildLinkUseCase(supabase);
    const result = await useCase.execute({ orderId, organizationId, marketplace, links });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[link-order-product] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});

function buildLinkUseCase(supabase: any): LinkProductToOrderItemUseCase {
  const orderRepo = new SupabaseOrderRepository(supabase);
  const linkRepo = new SupabaseProductLinkRepository(supabase);
  const inventory = new SupabaseInventoryAdapter(supabase);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, linkRepo);
  const handleStock = new HandleStockSideEffectsUseCase(inventory);
  // O LinkUseCase chama RecalculateUseCase que retorna o evento
  // e HandleStockUseCase é chamado no RecalculateUseCase...
  // ATENÇÃO: ver nota abaixo sobre composição
  return new LinkProductToOrderItemUseCase(orderRepo, linkRepo, recalculate);
}
```

**Nota sobre composição de use cases:** O `LinkProductToOrderItemUseCase` chama `RecalculateOrderStatusUseCase`, que retorna um evento. Mas quem chama `HandleStockSideEffectsUseCase`?

**Solução:** Refatorar `LinkProductToOrderItemUseCase` para aceitar também `HandleStockSideEffectsUseCase`, ou fazer a edge function chamar os três em sequência. A segunda opção é mais explícita:

```typescript
// Na edge function, em vez de delegar ao use case:
const recalcResult = await recalculate.execute({ orderId, organizationId, source: 'user_action' });
if (recalcResult.statusChanged && recalcResult.event) {
  await handleStock.handle(recalcResult.event);
}
```

O `LinkProductToOrderItemUseCase` deve ser simplificado para não chamar `RecalculateOrderStatusUseCase` diretamente — isso fica na edge function. O use case apenas faz a vinculação e retorna `remainingUnlinkedCount`.

---

## 4. Nova Edge Function: `mark-labels-printed`

**Arquivo:** `supabase/functions/mark-labels-printed/index.ts`

**Responsabilidade:** Endpoint que substitui a chamada à RPC SQL `rpc_marketplace_order_print_label`.

```typescript
serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const body = await req.json();
  const { orderIds, organizationId } = body;

  if (!orderIds?.length || !organizationId) {
    return new Response(JSON.stringify({ error: 'Missing orderIds or organizationId' }), { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const orderRepo = new SupabaseOrderRepository(supabase);
  const linkRepo = new SupabaseProductLinkRepository(supabase);
  const inventory = new SupabaseInventoryAdapter(supabase);
  const recalculate = new RecalculateOrderStatusUseCase(orderRepo, linkRepo);
  const handleStock = new HandleStockSideEffectsUseCase(inventory);
  const markPrinted = new MarkOrderLabelPrintedUseCase(orderRepo, recalculate);

  const result = await markPrinted.execute({ orderIds, organizationId });

  // Disparar side effects de estoque para cada pedido cujo status mudou
  await Promise.all(
    result.statusChanges.map(change =>
      handleStock.handle({
        type: 'ORDER_STATUS_CHANGED',
        orderId: change.orderId,
        organizationId,
        previousStatus: null, // não crítico para estoque
        newStatus: change.newStatus,
        changedAt: new Date().toISOString(),
        source: 'user_action',
      })
    )
  );

  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
```

**Tamanho esperado:** ~50 linhas

---

## 5. Plano de Remoção do Legado

**Importante:** A remoção do legado deve ser feita de forma gradual, com monitoramento em produção.

### Fase 1: Ativar o novo fluxo em paralelo (T9 deploy)
- `orders-queue-worker` começa a calcular e salvar status na tabela `orders`
- Trigger legado continua rodando em `marketplace_orders_presented_new`
- Frontend ainda lê de `marketplace_orders_presented_new` (T10 não deployado ainda)

### Fase 2: Migrar o frontend (T10 deploy)
- Frontend passa a ler de `orders.status`
- Comparar contagens de pedidos por status entre as duas fontes (deve ser idêntico)

### Fase 3: Remover o legado (após 7 dias em produção sem incidentes)
- Desativar edge functions `mercado-livre-process-presented` e `shopee-process-presented`
- Criar migration para dropar o trigger `on_marketplace_orders_raw_change_new`
- Criar migration para dropar o trigger `trg_presented_new_stock_flow`
- Desativar edge function `linked_products_item` (substituída por `link-order-product`)
- Desativar RPC SQL `rpc_marketplace_order_print_label` (substituída por `mark-labels-printed`)

**NÃO remover ainda:**
- Tabela `marketplace_orders_presented_new` (manter como backup por 30 dias)
- Tabela `marketplace_orders_raw` (é arquivo histórico permanente)

---

## 6. Testes de Integração da Edge Function

```typescript
// supabase/functions/link-order-product/__tests__/integration.test.ts
// Requer banco local e pedido com itens não vinculados seed

Deno.test("link-order-product: retorna remainingUnlinkedCount=0 ao vincular todos", async () => {
  // Seed: pedido com 1 item não vinculado em orders/order_items
  // POST com link permanente para o item
  // Assert: resposta.remainingUnlinkedCount = 0
  // Assert: orders.status mudou para algo diferente de 'a_vincular'
  // Assert: marketplace_item_product_links tem o novo vínculo
});
```

---

## 7. Definition of Done

- [ ] `orders-queue-worker` atualizado para chamar `calculateAndPersistStatus` após cada upsert bem-sucedido
- [ ] Se `calculateAndPersistStatus` falhar, o erro é logado mas não propaga (pedido salvo é mais importante)
- [ ] Nova edge function `link-order-product` criada e deployada
- [ ] Nova edge function `mark-labels-printed` criada e deployada
- [ ] Ambas as novas edge functions têm tratamento de erro com status HTTP corretos (400, 500)
- [ ] `buildStatusUseCases()` é instanciado uma vez por invocação (fora do loop)
- [ ] Teste de integração para `link-order-product` com banco local
- [ ] Verificação manual: criar um pedido de teste, receber webhook, confirmar que `orders.status` é calculado corretamente
- [ ] Nenhuma edge function excede 80 linhas no handler principal
- [ ] Plano de remoção do legado documentado no commit description
