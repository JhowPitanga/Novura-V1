# PRD — Módulo de Desempenho (Performance)

> Versão: 2.1 · Data: 05/05/2026 · Status: Módulo Desempenho implementado (Visão Geral, Por Produto, Financeiro)

---

## 1. Contexto e estado atual

A página vive em `src/pages/Performance.tsx` com `CleanNavigation` (tabs **Visão Geral**, **Por Produto**, **Financeiro**).

### Hooks e serviços existentes


| Arquivo                               | Responsabilidade                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/hooks/usePerformance.ts`         | Orquestra todos os hooks de performance (métricas, ranking, estados, ABC, breakdown, listings vendidos) |
| `src/hooks/useOrdersMetrics.ts`       | Agrega `orders` + `order_items` em totais e séries temporais                                            |
| `src/hooks/useListingsRanking.ts`     | Top anúncios por `marketplace_item_id`                                                                  |
| `src/hooks/usePerformanceFilters.ts`  | Estado compartilhado (date/marketplace/search) persistido em `sessionStorage` para a tab Por Produto    |
| `src/services/performance.service.ts` | Wrappers de todas as RPCs + tipos TypeScript exportados                                                 |
| `src/utils/abc.ts`                    | Cálculo ABC Pareto client-side (fallback se RPC indisponível)                                           |


### Fontes de dados


| Tabela                             | Colunas-chave                                                                                                | Uso                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `orders`                           | `marketplace`, `gross_amount`, `net_amount`, `marketplace_fee`, `shipping_cost`, `buyer_state`, `created_at` | Base de todas as métricas          |
| `order_items`                      | `product_id`, `marketplace_item_id`, `quantity`, `unit_price`, `unit_cost`, `sku`, `title`, `image_url`      | Métricas de unidades, ABC, ranking |
| `order_shipping`                   | `state_uf`, `city`                                                                                           | Mapa e ranking por UF              |
| `marketplace_orders_presented_new` | `payment_marketplace_fee`, `payment_shipping_cost`, `items_total_sale_fee`, `shipping_state_uf`              | Tab Financeiro (fase futura)       |
| `marketplace_item_product_links`   | —                                                                                                            | Vínculo anúncio ↔ produto          |
| `products`                         | `id`, `name`                                                                                                 | Nome do produto nas agregações     |


---

## 2. Arquitetura

```
Browser
  └── Performance.tsx
        ├── VisaoGeral
        │     ├── OverviewFilterBar     (date + marketplace)
        │     ├── MetricCardsGrid       (vendas, unidades, pedidos, ticket, margem)
        │     ├── SalesChart            (linha multi-métrica)
        │     ├── SalesSourceSection    (pizza por marketplace)
        │     ├── StatesRankingTable    ← NOVO (mapa tile + ranking UF)
        │     ├── AbcCurveSection       ← NOVO (ABC produtos + toggle critério)
        │     └── ListingsRankingTable
        ├── PorProduto                  ← NOVO (refatorado)
        │     ├── ProductPerformanceFilterBar (date + marketplace + busca)
        │     ├── [sub-tab] ProductsSubTab    (tabela ABC + mix canal + drawer)
        │     └── [sub-tab] AnunciosSubTab    (tabela anúncios vendidos + ABC)
        └── Financeiro                  ← IMPLEMENTADO (cards, composição e canais)

RPC Layer (Supabase Postgres)
  ├── fn_perf_sales_by_state       (M2)
  ├── fn_perf_abc_products         (M3)
  ├── fn_perf_abc_listings         (M3)
  ├── fn_perf_product_breakdown    (M4)
  ├── fn_perf_listings_sold        (M5)
  └── fn_perf_financial_costs      (M6 — disponível, fallback por tabela ativo)
```

**Princípios**

1. **RPCs SQL** `SECURITY INVOKER` — RLS das tabelas base sempre aplicada; p_org_id é filtro de índice, não contorno de segurança.
2. **Cache TanStack Query** — `staleTime: 2 min` para estados/listings, `5 min` para ABC/breakdown.
3. **Filtros centralizados** — `usePerformanceFilters` persiste `marketplace` + `searchTerm` em `sessionStorage` entre navegações.

---

## 3. Tabs e layout

```
┌─ CleanNavigation ─────────────────────────────────────────┐
│  [Visão Geral]  [Por Produto]  [Financeiro]               │
└───────────────────────────────────────────────────────────┘

VISÃO GERAL
[OverviewFilterBar: Calendário 7d/30d/custom | Marketplace ▾]
[Cards: Vendas | Unidades | Pedidos | Ticket | Margem Est.]
[SalesChart — trajetória multi-métrica]
[SalesSourceSection — pizza por marketplace]
[StatesRankingTable — tile map BR + ranking UF]
[AbcCurveSection — TOP produtos com tags A/B/C + toggle R$/Unidades]
[ListingsRankingTable — top anúncios]

POR PRODUTO
[FilterBar: Calendário | Marketplace ▾ | 🔍 Buscar produto/SKU]
[Sub-tabs: Produtos | Anúncios]
  Produtos: tabela com tag ABC, mix canal (stacked bar), vínculos → LinkedAdsDrawer
  Anúncios: tabela de anúncios vendidos com tag ABC e margem %

FINANCEIRO
[Cards de Resumo: Gasto total | Comissão | Frete | Custo de produto | Receita líquida]
[Composição do gasto: barra + breakdown percentual]
[Financeiro canais de venda: tabela por marketplace com imposto, frete, comissão e produto]
```

---

## 4. Curva ABC — regra e UI

**Pareto 80/15/5**

1. Ordena descendentemente pelo critério (R$ ou unidades).
2. Calcula porcentagem acumulada item a item.
3. Antes de somar o item atual, verifica o patamar:
  - `cum_pct antes < 80%` → tag **A**
  - `cum_pct antes < 95%` → tag **B**
  - `cum_pct antes ≥ 95%` → tag **C**

**Cores**


| Tag | Tailwind classes                                     |
| --- | ---------------------------------------------------- |
| A   | `bg-emerald-100 text-emerald-700 border-emerald-200` |
| B   | `bg-amber-100 text-amber-700 border-amber-200`       |
| C   | `bg-rose-100 text-rose-700 border-rose-200`          |


---

## 5. Segurança e RLS

Todas as RPCs são `SECURITY INVOKER SET search_path = public`. Cada query filtra por `p_org_id` (que coincide com o `organization_id` do usuário autenticado, verificado pela RLS da tabela `orders`). Parâmetro `p_marketplace = NULL` ou `'todos'` desabilita o filtro de canal.

---

## Apêndice A — Assinaturas SQL completas das RPCs

### M2 — `fn_perf_sales_by_state`

```sql
FUNCTION public.fn_perf_sales_by_state(
  p_org_id    uuid,
  p_from      timestamptz,
  p_to        timestamptz,
  p_marketplace text DEFAULT NULL
) RETURNS TABLE (
  uf text, state_name text,
  pedidos bigint, unidades bigint,
  total numeric, ticket_medio numeric, pct_total numeric
)
```

Fonte primária: `order_shipping.state_uf`; fallback: `orders.buyer_state`.

### M3 — `fn_perf_abc_products`

```sql
FUNCTION public.fn_perf_abc_products(
  p_org_id uuid, p_from timestamptz, p_to timestamptz,
  p_marketplace text DEFAULT NULL,
  p_criterion text DEFAULT 'valor'   -- 'valor' | 'unidades'
) RETURNS TABLE (
  id uuid, nome text, valor numeric, unidades bigint,
  pct numeric, cum_pct numeric, tag char(1)
)
```

### M3 — `fn_perf_abc_listings`

```sql
FUNCTION public.fn_perf_abc_listings(
  p_org_id uuid, p_from timestamptz, p_to timestamptz,
  p_marketplace text DEFAULT NULL,
  p_criterion text DEFAULT 'valor'
) RETURNS TABLE (
  id text, titulo text, marketplace text,
  valor numeric, unidades bigint,
  pct numeric, cum_pct numeric, tag char(1)
)
```

### M4 — `fn_perf_product_sales_breakdown`

```sql
FUNCTION public.fn_perf_product_sales_breakdown(
  p_org_id uuid, p_from timestamptz, p_to timestamptz,
  p_marketplace text DEFAULT NULL
) RETURNS TABLE (
  product_id uuid, marketplace text,
  valor numeric, unidades bigint, pct_within_product numeric
)
```

### M5 — `fn_perf_listings_sold`

```sql
FUNCTION public.fn_perf_listings_sold(
  p_org_id uuid, p_from timestamptz, p_to timestamptz,
  p_marketplace text DEFAULT NULL
) RETURNS TABLE (
  id text, titulo text, marketplace text, image_url text,
  pedidos bigint, unidades bigint, valor numeric, margin_pct numeric
)
```

Somente anúncios com `unidades > 0`. `margin_pct` é `NULL` quando `unit_cost` não cadastrado.

### M6 — `fn_perf_financial_costs` (preparatória — Fase 4)

```sql
FUNCTION public.fn_perf_financial_costs(
  p_org_id uuid, p_from timestamptz, p_to timestamptz,
  p_marketplace text DEFAULT NULL
) RETURNS TABLE (
  marketplace text, item_id text, item_title text,
  total_revenue numeric, marketplace_fee numeric,
  shipping_cost numeric, sale_fee numeric,
  total_cost numeric, pct_revenue numeric
)
```

Fonte: `marketplace_orders_presented_new`.

### M7 — `performance_daily_snapshots` (Fase 5, opt-in)

```sql
CREATE TABLE performance_daily_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day             date NOT NULL,
  marketplace     text NOT NULL,
  pedidos         int  NOT NULL DEFAULT 0,
  unidades        int  NOT NULL DEFAULT 0,
  vendas          numeric(18,2) NOT NULL DEFAULT 0,
  comissao        numeric(18,2),
  frete           numeric(18,2),
  state_uf        text,
  UNIQUE (organization_id, day, marketplace, state_uf)
);
```

---

## Apêndice B — Contratos TypeScript

```typescript
// src/services/performance.service.ts

export interface StateSale {
    uf: string; state_name: string;
    pedidos: number; unidades: number;
    total: number; ticket_medio: number; pct_total: number;
}

export type AbcTag = 'A' | 'B' | 'C';
export type AbcCriterion = 'valor' | 'unidades';

export interface AbcProductRow {
    id: string; nome: string;
    valor: number; unidades: number;
    pct: number; cum_pct: number; tag: AbcTag;
    margin_pct?: number | null;
    margin_brl?: number | null;
}

export interface AbcListingRow {
    id: string; titulo: string; marketplace: string;
    valor: number; unidades: number;
    pct: number; cum_pct: number; tag: AbcTag;
}

export interface ProductChannelMix {
    product_id: string; marketplace: string;
    valor: number; unidades: number; pct_within_product: number;
}

export interface SoldListing {
    id: string; titulo: string; sku: string; marketplace: string; image_url: string;
    pedidos: number; unidades: number; valor: number;
    margin_pct: number | null;
    margin_brl: number | null;
    pct: number; cum_pct: number; tag: AbcTag;
}

// src/hooks/usePerformance.ts (new hooks)
useSalesByState(dateRange, marketplace, orgId)      // → StateSale[]
useAbcProducts(dateRange, marketplace, orgId, criterion)  // → AbcProductRow[]
useAbcListings(dateRange, marketplace, orgId, criterion)  // → AbcListingRow[]
useProductSalesBreakdown(dateRange, marketplace, orgId)   // → ProductChannelMix[]
useListingsSold(dateRange, marketplace, orgId)           // → SoldListing[]

// src/utils/abc.ts
computeAbc(items: AbcInput[], criterion): AbcResult[]
abcTagClasses(tag: AbcTag): string   // returns Tailwind class string
filterAbcByTag(items, tags): AbcResult[]
```

---

## Apêndice C — Paleta e tokens UI


| Uso                           | Valor                            |
| ----------------------------- | -------------------------------- |
| Primary (Novura)              | `#7C3AED` — `violet-700`         |
| Secondary                     | `#A855F7` — `violet-500`         |
| Accent                        | `#C084FC` — `violet-400`         |
| ABC Tag A                     | `emerald-100 / emerald-700`      |
| ABC Tag B                     | `amber-100 / amber-700`          |
| ABC Tag C                     | `rose-100 / rose-700`            |
| Mapa estado — sem dado        | `#F3F0FF`                        |
| Mapa estado — max intensidade | `rgb(109,40,217)` — `violet-700` |
| Mapa estado — hover borda     | `#7C3AED`                        |
| Shopee                        | `#EE4D2D`                        |
| Mercado Livre                 | `#FFE600`                        |
| Amazon                        | `#FF9900`                        |


Espaçamentos: `gap-4` (cards), `gap-6` (seções). Cards com `rounded-xl`. Tabelas com `hover:bg-violet-50/40`.

---

## Apêndice D — Glossário


| Termo               | Definição                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Curva ABC**       | Classificação de itens pelo método Pareto: os 20% de produtos que representam ~80% do faturamento são A; os seguintes 15% são B; o restante é C. |
| **Pareto 80/15/5**  | Variação do princípio de Pareto onde o corte é 80%-95%-100% do acumulado.                                                                        |
| **Mix por canal**   | Distribuição percentual do faturamento de um produto por marketplace. Soma 100% dentro do produto.                                               |
| **Ticket médio**    | Faturamento total dividido pelo número de pedidos (`total / pedidos`).                                                                           |
| **Margem estimada** | `(receita - custo) / receita × 100`. Disponível apenas quando `order_items.unit_cost` está cadastrado.                                           |
| **Anúncio**         | Listagem no marketplace identificada por `marketplace_item_id`. Diferentes anúncios podem ser vinculados a um mesmo produto interno.             |
| **Curva acumulada** | Soma das porcentagens individuais dos itens, em ordem decrescente, até o item atual inclusive. Usada para determinar o corte A/B/C.              |
| **UF**              | Unidade Federativa — sigla do estado brasileiro (ex.: SP, RJ, MG). Fonte primária: `order_shipping.state_uf`; fallback: `orders.buyer_state`.    |


---

## Faseamento e DoD


| Fase                                  | Status        | Entregas                                                                                                                                |
| ------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Estados + ABC                     | ✅ Concluído   | Migrações M2–M5, hooks `useSalesByState`/`useAbc`*, componentes `BrazilSalesMap`, `StatesRankingTable`, `AbcBadge`, `AbcCurveSection`   |
| 2 — Por Produto refatorado            | ✅ Concluído   | `produto/` com `ProductPerformanceFilterBar`, sub-tabs Produtos/Anúncios, `ProductChannelMixCell`, `LinkedAdsDrawer`, paginação e busca |
| 3 — Visão Geral polida                | ✅ Concluído   | Cards e gráficos com filtros padrão e identidade visual unificada                                                                       |
| 4 — Financeiro implementado           | ✅ Concluído   | `FinanceiroOverviewCards`, composição de gasto, tabela por canal, cálculo de imposto por `companies.imposto_pago`                       |
| 5 — Margem completa (produto/anúncio) | ✅ Concluído   | Coluna `Margem` em Produtos e Anúncios com valor (R$) e percentual (%)                                                                  |
| 6 — Snapshots agregados               | ⏳ Sob demanda | Migração M7 + `pg_cron` (ativar quando volume > 50k pedidos/mês)                                                                        |


---

## 6. Atualização técnica (05/05/2026)

### 6.1 Estado funcional atual

- **Visão Geral**: filtros padronizados, cards de métrica, gráfico de vendas, origem por canal, mapa/ranking por UF e sessão ABC.
- **Por Produto**: alternância Produtos/Anúncios, filtro ABC por cards A/B/C, critério R$ ou unidades, paginação (10 por página), busca por nome/SKU/ID.
- **Financeiro**: cards com crescimento, composição de gasto e tabela "Financeiro canais de venda" por marketplace.

### 6.2 Regra oficial de margem (implementada)

Margem é exibida **somente quando há vínculo com produto interno e custo de produto disponível** (`order_items.unit_cost`).

Fórmula base por item:

```text
margem_brl = receita_item - custo_item - comissao_proporcional - frete_proporcional - imposto_item
margem_pct = (margem_brl / receita_item) * 100
```

Onde:

- `receita_item = quantity * unit_price`
- `custo_item = quantity * unit_cost`
- `comissao_proporcional` e `frete_proporcional` são rateados pelo peso do item no pedido:
  - `ratio = receita_item / receita_total_do_pedido`
  - `comissao_item = orders.marketplace_fee * ratio`
  - `frete_item = orders.shipping_cost * ratio`
- `imposto_item = receita_item * (taxa_imposto_marketplace / 100)`
- `taxa_imposto_marketplace` vem de `companies.imposto_pago` via `marketplace_integrations.company_id`

### 6.3 Regra oficial do Financeiro (implementada)

- **Comissão**: usa estritamente `orders.marketplace_fee`
- **Frete**: usa estritamente `orders.shipping_cost`
- **Custo de produtos**: soma `order_items.quantity * order_items.unit_cost`
- **Imposto**: calcula por marketplace usando `companies.imposto_pago`
- **Gasto total**:

```text
total_spent = marketplace_fee + shipping_cost + tax_amount + product_cost
```

- **Receita líquida (consistente com os custos exibidos)**:

```text
net_revenue = gross_amount - (marketplace_fee + shipping_cost + tax_amount + product_cost)
```

### 6.4 Contratos TS atualizados

```typescript
export interface AbcProductRow {
  id: string;
  nome: string;
  valor: number;
  unidades: number;
  pct: number;
  cum_pct: number;
  tag: AbcTag;
  margin_pct?: number | null;
  margin_brl?: number | null;
}

export interface SoldListing {
  id: string;
  titulo: string;
  sku: string;
  marketplace: string;
  image_url: string;
  pedidos: number;
  unidades: number;
  valor: number;
  margin_pct: number | null;
  margin_brl: number | null;
  pct: number;
  cum_pct: number;
  tag: AbcTag;
}
```

### 6.5 Componentes-chave em produção

- `src/components/performance/AbcCurveSection.tsx`
- `src/components/performance/produto/PorProduto.tsx`
- `src/components/performance/produto/ProductsSubTab.tsx`
- `src/components/performance/produto/AnunciosSubTab.tsx`
- `src/components/performance/financeiro/FinanceiroOverviewCards.tsx`
- `src/components/performance/MarketplaceFilterSelect.tsx`
- `src/services/performance.service.ts`
- `src/hooks/usePerformance.ts`
- `src/hooks/usePerformanceFilters.ts`

### 6.6 Migrações relacionadas ao módulo

- `supabase/migrations/20260504_000001_fn_perf_sales_by_state.sql`
- `supabase/migrations/20260504_000002_fn_perf_abc_curves.sql`
- `supabase/migrations/20260504_000003_fn_perf_product_breakdown.sql`
- `supabase/migrations/20260504_000004_fn_perf_listings_sold.sql`
- `supabase/migrations/20260504_000005_fn_perf_financial_costs.sql`

### 6.7 Observações de rollout

- O service mantém caminho de RPC preparado, com fallback por tabela para evitar quebra enquanto funções não estão disponíveis em todos os ambientes.
- A UI de margem usa `—` quando o dado não é calculável (sem vínculo interno ou sem `unit_cost`).

