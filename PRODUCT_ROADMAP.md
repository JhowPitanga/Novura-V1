# PRD — Novura ERP
**Versão 1.0 | Fevereiro 2026**

> *"O ERP que te mostra onde seu dinheiro está — antes de te pedir qualquer configuração."*

---

## 1. Executive Summary

Novura is a SaaS ERP built for small Brazilian e-commerce sellers operating on Mercado Livre and Shopee. Unlike Bling and Tiny — which demand hours of configuration before delivering any value — Novura's core promise is: **connect your marketplace and understand your business in under 5 minutes.**

The product is built around two convictions:
1. Small sellers don't have time to configure tools. They need insight before effort.
2. The biggest problem for small sellers isn't managing orders — it's not knowing their real margin, real cash position, or real cost per sale.

Novura enters through insight and retains through operations.

---

## 2. Problem Statement

### Current Situation
Brazilian e-commerce is dominated by Bling and Tiny in the ERP segment. Both products were built for general retail — not specifically for marketplace sellers. Over time they've accumulated features that serve medium and large businesses but create overwhelming complexity for small sellers.

A typical new seller experience with Bling or Tiny:
- Create account
- Configure fiscal regime, CFOP, tax rules
- Set up warehouses
- Configure carriers
- Import products manually or via file
- Set up chart of accounts
- Then, maybe, start seeing orders

Most small sellers give up or use only 20% of the product.

### User Pain Points

| Pain | Current experience | Emotional cost |
|---|---|---|
| Setup complexity | Hours of config before any value | "Esse negócio é complicado demais" |
| Margin blindness | Sees GMV, not real profit | "Achei que estava ganhando dinheiro" |
| Cash flow opacity | Doesn't know when MP releases money | "Não sei se tenho dinheiro pra repor estoque" |
| Reactive operations | Finds out about problems too late | Stock-outs, reputation drops, wasted ADS |
| ADS waste | No visibility into ADS ROI per product | Spending on ads that destroy margin |

### Business Impact
- Sellers who don't understand their margin can't price correctly, can't scale, and can't reinvest confidently
- Cash flow opacity causes missed restocking opportunities and unnecessary stress
- No proactive alerts means problems compound before they're visible

---

## 3. User Persona

### "O Vendedor em Crescimento" — Primary Persona

**Profile:**
- Name: Rafael, 28 anos, São Paulo
- Revenue: ~R$80k–120k/month on ML, mostly single-category (electronics accessories or home goods)
- Team: Solo or 1 part-time helper
- Tech comfort: High for consumer apps, low for business software
- Current tool: Using ML's native panel + manual spreadsheet, or recently signed up for Bling and gave up during setup

**Goals:**
- Know if he's actually making money (not just selling)
- Understand when money will hit his account so he can restock
- Spend less time on admin, more time on sourcing and pricing

**Frustrations:**
- "O Bling tem tudo mas eu não entendo nada"
- "Olho pro painel do ML e só vejo o total de vendas, não sei o que sobrou"
- "Às vezes fico sem estoque e nem percebi que ia acabar"

**Trigger for switching:** A friend mentions Novura, or he sees an ad. He signs up, connects ML, and within 5 minutes sees that he's losing R$3.200/month in fees he didn't know about. He doesn't leave.

---

## 4. Success Metrics

### Primary Metrics (North Star)

| Metric | Target | Why |
|---|---|---|
| Time to first insight | < 5 min from ML OAuth | Measures onboarding promise |
| 7-day retention | > 60% | Did the product become a habit? |
| Activation depth — cost input | > 40% of users | Are they going deeper? |
| Mercado Pago connect rate | > 30% of activated users | Progressive trust working? |

### Secondary Metrics

| Metric | Target |
|---|---|
| Diagnóstico "wow" moment (scroll + dwell > 60s) | > 70% of new users |
| Weekly active usage ("Seu Caixa" opened) | > 50% of retained users |
| NPS at day 30 | > 50 |
| Churn at 90 days | < 20% |

### Anti-metrics (things we must NOT optimize for)
- Feature breadth — more features ≠ better product for this segment
- Time on platform — Novura should be fast and useful, not sticky through complexity

---

## 5. Shape Up Cycles

### How Shape Up Works for Novura

- **Cycles:** 6 weeks of building, 2 weeks of cooldown (no new features — bug fixes, exploration, rest)
- **Bets:** Leadership places bets at the betting table. Only shaped work gets a cycle.
- **Appetite:** Fixed time, variable scope. If it doesn't fit in 6 weeks, we cut scope — we don't extend the cycle.
- **No backlog:** Unbuilt ideas are not tracked forever. If they're important, they resurface. If they don't, they weren't.

---

## Cycle 0 — "Plataforma de Pedidos" (Pré-lançamento)

**Appetite:** 6 weeks | **Team:** 1 backend engineer + 1 fullstack engineer

> This cycle is invisible to end users but is the prerequisite for every feature in Cycles 1–3. You cannot build reliable margin calculation, Diagnóstico, NFe emission, or stock intelligence on top of a broken orders foundation. Cycle 0 ships nothing to users — it makes everything else possible.

### Problem

The current orders system was built incrementally without a deliberate data model. As a result:
- Commission and shipping fees are not stored in a normalized, queryable structure
- Order items (individual SKUs) are not properly linked to internal products
- Order sync has no idempotency guarantee — running it twice can create duplicate orders
- NFe emission has no idempotency — the same order can be invoiced twice (legal and financial risk)
- There is no status history — only the current status is stored, making analytics impossible
- Business logic lives in the frontend instead of the service/database layer

Every feature in Cycles 1–3 depends on trustworthy order data. Building on the current foundation means every analysis feature will show wrong numbers, and every operational feature will be fragile.

### The Bet

**Rebuild the orders data model and sync infrastructure as marketplace-agnostic from day one — so that ML and Shopee orders flow into the same tables, follow the same contracts, and produce the same trustworthy data — before a single real user sees the product.**

The UI in Cycle 1 is ML-only. The data layer in Cycle 0 supports both. When Shopee reaches the frontend in Cycle 3, the backend work is already done.

---

### What We Found in the Existing Schema

The current codebase evolved into an 87-column `marketplace_orders_presented_new` table that mixes order data, buyer info, shipping address, shipment tracking, payment info, item data (first item only), billing info, label binary data (PDFs and ZPL files stored inline), and NFe status — all in one table. Order items exist in three separate places simultaneously with no single source of truth.

**What is kept:**
- `marketplace_orders_raw` — raw archive of marketplace API responses. Never queried for display. Correct pattern, keep as-is.
- `notas_fiscais` structure — mostly correct. Renamed to `invoices` and improved.

**What is replaced:**
- `marketplace_orders_presented_new` (87 columns) → split into 6 focused tables below.

---

### Canonical Data Model

**`orders`** — core operational data, ~25 columns
```sql
id                    uuid PK default gen_random_uuid()
organization_id       uuid FK → organizations NOT NULL
marketplace           text NOT NULL          -- 'mercado_livre' | 'shopee'
marketplace_order_id  text NOT NULL
pack_id               text                   -- ML pack (multiple orders in one shipment)
status                text                   -- marketplace status: paid | shipped | delivered | canceled
internal_status       text                   -- seller workflow: printed | picked | linked | etc.
payment_status        text                   -- pending | released | held | disputed
gross_amount          numeric(18,2)          -- total before any deductions
marketplace_fee       numeric(18,2)          -- ML/Shopee commission
shipping_cost         numeric(18,2)          -- shipping charged to seller
shipping_subsidy      numeric(18,2)          -- ML subsidy (reduces shipping cost)
net_amount            numeric(18,2)          -- pre-calculated: gross - fee - shipping + subsidy
buyer_name            text
buyer_document        text                   -- CPF/CNPJ (needed for NFe emission)
buyer_state           text                   -- for geographic analytics
created_at            timestamptz
shipped_at            timestamptz
delivered_at          timestamptz
canceled_at           timestamptz
last_synced_at        timestamptz

UNIQUE (organization_id, marketplace, marketplace_order_id)
```

**`order_items`** — one row per SKU per order (replaces JSONB blobs + first_item_* columns)
```sql
id                    uuid PK default gen_random_uuid()
order_id              uuid FK → orders NOT NULL
product_id            uuid FK → products nullable  -- linked to internal product
marketplace_item_id   text
sku                   text
title                 text
quantity              integer NOT NULL default 1
unit_price            numeric(18,2) NOT NULL
unit_cost             numeric(18,2)          -- filled when product linked (drives margin calc)
variation_name        text
image_url             text
```

**`order_shipping`** — shipping and delivery details (replaces 20+ shipping_* columns)
```sql
id                    uuid PK default gen_random_uuid()
order_id              uuid FK → orders UNIQUE NOT NULL
shipment_id           text                   -- marketplace shipment ID
logistic_type         text                   -- FULFILLMENT | SELF_SERVICE | ME2
tracking_number       text
carrier               text
status                text
substatus             text
street_name           text
street_number         text
neighborhood          text
city                  text
state_uf              text
zip_code              text
sla_expected_date     timestamptz
sla_status            text
estimated_delivery    timestamptz
```

**`order_status_history`** — append-only, never updated
```sql
id                    uuid PK default gen_random_uuid()
order_id              uuid FK → orders NOT NULL
from_status           text
to_status             text NOT NULL
changed_at            timestamptz NOT NULL default now()
source                text NOT NULL   -- 'webhook' | 'sync' | 'user' | 'system'
```

**`order_labels`** — binary label data separated from orders (was inline in marketplace_orders_presented_new)
```sql
id                    uuid PK default gen_random_uuid()
order_id              uuid FK → orders UNIQUE NOT NULL
label_type            text    -- 'pdf' | 'zpl2'
content_base64        text
content_type          text
size_bytes            integer
fetched_at            timestamptz
```

**`invoices`** — replaces `notas_fiscais`, linked one-to-one with orders
```sql
id                    uuid PK default gen_random_uuid()
organization_id       uuid FK → organizations NOT NULL
order_id              uuid FK → orders NOT NULL
company_id            uuid FK → companies NOT NULL
idempotency_key       text UNIQUE NOT NULL   -- prevents double emission at DB level
focus_id              text
nfe_number            integer
nfe_key               text
serie                 text
status                text   -- 'pending' | 'queued' | 'processing' | 'authorized' | 'rejected' | 'canceled'
emission_environment  text   -- 'producao' | 'homologacao'
xml_url               text
pdf_url               text
marketplace                   text
marketplace_order_id          text
marketplace_submission_status text
marketplace_submission_at     timestamptz
total_value           numeric(18,2)
payload_sent          jsonb   -- full payload sent to Focus NFe (audit)
error_message         text
error_code            text
retry_count           integer default 0
emitted_at            timestamptz
authorized_at         timestamptz
canceled_at           timestamptz
created_at            timestamptz default now()
```

---

### What Each Design Decision Enables

| Decision | Feature it enables |
|---|---|
| `net_amount` pre-calculated on `orders` | Diagnóstico money leaks — instant DB read, no runtime aggregation |
| `order_items` as proper rows | Margem real por pedido (Cycle 1) — every SKU queryable individually |
| `order_items.unit_cost` | True margin per item once product is linked |
| `order_shipping` separate table | Order list queries never touch shipping data unless needed |
| `order_labels` separate table | Order list queries never load binary PDF/ZPL content |
| `order_status_history` append-only | Avg fulfillment time, cancellation patterns, "Seu Caixa" weekly trends |
| `invoices.idempotency_key` UNIQUE | Physically impossible to emit two invoices for the same order |
| `buyer_state` on `orders` | Geographic breakdown in analytics |
| `internal_status` separate from `status` | Seller workflow without conflicting with marketplace status |
| UNIQUE on `(organization_id, marketplace, marketplace_order_id)` | Idempotent sync — duplicate orders physically impossible |

---

### Migration Strategy

**Do not migrate the existing data.**

`marketplace_orders_raw` is the source of truth. The path forward is:

1. Create the new tables alongside the existing ones (no data yet)
2. Rewrite sync functions to write to the new schema
3. Re-sync the last 90 days from ML/Shopee API into the new tables
4. Keep `marketplace_orders_presented_new` alive (read-only) while the frontend migrates
5. Drop `marketplace_orders_presented_new` and `notas_fiscais` once all queries point to the new tables

Clean re-sync is faster and safer than writing transformation SQL for 87 columns of mixed JSONB and normalized data.

---

### Edge Functions: Three Principles, Not a Framework

At this stage, no event-driven architecture, no message queues, no event tables. Those solve problems you don't have yet. What you need is three principles applied consistently to every function:

**Principle 1 — Single responsibility**
One function does one thing. If you can't describe what it does in one sentence without "and", split it. Small functions are better than smart functions. Supabase edge functions are cheap to create.

**Principle 2 — UPSERT everywhere, INSERT nowhere**
Every sync operation uses `UPSERT` on a natural unique key (`marketplace_order_id`). Running the same function twice produces the same result. Duplicates become physically impossible without any extra infrastructure.

**Principle 3 — Errors are data, not exceptions**
`try/catch` on every external call (ML API, Shopee API, Focus NFe). Log failures with context. Return structured errors: `{ success: false, error: 'focus_timeout', order_id: '...' }`. Never swallow errors silently.

---

### Functions to Split and Rebuild

#### Marketplace-agnostic design rule
Every sync and webhook function must treat `marketplace` as a parameter, not a hardcoded assumption. The same `orders-upsert` function handles an ML order and a Shopee order identically — the only difference is the `marketplace` column value and the upstream fetch function that calls it.

**`orders-fetch-ml`** — calls ML API, returns normalized order payload
**`orders-fetch-shopee`** — calls Shopee API, returns normalized order payload (same output shape as ML)
**`orders-upsert`** — marketplace-agnostic: receives normalized payload, writes to `orders` + `order_items` + `order_shipping` via UPSERT. Called by both fetch functions.
**`orders-sync-ml`** — orchestrates `orders-fetch-ml` + `orders-upsert` for a date range. Returns `{ synced: N, failed: N, errors: [...] }`
**`orders-sync-shopee`** — same orchestration for Shopee

The upsert logic is written once. Both marketplaces use it.

**`process-order-webhook`** (in Cycle 0 spec: `orders-webhook`)
- Validate webhook signature first — invalid signatures return 401, nothing is processed
- Detect marketplace from headers/payload, route to correct normalizer
- UPSERT via the shared `orders-upsert` logic — idempotent by design
- Write one row to `order_status_history` — append only, never update
- Return 200 immediately after DB write — no chained operations in the webhook handler

**How ML notifications work (Mercado Livre)**  
Each topic/entity can have notifications tied to specific events and actions; the integrator can subscribe to specific events within a topic via API filters. For orders, the recommended topic is **`orders_v2`** — notifications on creation and updates of confirmed sales. The webhook body does **not** contain the full order; it only identifies the resource, e.g.:

```json
{
  "resource": "/orders/2195160686",
  "user_id": 468424240,
  "topic": "orders_v2",
  "application_id": 5503910054141466,
  "attempts": 1,
  "sent": "2019-10-30T16:19:20.129Z",
  "received": "2019-10-30T16:19:20.106Z"
}
```

The handler must parse `resource` (e.g. `/orders/2195160686` → order ID `2195160686`), then **GET** the full order: `GET https://api.mercadolibre.com/orders/$ORDER_ID` with the seller's access token, then normalize and upsert.

**`emit-invoice`** *(renamed from emit-nfe)*
- Check `invoices` for existing row with `status = authorized` before calling Focus — if found, return it immediately
- Create `invoices` row with `status = queued` and `idempotency_key` before calling Focus API — if this write fails, nothing external has happened yet
- On Focus timeout: update to `status = processing`, increment `retry_count` — caller can retry safely
- Hard rule: never call the Focus API without an `invoices` record existing first

---

### When to revisit event-driven architecture

Add it when you have a concrete problem it solves:
- Multiple features need to react to the same trigger and keeping them in sync is causing bugs
- You have 4+ engineers where coordination overhead on shared functions is slowing you down
- You're processing volume where synchronous chains create real bottlenecks

None of these exist today. Revisit at Series A.

---

### UX Foundation for Orders

The order lifecycle must be explicit and visible to the seller. Every order state has a clear label, a clear next action (if any), and a clear error state.

**Order lifecycle:**
```
Pedido recebido
  → Pagamento confirmado → Em separação → NFe emitida → Enviado → Entregue
  → Cancelado (at any point before shipment)
  → Devolvido (after delivery)
```

**Error states (first-class citizens, not afterthoughts):**
- NFe rejeitada pela Sefaz: show Focus error code in plain Portuguese + suggested action
- Sync falhou: show which orders didn't sync, why, + retry button
- Pagamento retido no Mercado Pago: show reason + estimated release date
- Webhook não recebido: show "última sincronização há X horas" + manual sync button

**Loading states for long operations:**
- Order import: "Importando pedidos do Mercado Livre... 847 de 1.203"
- NFe batch emission: "Emitindo notas... 12 de 34 concluídas"
- Manual sync: spinner with "Sincronizando com o Mercado Livre..."

---

### Definition of Done

Cycle 0 is complete when all seven conditions are true:

1. ML order sync runs twice without creating duplicate rows
2. Shopee order sync runs twice without creating duplicate rows — writing to the same tables as ML
3. `net_amount` matches what the seller actually receives (tolerance: ±R$0,01) for both marketplaces
4. Invoice emission for the same order called twice produces one invoice, not two (`invoices.idempotency_key` enforces this)
5. Every order status change writes a row to `order_status_history`
6. An order with 3 SKUs creates 3 rows in `order_items`
7. Diagnóstico money leaks reads from pre-calculated `net_amount` — no runtime aggregation at query time

### Rabbit Holes to Avoid
- Do not build Shopee UI in this cycle — Cycle 0 is data layer only, Cycle 1 UI is ML-only
- Do not implement every possible fee type — commission, shipping, and subsidy are enough for Cycle 0
- Do not build the full order lifecycle UI — just ensure the data model supports it
- Do not migrate historical order data if it requires manual intervention — do a clean re-sync from both APIs

### No-Gos
- Shopee-specific frontend features (belongs in Cycle 3)
- New user-facing features of any kind
- Performance optimizations beyond basic indexing
- Multi-warehouse inventory logic

---

## Cycle 1 — "O Primeiro Minuto" (MVP)

**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

### Problem
A small seller hears about Novura, visits the product, and has to fill out forms and configure settings before seeing any value. They leave before understanding what Novura does for them. Bling and Tiny lose users at this same moment — not because the product is bad, but because onboarding demands too much before delivering anything.

### Shaped Solution

**The bet:** A seller connects their Mercado Livre account and sees real insights about their store in under 5 minutes — with zero configuration required.

**What we're building:**

1. **ML OAuth connect** — one button, standard OAuth flow. After authorization, Novura pulls the last 90 days of orders, product catalog, and inventory automatically.

2. **Diagnóstico automático** — shown immediately after import. Not a dashboard. A findings report, framed like a doctor's assessment:
   - Money leaks: "ML reteve R$X em comissões e R$Y em frete nos últimos 90 dias"
   - Best/worst net revenue products (commission + shipping as % of price, no CMV needed yet)
   - Simples Nacional tracker: "Você faturou R$X em [ano corrente]. Seu limite é R$480k."

3. **Product cost input** — after the diagnosis, a single CTA: "Adicione o custo dos seus produtos para ver sua margem real." One field per SKU. Unlocks true margin per order.

4. **Orders list** — basic view with real net margin per order once costs are entered. Replaces the ML orders panel with something richer.

**The flow:**
```
Landing page → Connect ML (OAuth) → Auto-import
→ Diagnóstico (immediate wow) → Add product costs
→ See real margin per order
```

### Rabbit Holes to Avoid
- Do not build a "setup wizard" with multiple steps before showing value. The diagnosis IS the onboarding.
- Do not try to calculate true margin in the diagnosis before the seller inputs costs. Use commission + shipping only — be transparent about what's estimated.
- Do not build complex inventory management in this cycle. Stock count only.
- Do not design for multiple warehouses, tax regimes, or multi-user teams. One seller, one store.

### No-Gos
- NFe emission (Cycle 3)
- Shopee integration (Cycle 3)
- ADS integration (Cycle 2)
- Mercado Pago integration (Cycle 2)
- Team permissions / multi-user

---

## Cycle 2 — "Seu Caixa"

**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

### Problem
The seller now understands their margin per order. But two questions remain unanswered: "Quando meu dinheiro cai na conta?" and "Estou gastando certo nos anúncios?" These are the two biggest blind spots after margin — and they're what determines whether Novura becomes a daily habit or a monthly check-in.

### Shaped Solution

**The bet:** Sellers open Novura every week because it tells them where their cash is and whether their ads are working — not because they remember to check.

**What we're building:**

1. **Mercado Pago integration** — triggered by a contextual CTA in the diagnosis screen, never forced. Once connected:
   - Saldo disponível agora
   - A liberar em 7 / 14 / 30 dias
   - Retido por disputas abertas
   - Visual: a simple timeline, not a table

2. **"Seu Caixa" — weekly insight screen** — the Monday morning view:
   - Receita bruta da semana
   - O que o ML reteve
   - Margem real (com custo do produto)
   - Dinheiro disponível vs. a liberar
   - One alert: the most important thing to act on this week

3. **Stock intelligence:**
   - "Produto X vai zerar em ~8 dias no ritmo atual"
   - "Você tem R$X parado em produtos sem venda há 45 dias" (framed as trapped cash)
   - Alert-driven, not a table to check manually

4. **ADS efficiency** — ML ADS integration:
   - Gasto em ADS por produto vs. margem por produto
   - "Você está pagando R$X por venda anunciada neste produto. Sua margem é R$Y."
   - Flag: products with negative ROI after ADS

### Rabbit Holes to Avoid
- Do not build a full cash flow projection tool. The payment timeline is enough for this cycle.
- Do not try to do order-level ADS attribution. Blended model (daily spend / daily orders) is good enough and honest about its limitations.
- Do not make "Seu Caixa" a configurable dashboard. It's opinionated — one screen, curated for small sellers.
- Stock intelligence should be alerts, not a new page. Surface them where the seller already is.

### No-Gos
- Custom date range pickers for the weekly summary (weekly is the default, always)
- Multi-campaign ADS breakdown (product-level is enough)
- Supplier integration (Cycle 4)

---

## Cycle 3 — "Visibilidade e Conformidade"

**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

### Problem
The seller understands their margin and cash flow. Now they face two different pressures: their listings are underperforming and they don't know why, and they need to emit NFe but find it intimidating. Both problems are keeping them from growing and staying compliant.

### Shaped Solution

**The bet:** Sellers can understand why a listing isn't converting and emit NFe without needing an accountant to set it up.

**What we're building:**

1. **Listing performance** — per listing, using ML's impressions and visit data:
   - Visitas, taxa de conversão, comparação com média da categoria
   - Simple signal: green (above average), yellow (below), red (far below)
   - One suggested action per underperforming listing — not generic tips, category-specific

2. **Reputation risk alerts** — proactive, before the thermometer changes:
   - Reclamações abertas e prazo para resposta
   - Tempo médio de envio vs. limite do ML
   - "Você está a X reclamações de mudar de cor"

3. **NFe emission — simplified for Simples Nacional:**
   - Default regime: Simples Nacional. No chart of accounts. No complex tax rules.
   - Emit NFe directly from the order view — one click per order
   - Batch emission for multiple orders
   - Smart defaults: CFOP, CST, alíquota pulled from product category

4. **Basic Shopee integration** — connect Shopee store, import orders and products. Diagnosis extends to Shopee data. No ADS or advanced features yet.

### Rabbit Holes to Avoid
- Do not build a full listing editor inside Novura. The action should link to ML — don't replicate ML's interface.
- NFe must not require the seller to understand fiscal terminology. Every field needs plain Portuguese labels with tooltips.
- Do not support Lucro Real or Lucro Presumido tax regimes in this cycle. Simples Nacional only.
- Shopee integration: orders and products only. No Shopee ADS, no Shopee-specific analytics.

### No-Gos
- Price comparison vs. competitors (requires scraping infrastructure, Cycle 4+)
- NFe for marketplace orders with DIFAL (too complex for this segment)
- Shopee ADS integration

---

## Cycle 4 — "Dropshipping e Automação"

**Appetite:** 6 weeks | **Team:** 1 designer + 2 engineers

### Problem
A growing segment of Novura's users are dropshippers. Their biggest operational pain is manually forwarding orders to suppliers and updating tracking codes — work that takes hours per week and introduces errors. Meanwhile, their product costs change when supplier prices change, but they're still manually updating costs in Novura.

### Shaped Solution

**The bet:** A dropshipping seller can connect their supplier and have Novura handle the entire order forwarding + tracking loop — making it the operational backbone of their business, not just an analytics tool.

**What we're building:**

1. **Supplier integration** — connect to major Brazilian dropshipping suppliers:
   - When ML order arrives → Novura auto-forwards to supplier
   - Supplier ships → tracking code returned to Novura → auto-updated on ML listing
   - Manual override always available

2. **Supplier cost sync** — supplier's product price automatically updates the cost in Novura:
   - Margin recalculated in real time when supplier changes price
   - Alert: "Fornecedor X aumentou o preço de 3 produtos. Sua margem caiu para X%."

3. **Price positioning** — compare your listing price vs. top competitors in the same category:
   - "Você é o mais barato entre 14 vendedores. Pode subir R$8 sem perder competitividade."
   - "Concorrente X baixou o preço na semana passada — suas vendas caíram 18%."

### Rabbit Holes to Avoid
- Do not build a supplier marketplace or directory. Integration first, discovery later.
- Price positioning must use ML's own data where possible. Avoid building a scraper from scratch.
- Auto-forwarding must have a clear manual override — do not make it fully automatic without seller confirmation in the first version.

### No-Gos
- International supplier integration (AliExpress, 1688) in this cycle — national suppliers only
- Automated repricing (changing your ML price automatically) — too risky for v1

---

## Betting Table Summary

| Cycle | Theme | Core Bet | Key Output |
|---|---|---|---|
| 1 | O Primeiro Minuto | Sellers see real margin in 5 min | ML connect + Diagnóstico + cost input |
| 2 | Seu Caixa | Sellers open Novura every week | MP integration + stock alerts + ADS efficiency |
| 3 | Visibilidade e Conformidade | Sellers grow and stay compliant | Listing performance + NFe + Shopee |
| 4 | Dropshipping e Automação | Operational backbone for dropshippers | Supplier connect + price positioning |

---

## Cooldown Periods (Between Each Cycle)

Each 2-week cooldown is used for:
- Bug fixes from the previous cycle
- User interviews with early sellers
- Shaping the next cycle's work (designers + PMs only)
- Technical debt that would block the next cycle
- Nothing gets shipped to users during cooldown

---

## 6. Feature Requirements by Cycle

### Cycle 1 — F1.1: ML OAuth Connect

**User story:** As a new seller, I want to connect my Mercado Livre account with one click so that Novura can access my store data without me manually inputting anything.

**Functional requirements:**
- Standard ML OAuth 2.0 flow
- On authorization, pull automatically: last 90 days of orders (with commission and shipping cost per order), full product catalog, current inventory levels
- Show a loading state with real progress ("Importando 847 pedidos...") — not a spinner
- On completion, redirect immediately to Diagnóstico

**Acceptance criteria:**
- Connect-to-diagnosis flow completes in under 90 seconds for stores with up to 1000 orders
- If ML API is slow or fails, show a clear message and retry option — never a blank screen
- No form fields required before or during connection

---

### Cycle 1 — F1.2: Diagnóstico Automático

**User story:** As a newly connected seller, I want to immediately see what's wrong or notable about my store so I have a reason to keep using Novura.

**Functional requirements:**

Block 1 — Money Leaks (always shown):
- "Nos últimos 90 dias, o ML reteve R$X em comissões e R$Y em frete"
- Visual: Receita bruta → deduções → Receita líquida (simple waterfall)

Block 2 — Produto com pior custo de plataforma (always shown):
- "Seu produto com maior peso de taxa é [Produto X] — ML leva R$Y por venda (Z% do preço)"

Block 3 — Simples Nacional Tracker (always shown):
- "Você faturou R$X em [ano corrente]. Seu limite do Simples Nacional é R$4,8M."
- Progress bar. Yellow above 60%, red above 80%.

Block 4 — CTA to unlock true margin:
- "Adicione o custo dos seus produtos para ver sua margem real por pedido →"

**Design requirements:**
- Each finding: bold number → plain Portuguese sentence → business implication
- No jargon. No "EBITDA", no "markup", no "CMV" — use "custo do produto"
- Mobile-first layout

**Acceptance criteria:**
- Diagnóstico rendered within 5 seconds of import completion
- All numbers derived from actual imported data — no dummy/sample data ever shown
- If a block cannot be calculated, it is hidden — not shown as zero or error

---

### Cycle 1 — F1.3: Product Cost Input

**User story:** As a seller who wants to see real margin, I want to enter the cost of each product once so Novura can calculate my true profit per order.

**Functional requirements:**
- List of products sorted by sales volume (most sold first)
- One field per product: "Custo do produto (R$)"
- Products without cost show margin as "Margem parcial (sem custo do produto)" — transparent, not misleading
- Costs saved permanently, editable at any time

**Acceptance criteria:**
- Seller can input costs for 10 products in under 3 minutes
- Saving a cost immediately recalculates margin for all historical orders of that product
- No cost = no margin shown (never shows R$0 as margin)

---

### Cycle 1 — F1.4: Orders List with Real Margin

**Functional requirements:**
- Table: Date, Product, Sale price, ML commission, Shipping cost, Product cost, Net margin (R$ and %)
- Color-coded margin: green (>20%), yellow (5–20%), red (<5% or negative)
- Filter by: date range, marketplace, margin range
- Sort by: date, margin %, net value

---

### Cycle 2 — F2.1: Mercado Pago Integration

**Trigger:** Contextual CTA in Diagnóstico — never shown as a setup step.

**Functional requirements:**
- Separate OAuth for Mercado Pago
- Pull: available balance, scheduled releases (7/14/30 days), held amounts
- Visual: horizontal timeline of cash releases — not a table

---

### Cycle 2 — F2.2: "Seu Caixa" Weekly Screen

**Functional requirements:**
- Shown by default on Monday (or first login of the week)
- Receita bruta, ML deductions, margem real, Mercado Pago balance, 1 alert card
- Not configurable — opinionated, curated for this segment
- Never shows more than 1 alert — if multiple exist, show the highest priority

---

### Cycle 2 — F2.3: Stock Intelligence

**Functional requirements:**
- Stock-out prediction: current stock ÷ avg daily sales (last 30 days)
- Dead stock: products with zero sales in 45+ days, shown as total trapped cash value
- Lost sales estimate for products that went out of stock
- Only shown when at least 14 days of sales history exists

---

### Cycle 2 — F2.4: ADS Efficiency per Product

**Functional requirements:**
- ML ADS integration (separate OAuth, contextual CTA)
- Per product: daily ADS spend vs. net margin per unit
- Flag products where ADS cost > 50% of margin
- Blended attribution model with transparent disclaimer

---

### Cycle 3 — F3.1: Listing Performance

**Functional requirements:**
- Per listing: impressions, visits, conversion rate vs. category average
- Color signal: green / yellow / red
- One contextual suggestion per underperforming listing

---

### Cycle 3 — F3.2: Reputation Risk Alerts

**Functional requirements:**
- Monitor: open complaints, avg shipping time, mediation count
- Alert thresholds aligned with ML's penalty rules
- Proactive framing: "Você está a X eventos de mudar de cor"

---

### Cycle 3 — F3.3: NFe Emission (Simples Nacional only)

**Functional requirements:**
- One-click emit from order view
- Smart defaults: CFOP, CST, alíquota from product category
- Batch emission for multiple orders
- All field labels in plain Portuguese with tooltips
- Lucro Real and Lucro Presumido: out of scope

---

### Cycle 3 — F3.4: Basic Shopee Integration

**Functional requirements:**
- Connect Shopee via OAuth
- Import: orders (90 days), product catalog, inventory
- Diagnóstico extends to include Shopee data
- Orders list shows Shopee + ML orders with marketplace tag

---

### Cycle 4 — F4.1: Supplier Integration

**Functional requirements:**
- Connect national dropshipping suppliers
- Auto-forward order to supplier when ML order confirmed
- Receive tracking code, auto-update on ML
- Manual override always available
- First version: seller confirms auto-forwarding per order

---

### Cycle 4 — F4.2: Supplier Cost Sync

**Functional requirements:**
- Supplier price changes auto-update product cost in Novura
- Alert when margin changes due to supplier price update
- Seller approves or overrides cost update

---

### Cycle 4 — F4.3: Price Positioning

**Functional requirements:**
- Compare seller's price vs. top competitors in the same ML category
- Two signals: "pode subir o preço" and "preço acima da média"
- Correlation view: price changes vs. visit/sales trend

---

## 7. Technical Requirements (Cross-Cycle)

| Requirement | Detail |
|---|---|
| ML API | OAuth 2.0, orders, products, inventory, impressions, ADS endpoints |
| Mercado Pago API | Balance, scheduled releases, disputes |
| ML ADS API | Campaign spend by product |
| Shopee API | Orders, products, inventory |
| Multi-tenant | All data isolated by `organization_id` |
| Real-time | Order status updates via Supabase real-time subscriptions |
| NFe | Focus NFe integration |
| Performance | Import of 1000 orders < 90 seconds |
| Mobile | Diagnóstico and "Seu Caixa" fully usable on mobile |

---

## 8. Design Requirements (Cross-Cycle)

- **Language:** All UI in Portuguese (pt-BR). No English labels visible to users.
- **Tone:** Direct, human, non-technical. Never use "EBITDA", "markup", "CMV", "CFOP" without plain-language explanation.
- **Framing:** Every insight: finding → business implication → suggested action.
- **Alerts:** Maximum 1 alert surfaced at a time. Priority: cash risk > stock risk > reputation risk > ADS waste.
- **Progressive disclosure:** Never show a feature before the seller has the integration that powers it.
- **Empty states:** No blank screens. If data is missing, explain why and what to do.

---

## 9. Out of Scope (All Cycles)

- Multiple warehouses / fulfillment centers
- Multiple tax regimes (Lucro Real, Lucro Presumido)
- Chart of accounts / accounting module
- Complex team permissions
- Amazon BR, Magazine Luiza, Americanas integrations
- Automated repricing
- International supplier integrations (AliExpress, 1688)
- Financial forecasting beyond 30-day cash releases
- B2B / wholesale order management
- Custom report builder

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ML API rate limits slow import | Medium | High | Batch imports with queue, show progress to user |
| Diagnóstico shows wrong numbers and breaks trust | Low | Critical | Extensive QA on fee calculation logic per ML category |
| Seller inputs wrong product cost → wrong margin | High | Medium | Show disclaimer, allow easy editing, never hide cost from view |
| MP OAuth adoption too low (<15%) | Medium | Medium | A/B test CTA placement and copy |
| NFe emission errors cause compliance issues | Low | Critical | Use Focus NFe as intermediary; never emit without seller confirmation |
| Competitors copy the Diagnóstico feature | High | Medium | Moat is ML API depth + MP integration, not just the UI |
| Simples Nacional limit incorrect (multi-channel revenue) | Medium | Medium | Disclaimer: "Baseado apenas nas vendas importadas para o Novura" |

---

## 11. Open Questions

1. **NFe for Cycle 1 or 3?** Some early users will need NFe immediately — consider a simplified emit-only flow in Cycle 1.
2. **Shopee priority:** If first trial users are ML-only, can Cycle 3's Shopee work be deferred to Cycle 4?
3. **Mobile app:** Responsive web only for Cycle 1, or is there a case for mobile-native?

---

## 12. Monetization & Billing

### Model Overview

**Freemium + 14-day free trial. Single plan. No credit card required to start.**

The model has three states for every organization:

```
Free (permanent)
  └── Diagnóstico + ML connect always available, no time limit

Trial (14 days, no credit card)
  └── Full product access unlocked automatically after first ML connection
  └── Countdown shown transparently: "X dias restantes do seu período gratuito"

Paid (R$149/mês)
  └── Full product access, recurring monthly charge via Stripe
```

**Why this structure:**
- Free Diagnóstico removes all friction from acquisition — no card, no commitment
- 14-day trial creates urgency to explore paid features without asking for payment upfront
- After trial ends, seller has already seen their margin, used "Seu Caixa", emitted NFe — they know the value
- Single plan avoids "which tier do I need?" paralysis for small sellers

---

### Free vs. Paid Feature Table

| Feature | Free (sempre) | Trial (14 dias) | Pago (R$149/mês) |
|---|---|---|---|
| Conectar Mercado Livre | ✅ | ✅ | ✅ |
| Importar 90 dias de pedidos | ✅ | ✅ | ✅ |
| Diagnóstico automático (money leaks, Simples Nacional) | ✅ | ✅ | ✅ |
| Custo por produto (input manual) | ❌ | ✅ | ✅ |
| Lista de pedidos com margem real | ❌ | ✅ | ✅ |
| Emissão de NFe | ❌ | ✅ | ✅ |
| Inteligência de estoque (previsão de ruptura) | ❌ | ✅ | ✅ |
| "Seu Caixa" (resumo semanal) | ❌ | ✅ | ✅ |
| Integração Mercado Pago | ❌ | ✅ | ✅ |
| Eficiência de ADS | ❌ | ✅ | ✅ |
| Performance de anúncios | ❌ | ✅ | ✅ |
| Alertas de reputação | ❌ | ✅ | ✅ |
| Integração Shopee | ❌ | ✅ | ✅ |

**Regra do paywall:** Se o vendedor tenta usar uma feature paga fora do trial, aparece um modal de upgrade — nunca um erro. O modal mostra o que ele vai desbloquear e o CTA "Assinar por R$149/mês".

---

### Pricing

| | Valor |
|---|---|
| Plano único | **R$149/mês** |
| Cobrança | Mensal, renovação automática |
| Moeda | BRL |
| Métodos de pagamento | Cartão de crédito (recorrente), Pix (recorrente via Stripe), Boleto (futuro) |
| Trial | 14 dias, sem cartão de crédito |
| Cancelamento | A qualquer momento, sem multa |

**Posicionamento:** Abaixo do Bling (~R$200/mês) e Tiny (~R$150/mês), com onboarding radicalmente mais simples e foco em transparência financeira que nenhum dos dois oferece.

---

### Subscription Lifecycle

```
Signup
  └── org criada → trial automático de 14 dias (sem cartão)
       └── trial_end_date = now + 14 days

Durante o trial
  └── Acesso completo a todas as features pagas
  └── Banner: "X dias restantes — assine para continuar"
  └── Email D-3: lembrete de trial acabando
  └── Email D-1: último dia

Trial encerrado sem assinatura
  └── Features pagas bloqueadas
  └── Diagnóstico permanece acessível
  └── Modal de upgrade ao tentar qualquer feature paga

Assinatura ativa
  └── Cobrança mensal via Stripe
  └── Webhook `invoice.payment_succeeded` → renova `current_period_end`

Falha de pagamento
  └── Stripe tenta 3x (D+1, D+3, D+7)
  └── Grace period de 7 dias → features pagas continuam acessíveis
  └── Email notificando falha com link para atualizar cartão
  └── Após grace period → downgrade para free tier

Cancelamento
  └── Acesso mantido até fim do período pago
  └── No dia seguinte ao fim → downgrade para free tier
  └── Dados preservados (pedidos, produtos, configurações)
```

---

### Stripe Technical Architecture

**Payment Processor:** Stripe
**Integration pattern:** Stripe Checkout (hosted) para simplicidade. Stripe Customer Portal para self-service.

#### Frontend components

```
@stripe/stripe-js          — Stripe.js loader
@stripe/react-stripe-js    — React wrapper (apenas para embedded elements futuros)
```

**Fluxo de upgrade:**
1. Usuário clica "Assinar" → frontend chama edge function `stripe-create-checkout-session`
2. Backend cria Checkout Session → retorna `session.url`
3. Frontend faz `window.location.href = session.url` → Stripe Checkout hosted page
4. Pagamento concluído → Stripe redireciona para `/billing/sucesso?session_id=...`
5. Frontend confirma sessão → mostra tela de boas-vindas ao plano pago

**Gerenciamento de assinatura (Stripe Customer Portal):**
1. Usuário clica "Gerenciar assinatura" em `/configuracoes`
2. Frontend chama edge function `stripe-create-portal-session`
3. Backend cria Portal Session → retorna `portal.url`
4. Redirect para Stripe Customer Portal (atualizar cartão, cancelar, ver faturas)

---

#### Supabase Edge Functions (new)

| Função | Responsabilidade |
|---|---|
| `stripe-create-checkout-session` | Cria Stripe Customer se não existe + cria Checkout Session com trial |
| `stripe-webhook` | Processa todos os eventos do Stripe, atualiza `subscriptions` table |
| `stripe-create-portal-session` | Cria Customer Portal Session para self-service |

---

#### Database Schema (new tables)

**`billing_customers`**
```sql
id                  uuid primary key
organization_id     uuid references organizations(id) unique
stripe_customer_id  text unique not null
created_at          timestamptz default now()
```

**`subscriptions`**
```sql
id                        uuid primary key
organization_id           uuid references organizations(id) unique
stripe_subscription_id    text unique
stripe_customer_id        text
status                    text  -- 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
plan_id                   text  -- 'novura_pro_monthly'
trial_start               timestamptz
trial_end                 timestamptz
current_period_start      timestamptz
current_period_end        timestamptz
cancel_at_period_end      boolean default false
canceled_at               timestamptz
created_at                timestamptz default now()
updated_at                timestamptz default now()
```

---

#### Stripe Webhook Events to Handle

| Evento | Ação no banco |
|---|---|
| `checkout.session.completed` | Criar/atualizar `subscriptions` com status `trialing` ou `active` |
| `customer.subscription.trial_will_end` | Disparar email D-3 |
| `customer.subscription.updated` | Atualizar `status`, `current_period_end`, `cancel_at_period_end` |
| `customer.subscription.deleted` | Atualizar `status = 'canceled'` |
| `invoice.payment_succeeded` | Atualizar `current_period_end`, garantir `status = 'active'` |
| `invoice.payment_failed` | Atualizar `status = 'past_due'`, iniciar grace period |

**Segurança:** Todos os webhooks validados com `stripe.webhooks.constructEvent()` usando `STRIPE_WEBHOOK_SECRET`. Nunca processar eventos sem validação da assinatura.

---

#### Feature Gating

**Hook: `useSubscription()`**

```
Retorna:
  status: 'trialing' | 'active' | 'past_due' | 'free' | 'canceled'
  isPaid: boolean  (true se trialing ou active ou past_due dentro do grace period)
  daysLeftInTrial: number | null
  trialEnded: boolean
```

**Regras:**
- `status = 'trialing'` → acesso completo
- `status = 'active'` → acesso completo
- `status = 'past_due'` + dentro do grace period (7 dias) → acesso completo + banner de aviso
- `status = 'past_due'` + fora do grace period → acesso free apenas
- `status = 'canceled'` → acesso free apenas
- `status = 'free'` (nunca assinou) → acesso free apenas

**Onde o gate é aplicado:** Em cada hook de feature paga (ex: `useOrdersWithMargin`, `useNfeEmission`, `useStockIntelligence`). Nunca apenas na UI — o hook precisa retornar `null` + `requiresUpgrade: true` se o status não permite acesso.

---

### User Flows

#### Upgrade flow
```
Feature paga acessada fora do trial
  → Modal: "Esta feature faz parte do Novura Pro"
     → Lista de 3-4 benefits específicos à feature acessada
     → CTA: "Assinar por R$149/mês"
  → Stripe Checkout (hosted)
  → Pagamento → redirect para /billing/sucesso
  → Feature desbloqueada imediatamente via webhook
```

#### Failed payment flow
```
Cobrança falha
  → Email imediato: "Não conseguimos cobrar seu cartão"
     → Link: "Atualizar dados de pagamento" → Stripe Customer Portal
  → Banner no app: "Pagamento pendente — atualize seu cartão para não perder acesso"
  → D+7 sem pagamento → downgrade para free
     → Email: "Seu acesso ao Novura Pro foi suspenso"
     → Dados preservados, Diagnóstico acessível
```

#### Cancellation flow
```
Usuário cancela
  → Confirmação: "Você perderá acesso em [data fim do período]"
  → Status: cancel_at_period_end = true
  → Banner: "Seu plano será cancelado em X dias — [reativar]"
  → Na data fim: status → 'canceled', downgrade para free
  → Email: "Seu plano foi cancelado. Diagnóstico ainda disponível."
  → Dados preservados por 90 dias, então arquivados
```

---

### Billing Risks and Mitigations

| Risco | Mitigação |
|---|---|
| Webhook chega antes do redirect do Checkout | Polling no frontend por até 10s antes de mostrar tela de sucesso |
| Stripe Customer duplicado por race condition | `upsert` com `ON CONFLICT (organization_id)` na criação do customer |
| Trial abusado (novo email a cada 14 dias) | Rate limit por IP na criação de conta + verificação de email obrigatória |
| Falha no webhook → feature não desbloqueada | Endpoint de verificação manual: `stripe-sync-subscription` chamado no login |
| Seller cancela e perde dados inadvertidamente | Comunicar claramente que dados ficam por 90 dias + oferecer export antes |

---

### Billing Open Questions

1. **Annual plan:** Oferecer desconto anual (ex: R$1.290/ano = 2 meses grátis) desde o lançamento ou depois de validar retenção mensal?
2. **Pix recorrente:** Stripe suporta Pix como método único mas não recorrente nativo. Aceitar Pix apenas para plano anual (pagamento único) e cartão para mensal?
3. **Boleto:** Adicionar boleto como opção de pagamento para aumentar conversão entre sellers sem cartão de crédito?
4. **Churn email sequence:** Construir internamente ou usar ferramenta de email (Customer.io, Loops, etc.)?
