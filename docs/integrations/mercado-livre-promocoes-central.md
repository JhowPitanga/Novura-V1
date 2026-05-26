# Central de Promoções — Mercado Livre

> Última atualização: maio/2026 • Fonte: [MCP docs ML](https://developers.mercadolivre.com.br/pt_br/gerenciar-ofertas) • Recurso base: `/seller-promotions` + `app_version=v2`

---

## 1. Visão geral

O endpoint `/seller-promotions` do Mercado Livre centraliza **todas** as modalidades de promoção disponíveis ao vendedor. Na Novura, o fluxo **Anúncios → Promoções (ML)** consome esse recurso por meio do `MlPromotionsAdapter` (edge functions `promotions-*`) e persiste os dados na tabela `marketplace_promotions`.

### Diagrama de fluxo

```
Notificações ML          API /seller-promotions           Edge Functions Novura
─────────────────        ─────────────────────────        ──────────────────────
public_candidate ──▶  GET /candidates/{id}       ──▶  promotions-sync (cron/manual)
public_offers    ──▶  GET /offers/{id}            ──▶  promotions-sync
                       GET /users/{userId}         ──▶  listCampaigns() → upsert DB
                       GET /promotions/{id}        ──▶  getCampaign()
                       GET /promotions/{id}/items  ──▶  getCampaignItems()
                       GET /items/{itemId}         ──▶  getMlItemPromotions()
                       POST /items/{itemId}        ──▶  promotions-add-items
                       PUT  /items/{itemId}        ──▶  promotions-update-items
                       DELETE /items/{itemId}      ──▶  promotions-remove-item
```

---

## 2. Tipos de campanha (ml_kind)

O campo `ml_kind` na tabela `marketplace_promotions` guarda o tipo nativo da API ML. O campo `promotion_type` mantém o valor universal (`STANDARD_DISCOUNT` | `FLASH_SALE`) para compatibilidade cross-marketplace.

| ml_kind | Nome exibido | Tipo universal | Criável pelo seller | Requer convite | Suporte Update in-place |
|---------|-------------|---------------|---------------------|----------------|-------------------------|
| `SELLER_CAMPAIGN` | Campanha do Vendedor | `STANDARD_DISCOUNT` | Sim | Não | Sim |
| `DEAL` | Campanha Tradicional | `STANDARD_DISCOUNT` | Não | Sim (deadline) | Sim |
| `MARKETPLACE_CAMPAIGN` | Co-participação | `STANDARD_DISCOUNT` | Não | Sim | Sim |
| `VOLUME` | Desconto por Quantidade | `STANDARD_DISCOUNT` | Não | Sim | Sim |
| `PRICE_DISCOUNT` | Desconto Individual | `STANDARD_DISCOUNT` | Sim | Não | **Não** — remover e reaplicar |
| `PRE_NEGOTIATED` | Pré-acordado por Item | `STANDARD_DISCOUNT` | Não | Sim | Sim |
| `SMART` | Co-participação Automatizada | `STANDARD_DISCOUNT` | Não | Automático | Sim |
| `PRICE_MATCHING` | Preços Competitivos | `STANDARD_DISCOUNT` | Não | Automático | Sim |
| `PRICE_MATCHING_MELI_ALL` | Preços Competitivos (variante) | `STANDARD_DISCOUNT` | Não | Automático | Sim |
| `UNHEALTHY_STOCK` | Liquidação Estoque Full | `STANDARD_DISCOUNT` | Não | Sim | Sim |
| `SELLER_COUPON_CAMPAIGN` | Cupons do Vendedor | `STANDARD_DISCOUNT` | Sim | Não | Sim |
| `BANK` | Co-participação PIX | `STANDARD_DISCOUNT` | Não | Sim | **Não** — remover e reaplicar preço |
| `LIGHTNING` | Oferta Relâmpago | `FLASH_SALE` | Não | Sim | **Não** — remover e reaplicar |
| `DOD` | Oferta do Dia | `FLASH_SALE` | Não | Sim | **Não** — remover e reaplicar |

> **Disponibilidade:** `SELLER_COUPON_CAMPAIGN` e `BANK` (PIX) disponíveis apenas para MLB (Brasil).
> **Limite de desconto global:** seller pode configurar até **80%** para `LIGHTNING`, `DOD`, `SELLER_CAMPAIGN`, `DEAL`, `PRICE_DISCOUNT`.

---

## 3. Fluxo de status

### Status da campanha

```
candidate ──▶ pending ──▶ started (active) ──▶ finished (ended)
                                └──▶ cancelled
```

| Status API | Status Novura |
|-----------|--------------|
| `started` | `active` |
| `pending` | `scheduled` |
| `finished` | `ended` |
| `cancelled` | `cancelled` |
| `candidate` | `candidate` |

### Status do item na campanha

| Status | Descrição |
|--------|-----------|
| `candidate` | Item elegível, aguardando opt-in |
| `pending` | Opt-in realizado, promoção ainda não iniciou |
| `started` | Item ativo na promoção |
| `finished` | Item removido ou promoção encerrada |
| `paused` | Item pausado |

---

## 4. Endpoints e contratos

### 4.1 Base

```
https://api.mercadolibre.com/seller-promotions/...?app_version=v2
Authorization: Bearer {ACCESS_TOKEN}
```

### 4.2 Listar promoções do vendedor

```http
GET /seller-promotions/users/{user_id}?app_version=v2
```

Retorna **todos os tipos** de promoção. Campos da resposta:

| Campo | Descrição |
|-------|-----------|
| `id` | ID da promoção (ex: `P-MLB123`, `C-MLB456`, `LGH-MLB789`) |
| `type` | Tipo nativo ML (ver tabela acima) |
| `status` | Status atual |
| `start_date` / `finish_date` | Período |
| `deadline_date` | Prazo para opt-in |
| `name` | Nome da campanha |
| `benefits` | `meli_percent`, `seller_percent` (co-participação) |

### 4.3 Consultar candidato (notificação)

```http
GET /seller-promotions/candidates/{candidate_id}?app_version=v2
```

Campo `candidate_id` obtido via notificação do tópico `public_candidate`.

### 4.4 Consultar oferta (notificação)

```http
GET /seller-promotions/offers/{offer_id}?app_version=v2
```

Campo `offer_id` obtido via notificação do tópico `public_offers`.

### 4.5 Detalhes da campanha

```http
GET /seller-promotions/promotions/{promotion_id}?promotion_type={ML_KIND}&app_version=v2
```

> Para `BANK` (PIX): `promotion_type=BANK`.

### 4.6 Itens da campanha

```http
GET /seller-promotions/promotions/{promotion_id}/items
    ?promotion_type={ML_KIND}&app_version=v2
    [&status=started|pending|candidate]
    [&status_item=active|paused]
    [&item_id={item_id}]
    [&limit=50&search_after={cursor}]
```

> `status_item=active` é o padrão quando omitido. Valor inválido → **400**.

**Paginação:** usar `search_after` (TTL ~5 min, sem paginação para trás). Máximo 50 por página.

### 4.7 Promoções de um item (visão 360°)

```http
GET /seller-promotions/items/{item_id}?app_version=v2
```

Retorna array com todas as promoções associadas ao item, incluindo campos por tipo (`stock`, `meli_percentage`, `fixed_amount`, `sub_type`, etc.).

### 4.8 Adicionar item à promoção (opt-in)

```http
POST /seller-promotions/items/{item_id}?app_version=v2
Content-Type: application/json

{
  "promotion_id": "{id}",
  "promotion_type": "{ML_KIND}",
  "offer_id": "{candidate_offer_id}",   // para convites
  "deal_price": 99.90,                  // SELLER_CAMPAIGN, DEAL
  "top_deal_price": 89.90,              // opcional, lealdade
  "stock": 5                            // LIGHTNING (obrigatório)
}
```

### 4.9 Atualizar item (in-place, apenas para tipos suportados)

```http
PUT /seller-promotions/items/{item_id}?app_version=v2
Content-Type: application/json

{
  "promotion_id": "{id}",
  "promotion_type": "{ML_KIND}",
  "deal_price": 89.90
}
```

> **NÃO** usar para `PRICE_DISCOUNT`, `DOD`, `LIGHTNING`, `BANK` — nesses casos, remover e reaplicar.

### 4.10 Remover item da promoção

```http
DELETE /seller-promotions/items/{item_id}
    ?promotion_type={ML_KIND}&promotion_id={id}&offer_id={offer_id}&app_version=v2
```

### 4.11 Delete massivo de todas as ofertas de um item

```http
DELETE /seller-promotions/items/{item_id}?app_version=v2
```

> **Não** se aplica a `DOD` e `LIGHTNING` — retorna HTTP 200 com erros por oferta.

---

## 5. Seção por modalidade

### 5.1 Campanha Tradicional (DEAL)

**Docs:** [campanhas-tradicionais](https://developers.mercadolivre.com.br/pt_br/campanhas-tradicionais)

- Vendedor indica itens com preço definido por ele.
- Requer `deadline_date` para aceitar o convite.
- Aprovação necessária.
- `promotion_type=DEAL` em todas as chamadas de items.

### 5.2 Campanha com Co-participação (MARKETPLACE_CAMPAIGN)

**Docs:** [campanha-com-co-participacao](https://developers.mercadolivre.com.br/pt_br/campanha-com-co-participacao)

- Desconto dividido entre MELI (`meli_percent`) e seller (`seller_percent`).
- Seller aceita o convite; preço é calculado automaticamente.
- Campos: `meli_percent`, `seller_percent`, `start_date`, `finish_date`.
- Sem deadline para criação; ML define as condições.

### 5.3 Desconto por Quantidade (VOLUME)

**Docs:** [campanhas-de-desconto-por-quantidade](https://developers.mercadolivre.com.br/pt_br/campanhas-de-desconto-por-quantidade)

- Modalidades: `BNGM` (leve N pague M), `BNSP` (leve N ganhe N% off), `SPONTH`.
- Campo `allow_combination` indica se itens diferentes podem ser combinados.
- `sub_type` no item indica a mecânica de desconto.
- `promotion_type=VOLUME` nas chamadas de items.

### 5.4 Pré-acordado por Item e Liquidação Estoque Full (PRE_NEGOTIATED / UNHEALTHY_STOCK)

**Docs:** [desconto-pre-acordado-por-item](https://developers.mercadolivre.com.br/pt_br/desconto-pre-acordado-por-item)

- Desconto negociado com agente comercial ML.
- Seller concorda e aceita a condição; MELI contribui com bonificação.
- `UNHEALTHY_STOCK` usa mesma mecânica para liquidação de Full.
- Usar `promotion_type=PRE_NEGOTIATED` ou `UNHEALTHY_STOCK` nas chamadas.

### 5.5 Desconto Individual (PRICE_DISCOUNT)

**Docs:** [desconto-individua](https://developers.mercadolivre.com.br/pt_br/desconto-individua)

- Seller cria/remove desconto direto em item específico.
- **Sem update in-place** — remover e reaplicar para alterar.
- Campos disponíveis no item: `min_discounted_price`, `max_discounted_price`, `suggested_discounted_price`.
- Não tem `promotion_id` fixo por campanha; é por item.

### 5.6 Ofertas do Dia (DOD)

**Docs:** [ofertas-do-dia](https://developers.mercadolivre.com.br/pt_br/ofertas-do-dia)

- Item convidado por ML; seller define preço e stock obrigatório.
- **Sem update in-place** — remover e reaplicar.
- `stock.min` e `stock.max` indicam faixa de estoque requerida.
- Não incluído no delete massivo — remover campanha por campanha.

### 5.7 Ofertas Relâmpago (LIGHTNING)

**Docs:** [ofertas-relampago](https://developers.mercadolivre.com.br/pt_br/ofertas-relampago)

- Convite por ML; stock obrigatório na adesão.
- **Sem update in-place** — remover e reaplicar.
- Não incluído no delete massivo.

### 5.8 Campanha do Vendedor (SELLER_CAMPAIGN)

**Docs:** [campanhas-do-vendedor](https://developers.mercadolivre.com.br/pt_br/campanhas-do-vendedor)

- **Único tipo que o seller cria** via API (`POST /seller-promotions/promotions`).
- `sub_type: FLEXIBLE_PERCENTAGE` — seller define o percentual por item.
- Update in-place via `PUT /seller-promotions/items/{item_id}`.
- Campos mínimos para criação: `promotion_type`, `sub_type`, `name`, `start_date`, `finish_date`.

### 5.9 Co-participação Automatizada e Preços Competitivos (SMART / PRICE_MATCHING)

**Docs:** [campanhas-smart-price-matching](https://developers.mercadolivre.com.br/pt_br/campanhas-smart-price-matching)

- ML cria automaticamente; seller pode recusar via lista de exclusão.
- `SMART`: co-financiado automático com ML.
- `PRICE_MATCHING` / `PRICE_MATCHING_MELI_ALL`: ML cobre toda diferença de preço para ser competitivo.
- Seller pode excluir seller ou item da automação (ver seção 6).

### 5.10 Cupons do Vendedor (SELLER_COUPON_CAMPAIGN)

**Docs:** [cupons-do-vendedor](https://developers.mercadolivre.com.br/pt_br/cupons-do-vendedor)

> **Disponível apenas para MLB (Brasil).**

- `sub_type`: `FIXED_PERCENTAGE` (desconto %) ou `FIXED_AMOUNT` (valor fixo R$).
- `fixed_percentage`: percentual do cupom.
- `fixed_amount`: valor fixo do cupom em R$.
- ID da campanha tem prefixo `C-MLB`.

### 5.11 Co-participação PIX (BANK / COFINANCED)

**Docs:** [campanha-co-participacao-para-pix](https://developers.mercadolivre.com.br/pt_br/campanha-co-participacao-para-pix)

> **Disponível apenas para MLB (Brasil).**

- `type: BANK`, `sub_type: COFINANCED`, `payment_method: PIX`.
- Desconto dividido: `meli_percentage` + `seller_percentage`.
- **Atualização de preço:** remover item → atualizar preço via fluxo normal → incluir novamente.
- Todas as chamadas usam `promotion_type=BANK`.

---

## 6. Lista de exclusão (campanhas automáticas)

Permite excluir seller ou item de campanhas automáticas (`SMART`, `PRICE_MATCHING`).

### Consultar exclusão do seller

```http
GET /seller-promotions/exclusion-list/seller?app_version=v2
```

Resposta: `{ "excluded": "not_excluded" | "excluded" }`

### Gerenciar exclusão do seller

```http
POST /seller-promotions/exclusion-list/seller?app_version=v2
{ "exclusion_status": "true" | "false" }
```

### Consultar exclusão de item

```http
GET /seller-promotions/exclusion-list/seller/{item_id}?app_version=v2
```

### Gerenciar exclusão de item

```http
POST /seller-promotions/exclusion-list/item?app_version=v2
{ "item_id": "{id}", "exclusion_status": "true" | "false" }
```

---

## 7. Erros comuns

| Código | Descrição | Causa provável |
|--------|-----------|---------------|
| `423_ENTITY_LOCKED` | Item temporariamente bloqueado | Retry após alguns segundos |
| `400_BAD_REQUEST` | Requisição inválida | `status_item` com valor diferente de `active`/`paused`; `promotion_type` errado |
| `401 / 403` | Token expirado | Renovar access token; o adapter faz 1 retry automático |

---

## 8. Mapeamento Novura ↔ ML

### Campos `marketplace_promotions`

| Coluna | Fonte ML | Observação |
|--------|----------|-----------|
| `promotion_type` | Mapeado pelo adapter | `STANDARD_DISCOUNT` ou `FLASH_SALE` |
| `ml_kind` | `row.type` da API ML | Tipo nativo completo (ex: `DEAL`, `BANK`) |
| `source` | Inferido por tipo | `seller_created` para `SELLER_CAMPAIGN`; `platform_invite` para convites |
| `status` | Mapeado por `mapMlStatusToUniversal` | started→active, pending→scheduled, etc. |
| `meli_percent` | `benefits.meli_percent` | Co-participação |
| `seller_percent` | `benefits.seller_percent` | Co-participação |
| `raw` | Resposta completa da API | Fonte de verdade para campos específicos por tipo |

### Edge functions e operações ML

| Edge Function | Operações ML suportadas |
|--------------|------------------------|
| `promotions-sync` | `listCampaigns` todos os tipos + `getCampaignItems` por `ml_kind` |
| `promotions-create` | `createStandardDiscount` → `SELLER_CAMPAIGN` |
| `promotions-add-items` | Opt-in para qualquer `ml_kind` (body: `mlKind`) |
| `promotions-update-items` | Update in-place para tipos que permitem |
| `promotions-remove-item` | Remoção para qualquer `ml_kind` (body: `mlKind`) |
| `promotions-delete` | Deletar campanha `SELLER_CAMPAIGN` |

---

## 9. Ambiente de testes

Para testar com campanhas reais de teste, adicionar `version=test` às chamadas:

```http
GET /seller-promotions/users/{user_id}?app_version=v2&version=test
```

Preencher [formulário de testes ML](https://docs.google.com/forms/d/e/1FAIpQLSenA_USmZQb8deHLrjhO_Rx1oOqfsj--Rhv-f_L1SebEJRBjA/viewform) com usuário e itens de teste.

---

## 10. Referências

| Tema | URL |
|------|-----|
| Hub de promoções | https://developers.mercadolivre.com.br/pt_br/gerenciar-ofertas |
| Campanhas tradicionais (DEAL) | https://developers.mercadolivre.com.br/pt_br/campanhas-tradicionais |
| Co-participação (MARKETPLACE_CAMPAIGN) | https://developers.mercadolivre.com.br/pt_br/campanha-com-co-participacao |
| Desconto por quantidade (VOLUME) | https://developers.mercadolivre.com.br/pt_br/campanhas-de-desconto-por-quantidade |
| Pré-acordado + Liquidação Full | https://developers.mercadolivre.com.br/pt_br/desconto-pre-acordado-por-item |
| Desconto individual (PRICE_DISCOUNT) | https://developers.mercadolivre.com.br/pt_br/desconto-individua |
| Ofertas do dia (DOD) | https://developers.mercadolivre.com.br/pt_br/ofertas-do-dia |
| Ofertas relâmpago (LIGHTNING) | https://developers.mercadolivre.com.br/pt_br/ofertas-relampago |
| Campanhas do vendedor (SELLER_CAMPAIGN) | https://developers.mercadolivre.com.br/pt_br/campanhas-do-vendedor |
| Smart + Preços competitivos | https://developers.mercadolivre.com.br/pt_br/campanhas-smart-price-matching |
| Cupons do vendedor (SELLER_COUPON_CAMPAIGN) | https://developers.mercadolivre.com.br/pt_br/cupons-do-vendedor |
| Co-participação PIX (BANK) | https://developers.mercadolivre.com.br/pt_br/campanha-co-participacao-para-pix |
| Permissões OAuth | https://developers.mercadolivre.com.br/pt_br/permissoes-funcionais |
