# STATUS-ENGINE-T8 — Migration: Coluna `status` e Campos de Sinais na Tabela `orders`

**Ciclo:** Motor de Status de Pedidos
**Status:** 🔴 Não iniciado
**Depende de:** C0-T1 (tabela `orders` existe)
**Bloqueia:** T4 (adapters leem/escrevem estes campos), T9, T10

---

## 1. Visão Geral (para não-técnicos)

A tabela `orders` foi criada no Cycle 0, mas ela ainda não tem todos os campos necessários para que o novo motor de status funcione. Esta task adiciona as colunas que faltam.

Pense nisso como adicionar gavetas novas em um arquivo que já existe. As gavetas antigas continuam intactas, os documentos já arquivados continuam no lugar — apenas novas gavetas são adicionadas.

**Regra de ouro:** NUNCA editar um arquivo de migração que já foi executado. Sempre criar um NOVO arquivo de migração.

---

## 2. O que Precisa Ser Adicionado

### 2.1 Campos de sinais do marketplace na tabela `orders`

O `SupabaseOrderRepository.findById()` precisa ler estes campos para construir o `MarketplaceSignals`:

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `shipment_status` | `text` | `null` | Status do envio (ex: 'ready_to_ship', 'shipped') |
| `shipment_substatus` | `text` | `null` | Substatus do envio (ex: 'invoice_pending', 'ready_to_print') |
| `is_fulfillment` | `boolean` | `false` | Pedido gerenciado pelo marketplace (ML Full, Shopee Full) |
| `is_cancelled` | `boolean` | `false` | Pedido cancelado |
| `is_refunded` | `boolean` | `false` | Pagamento reembolsado |
| `is_returned` | `boolean` | `false` | Pedido devolvido pelo comprador |
| `is_printed_label` | `boolean` | `false` | Etiqueta de envio marcada como impressa pelo vendedor |
| `label_printed_at` | `timestamptz` | `null` | Quando a etiqueta foi marcada como impressa |
| `has_invoice` | `boolean` | `false` | NF-e já foi emitida |
| `is_pickup_done` | `boolean` | `false` | Pickup concluído (específico Shopee) |

### 2.2 Coluna de status calculado

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `status` | `text` | `null` | Status interno calculado pelo OrderStatusEngine |
| `status_updated_at` | `timestamptz` | `null` | Quando o status foi calculado pela última vez |

**Nota:** `status` usa `text` (não `enum` SQL) para flexibilidade. Os valores possíveis são os do `OrderStatus` enum em TypeScript. Usar `text` permite adicionar novos status sem alterar o schema.

---

## 3. Arquivo de Migração a Criar

**Caminho:** `supabase/migrations/20260401_000000_add_status_and_signals_to_orders.sql`

**Por que esta data:** Use a data atual de implementação (depois de 2026-03-30). Ajuste o timestamp conforme necessário.

```sql
-- Migration: Adiciona status calculado e campos de sinais do marketplace à tabela orders
-- Necessário para o OrderStatusEngine (STATUS-ENGINE-T4)

BEGIN;

-- Campos de sinais do marketplace (entrada do engine)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipment_status        text,
  ADD COLUMN IF NOT EXISTS shipment_substatus     text,
  ADD COLUMN IF NOT EXISTS is_fulfillment         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cancelled           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_refunded            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_returned            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_printed_label       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_printed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS has_invoice            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pickup_done         boolean NOT NULL DEFAULT false;

-- Status calculado (saída do engine)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS status                 text,
  ADD COLUMN IF NOT EXISTS status_updated_at      timestamptz;

-- Índice para queries do frontend (filtrar por status da organização)
CREATE INDEX IF NOT EXISTS idx_orders_organization_status
  ON orders (organization_id, status)
  WHERE status IS NOT NULL;

-- Índice para histórico de pedidos cancelados
CREATE INDEX IF NOT EXISTS idx_orders_cancelled
  ON orders (organization_id, is_cancelled)
  WHERE is_cancelled = true;

COMMIT;
```

**Tamanho esperado:** ~35 linhas de SQL

---

## 4. Atualização dos Normalizers (orders-normalize)

Os normalizers (`MlOrderNormalizeService` e `ShopeeOrderNormalizeService`) precisam preencher os novos campos ao criar o `NormalizedOrder`.

### Campos a adicionar ao tipo `NormalizedOrder`

```typescript
// Em supabase/functions/_shared/orders-normalize/normalized-order.types.ts
export interface NormalizedOrder {
  // ... campos existentes ...

  // Campos de sinais do marketplace (novos)
  shipmentStatus?: string;
  shipmentSubstatus?: string;
  isFulfillment: boolean;
  isCancelled: boolean;
  isRefunded: boolean;
  isReturned: boolean;
  hasInvoice: boolean;
  isPickupDone?: boolean;
}
```

### Campos a adicionar ao `OrdersUpsertAdapter`

O adapter de upsert (C0-T2/T3) precisa incluir os novos campos no INSERT/UPDATE:

```typescript
// Em orders-upsert-adapter.ts, no upsert da tabela orders:
{
  // ... campos existentes ...
  shipment_status: order.shipmentStatus ?? null,
  shipment_substatus: order.shipmentSubstatus ?? null,
  is_fulfillment: order.isFulfillment ?? false,
  is_cancelled: order.isCancelled ?? false,
  is_refunded: order.isRefunded ?? false,
  is_returned: order.isReturned ?? false,
  has_invoice: order.hasInvoice ?? false,
  is_pickup_done: order.isPickupDone ?? false,
  // NOTA: is_printed_label e label_printed_at são setados apenas por MarkOrderLabelPrintedUseCase
  // NÃO incluir no upsert do normalizer — o normalizer não sabe se o vendedor já imprimiu
}
```

---

## 5. Verificação Pós-Migração

Execute as seguintes queries no Supabase SQL Editor para verificar:

```sql
-- Verificar que as colunas foram adicionadas
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN (
    'status', 'status_updated_at', 'shipment_status', 'shipment_substatus',
    'is_fulfillment', 'is_cancelled', 'is_refunded', 'is_returned',
    'is_printed_label', 'label_printed_at', 'has_invoice', 'is_pickup_done'
  )
ORDER BY column_name;

-- Verificar que os índices foram criados
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders'
  AND indexname LIKE 'idx_orders_%';

-- Verificar que registros existentes não foram afetados
SELECT COUNT(*) as total_orders, COUNT(status) as with_status FROM orders;
-- Esperado: total_orders > 0, with_status = 0 (status ainda não calculado)
```

---

## 6. Backfill (Opcional)

Após a migração e após o `orders-queue-worker` (T9) estar rodando com o novo engine, os pedidos existentes terão `status = null`. O frontend (T10) deve tratar `null` como `'pendente'` enquanto o backfill não ocorre.

Para forçar um backfill, pode-se criar um job manual que:
1. Seleciona todos os pedidos com `status IS NULL`
2. Para cada um, chama `RecalculateOrderStatusUseCase` — mas isso requer que os campos de sinais também estejam preenchidos

**Recomendação:** NÃO fazer backfill automático agora. Deixar o backfill acontecer naturalmente — cada pedido terá seu status calculado na próxima vez que receber um webhook. Pedidos antigos sem atividade continuarão com `status = null`.

---

## 7. Definition of Done

- [ ] Migration file criado em `supabase/migrations/` com timestamp após 2026-03-30
- [ ] Migration adiciona todos os 12 campos listados (10 sinais + 2 status)
- [ ] Migration usa `ADD COLUMN IF NOT EXISTS` (idempotente)
- [ ] Migration está dentro de `BEGIN; ... COMMIT;`
- [ ] Índice `idx_orders_organization_status` criado
- [ ] `NormalizedOrder` atualizado com os novos campos
- [ ] `MlOrderNormalizeService` atualizado para preencher os novos campos
- [ ] `ShopeeOrderNormalizeService` atualizado para preencher os novos campos
- [ ] `OrdersUpsertAdapter` atualizado para incluir os novos campos no upsert
- [ ] Query de verificação pós-migração executada e resultado documentado
- [ ] Migration NÃO remove nem altera nenhuma coluna existente
- [ ] Migration NÃO usa `DROP`, `TRUNCATE`, ou `DELETE`
