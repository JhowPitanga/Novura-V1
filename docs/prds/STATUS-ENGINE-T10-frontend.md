# STATUS-ENGINE-T10 — Frontend: Hooks, Componentes e LinkOrderModal

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** T8 (coluna `orders.status` existe), T9 (status sendo calculado no banco)
**Bloqueia:** Nada — é a última task do ciclo

---

## 1. Visão Geral (para não-técnicos)

Esta task migra o frontend para ler os dados das novas tabelas. O vendedor não vê nada diferente na tela — os mesmos pedidos, os mesmos status, os mesmos botões. O que muda é de onde o código busca os dados.

Também atualiza o modal de vinculação ("A vincular") para usar a nova endpoint `link-order-product` ao invés de chamar a edge function legada. E remove o `LinkOrderModal` de chamar Supabase diretamente — todas as chamadas passam pelo service layer.

**Pré-condição obrigatória:** Antes de começar, verificar que `orders.status` está sendo preenchido. Execute no Supabase:
```sql
SELECT COUNT(*) FROM orders WHERE status IS NOT NULL;
```
Deve retornar mais que zero. Se retornar zero, T9 não foi deployado ainda — NÃO iniciar T10.

---

## 2. Mudanças no Service Layer

### 2.1 `src/services/orders.service.ts` — substituição da query principal

**O que muda:** A função `fetchAllOrders()` atualmente busca de `marketplace_orders_presented_new`. Mudar para buscar de `orders` com join em `order_items` e `order_shipping`.

**O que NÃO muda:** A assinatura da função e o tipo de retorno (`OrderRow[]`) devem permanecer compatíveis. O mapeamento interno muda, mas os componentes não percebem.

```typescript
// ANTES (legado):
export async function fetchAllOrders(orgId: string): Promise<OrderRow[]> {
  const { data } = await supabase
    .from('marketplace_orders_presented_new')
    .select(`...87 colunas...`)
    .eq('organizations_id', orgId);
  return (data ?? []).map(parseOrderRow);
}

// DEPOIS (novo):
export async function fetchAllOrders(orgId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      organization_id,
      marketplace,
      marketplace_order_id,
      status,
      marketplace_status,
      net_amount,
      buyer_name,
      buyer_state,
      created_at,
      shipped_at,
      canceled_at,
      is_printed_label,
      label_printed_at,
      has_invoice,
      is_fulfillment,
      order_items (
        id, sku, marketplace_item_id, variation_id, seller_sku,
        quantity, unit_price, unit_cost, product_id
      ),
      order_shipping (
        status, substatus, tracking_number, carrier,
        expected_delivery_date, recipient_name, recipient_state
      )
    `)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`fetchAllOrders failed: ${error.message}`);
  return (data ?? []).map(parseNewOrderRow);
}
```

### 2.2 Função `parseNewOrderRow()`

Esta função substitui o `parseOrderRow` legado. Mapeia os campos da nova estrutura para o tipo `OrderRow` que os componentes conhecem.

**Atenção:** O tipo `OrderRow` pode precisar ser atualizado em `src/types/orders.ts` para incluir campos que existiam no antigo mas agora ficam em tabelas separadas.

**Campos críticos a mapear:**
- `status` — vem de `orders.status` (calculado pelo engine)
- `marketplace` — vem de `orders.marketplace`
- `items` — vem de `order_items[]` (join)
- `shipping` — vem de `order_shipping` (join)
- `label` — campos de etiqueta agora estão em `order_labels` (nova tabela) OU em `orders.is_printed_label`

```typescript
function parseNewOrderRow(row: any): OrderRow {
  const shipping = row.order_shipping;
  const items = row.order_items ?? [];

  return {
    id: row.id,
    organizationId: row.organization_id,
    marketplace: row.marketplace,
    marketplaceOrderId: row.marketplace_order_id,

    // Status calculado pelo engine — o campo central desta refatoração
    // Fallback para 'pendente' se ainda não calculado (pedidos antigos sem status)
    statusInterno: row.status ?? 'pendente',

    netAmount: row.net_amount,
    buyerName: row.buyer_name,
    buyerState: row.buyer_state,
    createdAt: row.created_at,
    shippedAt: row.shipped_at,
    canceledAt: row.canceled_at,

    hasPrintedLabel: row.is_printed_label ?? false,
    labelPrintedAt: row.label_printed_at,
    hasInvoice: row.has_invoice ?? false,
    isFulfillment: row.is_fulfillment ?? false,

    items: items.map((item: any) => ({
      id: item.id,
      sku: item.sku,
      marketplaceItemId: item.marketplace_item_id,
      variationId: item.variation_id,
      sellerSku: item.seller_sku,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      unitCost: item.unit_cost,
      productId: item.product_id,
    })),

    shipping: shipping ? {
      status: shipping.status,
      substatus: shipping.substatus,
      trackingNumber: shipping.tracking_number,
      carrier: shipping.carrier,
      expectedDeliveryDate: shipping.expected_delivery_date,
      recipientName: shipping.recipient_name,
      recipientState: shipping.recipient_state,
    } : null,

    // has_unlinked_items — calculado localmente a partir dos items
    hasUnlinkedItems: items.some((item: any) => !item.product_id && !item.seller_sku),
  };
}
```

**Tamanho esperado:** ~60 linhas

### 2.3 Atualizar `markOrdersPrinted()`

```typescript
// ANTES — chamava RPC SQL diretamente:
export async function markOrdersPrinted(orderIds: string[]): Promise<void> {
  await supabase.rpc("rpc_marketplace_order_print_label", { p_order_ids: orderIds });
}

// DEPOIS — chama a nova edge function:
export async function markOrdersPrinted(
  orderIds: string[],
  organizationId: string
): Promise<void> {
  const { error } = await supabase.functions.invoke('mark-labels-printed', {
    body: { orderIds, organizationId },
  });
  if (error) throw new Error(`markOrdersPrinted failed: ${error.message}`);
}
```

### 2.4 Novo método `linkProductToOrderItems()`

```typescript
export async function linkProductToOrderItems(params: {
  orderId: string;
  organizationId: string;
  marketplace: string;
  links: Array<{
    orderItemId: string;
    marketplaceItemId: string;
    variationId: string;
    productId: string;
    isPermanent: boolean;
  }>;
}): Promise<{ remainingUnlinkedCount: number; statusChanged: boolean; newStatus?: string }> {
  const { data, error } = await supabase.functions.invoke('link-order-product', {
    body: params,
  });
  if (error) throw new Error(`linkProductToOrderItems failed: ${error.message}`);
  return data;
}
```

---

## 3. Atualizar `useOrderFiltering.ts`

O hook de filtragem usa `normStatus()` para normalizar strings de status. Com o novo enum, os valores são mais consistentes, mas o `normStatus()` deve continuar funcionando para compatibilidade durante a transição.

**O que muda:** Os valores vindos do banco agora são os valores do enum (`'cancelado'`, `'a_vincular'`, etc.) em vez das strings legadas (`'Cancelado'`, `'A vincular'`). Atualizar `normStatus()` para lidar com ambos os formatos.

```typescript
// Em useOrderFiltering.ts
function normStatus(v: string): string {
  return v.toLowerCase()
    .replace(/\s+/g, '_')     // 'a vincular' → 'a_vincular'
    .replace(/ã/g, 'a')       // 'emissão' → 'emissao'
    .replace(/ç/g, 'c')       // normaliza cedilha
    .replace(/[áà]/g, 'a')
    .replace(/[éê]/g, 'e')
    .replace(/[íi]/g, 'i')
    .replace(/[óô]/g, 'o')
    .replace(/[úu]/g, 'u');
}
```

---

## 4. Atualizar `LinkOrderModal.tsx`

### O que muda

1. Substituir a chamada direta à edge function `linked_products_item` pela chamada ao service layer `linkProductToOrderItems()`
2. A interface permanece idêntica para o usuário
3. Remover chamada ao `process-presented` após vincular — o `link-order-product` já recalcula o status

### Ponto específico de mudança

No `handleSave` do `LinkOrderModal`, substituir:

```typescript
// ANTES (chamadas diretas):
await supabase.functions.invoke('linked_products_item', { body: { ... } });
await supabase.functions.invoke('mercado-livre-process-presented', { body: { order_id, status_only: true } });

// DEPOIS (via service layer):
import { linkProductToOrderItems } from '../../services/orders.service';

const result = await linkProductToOrderItems({
  orderId: pedido.id,
  organizationId,
  marketplace: pedido.marketplace,
  links: anunciosParaVincular.map(item => ({
    orderItemId: item.orderItemId,
    marketplaceItemId: item.marketplaceItemId,
    variationId: item.variationId,
    productId: selectedProducts[item.marketplaceItemId]?.id,
    isPermanent: permanentLinks[item.marketplaceItemId] ?? false,
  })),
});

if (result.statusChanged) {
  queryClient.invalidateQueries({ queryKey: ['orders'] });
}
```

---

## 5. Atualizações Menores

### `src/utils/orderUtils.ts` — função `getStatusColor()`

O campo `statusInterno` agora pode vir como `'a_vincular'` (com underscore) em vez de `'A vincular'`. A função `normStatus` cuida da normalização, mas verificar que as cores continuam sendo atribuídas corretamente:

```typescript
// Verificar que estes casos ainda funcionam:
case 'a_vincular':
case 'a vincular':
  return 'bg-yellow-500 ...';
```

### `src/hooks/useOrderFiltering.ts` — função `matchStatus()`

Verificar que os filtros por status funcionam com os novos valores:

```typescript
// Antes filtrava por strings legadas:
if (target === 'a-vincular') return s === 'a vincular';

// Depois deve filtrar por ambos (durante transição):
if (target === 'a-vincular') return s === 'a vincular' || s === 'a_vincular';
```

---

## 6. Testes de Frontend

### Testes de snapshot/componente (não regressão visual)

```typescript
// src/components/orders/__tests__/OrderTableRow.test.tsx
import { render, screen } from '@testing-library/react';
import { OrderTableRow } from '../OrderTableRow';

test('exibe badge amarelo para status a_vincular', () => {
  const mockOrder = { ...baseOrder, statusInterno: 'a_vincular' };
  render(<OrderTableRow order={mockOrder} />);
  const badge = screen.getByText('A vincular');
  expect(badge).toHaveClass('bg-yellow-500');
});

test('exibe badge verde para status enviado', () => {
  const mockOrder = { ...baseOrder, statusInterno: 'enviado' };
  render(<OrderTableRow order={mockOrder} />);
  const badge = screen.getByText('Enviado');
  expect(badge).toHaveClass('bg-green-');
});
```

### Testes do service layer

```typescript
// src/services/__tests__/orders.service.test.ts
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

test('fetchAllOrders busca de orders (não de marketplace_orders_presented_new)', async () => {
  let requestedTable = '';
  server.use(
    http.get('*/orders*', ({ request }) => {
      requestedTable = 'orders';
      return HttpResponse.json({ data: [], error: null });
    })
  );
  await fetchAllOrders('org-1');
  expect(requestedTable).toBe('orders');
});
```

---

## 7. Checklist de Verificação Manual

Antes de marcar T10 como Done, verificar manualmente na interface:

- [ ] Abas de status mostram contagem correta (comparar com contagens do banco)
- [ ] Filtro "A vincular" mostra apenas pedidos com `status = 'a_vincular'`
- [ ] Modal de vinculação: ao vincular um produto e salvar, o pedido sai de "A vincular"
- [ ] Aba "Impressão": pedidos aparecem corretamente
- [ ] Botão "Imprimir etiquetas": após clicar, pedidos mudam para "Aguardando Coleta"
- [ ] Aba "Cancelado": pedidos cancelados aparecem
- [ ] Cores dos badges estão corretas para todos os status

---

## 8. Definition of Done

- [ ] `fetchAllOrders()` lê de `orders` (não de `marketplace_orders_presented_new`)
- [ ] `parseNewOrderRow()` mapeia todos os campos necessários (incluindo `hasUnlinkedItems`)
- [ ] `markOrdersPrinted()` chama edge function `mark-labels-printed` (não RPC SQL)
- [ ] `linkProductToOrderItems()` criado em `orders.service.ts`
- [ ] `LinkOrderModal.tsx` usa `linkProductToOrderItems()` no handleSave
- [ ] `LinkOrderModal.tsx` não chama `supabase.functions.invoke` diretamente
- [ ] `normStatus()` normaliza tanto strings legadas quanto novos valores do enum
- [ ] `matchStatus()` funciona com os novos valores durante transição
- [ ] `getStatusColor()` atribui cores corretas para `'a_vincular'` (com underscore)
- [ ] Testes de snapshot para os principais badges de status
- [ ] Checklist de verificação manual completado sem regressões
- [ ] Query `SELECT COUNT(*) FROM orders WHERE status IS NOT NULL` retorna resultado > 0 antes do deploy
- [ ] `SELECT COUNT(*) FROM marketplace_orders_presented_new WHERE status_interno IS NOT NULL` e `SELECT COUNT(*) FROM orders WHERE status IS NOT NULL` têm contagens similares (tolerância de 5%)
