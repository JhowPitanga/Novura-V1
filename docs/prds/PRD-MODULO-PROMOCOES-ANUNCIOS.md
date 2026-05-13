# PRD — Módulo de Promoções (Anúncios)

**Produto:** Novura  
**Área:** Anúncios → aba **Promoções** + páginas de criação/gerenciamento + Edge Functions Supabase  
**Idioma da UI:** pt-BR  
**Última revisão técnica:** 2026-05-12  

---

## 1. Resumo executivo

O módulo centraliza campanhas promocionais do **Mercado Livre** e da **Shopee** em tabelas Postgres (`marketplace_promotions`, `marketplace_promotion_items`), com leitura pela aplicação web (RLS por organização) e escrita exclusiva via **Edge Functions** com `service_role`. A UI na rota **Anúncios** permite sincronizar campanhas, filtrar por tipo de promoção (cards), listar campanhas, abrir detalhes, adicionar/remover itens e criar descontos padrão ou ofertas relâmpago (Shopee) conforme o marketplace selecionado.

---

## 2. Objetivos e escopo

### 2.1 Objetivos

- Exibir um espelho **confiável e atualizável** das promoções ativas/candidatas no marketplace.
- Permitir **ações seguras** (criar, atualizar metadados, encerrar, adicionar/remover/atualizar itens) sem expor tokens de marketplace ao browser.
- Suportar **taxonomia ML** nativa (`ml_kind`) mantendo um modelo universal (`promotion_type`, `source`, `status`).

### 2.2 Escopo in-scope

- Aba **Promoções** em `Listings` (sub-aba ao lado de Anúncios).
- Rotas: criação/edição de promoção padrão e fluxo dedicado Shopee Flash.
- Sincronização manual e **job agendado** (pg_cron) chamando Edge Function.

### 2.3 Fora de escopo / backlog sugerido

- **Listagem agregada “todos os anúncios participantes por tipo de card”** na aba principal: não está na UI atual (código removido na limpeza de 2026-05-12); pode ser reintroduzido consumindo `marketplace_promotion_items` + tabela de anúncios.
- Ocultar a sub-aba **Promoções** para usuários sem `promote_view` / `promote_*`: hoje o trigger da aba não usa `canViewPromotions()` — apenas o módulo `anuncios` + `view` nas rotas de páginas filhas.
- Alinhar **rotas** `/anuncios/promocoes/*` a ações explícitas (`promote_create`, etc.) além de `view`.

---

## 3. Personas e permissões

Definidas em `src/hooks/usePermissions.tsx` (módulo `anuncios`):

| Função | Permissão | Uso na UI |
|--------|-----------|-----------|
| Ver promoções (conceito) | `promote_view` ou outras `promote_*` ou `view` | `canViewPromotions` — hoje pouco usado na aba |
| Criar | `promote_create` ou `owner` | Botões “Criar” nos cards (`canCreatePromotion`) |
| Editar campanha / itens | `promote_edit` ou `owner` | Drawer, manage page |
| Encerrar / excluir | `promote_delete` ou `owner` | Ações destrutivas na lista e drawer |

**Nota:** As rotas em `App.tsx` para páginas de promoção usam `RestrictedRoute module="anuncios" actions={["view"]}` — reforço de permissões finas nas rotas é gap documentado na seção 2.3.

---

## 4. Experiência do usuário — Aba Promoções

**Entrada:** `Anúncios` (`/anuncios/*`) com marketplace selecionado → sub-aba **Promoções**.  
**Componente raiz:** `PromotionsTab` (`src/components/promotions/PromotionsTab.tsx`).

### 4.1 Elementos da tela

1. **Busca** — filtra campanhas por nome ou `external_id` (texto local).
2. **Sincronizar** — chama Edge Function `promotions-sync` com `integrationId` da integração ativa (`marketplace_integrations`).
3. **Cards por segmento** — definição em `promotionSegments.ts`:
   - **Mercado Livre:** até 7 segmentos (campanha do vendedor, campanhas ML, relâmpago, oferta do dia, desconto individual, smart/competitivos, PIX/cupons) + placeholders de grid.
   - **Shopee:** 2 segmentos — desconto na loja (`STANDARD_DISCOUNT`) e oferta relâmpago (`FLASH_SALE`).
4. **Seleção de card** — alterna filtro: nenhum card = “Todas as campanhas”; card selecionado = lista apenas campanhas cujo `Promotion` satisfaz `segment.matches(p)`.
5. **Lista** — `PromotionsList` / `PromotionRow`: ver detalhes, editar, adicionar itens, encerrar (conforme permissões).
6. **Modais globais do tab** — `PromotionDetailDrawer`, `AddItemsToPromotionDialog`, confirmação de encerramento.

### 4.2 Fluxos auxiliares (fora da aba)

- **`PromotionCreate`** — `/anuncios/promocoes/nova?marketplace=...` — desconto padrão ML/Shopee.
- **`PromotionManage`** — `/anuncios/promocoes/:promotionId` — gestão de campanha + itens.
- **`ShopeeFlashSaleCreate` / `ShopeeFlashSaleManage`** — rotas dedicadas flash Shopee (`promotions-list-flash-slots`, `promotions-create` com `slotId`).

---

## 5. Modelo de dados (PostgreSQL)

### 5.1 `public.marketplace_promotions`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `organizations_id` | uuid | FK `organizations` |
| `integration_id` | uuid | FK `marketplace_integrations` (nullable on delete) |
| `marketplace_key` | text | `mercado_livre` \| `shopee` |
| `external_id` | text | ID da campanha no marketplace |
| `promotion_type` | text | `STANDARD_DISCOUNT` \| `FLASH_SALE` |
| `ml_kind` | text | Tipo nativo ML (`DEAL`, `LIGHTNING`, …); **NULL** na Shopee |
| `source` | text | `seller_created` \| `platform_invite` \| `time_slot` |
| `status` | text | `draft` … `candidate` |
| `name`, datas, percentuais | diversos | Metadados de exibição e negócio |
| `raw` | jsonb | Payload bruto da API |
| `last_synced_at` | timestamptz | Última sincronização bem-sucedida |

**Unique:** `(organizations_id, marketplace_key, external_id)`.

**Migrations:** `20260505_000001_create_marketplace_promotions.sql` (schema base), `20260512_000001_add_ml_kind_to_promotions.sql` (`ml_kind` + índice).

**Correção aplicada (2026-05-12):** na migration `20260505_000001`, o fechamento da `CREATE TABLE marketplace_promotion_items` e o `CREATE UNIQUE INDEX` estavam corrompidos (texto literal `\n`); corrigido para SQL válido — necessário para novos ambientes que apliquem migrations do zero.

### 5.2 `public.marketplace_promotion_items`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `promotion_id` | uuid | FK `marketplace_promotions` ON DELETE CASCADE |
| `marketplace_item_id` | text | ID do anúncio no marketplace |
| `variation_id` | text | Variação (Shopee model / ML variation), opcional |
| `status` | text | `candidate` \| `pending` \| `started` \| `finished` \| `paused` |
| Preços / estoque / limites | numeric/int | Espelho do contrato universal |
| `raw` | jsonb | Detalhes específicos do provider |

**Unique:** `(promotion_id, marketplace_item_id, COALESCE(variation_id,''))`.

### 5.3 RLS

- **SELECT:** membros da org (`is_org_member`) em promoções; itens via EXISTS na promoção pai.
- **ALL:** `service_role` (Edge Functions com admin client).

### 5.4 Tabelas auxiliares (leitura)

- **Listagens para preço/título na UI e resolução de % em add-items:** `marketplace_items`, `marketplace_items_unified`, `marketplace_items_raw` — uso varia por função (ver comentários nos handlers `promotions-add-items` e `promotions-update-items`).

---

## 6. Edge Functions — catálogo

Todas as funções abaixo são invocadas com **POST** + JSON (`Content-Type: application/json`), salvo nota. Autenticação típica: JWT do usuário no header `Authorization` (client) ou **service role** no cron.

**Secrets comuns:** `TOKENS_ENCRYPTION_KEY` (obrigatório para adapters de token), `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` no runtime Deno.

| Função | Papel | Corpo principal | Resposta resumida |
|--------|--------|-------------------|---------------------|
| `promotions-sync` | Lista campanhas no provider, upsert `marketplace_promotions`, para status “vivos” busca itens e upsert `marketplace_promotion_items` | `{ integrationId }` | `{ ok, campaigns, items, upsertedCampaigns, failedCampaigns, failedItems, … }` — UI usa `campaigns` e `items` para toast |
| `promotions-cron-sync` | Itera integrações ML+Shopee ativas; mesmo fluxo de sync | `{}` (cron) | Resumo por integração |
| `promotions-create` | Cria campanha no marketplace + `upsertCampaign` local | `STANDARD_DISCOUNT`: `integrationId`, `promotionType`, `name`, `startDate`, `endDate`; Flash Shopee: `slotId` | `{ ok, id, … }` |
| `promotions-update` | Atualiza nome/datas | `integrationId`, `externalId`, `promotionType`, `name?`, `startDate?`, `endDate?` | `{ ok, campaign }` |
| `promotions-delete` | Encerra/remove no provider; marca `status=ended` local | `integrationId`, `externalId`, `promotionType`, `force?` (`auto`\|`end`\|`delete`) | `{ ok }` |
| `promotions-add-items` | Adiciona itens à campanha; resolve `discountPercent`→preço | `integrationId`, `externalId`, `promotionType`, `items[]` | `{ ok, successful[], failed[] }` |
| `promotions-update-items` | Atualiza preços/limites de itens já na campanha | `integrationId`, `externalId`, `promotionType`, `items[]` | `{ successful[], failed[] }` |
| `promotions-remove-item` | Remove item (e variação opcional); opcional `mlKind` | `integrationId`, `externalId`, `promotionType`, `marketplaceItemId`, `variationId?`, `mlKind?` | `{ ok }` |
| `promotions-list-flash-slots` | Shopee: slots disponíveis | `{ integrationId }` | `{ ok, slots[] }` ou lista vazia se não suportado |
| `promotions-ml-item-promotions` | ML: visão 360° por item | `{ integrationId, marketplaceItemId }` | `{ ok, promotions[] }` |
| `promotions-ml-exclusion-list` | ML: ler/toggle lista de exclusão campanhas automáticas | `{ integrationId, target: "seller"|"item", itemId?, exclusionStatus? }` | `{ ok, excluded }` |

### 6.1 Código compartilhado (Deno)

- `supabase/functions/_shared/adapters/promotions/factory.ts` — `resolvePromotionsAdapter`, `normalizeMarketplaceKey`.
- `supabase/functions/_shared/adapters/promotions/ml-promotions-adapter.ts` — ML API seller-promotions.
- `supabase/functions/_shared/adapters/promotions/shopee-promotions-adapter.ts` — Shopee discount / flash.
- `supabase/functions/_shared/adapters/promotions/db-upsert.ts` — `upsertCampaign`, `upsertCampaignItems`, `getIntegrationMeta`.
- `supabase/functions/_shared/domain/promotions/promotion-types.ts` — `UniversalCampaign`, `UniversalCampaignItem`, regras `MlPromotionKind`, etc.

---

## 7. Agendamento (pg_cron)

**Migration:** `20260505_000002_pgcron_promotions_sync.sql`

- Job nomeado `promotions-sync`, expressão `*/30 * * * *` (a cada 30 minutos).
- Chama `net.http_post` para `{supabase_url}/functions/v1/promotions-cron-sync` com Bearer do secret `pgcron_service_role_jwt`.

**Requisitos:** extensões `pg_cron` e `pg_net`; secrets no Vault `supabase_url` e `pgcron_service_role_jwt` (padrão já usado por outros crons do projeto).

---

## 8. Frontend — camadas

| Camada | Arquivos |
|--------|----------|
| Tipos | `src/types/promotions.ts` |
| Serviço (invoke + queries Supabase) | `src/services/promotions.service.ts`, `promotionKeys` |
| Hooks React Query | `src/hooks/usePromotions.ts` |
| UI promoções | `src/components/promotions/*` — `PromotionsTab`, `PromotionsList`, `PromotionDetailDrawer`, `AddItemsToPromotionDialog`, `PromotionTypeCard`, `promotionSegments`, `validators`, … |
| Páginas | `PromotionCreate.tsx`, `PromotionManage.tsx`, `ShopeeFlashSaleCreate.tsx`, `ShopeeFlashSaleManage.tsx` |
| Listagens | `src/pages/Listings.tsx` (aba Promoções) |
| Rotas | `src/App.tsx` |
| Util | `src/utils/marketplaceUtils.ts` — `normalizeMarketplaceKey`, `marketplaceListingsDataTable` |

**Padrão:** páginas/componentes não chamam `supabase.from` direto para domínio de promoções; usam hooks → serviço.

---

## 9. Métricas e qualidade

- **Sincronização:** contadores retornados por `promotions-sync` alimentam feedback ao usuário.
- **Erros:** Edge Functions tendem a responder `200` com `{ ok: false, error }` em falhas tratadas — o client deve checar `ok`.
- **Testes automatizados:** módulo ainda sem suite dedicada em Vitest (oportunidade: contratos de `promotionMatchesSegment` e parsers de resposta).

---

## 10. Checklist pós-deploy

1. Aplicar migrations `20260505_*`, `20260512_*` (ordem cronológica de arquivo).
2. Deploy das Edge Functions listadas na seção 6.
3. Confirmar `TOKENS_ENCRYPTION_KEY` e cron secrets.
4. Smoke test: abrir Anúncios → Promoções → Sincronizar → abrir drawer → adicionar item (conta de teste).

---

## 11. Referências internas

- Regras de segmentação ML: `src/components/promotions/promotionSegments.ts` (`ML_PROMOTION_SEGMENTS`, `SHOPEE_PROMOTION_SEGMENTS`).
- Documentação complementar ML (se existir no repo): `docs/integrations/mercado-livre-promocoes-central.md` (quando presente).

---

## 12. Changelog desta varredura (2026-05-12)

1. **SQL:** correção da migration `20260505_000001_create_marketplace_promotions.sql` (fechamento da tabela `marketplace_promotion_items` + índice único).
2. **Permissões:** `canCreatePromotion` volta a exigir `promote_create` (ou `owner`), removendo bypass `return true`.
3. **Código morto:** remoção do fluxo “participating listings” não utilizado na UI (`ParticipatingListingsPanel`, hook `useParticipatingListingRows`, funções correlatas no `promotions.service` e tipo `ParticipatingListingRow`).

---

## 13. Registro de deploy (produção / projeto vinculado)

**Data:** 2026-05-12  
**Projeto Supabase (ref):** `frwnfukydjwilfobxxhw`

### Migrações (schema)

- No histórico remoto já constavam **`create_marketplace_promotions`** e **`add_ml_kind_to_promotions`** (equivalentes às tabelas `marketplace_promotions` / `marketplace_promotion_items` e coluna `ml_kind`). Nenhuma reaplicação DDL duplicada foi necessária.

### Agendamento pg_cron

- Job **`promotions-sync`** (HTTP POST para `/functions/v1/promotions-cron-sync`, a cada **30 minutos**) foi **criado/atualizado** no banco (equivalente ao SQL em `supabase/migrations/20260505_000002_pgcron_promotions_sync.sql`). Depende dos secrets no Vault: `supabase_url`, `pgcron_service_role_jwt`.

### Edge Functions (redeploy via Supabase CLI)

Todas publicadas na versão atual do repositório (`feat/promocoes-modulo-producao`):

- `promotions-sync`, `promotions-create`, `promotions-update`, `promotions-delete`
- `promotions-add-items`, `promotions-update-items`, `promotions-remove-item`
- `promotions-list-flash-slots`, `promotions-cron-sync`
- `promotions-ml-item-promotions`, `promotions-ml-exclusion-list`
