# PRD — Módulo de Anúncios (Banco de Dados)

> **Versão:** 1.3 · **Data:** 21/05/2026 · **Status:** ✅ MVP concluído — edge functions deployadas, backfill executado, frontend em canônico + UX listagem refinada
> **Escopo:** modelagem de dados, adaptadores, **"Sincronizar este anúncio"** e melhorias de UX da listagem em `/anuncios`.
> **Fora de escopo:** fluxos de criação/edição detalhados (já cobertos por `PRD-MODULO-CRIACAO-EDICAO-ANUNCIOS.md`).
> **Idioma da aplicação:** pt-BR.

**Convenção de canais:** neste documento, os marketplaces são referenciados pelo nome completo — **Mercado Livre** e **Shopee** — alinhado a `marketplace_name` no banco (`'Mercado Livre'`, `'Shopee'`). Siglas como "ML" não são usadas.

---

## 1. Resumo executivo

Hoje o módulo de Anúncios depende de duas fontes muito diferentes:

- **Mercado Livre** grava em `marketplace_items_raw.data` o payload completo da API e a view `marketplace_items_unified` faz dezenas de extrações em SQL (logística, frete grátis, dimensões parseadas de string, taxas a partir de `listing_prices`, etc.).
- **Shopee** grava o mesmo payload no `marketplace_items_raw.data` em formato totalmente diferente (`base_info`, `item_promotion`, `model_list`, `extra_info`) e quase nada disso passa pela view. O front-end faz o parsing em `parseListingRow` e em `listings.service.ts`.

Isso gera três problemas:

1. **Acoplamento por canal no front-end.** `fetchListings` decide qual tabela ler com base no marketplace e `parseListingRow` ramifica para Mercado Livre/Shopee.
2. **Métricas pulverizadas.** `marketplace_metrics` cobre Mercado Livre (visits, conversion, quality_level). Curtidas, comentários e visualizações da Shopee ficam em `marketplace_items_raw.item_perfomance` (com typo) ou em `performance_data`. Não há tabela única.
3. **Tarifas só para Mercado Livre.** `marketplace_item_prices.listing_prices` traz commission/sale_fee só do Mercado Livre. Não há tabela paralela para Shopee, e o cálculo de custo de venda no front-end vem da `marketplace_items_unified` via parsing de JSON.

A proposta é manter `marketplace_items_raw` apenas como **cache do payload do canal** e introduzir um conjunto **normalizado e canal-agnóstico** de tabelas. Cada canal terá um **adaptador** (edge function compartilhada) que transforma o payload no formato canônico e grava nas tabelas normalizadas. A UI passa a ler apenas o formato canônico.

---

## 2. Estado atual do banco (auditoria)

### 2.1 Tabelas existentes


| Tabela / view                      | Função hoje                                                                                                                                                                                                           | Observações                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `marketplace_items_raw`            | Armazena o item de cada canal. Tem colunas explícitas (`title`, `price`, `category_id`, `status`) e `data jsonb` com o payload bruto.                                                                                 | Mistura "snapshot canônico" com "payload bruto". Possui `performance_data jsonb`, `item_perfomance jsonb` (typo), `stock_distribution jsonb`, `shipping_types jsonb`, `promotion_price numeric`. |
| `marketplace_items_unified` (view) | Extrai e calcula campos derivados (apenas Mercado Livre). Faz parsing de `dimensions` string, computa `shipping_tags`, normaliza `shipping_mode`, calcula `total_fare`/`percentage_fee` a partir de `listing_prices`. | Lógica complexa em SQL (~250 linhas). Não cobre Shopee. Front-end já lê dessa view para Mercado Livre e cai direto na `marketplace_items_raw` para Shopee.                                       |
| `marketplace_item_descriptions`    | Texto (plain/html) das descrições — uma linha por item.                                                                                                                                                               | Tabela limpa, canal-agnóstica em estrutura mas usada só por Mercado Livre.                                                                                                                       |
| `marketplace_item_prices`          | Preço de venda + payload de "listing prices" (tarifas) — Mercado Livre.                                                                                                                                               | `listing_prices` é jsonb com `sale_fee_amount`, `sale_fee_details`, `listing_fee_amount`, `listing_type_id`, etc. Shopee não popula essa tabela.                                                 |
| `marketplace_stock_distribution`   | Estoque por depósito.                                                                                                                                                                                                 | Usada para Mercado Livre (Full / Flex / Correios). Não cobre Shopee.                                                                                                                             |
| `marketplace_metrics`              | Métricas de qualidade + visitas para Mercado Livre.                                                                                                                                                                   | Tem colunas dedicadas (`visits_total`, `conversion_rate`, `quality_level`, `listing_quality`, `rating_average`, `reviews_count`) **e** jsonbs `reviews_data`, `visits_data`. Não tem Shopee.     |
| `marketplace_item_product_links`   | Vínculo anúncio ↔ produto interno.                                                                                                                                                                                    | Funciona para ambos os canais. Mantida.                                                                                                                                                          |
| `marketplace_drafts`               | Rascunhos para o fluxo de criação.                                                                                                                                                                                    | Independente do PRD atual — mantida.                                                                                                                                                             |
| `marketplace_integrations`         | OAuth e capacidades de envio.                                                                                                                                                                                         | Mantida.                                                                                                                                                                                         |


### 2.2 Forma real dos dados

**Mercado Livre — chaves vistas em `marketplace_items_raw.data`:**

`site_id, title, price, base_price, currency_id, status, sub_status, available_quantity, sold_quantity, listing_type_id, category_id, attributes, variations, pictures, video_id, shipping, sale_terms, permalink, condition, accepts_mercadopago, tags, warranty, geolocation, seller_id, catalog_listing, catalog_product_id, last_updated, health, family_name, inventory_id, parent_item_id, start_time, stop_time, end_time, …`

**Shopee — chaves em `marketplace_items_raw.data`:**

```
base_info             // dados nucleares: item_name, item_status, brand, weight, dimension,
                      // attribute_list, image, video_info, item_sku, logistic_info, has_model,
                      // category_id, condition, has_promotion, description, deboost, item_dangerous, …
extra_info            // métricas: views, likes, comment_count, sale, rating_star
content_diagnosis_result  // quality_level + unfinished_task (campos faltantes)
item_promotion        // promoções ativas no item
model_list            // variações (model_id, model_sku, price_info, stock_info_v2, …)
```

**Resumo das diferenças:**


| Conceito               | Mercado Livre                                                           | Shopee                                                                                       |
| ---------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Título                 | `data.title`                                                            | `data.base_info.item_name`                                                                   |
| SKU "raiz"             | `data.seller_custom_field` / atributo `SELLER_SKU`                      | `data.base_info.item_sku`                                                                    |
| Preço                  | `data.price` + `marketplace_item_prices.sale_price_amount`              | `data.base_info.price_info[0].current_price` ou no `model_list[].price_info`                 |
| Categoria              | `data.category_id`                                                      | `data.base_info.category_id`                                                                 |
| Status                 | `active / paused / closed`                                              | `NORMAL / UNLIST / BANNED / DELETED`                                                         |
| Visitas                | `marketplace_metrics.visits_total / visits_last_30_days`                | `data.extra_info.views`                                                                      |
| Vendas (total)         | `data.sold_quantity`                                                    | `data.extra_info.sale`                                                                       |
| Curtidas / Comentários | n/a                                                                     | `data.extra_info.likes / comment_count`                                                      |
| Avaliação              | `marketplace_metrics.rating_average`                                    | `data.extra_info.rating_star`                                                                |
| Qualidade              | `marketplace_metrics.listing_quality / quality_level`                   | `data.content_diagnosis_result.quality_level + unfinished_task`                              |
| Logística              | `data.shipping.logistic_type` + `data.shipping.tags` + `shipping_types` | `data.base_info.logistic_info` (Padrão, Same Day, **Shopee Xpress**, Retire, Fulfillment, …) |
| Dimensões              | `data.shipping.dimensions` string `"L x A x W, peso"` + `package_*_cm`  | `data.base_info.dimension` + `data.base_info.weight`                                         |
| Tarifa de venda        | `marketplace_item_prices.listing_prices.sale_fee_`*                     | **Não persistida** — somente em `order_items.fee` quando há venda                            |
| Variações              | `data.variations` (id, sku, attribute_combinations, picture_ids, price) | `data.model_list` (model_id, model_sku, price_info, stock_info_v2.seller_stock)              |


### 2.3 Como o front-end consome hoje

`src/services/listings.service.ts` decide a tabela:

```56:86:src/services/listings.service.ts
export async function fetchListings(orgId: string, selectedDisplayName: string): Promise<FetchListingsResult> {
    const isShopee = String(selectedDisplayName).toLowerCase() === 'shopee';
    try {
        const { data, error } = isShopee
            ? await (supabase as any)
                .from('marketplace_items_raw')
                .select('*')
                …
            : await (supabase as any)
                .from('marketplace_items_unified')
                .select('*')
                …
```

`useListingItems` deriva mapas separados (`listingTypeByItemId`, `shippingTypesByItemId`, `metricsByItemId`, `listingPricesByItemId`) e ramifica leitura por canal:

```74:97:src/hooks/useListings.ts
if (result.isShopee) {
    lmap[id] = null;
    if (Array.isArray(r?.shipping_types)) {
        smap[id] = …
    }
    mmap[id] = {
        quality_level: r?.performance_data?.quality_level ?? null,
        performance_data: r?.performance_data ?? null,
    };
} else {
    lmap[id] = r?.listing_type_id ? String(r.listing_type_id) : null;
    if (r?.listing_prices) pmap[id] = r.listing_prices;
    if (Array.isArray(r?.shipping_tags) && r.shipping_tags.length) {
        smap[id] = r.shipping_tags.map((t: any) => String(t || '').toLowerCase());
    }
    …
}
```

Conclusão: **o front-end tem lógica de canal embutida** porque o banco não devolve um shape comum.

---

## 3. Objetivos do PRD

1. **Modelo canônico**: tabelas normalizadas que descrevem qualquer anúncio (multi-canal) — título, preço, status, marketplace, logística, dimensões, métricas, qualidade e tarifas.
2. **Adaptadores no ingest**: cada canal tem uma função `normalize(payload)` no Edge Functions que escreve em uma única transação no modelo canônico **e** mantém o payload bruto.
3. **Camada raw versionada por canal**: payload original preservado em uma tabela "raw" simples, com `payload jsonb` e `payload_version int`. Sem mais SQL pesado em views.
4. **API uniforme para o front**: as queries deixam de depender do canal — uma única consulta sobre `marketplace_listings` + joins.
5. **Sincronização granular**: nova ação **"Sincronizar este anúncio"** dispara um worker que reaplica o adaptador apenas para um item.
6. **Compatibilidade**: introduzir as tabelas de forma **aditiva**. O front-end migra gradualmente; nenhum `db reset`.

---

## 4. Arquitetura proposta

### 4.1 Visão geral

```
┌─────────────────────────┐      ┌──────────────────────────┐      ┌─────────────────────────┐
│  Marketplace API        │─────▶│  Edge: <channel>-sync-*  │─────▶│  marketplace_listings_raw│
│  (Mercado Livre / Shopee)│      │  + shared/adapter.ts     │      │  (payload por canal)    │
└─────────────────────────┘      └────────────┬─────────────┘      └────────────┬────────────┘
                                       │                                 │
                                       │                                 ▼
                                       │              ┌───────────────────────────────────┐
                                       └─────────────▶│ marketplace_listings (canônico)   │
                                                      │ + marketplace_listing_variations  │
                                                      │ + marketplace_listing_pictures    │
                                                      │ + marketplace_listing_attributes  │
                                                      │ + marketplace_listing_shipping    │
                                                      │ + marketplace_listing_metrics     │
                                                      │ + marketplace_listing_quality     │
                                                      │ + marketplace_listing_fees        │
                                                      └───────────────────┬───────────────┘
                                                                          │
                                                                          ▼
                                                              ┌───────────────────────┐
                                                              │ React Query (front-end)│
                                                              │ Listings.tsx          │
                                                              └───────────────────────┘
```

### 4.2 Princípios de modelagem

- **Identidade única**: `(organizations_id, marketplace_name, marketplace_item_id)` é a chave natural em todas as tabelas filhas.
- **Variação separada**: cada variação é uma linha em `marketplace_listing_variations`. Estoque por depósito vive em `marketplace_stock_distribution` (mantida).
- **Nada de payload nas tabelas canônicas**: nenhum `jsonb` de payload bruto em `marketplace_listings`. Para acessar o original, usar `marketplace_listings_raw`.
- **Enums normalizados**: status, logística e qualidade ganham domínios canônicos com mapeamento por canal.
- **Tabelas pequenas por intenção**: métricas, qualidade e tarifas em tabelas separadas (cadências de sync distintas).
- **Auditoria**: cada tabela canônica ganha `synced_at`, `source_payload_version`, `integration_id`.

---

## 5. Esquema canônico (DDL alvo)

> Tipos usados a seguir são enums Postgres novos: `listing_status_canonical`, `logistic_type_canonical`, `listing_quality_level_canonical`.

### 5.1 Enums

```sql
CREATE TYPE listing_status_canonical AS ENUM (
  'active', 'paused', 'closed', 'deleted', 'under_review'
);

CREATE TYPE logistic_type_canonical AS ENUM (
  'full',          -- Fulfillment / FBS (Mercado Livre Full, Shopee Fulfillment)
  'flex',          -- Mercado Envios Flex / Shopee Same Day
  'shopee_xpress', -- Shopee Xpress (entrega acelerada operada pela Shopee)
  'envios',        -- Mercado Envios padrão / drop-off do canal
  'correios',      -- Correios / Shopee Padrão
  'agencia',       -- Agência (Mercado Livre)
  'retire',        -- Retirada local / Shopee Retire
  'custom',        -- ME1 (Mercado Livre) / outros
  'unknown'
);

CREATE TYPE listing_quality_level_canonical AS ENUM (
  'excellent', 'good', 'medium', 'low', 'incomplete', 'unknown'
);
```

### 5.2 `marketplace_listings` (núcleo)

```sql
CREATE TABLE marketplace_listings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id                  uuid REFERENCES companies(id),
  integration_id              uuid REFERENCES marketplace_integrations(id),

  marketplace_name            text NOT NULL,                  -- 'Mercado Livre' | 'Shopee' | …
  marketplace_item_id         text NOT NULL,                  -- MLBxxxx / Shopee item_id

  -- Identificação e exibição
  title                       text NOT NULL,
  sku                         text,
  category_id                 text,
  category_path               text,
  permalink                   text,
  thumbnail_url               text,
  has_variations              boolean NOT NULL DEFAULT false,
  condition                   text,                           -- 'new' | 'used' | 'refurbished'

  -- Status canônico + raw do canal
  status                      listing_status_canonical NOT NULL DEFAULT 'active',
  status_raw                  text,                           -- 'NORMAL' | 'paused' | …
  sub_status                  text[],                         -- ex.: 'deleted_by_user'
  pause_reason                text,

  -- Preço resumido (para listagens; detalhes em marketplace_listing_prices)
  price                       numeric(14,2),
  original_price              numeric(14,2),
  promo_price                 numeric(14,2),
  currency                    text NOT NULL DEFAULT 'BRL',

  -- Estoque/quantidades agregadas (para listagens rápidas)
  available_quantity          integer NOT NULL DEFAULT 0,
  sold_quantity               integer NOT NULL DEFAULT 0,

  -- Catalogação Mercado Livre (quando aplica)
  listing_type_id             text,
  catalog_listing             boolean,
  catalog_product_id          text,

  -- Cadastro
  marketplace_created_at      timestamptz,
  marketplace_updated_at      timestamptz,
  last_synced_at              timestamptz NOT NULL DEFAULT now(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listings_unique UNIQUE (organizations_id, marketplace_name, marketplace_item_id)
);

CREATE INDEX ON marketplace_listings (organizations_id, marketplace_name, status);
CREATE INDEX ON marketplace_listings (organizations_id, marketplace_updated_at DESC);
CREATE INDEX ON marketplace_listings USING gin (to_tsvector('portuguese', coalesce(title, '')));
```

### 5.3 `marketplace_listing_variations`

```sql
CREATE TABLE marketplace_listing_variations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id             uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  variation_id           text NOT NULL,        -- Mercado Livre: variation.id / Shopee: model_id

  sku                    text,
  price                  numeric(14,2),
  original_price         numeric(14,2),
  promo_price            numeric(14,2),
  available_quantity     integer NOT NULL DEFAULT 0,
  sold_quantity          integer NOT NULL DEFAULT 0,
  image_url              text,
  attributes             jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id,name,value_name,value_id}]
  primary_for_listing    boolean NOT NULL DEFAULT false,

  last_synced_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_listing_variations_unique
    UNIQUE (organizations_id, marketplace_name, marketplace_item_id, variation_id)
);
CREATE INDEX ON marketplace_listing_variations (listing_id);
```

### 5.4 `marketplace_listing_pictures`

```sql
CREATE TABLE marketplace_listing_pictures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  variation_id        uuid REFERENCES marketplace_listing_variations(id) ON DELETE CASCADE,
  organizations_id    uuid NOT NULL,
  marketplace_name    text NOT NULL,
  marketplace_item_id text NOT NULL,
  external_picture_id text,
  url                 text NOT NULL,
  secure_url          text,
  position            integer NOT NULL DEFAULT 0,
  is_video            boolean NOT NULL DEFAULT false,
  video_url           text
);
CREATE INDEX ON marketplace_listing_pictures (listing_id, position);
```

### 5.5 `marketplace_listing_attributes`

> Mantém atributos do canal (BRAND, MODEL, GTIN…) achatados para filtros e busca rápida. O JSON completo continua disponível na variação (`attributes`) e no raw.

```sql
CREATE TABLE marketplace_listing_attributes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id          uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id    uuid NOT NULL,
  marketplace_name    text NOT NULL,
  marketplace_item_id text NOT NULL,
  attribute_id        text NOT NULL,         -- 'BRAND', 'GTIN', 'COLOR', …
  attribute_name      text,
  value_id            text,
  value_name          text,
  value_struct        jsonb,                 -- número + unidade (number_unit)
  is_required         boolean,
  is_variation_attr   boolean,

  CONSTRAINT marketplace_listing_attributes_unique
    UNIQUE (listing_id, attribute_id)
);
```

### 5.6 `marketplace_listing_shipping`

> Substitui `shipping_tags_*`, `package_*_cm`, `cap_full`, etc. da view atual.

```sql
CREATE TABLE marketplace_listing_shipping (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  -- Logística canônica
  logistic_type           logistic_type_canonical NOT NULL DEFAULT 'unknown',
  logistic_types          logistic_type_canonical[] NOT NULL DEFAULT '{}',
  shipping_mode           text,                -- 'ME1' | 'ME2' | 'shopee_logistics' | …

  free_shipping           boolean NOT NULL DEFAULT false,
  mandatory_free_shipping boolean NOT NULL DEFAULT false,
  local_pick_up           boolean NOT NULL DEFAULT false,

  -- Dimensões e peso
  package_length_cm       numeric(8,2),
  package_width_cm        numeric(8,2),
  package_height_cm       numeric(8,2),
  package_weight_g        numeric(10,2),

  last_synced_at          timestamptz NOT NULL DEFAULT now()
);
```

### 5.7 `marketplace_listing_metrics`

> Substitui `marketplace_metrics` para o módulo de Anúncios (a tabela antiga fica como compatibilidade, ver §8). Centraliza Visitas / Vendas / Curtidas / Conversão / Avaliações para qualquer canal.

```sql
CREATE TABLE marketplace_listing_metrics (
  listing_id            uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id      uuid NOT NULL,
  marketplace_name      text NOT NULL,
  marketplace_item_id   text NOT NULL,

  visits_total          integer NOT NULL DEFAULT 0,
  visits_last_30_days   integer NOT NULL DEFAULT 0,
  impressions           integer,                  -- quando o canal expõe (Mercado Livre)
  sales_total           integer NOT NULL DEFAULT 0,
  sales_last_30_days    integer,
  conversion_rate       numeric(6,4) NOT NULL DEFAULT 0,

  -- Engajamento (Shopee)
  likes_total           integer NOT NULL DEFAULT 0,
  comments_total        integer NOT NULL DEFAULT 0,

  -- Avaliação
  rating_average        numeric(3,2),
  reviews_count         integer NOT NULL DEFAULT 0,

  last_visits_update    timestamptz,
  last_reviews_update   timestamptz,
  last_synced_at        timestamptz NOT NULL DEFAULT now()
);
```

### 5.8 `marketplace_listing_quality`

```sql
CREATE TABLE marketplace_listing_quality (
  listing_id          uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id    uuid NOT NULL,
  marketplace_name    text NOT NULL,
  marketplace_item_id text NOT NULL,

  quality_score       numeric(5,2),          -- 0-100 (Mercado Livre listing_quality)
  quality_level       listing_quality_level_canonical NOT NULL DEFAULT 'unknown',
  missing_attributes  text[] NOT NULL DEFAULT '{}',
  unfinished_tasks    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Shopee content_diagnosis_result.unfinished_task

  last_synced_at      timestamptz NOT NULL DEFAULT now()
);
```

### 5.9 `marketplace_listing_fees` (tarifas cobradas pelo canal)

> Substitui o uso direto de `marketplace_item_prices.listing_prices` no front e cobre Shopee.

```sql
CREATE TABLE marketplace_listing_fees (
  listing_id              uuid PRIMARY KEY REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  organizations_id        uuid NOT NULL,
  marketplace_name        text NOT NULL,
  marketplace_item_id     text NOT NULL,

  currency                text NOT NULL DEFAULT 'BRL',
  -- Comissão de venda
  commission_amount       numeric(14,2),          -- total da tarifa cobrada
  commission_percentage   numeric(5,2),           -- % aplicada
  commission_fixed_fee    numeric(14,2),          -- piso fixo
  -- Custo de exibição (publicação) — Mercado Livre cobra "listing fee" quando aplicável
  listing_fee_amount      numeric(14,2),
  -- Subsídio de envio (Mercado Livre "publication shipping cost", Shopee taxa logística)
  shipping_subsidy        numeric(14,2),
  -- Estimativa: comissão + listing_fee + shipping_subsidy
  total_fees_estimated    numeric(14,2),

  source_payload_version  integer,                -- versão do snapshot que originou esta linha
  last_synced_at          timestamptz NOT NULL DEFAULT now()
);
```

### 5.10 `marketplace_listings_raw`

> Substitui `marketplace_items_raw` para o módulo de Anúncios mantendo o histórico do payload bruto. **A tabela antiga continua existindo** (ver §8) — esta é a versão limpa.

```sql
CREATE TABLE marketplace_listings_raw (
  id                     bigserial PRIMARY KEY,
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  integration_id         uuid REFERENCES marketplace_integrations(id),
  payload                jsonb NOT NULL,
  payload_version        integer NOT NULL DEFAULT 1,
  payload_source         text NOT NULL,         -- 'sync-items' | 'webhook' | 'sync-one'
  fetched_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT marketplace_listings_raw_unique
    UNIQUE (organizations_id, marketplace_name, marketplace_item_id, payload_version)
);
CREATE INDEX ON marketplace_listings_raw (organizations_id, marketplace_name, marketplace_item_id, fetched_at DESC);
```

### 5.11 `marketplace_listing_sync_jobs` (auditoria do "Sincronizar este anúncio")

```sql
CREATE TABLE marketplace_listing_sync_jobs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizations_id       uuid NOT NULL,
  marketplace_name       text NOT NULL,
  marketplace_item_id    text NOT NULL,
  triggered_by_user_id   uuid REFERENCES auth.users(id),
  scope                  text NOT NULL,                 -- 'full' | 'metrics' | 'fees' | 'quality'
  status                 text NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'success' | 'error'
  error_message          text,
  duration_ms            integer,
  started_at             timestamptz,
  finished_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON marketplace_listing_sync_jobs (organizations_id, marketplace_name, marketplace_item_id, created_at DESC);
```

---

## 6. Adaptadores (camada de ingest)

Os adaptadores ficam em `supabase/functions/_shared/listing-adapters/`:

```
supabase/functions/_shared/listing-adapters/
  index.ts                  ← export resolveAdapter(channel)
  types.ts                  ← CanonicalListing, CanonicalVariation, …
  mercadoLivre.ts           ← normalize(payload, ctx)
  shopee.ts                 ← normalize(payload, ctx)
  shared/
    statusMapping.ts        ← raw → listing_status_canonical
    logisticMapping.ts      ← raw → logistic_type_canonical
    qualityMapping.ts       ← raw → listing_quality_level_canonical
    dimensionsParse.ts      ← string Mercado Livre "L x A x W, peso" + dimension Shopee
```

### 6.1 Contrato `types.ts`

```ts
export interface CanonicalListing {
  marketplace_name: string;
  marketplace_item_id: string;
  title: string;
  sku: string | null;
  category_id: string | null;
  category_path: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  has_variations: boolean;
  condition: 'new' | 'used' | 'refurbished' | null;

  status: 'active' | 'paused' | 'closed' | 'deleted' | 'under_review';
  status_raw: string;
  sub_status: string[];
  pause_reason: string | null;

  price: number | null;
  original_price: number | null;
  promo_price: number | null;
  currency: string;

  available_quantity: number;
  sold_quantity: number;

  listing_type_id: string | null;
  catalog_listing: boolean | null;
  catalog_product_id: string | null;

  marketplace_created_at: string | null;
  marketplace_updated_at: string | null;
}

export interface CanonicalVariation { /* ver §5.3 */ }
export interface CanonicalPicture   { /* ver §5.4 */ }
export interface CanonicalAttribute { /* ver §5.5 */ }
export interface CanonicalShipping  { /* ver §5.6 */ }
export interface CanonicalMetrics   { /* ver §5.7 */ }
export interface CanonicalQuality   { /* ver §5.8 */ }
export interface CanonicalFees      { /* ver §5.9 */ }

export interface NormalizedListing {
  listing: CanonicalListing;
  variations: CanonicalVariation[];
  pictures: CanonicalPicture[];
  attributes: CanonicalAttribute[];
  shipping: CanonicalShipping;
  metrics: CanonicalMetrics;
  quality: CanonicalQuality;
  fees: CanonicalFees;
}

export interface ListingAdapter {
  channel: 'mercado-livre' | 'shopee';
  normalize(payload: unknown, ctx: AdapterContext): NormalizedListing;
}
```

### 6.2 Mapeamento canal → canônico

**Status**


| Canal         | Raw                  | Canonical      |
| ------------- | -------------------- | -------------- |
| Mercado Livre | `active`             | `active`       |
| Mercado Livre | `paused`             | `paused`       |
| Mercado Livre | `closed`             | `closed`       |
| Mercado Livre | `under_review`       | `under_review` |
| Shopee        | `NORMAL`             | `active`       |
| Shopee        | `UNLIST`             | `paused`       |
| Shopee        | `BANNED` / `DELETED` | `deleted`      |
| Shopee        | `REVIEWING`          | `under_review` |


**Logística**


| Canal         | Raw                                                                               | Canonical       |
| ------------- | --------------------------------------------------------------------------------- | --------------- |
| Mercado Livre | `fulfillment` / `fbm`                                                             | `full`          |
| Mercado Livre | `self_service`                                                                    | `flex`          |
| Mercado Livre | `xd_drop_off` / `cross_docking`                                                   | `envios`        |
| Mercado Livre | `drop_off`                                                                        | `correios`      |
| Mercado Livre | `custom` / `not_specified`                                                        | `custom`        |
| Shopee        | `logistic_info[].logistic_name` contém "Padrão" / logistic_id padrão (ex.: 70011) | `correios`      |
| Shopee        | `logistic_info[].logistic_name` contém "Same Day"                                 | `flex`          |
| Shopee        | `logistic_info[].logistic_name` contém "Xpress" / "Shopee Xpress"                 | `shopee_xpress` |
| Shopee        | `logistic_info[].logistic_name` contém "Retire"                                   | `retire`        |
| Shopee        | `is_fulfillment_by_shopee = true`                                                 | `full`          |


> **Shopee Xpress:** modalidade de envio acelerada da Shopee, distinta de **Shopee Padrão** (`correios`) e de **Same Day** (`flex`). O adaptador Shopee deve mapear por `logistic_name` (case-insensitive) e, quando disponível, por `logistic_id` documentado na API do seller. Um anúncio pode ter **vários** canais logísticos habilitados em `logistic_info[]`; todos os tipos canônicos detectados entram em `marketplace_listing_shipping.logistic_types[]`, com `logistic_type` = o principal (prioridade sugerida: `full` > `shopee_xpress` > `flex` > `correios` > `retire`).

**Métricas**


| Métrica     | Mercado Livre                         | Shopee                          |
| ----------- | ------------------------------------- | ------------------------------- |
| Visits      | `marketplace_metrics.visits_total`    | `data.extra_info.views`         |
| Sales total | `data.sold_quantity`                  | `data.extra_info.sale`          |
| Likes       | `null`                                | `data.extra_info.likes`         |
| Comments    | `null`                                | `data.extra_info.comment_count` |
| Rating avg  | `marketplace_metrics.rating_average`  | `data.extra_info.rating_star`   |
| Conversion  | `marketplace_metrics.conversion_rate` | `sale / views`                  |


**Tarifas**


| Campo                 | Mercado Livre (`listing_prices`)                 | Shopee                                                                                             |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| commission_amount     | `sale_fee_amount` ou `prices[0].sale_fee.amount` | `data.base_info.commission_fee` (quando exposto) ou cálculo a partir de `order_items.fee` agregado |
| commission_percentage | `sale_fee_details.percentage_fee`                | tabela da categoria Shopee (manter cache em `marketplace_provider_fee_rules`)                      |
| commission_fixed_fee  | `sale_fee_details.fixed_fee`                     | `0` (Shopee não cobra fixo)                                                                        |
| listing_fee_amount    | `listing_fee_amount` (clássico)                  | `0`                                                                                                |
| shipping_subsidy      | `prices[0].shipping_cost.amount`                 | subsídio (`logistic_info.shipping_fee_subsidy`) quando disponível                                  |


### 6.3 Onde plugar o adaptador

Os jobs já existem e passam a chamar o adaptador antes do upsert:


| Edge function existente                 | Mudança                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `mercado-livre-sync-items`              | Após receber item da API, gravar em `marketplace_listings_raw` e rodar adaptador Mercado Livre → upserts.                                    |
| `mercado-livre-update-metrics`          | Roda adaptador parcial (somente `metrics`) e atualiza `marketplace_listing_metrics`.                                                         |
| `mercado-livre-update-quality`          | Adaptador parcial (somente `quality`).                                                                                                       |
| `mercado-livre-update-reviews`          | Adaptador parcial (metrics.rating + reviews_count).                                                                                          |
| `mercado-livre-listing-prices`          | Adaptador parcial (fees).                                                                                                                    |
| `mercado-livre-sync-stock-distribution` | Continua atualizando `marketplace_stock_distribution` (mantida). Mas também atualiza agregados em `marketplace_listings.available_quantity`. |
| `shopee-sync-items`                     | Adaptador completo. Métricas e qualidade vêm no mesmo payload (`extra_info`, `content_diagnosis_result`).                                    |
| `shopee-webhook-items`                  | Idem — gatilho parcial para os itens listados na notificação.                                                                                |


### 6.4 Nova função: `listings-sync-one`

```
supabase/functions/listings-sync-one/index.ts
```

Responsabilidade:

1. Recebe `{ organizationId, marketplace_item_id, scope?: 'full' | 'metrics' | 'fees' | 'quality' }`.
2. Cria linha em `marketplace_listing_sync_jobs` com `status='queued'`.
3. Detecta o canal pelo `marketplace_listings.marketplace_name`.
4. Chama as funções de canal necessárias para o `scope`:
  - `full` → `<channel>-sync-items` filtrado por id + `<channel>-update-metrics` + quality + fees.
  - `metrics` → apenas `<channel>-update-metrics`.
  - `fees` → apenas `mercado-livre-listing-prices` (Mercado Livre) / cálculo Shopee.
  - `quality` → apenas `<channel>-update-quality`.
5. Atualiza `status='success' / 'error'` e `duration_ms`.

---

## 7. Mudanças no front-end

### 7.0 UX da listagem (`/anuncios`) — entregue 21/05/2026

Melhorias na página `Listings.tsx` e componentes em `src/components/listings/`, sem alterar o layout geral do card.

| Área | Comportamento | Arquivos |
|------|---------------|----------|
| **Coluna Dados** | Remove badge mockado de marketplace (Shopee/ML). Exibe **Tarifas de venda** + valores de `marketplace_listing_fees` (`commission_percentage` + `commission_fixed_fee`, ex.: `11,5% + R$ 6,50`). Tooltip mantém tipo de publicação e valor estimado a pagar. | `ListingCard.tsx`, `formatListingFeeLine` em `listingUtils.ts` |
| **Toolbar** | Busca estilo pedidos (`h-12`, `rounded-2xl`). Filtros em drawer (`ListingsFilterDrawer`: logística, status, estoque, vínculo produto). Ordenação sem margem. **Filtro rápido de loja** (`ListingsStoreFilter`): checkboxes por `marketplace_integrations.store_name`, filtro via `marketplace_listings.integration_id`; opção **Todas as lojas** no topo. | `ListingsToolbar.tsx`, `ListingsFilterDrawer.tsx`, `ListingsStoreFilter.tsx`, `types/listings.ts`, `filterListings` em `useListings.ts` |
| **CTA Criar anúncio** | Botão movido para a barra superior de marketplace (`CleanNavigation.rightContent`), alinhado às tabs Shopee/Mercado Livre; toolbar fica só com busca + filtros + ordenar + sincronizar. | `Listings.tsx` |
| **Troca de marketplace (tabs)** | Estado do marketplace na URL: `?marketplace=mercado_livre` \| `shopee`. Fetch via React Query com `queryKey` por slug; **sem** `useState` duplicado de `rawItems` (evita lista vazia ao trocar aba). Loading: `isPending \|\| (isFetching && !data)`. Reset de painel com `key` por `marketplaceSlug`. | `useListings.ts`, `resolveMarketplacePathFromUrl`, `listings.service.ts` (`fetchMarketplaceStores`) |

**Critérios de aceite (UX):**

- [x] Alternar Mercado Livre ↔ Shopee dispara nova requisição e lista correta sem F5.
- [x] Durante troca de marketplace, exibir **Carregando...** até dados da aba ativa.
- [x] Filtro de loja restringe anúncios por `integration_id` dentro do marketplace da tab.
- [x] Coluna Dados mostra rótulo **Tarifas de venda** e percentual + taxa fixa canônicos.

### 7.1–7.4 Camada de dados (service + hook)

### 7.1 `listings.service.ts` (canônico)

- `fetchListings(orgId, channelDisplay)` passa a fazer **uma única query** em `marketplace_listings` filtrando por `marketplace_name`. Sem mais ramificação por canal.
- Joins controlados via `.select('*, shipping:marketplace_listing_shipping(*), metrics:marketplace_listing_metrics(*), fees:marketplace_listing_fees(*), quality:marketplace_listing_quality(*), variations:marketplace_listing_variations(*), pictures:marketplace_listing_pictures(*)')`.
- Função nova: `syncSingleListing(orgId, marketplaceItemId, scope='full')` → invoca edge `listings-sync-one`.

### 7.2 `parseListingRow`

Reduzido drasticamente: como o banco já entrega tudo canônico, vira só um `cast` de tipos. Toda a lógica de logística, métricas, qualidade e fees deixa de existir aqui.

### 7.3 `useListings.ts`

- Remove `metricsByItemId`, `listingTypeByItemId`, `shippingTypesByItemId`, `listingPricesByItemId` (todos vêm na própria query).
- Subscribe `postgres_changes` passa a observar `marketplace_listings`, `marketplace_listing_metrics` e `marketplace_listing_quality`.

### 7.4 `ListingCard.tsx` (nova ação)

Adicionar item no `DropdownMenu` (sem mudar o design dos demais botões):

```tsx
<DropdownMenuItem onSelect={(e) => { e.preventDefault(); onSyncSingle?.(ad); }}>
  <RefreshCw className="w-4 h-4 mr-2" />
  Sincronizar este anúncio
</DropdownMenuItem>
```

Handler em `Listings.tsx`:

```ts
const handleSyncSingle = async (ad: ListingItem) => {
  try {
    await mutations.syncSingle.mutateAsync({
      marketplaceItemId: ad.marketplaceId,
      scope: 'full',
    });
    toast({ title: 'Anúncio sincronizado' });
    refetch();
  } catch (e: any) {
    toast({ title: 'Falha ao sincronizar', description: e?.message, variant: 'destructive' });
  }
};
```

Mutation correspondente em `useListingMutations`:

```ts
const syncSingle = useMutation({
  mutationFn: ({ marketplaceItemId, scope }: { marketplaceItemId: string; scope?: string }) =>
    syncSingleListing(orgId!, marketplaceItemId, scope || 'full'),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['listings', 'items'] }),
});
```

---

## 8. Plano de migração (sem `db reset`)

> Restrição do usuário: proibido `npx supabase db reset` e variações.

### Fase 0 — Preparação (1 migration)

- Criar enums (§5.1).
- Criar tabelas canônicas (§5.2–5.11) **vazias e em paralelo** às existentes.
- Habilitar RLS com `policy multi_tenant_read` (filtro `organizations_id = auth.jwt() ->> 'organization_id'`).

### Fase 1 — Adaptadores e dual-write (edge functions)

- Implementar `_shared/listing-adapters/`.
- Patchar `mercado-livre-sync-items`, `shopee-sync-items`, webhooks e workers para gravar **simultaneamente**:
  - antigo (`marketplace_items_raw`, `marketplace_metrics`, `marketplace_item_prices`),
  - e novo (`marketplace_listings`*).
- Cobertura via feature flag por organização em `marketplace_integrations.config.listings_canonical = true`.

### Fase 2 — Backfill

- Job `listings-backfill` (edge): para cada `marketplace_items_raw` da organização, roda o adaptador a partir do `data` e popula as novas tabelas.
- Lote configurável (`page_size=100`), idempotente (uses `UPSERT` em todas as tabelas filhas).
- Audita resultado em `marketplace_listing_sync_jobs` com `scope='backfill'`.

### Fase 3 — Migração do front-end

- `fetchListings` lê de `marketplace_listings` se a flag estiver ativa; caso contrário, usa o caminho antigo.
- `useListingItems` agora ignora a ramificação Shopee/Mercado Livre.
- Após validar visualmente em produção (duas semanas), remover o caminho antigo do front-end.

### Fase 4 — Cleanup

- Drop da view `marketplace_items_unified` (depois que ninguém mais consumir).
- Marcar como deprecadas: `marketplace_items_raw.performance_data`, `marketplace_items_raw.item_perfomance` (typo), `marketplace_items_raw.promotion_price`. Mantêm-se até webhooks e edge fns externas pararem de gravar.
- Remover o suplemento de `marketplace_metrics` se nada mais consumir (manter por enquanto pelo módulo de Desempenho — ver §10).

---

## 9. RLS e segurança

- Cada tabela canônica recebe RLS com a mesma política do restante do app:

```sql
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY listings_select_by_org ON marketplace_listings
  FOR SELECT USING (organizations_id = current_setting('request.jwt.claim.organization_id', true)::uuid);

CREATE POLICY listings_insert_by_service_role ON marketplace_listings
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
```

- Tabelas filhas seguem o mesmo padrão; o front-end nunca grava — apenas service role (edge functions) escreve.
- `marketplace_listings_raw` é **apenas** legível por owner/admin (configurável) e service role. Não é exposta na UI.

---

## 10. Impacto em outros módulos


| Módulo                         | Impacto                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criação/Edição (PRD existente) | Os adaptadores no front (`src/adapters/listings/`*) já produzem um shape canônico para edição. Eles se manterão e passarão a ler do banco canônico em vez de `marketplace_items_unified`. |
| Desempenho                     | `marketplace_metrics` permanece como fonte para a página de Desempenho (séries históricas). `marketplace_listing_metrics` é o snapshot atual para a listagem. As duas convivem. **Decisão fechada (ANN-CLEAN-04).** |
| Estoque                        | `marketplace_stock_distribution` mantida. Agregado por listing já em `marketplace_listings.available_quantity`.                                                                           |
| Promoções                      | Continua lendo `marketplace_promotions` / `marketplace_promotion_items` (sem mudança).                                                                                                    |
| Pedidos / Tarifas reais        | `order_items.fee` segue como fonte de verdade da tarifa **realizada**. As tarifas em `marketplace_listing_fees` são **estimadas pelo canal antes da venda**.                              |
| Sincronização de pedidos       | Inalterada — usa `marketplace_orders_`*.                                                                                                                                                  |


---

## 11. Resumo das tabelas (visão final)


| Tabela / view                      | Status após migração               | Função                                                  |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `marketplace_listings`             | **NOVA** (núcleo)                  | Identidade do anúncio                                   |
| `marketplace_listing_variations`   | **NOVA**                           | Variações canônicas                                     |
| `marketplace_listing_pictures`     | **NOVA**                           | Mídia                                                   |
| `marketplace_listing_attributes`   | **NOVA**                           | Atributos achatados                                     |
| `marketplace_listing_shipping`     | **NOVA**                           | Logística + dimensões                                   |
| `marketplace_listing_metrics`      | **NOVA**                           | Visitas/Vendas/Curtidas/Conversão                       |
| `marketplace_listing_quality`      | **NOVA**                           | Qualidade do canal                                      |
| `marketplace_listing_fees`         | **NOVA**                           | Tarifas estimadas (por canal)                           |
| `marketplace_listings_raw`         | **NOVA**                           | Payload bruto versionado                                |
| `marketplace_listing_sync_jobs`    | **NOVA**                           | Auditoria do "Sincronizar este anúncio"                 |
| `marketplace_items_raw`            | Deprecado (mantida no curto prazo) | Substituída por `marketplace_listings_raw`              |
| `marketplace_items_unified` (view) | Removida ao final                  | Lógica vira tabela canônica                             |
| `marketplace_metrics`              | Mantida                            | Séries temporais para Desempenho                        |
| `marketplace_item_prices`          | Mantida (origem para fees)         | Continua sendo gravada pelo job Mercado Livre de prices |
| `marketplace_item_descriptions`    | Mantida                            | Já é canal-agnóstica                                    |
| `marketplace_stock_distribution`   | Mantida                            | Estoque por depósito                                    |
| `marketplace_item_product_links`   | Mantida                            | Vínculo com produtos internos                           |
| `marketplace_drafts`               | Mantida                            | Rascunhos do fluxo de criação                           |


---

## 12. Tarefas para implementação

> **Checklist executável (IDs `ANN-*`, critérios de aceite, ordem):** [`TAREFAS-MODULO-ANUNCIOS-EXECUCAO.md`](./TAREFAS-MODULO-ANUNCIOS-EXECUCAO.md)

### Status MVP (atualizado 21/05/2026)

| Tarefa | Status | Notas |
|--------|--------|-------|
| **DB-1** — Migration canônica | ✅ Concluído | 10 tabelas, RLS, índices aplicados no remoto |
| **EDGE-1** — `_shared/listing-adapters/` | ✅ Concluído | Adaptadores ML + Shopee implementados |
| **EDGE-2** — Patch mercado-livre-* (6 fns) | ✅ Concluído | Deployadas via MCP 21/05/2026 |
| **EDGE-3** — Patch shopee-* (2 fns) | ✅ Concluído | Deployadas via MCP 21/05/2026 |
| **EDGE-4** — `listings-sync-one` | ✅ Concluído | Deployada via MCP |
| **EDGE-5** — `listings-backfill` | ✅ Concluído | Deployada via MCP; 45 itens backfilled |
| **FE-1** — `listings.service.ts` | ⏳ Pendente (pós-rollout) | Remover legado após ANN-FLAG-02 |
| **FE-2** — `parseListingRow` | ⏳ Pendente (pós-rollout) | Remover parser legado após FE-1 |
| **FE-3** — `useListings.ts` | ⏳ Pendente (pós-rollout) | Remover ramificação por canal após FE-2; **parcial:** query por marketplace slug + URL `?marketplace=` |
| **FE-4** — "Sincronizar este anúncio" | ✅ Concluído | Já implementado |
| **FE-5** — `syncSingle` mutation | ✅ Concluído | Já implementado |
| **FE-UX** — Listagem `/anuncios` | ✅ Concluído 21/05/2026 | §7.0 — tarifas, filtros, loja, URL marketplace, CTA no topo |
| **QA-1** — Paridade visual | ⏳ Pendente | Aguarda ANN-FLAG-01 (rollout piloto) |
| **QA-2** — Sync-one < 5s | ⏳ Pendente | Aguarda ANN-FLAG-01 |
| **CLEAN** — Drop view + deprecação | ⏳ Pendente | Após 2 semanas estáveis pós-rollout completo |

### Próximas etapas

1. **ANN-FLAG-01** — Ativar `listings_canonical: true` para org piloto e validar visual
2. **ANN-QA-01/02** — Validar paridade e funcionalidade de sync em produção
3. **ANN-FLAG-02** — Expandir rollout para demais organizações
4. **ANN-FE-01/02/03** — Remover código legado (pós rollout completo)
5. **ANN-CLEAN-02** — Drop da view `marketplace_items_unified`

---

## 13. Decisões

| Tema                                                              | Decisão | Status |
| ----------------------------------------------------------------- | ------- | ------ |
| Manter `marketplace_metrics` ou colapsar tudo na nova?            | **Manter** — histórico do Desempenho depende dela. `marketplace_listing_metrics` é snapshot atual. | ✅ Fechada (ANN-CLEAN-04) |
| Tarifas Shopee: estimar via tabela de categoria ou esperar venda? | Cachear comissão por categoria em `marketplace_provider_fee_rules`; corrigir com `order_items.fee` pós-venda. | ✅ Fechada — seed default 14% aplicado (ANN-DB-02) |
| `marketplace_listing_attributes` deve normalizar valores?         | Não: manter `value_id`/`value_name` como recebidos. Normalização é responsabilidade do módulo de Produtos. | ✅ Fechada |
| Renomear `marketplace_name` para FK em `marketplace_providers`?   | Migração futura; manter `text` por compatibilidade no MVP. Criar issue com label `anuncios-post-mvp` (ANN-DEC-02). | ✅ Fechada — backlog |


---

