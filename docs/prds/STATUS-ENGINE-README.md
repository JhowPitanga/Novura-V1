# PRD — Motor de Status de Pedidos (Status Engine)

**Ciclo:** Refatoração Estrutural — Motor de Status
**Status:** 🔴 Não iniciado
**Depende de:** C0-T1 (tabelas novas criadas), C0-T9 (frontend migrado)
**Bloqueia:** Futuras integrações de marketplace, Cycle 1 features de margem e diagnóstico

---

## 1. Por que estamos fazendo isso?

### Para não-técnicos

Hoje, toda a lógica de "qual é o status atual de um pedido?" está espalhada em três lugares ao mesmo tempo:

1. **Dentro do banco de dados** — uma função SQL gigante de ~500 linhas que roda automaticamente toda vez que qualquer dado de pedido muda. É como ter o cérebro de um processo dentro de um bloco de concreto: funciona, mas ninguém consegue testá-lo, depurá-lo ou entendê-lo sem muita dor.

2. **Dentro de edge functions TypeScript** — `mercado-livre-process-presented` e `shopee-process-presented` que duplicam a mesma lógica da função SQL, mas em TypeScript, por precaução. Dois lugares para manter a mesma regra de negócio.

3. **Misturado com lógica de banco legado** — a tabela `marketplace_orders_presented_new` (87 colunas) ainda é a fonte de verdade para o frontend, enquanto as novas tabelas `orders` foram criadas mas ainda não têm o status calculado.

**O resultado prático:** quando uma regra de negócio muda (ex: "um pedido com Shopee Full também deve ir direto para Enviado"), é preciso mudar a função SQL E a edge function Shopee. Garantir que as duas mudanças estão sincronizadas é trabalho manual e frágil.

### Para desenvolvedores

Esta refatoração move o cálculo de status de pedidos para uma **camada de domínio testável**, usando **Arquitetura Hexagonal** e **padrões de DDD** (Domain-Driven Design). O banco de dados passa a ser apenas armazenamento — as regras de negócio vivem em TypeScript.

**Benefícios concretos:**
- Cada regra de status é uma classe isolada e testável unitariamente
- Adicionar suporte a um novo marketplace = criar um adapter, não tocar no core
- Zero dependência de triggers SQL para lógica de negócio
- Estoque e outros side effects são tratados como eventos, não triggers
- O frontend lê `orders.status` (campo novo, calculado), não uma view de 87 colunas

---

## 2. Visão Geral da Arquitetura Nova

### Arquitetura Hexagonal (Ports & Adapters)

```
┌─────────────────────────────────────────────────────────────┐
│                     CAMADA DE DOMÍNIO                       │
│  (pura TypeScript, zero dependências externas)              │
│                                                             │
│  OrderStatus (enum)                                         │
│  MarketplaceSignals (value object)                          │
│  ProductLinkState (value object)                            │
│  OrderStatusRule (interface)                                │
│  OrderStatusEngine (Chain of Responsibility)                │
│  OrderDomainEvents (types)                                  │
└────────────────────┬────────────────────────────────────────┘
                     │ usa interfaces (ports)
┌────────────────────▼────────────────────────────────────────┐
│                   CAMADA DE APLICAÇÃO                       │
│  (orquestra, não sabe nada sobre Supabase)                  │
│                                                             │
│  RecalculateOrderStatusUseCase                              │
│  LinkProductToOrderItemUseCase                              │
│  HandleStockSideEffectsUseCase                              │
│  MarkOrderLabelPrintedUseCase                               │
└────────────────────┬────────────────────────────────────────┘
                     │ implementa ports
┌────────────────────▼────────────────────────────────────────┐
│                CAMADA DE INFRAESTRUTURA                     │
│  (adapters concretos para Supabase, APIs)                   │
│                                                             │
│  SupabaseOrderRepository                                    │
│  SupabaseProductLinkRepository                              │
│  SupabaseInventoryAdapter                                   │
│  MlMarketplaceSignalsAdapter                                │
│  ShopeeMarketplaceSignalsAdapter                            │
└─────────────────────────────────────────────────────────────┘
```

### Padrão Chain of Responsibility para Regras de Status

Em vez de um `IF/ELSIF` gigante em SQL, cada status vira uma classe que sabe se ela se aplica:

```typescript
// Cada regra tem dois métodos: appliesTo() e getStatus()
// O engine percorre as regras em ordem de prioridade
// A primeira que aplica ganha

CancelledRule        → prioridade 1
ReturnedRule         → prioridade 2
FulfillmentRule      → prioridade 3
UnlinkedItemsRule    → prioridade 4  ← bloqueante
InvoicePendingRule   → prioridade 5
ReadyToPrintRule     → prioridade 6
AwaitingPickupRule   → prioridade 7
ShippedRule          → prioridade 8
PendingRule          → prioridade 9 (sempre aplica, é o fallback)
```

### Fluxo Novo (como o status é calculado)

```
Webhook chega
    ↓
orders-webhook: enfileira
    ↓
orders-queue-worker:
  1. Busca dados completos do marketplace
  2. Normaliza via MlOrderNormalizeService / ShopeeOrderNormalizeService
  3. Extrai MarketplaceSignals (adapter específico por marketplace)
  4. Consulta ProductLinkState para os itens do pedido
  5. Chama OrderStatusEngine.calculate(signals, linkState)  ← NOVO
  6. Upsert em orders com o status calculado                ← NOVO
  7. Escreve order_status_history                           ← NOVO
  8. Dispara HandleStockSideEffectsUseCase se status mudou  ← NOVO
    ↓
Frontend lê orders.status (não mais marketplace_orders_presented_new.status_interno)
```

---

## 3. Lista de Tasks

| Task | Nome | Descrição Curta | Depende de |
|---|---|---|---|
| [T1](./STATUS-ENGINE-T1-dominio.md) | Camada de Domínio | Entidades, value objects, eventos de domínio | — |
| [T2](./STATUS-ENGINE-T2-portas.md) | Ports (Interfaces) | Contratos hexagonais: repositórios e adapters | T1 |
| [T3](./STATUS-ENGINE-T3-calculadora.md) | OrderStatusEngine | Chain of Responsibility com 9 regras de status | T1 |
| [T4](./STATUS-ENGINE-T4-adaptadores.md) | Infrastructure Adapters | Implementações Supabase dos ports | T2 |
| [T5](./STATUS-ENGINE-T5-caso-uso-vincular.md) | Use Case: Vincular Produto | Substitui `linked_products_item` edge function | T2, T3 |
| [T6](./STATUS-ENGINE-T6-caso-uso-status.md) | Use Case: Recalcular Status | Orquestra recálculo após qualquer mudança | T3, T4 |
| [T7](./STATUS-ENGINE-T7-caso-uso-estoque.md) | Use Case: Side Effects de Estoque | Substitui triggers `trg_presented_new_stock_flow` | T2, T4 |
| [T8](./STATUS-ENGINE-T8-migracao-db.md) | Migration: coluna status | Adiciona `status` calculado na tabela `orders` | — |
| [T9](./STATUS-ENGINE-T9-edge-functions.md) | Wiring Edge Functions | Integra o engine no `orders-queue-worker` | T6, T7 |
| [T10](./STATUS-ENGINE-T10-frontend.md) | Frontend: hooks e componentes | Lê de `orders.status`, atualiza `LinkOrderModal` | T8, T9 |

---

## 4. O que NÃO muda nesta refatoração

- Layout visual da página de pedidos — zero mudança no JSX
- Tabela `marketplace_orders_raw` — continua existindo como arquivo histórico
- URLs da aplicação (`/pedidos`, `/anuncios`)
- Os nomes dos status do ponto de vista do usuário (em pt-BR)
- A tabela `marketplace_item_product_links` — continua como fonte de vínculos permanentes
- Os webhooks do Vercel (`api/mercado-livre-webhook.ts`, `api/shopee-webhook.ts`)

## 5. O que REMOVE desta refatoração (ao concluir T9)

- Trigger `on_marketplace_orders_raw_change_new` → função `process_marketplace_order_presented_new()` (~500 linhas SQL)
- Edge functions `mercado-livre-process-presented` e `shopee-process-presented` (lógica duplicada)
- Trigger `trg_presented_new_stock_flow` (side effects de estoque em SQL)
- Edge function `linked_products_item` (substituída pelo use case T5)

---

## 6. Regras de Arquitetura (obrigatórias para todos os agentes)

1. **A camada de domínio (T1, T3) não pode importar nada de fora do próprio diretório** — zero `import` de Supabase, Deno, ou frameworks externos
2. **Os use cases (T5, T6, T7) só podem depender de interfaces (ports), nunca de implementações concretas**
3. **Toda lógica transacional que não precisa de atomicidade vai no código, não no banco** — a única exceção é o `upsert` com `ON CONFLICT` que garante idempotência
4. **Cada arquivo deve ter no máximo 150 linhas** (ver `docs/ENGINEERING_STANDARDS.md`)
5. **Cada função deve ter no máximo 50 linhas**
6. **Testes unitários obrigatórios** para todo o domínio e use cases (T1–T7)
7. **Testes de integração obrigatórios** para os adapters (T4) e edge functions (T9)

---

## 7. Localização dos Arquivos Novos

Todos os arquivos do engine vivem dentro de `supabase/functions/_shared/`:

```
supabase/functions/_shared/
├── domain/
│   └── orders/
│       ├── OrderStatus.ts               ← T1
│       ├── MarketplaceSignals.ts        ← T1
│       ├── ProductLinkState.ts          ← T1
│       ├── OrderDomainEvents.ts         ← T1
│       ├── OrderStatusRule.ts           ← T1 (interface)
│       └── rules/
│           ├── CancelledRule.ts         ← T3
│           ├── ReturnedRule.ts          ← T3
│           ├── FulfillmentRule.ts       ← T3
│           ├── UnlinkedItemsRule.ts     ← T3
│           ├── InvoicePendingRule.ts    ← T3
│           ├── ReadyToPrintRule.ts      ← T3
│           ├── AwaitingPickupRule.ts    ← T3
│           ├── ShippedRule.ts           ← T3
│           └── PendingRule.ts           ← T3
├── application/
│   └── orders/
│       ├── OrderStatusEngine.ts         ← T3
│       ├── RecalculateOrderStatusUseCase.ts  ← T6
│       ├── LinkProductToOrderItemUseCase.ts  ← T5
│       ├── HandleStockSideEffectsUseCase.ts  ← T7
│       └── MarkOrderLabelPrintedUseCase.ts   ← T6
├── ports/
│   └── orders/
│       ├── IOrderRepository.ts          ← T2
│       ├── IProductLinkRepository.ts    ← T2
│       └── IInventoryPort.ts            ← T2
└── adapters/
    └── orders/
        ├── SupabaseOrderRepository.ts         ← T4
        ├── SupabaseProductLinkRepository.ts   ← T4
        ├── SupabaseInventoryAdapter.ts        ← T4
        ├── MlMarketplaceSignalsAdapter.ts     ← T4
        └── ShopeeMarketplaceSignalsAdapter.ts ← T4
```

E no frontend:

```
src/
├── services/
│   └── orders/
│       └── orders.service.ts   ← atualizado em T10
└── hooks/
    └── useOrders.ts            ← atualizado em T10
```
