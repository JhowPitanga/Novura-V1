# Fluxo Detalhado: Status "EMISSÃO NF"

> Documentação técnica completa do ciclo de vida de um pedido no status **"Emissão NF"** — desde a entrada nesse status até a emissão da nota fiscal, autorização pelo SEFAZ, e submissão do XML ao marketplace.

---

## 1. Visão Geral

O status **"Emissão NF"** indica que um pedido de marketplace está **pronto para emissão de nota fiscal eletrônica (NFe)**. Isso significa que:

1. Todos os itens do pedido estão **vinculados a produtos do catálogo ERP** (`has_unlinked_items = false`)
2. O marketplace reportou que o pedido está `ready_to_ship` com substatus `invoice_pending`
3. O pedido **não está cancelado, devolvido ou em fulfillment (Full)**

### Pré-condições para entrar em "Emissão NF"

Um pedido recebe `status_interno = 'Emissao NF'` quando **todas** as condições são verdadeiras:

1. O pedido não está cancelado (`v_is_cancelled = false`)
2. O pedido não está devolvido (`v_is_returned = false`)
3. O pedido não é fulfillment/Full (`v_is_full = false`)
4. **Todos os itens estão vinculados** (`has_unlinked_items = false`)
5. O `shipment_status = 'ready_to_ship'` com `shipment_substatus = 'invoice_pending'` (Mercado Livre)
   - Ou status equivalente na Shopee

> **Se o pedido tiver itens não vinculados**, ele fica em **"A vincular"** independentemente do status do marketplace. "A vincular" tem prioridade sobre "Emissão NF". Ver `docs/FLUXO_A_VINCULAR.md`.

---

## 2. Arquitetura de Dados — Tabelas Envolvidas

### 2.1 `marketplace_orders_presented_new`
- **Tipo**: Tabela materializada via trigger (pipeline legado)
- **Papel**: Principal fonte de dados para o frontend de pedidos e para a emissão de NF
- **Campos-chave para emissão**:
  - `status_interno` — status calculado (`'Emissao NF'`, `'Processando NF'`, `'subir xml'`, `'Falha na emissão'`)
  - `has_unlinked_items` — deve ser `false` para emitir
  - `linked_products` — jsonb array com vínculos: `[{ marketplace_item_id, variation_id, product_id, sku, source }]`
  - `xml_to_submit` — XML da NFe autorizada, pronto para envio ao marketplace
  - `marketplace_submission_status` — status de envio do XML ao marketplace (`'pending'`, `'sent'`)
  - `billing_name`, `billing_doc_type`, `billing_doc_number` — dados do destinatário da NF
  - `shipment_receiver_address` — endereço de entrega

### 2.2 `invoices` (Tabela Nova — Cycle 0)
- **Tipo**: Tabela de controle de emissão com idempotência
- **Papel**: Rastreia cada tentativa de emissão com proteção contra duplicatas
- **Campos-chave**:
  - `id` (uuid, PK)
  - `organization_id`, `order_id`, `company_id` (FKs)
  - `idempotency_key` — UNIQUE, formato: `{organization_id}:{order_id}:{environment}`
  - `status` — `'pending'` → `'queued'` → `'processing'` → `'authorized'` | `'error'`
  - `focus_id` — ID retornado pela API Focus NFe
  - `nfe_number`, `nfe_key`, `serie` — dados da NF autorizada
  - `emission_environment` — `'homologacao'` | `'producao'`
  - `xml_url`, `pdf_url` — URLs dos documentos
  - `marketplace_submission_status` — status de envio ao marketplace
  - `error_message`, `error_code`, `retry_count` — controle de erros
  - `payload_sent` (jsonb) — payload enviado ao Focus (para debug)
  - `emitted_at`, `authorized_at`, `canceled_at`

### 2.3 `notas_fiscais` (Tabela Legada)
- **Tipo**: Tabela legada de notas fiscais, ainda utilizada pelo `focus-nfe-emit`
- **Campos-chave**:
  - `id` (uuid, PK)
  - `organizations_id`, `company_id`, `marketplace_order_id`
  - `status` — CHECK: `'autorizada'`, `'rejeitada'`, `'denegada'`, `'cancelada'`, `'pendente'`, `'processando_autorizacao'`
  - `emissao_ambiente` — CHECK: `'homologacao'`, `'producao'`
  - `focus_nfe_id` — UUID do Focus
  - `numero`, `serie`, `chave_acesso` — dados da NF
  - `xml_base64`, `pdf_base64` — documentos codificados
  - `total_value`, `tipo`
  - `playload_enviado` (jsonb) — payload enviado ao Focus
  - `status_focus` — status bruto retornado pelo Focus
  - `marketplace_submission_response` — resposta do marketplace ao envio do XML
  - `error_details` — detalhes do erro

### 2.4 `companies`
- **Campos relevantes para emissão**:
  - `proxima_nfe` — próximo número de NFe a usar (auto-incremento controlado por advisory lock)
  - `serie_nfe` — série da NF
  - `focus_token_producao`, `focus_token_homologacao` — tokens da API Focus por empresa
  - Dados do emitente: CNPJ, razão social, endereço, IE, regime tributário

### 2.5 `company_tax_configs`
- **Tipo**: Configurações tributárias por empresa
- **Campos-chave**:
  - `tax_regime` — `'simples'`, `'lucro_presumido'`, `'lucro_real'`
  - CFOPs: `cfop_dentro_estado_pf`, `cfop_fora_estado_pf`, `cfop_dentro_estado_pj`, `cfop_fora_estado_pj`
  - ICMS: `icms_csosn` (Simples) ou `icms_cst` (outros regimes), `icms_aliquota`, `icms_bc_reducao`
  - PIS: `pis_cst`, `pis_aliquota`
  - COFINS: `cofins_cst`, `cofins_aliquota`
  - IPI: `ipi_cst`, `ipi_aliquota`

### 2.6 `company_nf_configs`
- **Tipo**: Configuração de série/numeração por empresa
- **Campos**: `organizations_id`, `company_id`, `numero_serie`, `proxima_nfe`
- **Unique**: Uma config por empresa

### 2.7 `products`
- **Campos relevantes para NF**:
  - `ncm` — Nomenclatura Comum do Mercosul (obrigatório para emissão)
  - `tax_origin_code` — código de origem fiscal (0-8)
  - `cest` — Código Especificador de Substituição Tributária
  - `barcode` — código de barras (EAN/GTIN)
  - `sku`, `name` — identificação do produto

### 2.8 `marketplace_item_product_links`
- **Papel na emissão**: Resolve qual produto ERP corresponde a cada item do marketplace
- **Consulta**: `focus-nfe-emit` usa esta tabela para encontrar NCM, CEST, origem dos itens

### 2.9 Filas (pgmq)
- **`q_emit_focus`** — fila de mensagens para emissão de NF
  - Payload: `{ organizations_id, company_id, environment, orderIds[], forceNewNumber?, forceNewRef? }`
- **`q_submit_xml`** — fila de mensagens para envio do XML ao marketplace
  - Payload: `{ marketplace, order_id, organization_id, ... }`

---

## 3. Fluxo Completo — Passo a Passo

### FASE 1: Pedido Entra no Status "Emissão NF"

#### Via Trigger no Banco (Pipeline Legado)

Quando o trigger `on_marketplace_orders_raw_change_new` processa um pedido (ver `FLUXO_A_VINCULAR.md` seção 3, Fase 2), a lógica PL/pgSQL calcula o `status_interno`:

```sql
-- Arquivo: supabase/migrations/20251205_create_materialize_orders_trigger.sql

IF v_is_cancelled OR v_is_refunded THEN
    v_status_interno := 'Cancelado';
ELSIF v_is_returned THEN
    v_status_interno := 'Devolução';
ELSIF v_has_unlinked_items THEN
    v_status_interno := 'A vincular';
ELSIF v_is_full THEN
    v_status_interno := 'Enviado';
ELSIF v_shipment_status = 'ready_to_ship'
  AND v_shipment_substatus = 'invoice_pending' THEN
    v_status_interno := 'Emissao NF';          -- ← AQUI
ELSIF v_shipment_status = 'ready_to_ship'
  AND v_shipment_substatus = 'ready_to_print' THEN
    v_status_interno := 'Impressao';
-- ... demais estados
```

#### Via Resolução do "A Vincular"

Quando o usuário vincula todos os itens no `LinkOrderModal` e salva:
1. O modal chama `process-presented` com `status_only=true`
2. O status é recalculado
3. Se `has_unlinked_items` agora é `false` e o marketplace reporta `invoice_pending` → status muda para `'Emissao NF'`

---

### FASE 2: Frontend — Interface de Emissão

#### 2.1 Página de Pedidos — Aba "Emissão NF" (`src/pages/Orders.tsx`)

A página filtra pedidos por `status_interno` e exibe a aba de emissão.

#### 2.2 Barra de Filtros (`src/components/orders/NfeFilterBar.tsx`)

Exibe quatro badges com contadores:

| Badge | Filtro | Significado |
|-------|--------|-------------|
| **Emitir** | `status_interno = 'Emissao NF'` | Prontos para emissão |
| **Processando** | `status_interno = 'Processando NF'` | Emissão em andamento |
| **Falha na emissão** | `status_interno = 'Falha na emissão'` | Erro na emissão |
| **Subir xml** | `status_interno = 'subir xml'` | NF autorizada, XML pendente de envio ao marketplace |

Também inclui:
- **Seletor de ambiente**: Homologação vs Produção (salvo em `localStorage` key `nfe_environment`)
- **Botão "Emissão em Massa"**: Emite NF para todos os pedidos filtrados como "Emitir"
- **Botão "Emitir Selecionados"**: Emite apenas para os pedidos selecionados pelo checkbox

#### 2.3 Lista de Emissão (`src/components/orders/NfeEmissionList.tsx`)

Exibe cada pedido com:
- Dados do pedido (marketplace, ID, comprador, valor)
- Status atual da NF (via hook `useNfeStatus`)
- Botão individual de emissão
- Checkbox para seleção em massa

#### 2.4 Hook de Status da NF (`src/hooks/useNfeStatus.ts`)

Monitora o status das notas fiscais consultando a tabela `invoices`:
- Mapeia status do Focus (`'autorizado'`, `'processando_autorizacao'`, etc.) para exibição
- Exibe mensagens de erro da API Focus
- Rastreia status de envio do XML ao marketplace

---

### FASE 3: Disparo da Emissão

#### 3.1 Ação do Usuário → Chamada de Serviço

Quando o usuário clica em "Emitir" (individual ou em massa):

```
src/pages/Orders.tsx → handleEmitirNfe()
  → src/services/orders.service.ts → emitNfeQueue()
```

**`emitNfeQueue()`** (`src/services/orders.service.ts`):
```typescript
export async function emitNfeQueue(
  organizationId: string,
  companyId: string,
  orderIds: string[],
  environment: string,           // 'homologacao' | 'producao'
  opts?: { forceNewNumber?: boolean; forceNewRef?: boolean }
): Promise<void> {
  // Chama RPC: rpc_queues_emit
  // Payload: { organizations_id, company_id, environment, orderIds, forceNewNumber, forceNewRef }
}
```

#### 3.2 RPC no Banco — Enfileiramento

**Função**: `public.rpc_queues_emit()` (`supabase/migrations/20251230_create_rpc_queues_emit.sql`)

1. Recebe `p_message` (jsonb) com `orderIds[]`, `organizations_id`, `company_id`, `environment`
2. Para cada `order_id` na lista:
   - Atualiza `marketplace_orders_presented_new.status_interno = 'Processando NF'`
3. Envia mensagem para a fila pgmq `q_emit_focus`
4. Retorna o `msg_id` da fila

> **Neste momento**, o pedido sai de "Emissão NF" e vai para **"Processando NF"** no frontend.

---

### FASE 4: Processamento da Fila — `emit-queue-consume`

**Arquivo**: `supabase/functions/emit-queue-consume/index.ts`

Edge function que consome duas filas: `q_emit_focus` e `q_submit_xml`.

#### Fila `q_emit_focus`:

1. **Lê mensagens** da fila (batch)
2. Para cada mensagem, extrai `orderIds[]`, `company_id`, `environment`
3. Chama `emit-invoice` para cada `order_id`
4. **Dequeue** (remove da fila) se o pedido atingir um dos status finais:
   - `'autorizado'` / `'autorizada'`
   - `'processando_autorizacao'`
5. Se falhou, incrementa retry e deixa na fila (até MAX_RETRIES = 5)

#### Fila `q_submit_xml`:

1. **Lê mensagens** da fila
2. Roteia por marketplace:
   - Mercado Livre → chama edge function `mercado-livre-submit-xml`
   - Shopee → chama edge function `shopee-submit-xml`
3. **Dequeue** em caso de sucesso

---

### FASE 5: Emissão Idempotente — `emit-invoice`

**Arquivo**: `supabase/functions/emit-invoice/index.ts`

Entry point que garante idempotência via a tabela `invoices`.

#### Algoritmo de 5 Passos (`processEmission.ts`):

**Passo 1 — Construir chave de idempotência**
```
idempotency_key = "{organization_id}:{order_id}:{environment}"
```

**Passo 2 — Verificar emissão existente**

Consulta `invoices` por `idempotency_key`:
- Se `status = 'authorized'` → Retorna sucesso (já emitida)
- Se `status = 'processing'` → Retorna "em andamento"
- Se `status = 'error'` e `retry_count >= 5` → Retorna "max retries atingido"
- Caso contrário → Prossegue

**Passo 3 — Criar registro na tabela `invoices`**

UPSERT com `status = 'queued'` **ANTES** de chamar o Focus:
```sql
INSERT INTO invoices (organization_id, order_id, company_id, idempotency_key, status, emission_environment)
VALUES (..., 'queued', ...)
ON CONFLICT (idempotency_key) DO UPDATE SET status = 'queued', retry_count = retry_count + 1
```

> **Princípio importante**: O registro é criado antes da chamada externa. Se o sistema falhar entre a criação e a resposta, a invoice fica como 'queued' e pode ser retentada.

**Passo 4 — Chamar `focus-nfe-emit`**

HTTP POST para a edge function `focus-nfe-emit` com:
```json
{
  "organization_id": "...",
  "companyId": "...",
  "orderIds": ["..."],
  "environment": "homologacao|producao",
  "forceNewNumber": false,
  "forceNewRef": false
}
```

**Passo 5 — Atualizar resultado**

Baseado na resposta do Focus:
- **Sucesso** → `status = 'processing'` + `focus_id`
- **Erro** → `status = 'error'` + `error_message` + incrementa `retry_count`

---

### FASE 6: Emissão no Focus NFe — `focus-nfe-emit`

**Arquivo**: `supabase/functions/focus-nfe-emit/index.ts` (~2000 linhas)

Esta é a edge function principal que constrói o payload NFe e envia à API Focus. Processo completo:

#### 6.1 Autenticação e Autorização

1. Valida token Bearer (Supabase auth ou service role para filas)
2. Verifica pertencimento à organização
3. Carrega configurações da empresa:
   - Token Focus (por ambiente: `focus_token_producao` / `focus_token_homologacao`)
   - Fallback: token global `FOCUS_API_TOKEN` se empresa não tem token próprio
   - `proxima_nfe`, série, dados fiscais

#### 6.2 Busca de Dados do Pedido

Consulta `marketplace_orders_presented_new` pelo `order_id`:
- Dados completos do pedido (itens, pagamento, frete)
- Endereço de entrega (`shipment_receiver_address`)
- Dados de faturamento (`billing_name`, `billing_doc_type`, `billing_doc_number`)

#### 6.3 Resolução do Destinatário (Receptor da NF)

Mescla dados de múltiplas fontes para construir o destinatário:

```
Fontes (em ordem de prioridade):
1. billing_name + billing_doc_number (dados de faturamento explícitos)
2. shipment_receiver_address (endereço de envio)
3. Dados do buyer (comprador) do pedido
4. Dados de fallback do campo "data" do pedido
```

Determina:
- **PF (CPF)** ou **PJ (CNPJ)** — baseado no `doc_type` ou comprimento do documento
- **Dentro ou fora do estado** — compara UF do destinatário com UF da empresa emissora
  - Afeta seleção do CFOP (ex: `cfop_dentro_estado_pf` vs `cfop_fora_estado_pf`)

#### 6.4 Resolução de Produtos e Itens

Para cada item do pedido, resolve o produto ERP via:

1. Campo `linked_products` do item (vínculo efêmero/permanente do pedido)
2. Tabela `marketplace_item_product_links` (vínculo permanente)
3. Match direto por SKU na tabela `products` (fallback)

Para cada produto resolvido, extrai:
- **NCM** (obrigatório — emissão falha sem NCM)
- **Código de origem fiscal** (`tax_origin_code`) (obrigatório)
- **CEST** (se aplicável)
- **Código de barras** (EAN/GTIN)
- **Nome e SKU**

> **Validação crítica**: Se qualquer item não tiver NCM ou `tax_origin_code`, a emissão **falha** com erro descritivo.

#### 6.5 Configuração Tributária

Carrega configurações de `company_tax_configs`:

1. **Regime tributário**: Simples Nacional, Lucro Presumido, ou Lucro Real
2. **CFOP**: Selecionado com base em:
   - Tipo do cliente: PF vs PJ
   - Localização: dentro do estado vs fora do estado
   - Regime tributário da empresa
3. **ICMS**: CSOSN (Simples) ou CST (demais regimes), alíquota, redução de BC
4. **PIS**: CST + alíquota
5. **COFINS**: CST + alíquota
6. **IPI**: CST + alíquota (se aplicável)

> **Validações obrigatórias**: CFOP, ICMS CST/CSOSN, PIS CST, COFINS CST. Emissão falha se qualquer um não estiver configurado.

#### 6.6 Numeração da NF

Chama a function PL/pgSQL `fn_reservar_e_numerar_notas()`:

```sql
-- Arquivo: supabase/migrations/20251231_create_fn_reservar_e_numerar_notas.sql

-- 1. Adquire advisory lock na empresa (previne concorrência)
-- 2. Verifica se já existe NF para este pedido:
--    - Se status = 'autorizada' → rejeita (NF já emitida)
--    - Se status = 'denegada' → rejeita (documento negado)
--    - Se status = 'cancelada' → permite re-emissão com novo número
--    - Caso contrário → reutiliza o número existente
-- 3. Calcula próximo número: MAX(numero da série) ou companies.proxima_nfe
-- 4. Insere/atualiza registro em notas_fiscais com status 'processando_autorizacao'
-- 5. Atualiza companies.proxima_nfe
-- 6. Retorna: { nf_id, numero, serie, payload }
```

#### 6.7 Construção do Payload Focus

Monta o JSON para a API Focus NFe:

```json
{
  "natureza_operacao": "Venda de Mercadoria",
  "serie": "1",
  "numero": 12345,
  "data_emissao": "2026-03-29T14:30:00-03:00",
  "tipo_documento": 1,
  "local_destino": 1,
  "finalidade_emissao": 1,
  "consumidor_final": 1,
  "presenca_comprador": 2,

  "cnpj_emitente": "12345678000190",
  "nome_emitente": "Empresa LTDA",
  "inscricao_estadual_emitente": "123456789",
  "logradouro_emitente": "Rua X, 100",
  "municipio_emitente": "São Paulo",
  "uf_emitente": "SP",
  "regime_tributario_emitente": 1,

  "nome_destinatario": "João Silva",
  "cpf_destinatario": "12345678901",
  "logradouro_destinatario": "Av Y, 200",
  "municipio_destinatario": "Rio de Janeiro",
  "uf_destinatario": "RJ",

  "items": [
    {
      "numero_item": 1,
      "codigo_produto": "SKU-001",
      "descricao": "Produto X",
      "codigo_ncm": "85176299",
      "cfop": "6102",
      "unidade_comercial": "UN",
      "quantidade_comercial": 1,
      "valor_unitario_comercial": 99.90,
      "valor_bruto": 99.90,
      "icms_situacao_tributaria": "102",
      "icms_origem": 0,
      "pis_situacao_tributaria": "49",
      "cofins_situacao_tributaria": "49"
    }
  ],

  "referencia": "pack-{packId}-order-{orderId}-company-{companyId}"
}
```

> A string `referencia` serve como chave de deduplicação no lado do Focus.

#### 6.8 Chamada à API Focus

```
POST https://homologacao.focusnfe.com.br/v2/nfe
  Authorization: Basic {base64(token:)}
  Content-Type: application/json
  Body: payload NFe
```

Ambientes:
- Homologação: `https://homologacao.focusnfe.com.br/v2/nfe`
- Produção: `https://api.focusnfe.com.br/v2/nfe`

#### 6.9 Tratamento da Resposta

**Se já processado (erro de duplicata)**:
1. Busca a NF no Focus pela string `referencia`
2. Se encontrada como autorizada, sincroniza status no banco

**Se erro**:
1. Cria/atualiza registro em `notas_fiscais` com status de erro
2. Atualiza `marketplace_orders_presented_new.status_interno = 'Falha na emissão'`
3. Salva `error_details` para debug

**Se sucesso (status = 'autorizado')**:
1. Extrai XML da resposta (ou fetch da URL retornada pelo Focus)
2. Parseia o XML para extrair:
   - Número da NF (`nNF`)
   - Série (`serie`)
   - Chave de acesso (`chNFe`)
   - Data de autorização (`dhEmi`)
   - Valor total (`vNF`)
3. Cria/atualiza registro em `notas_fiscais`:
   - `status = 'autorizada'`
   - `numero`, `serie`, `chave_acesso`
   - `xml_base64` (conteúdo do XML)
   - `total_value`
4. Atualiza `companies.proxima_nfe` para manter sequência
5. Salva XML em `marketplace_orders_presented_new.xml_to_submit`
6. Define `marketplace_submission_status = 'pending'`
7. Atualiza `marketplace_orders_presented_new.status_interno = 'subir xml'`

**Se processando (status = 'processando_autorizacao')**:
1. Faz polling no Focus até 10 vezes, aguardando autorização
2. Se autorizado durante o polling → executa o fluxo de sucesso acima
3. Se não autorizado após 10 tentativas → mantém status como 'processing'

---

### FASE 7: Webhook do Focus — `focus-webhook`

**Arquivo**: `supabase/functions/focus-webhook/index.ts`

O Focus NFe envia webhooks quando o status de uma NF muda (ex: SEFAZ autoriza ou rejeita).

#### Validação

- Verifica `FOCUS_WEBHOOK_SECRET` no header
- Fallback: valida pelo token Focus da empresa

#### Payload recebido

```json
{
  "cnpj_emitente": "12345678000190",
  "ref": "pack-123-order-456-company-789",
  "status": "autorizado",
  "uuid": "abc-123",
  "chave_nfe": "35260312345678000190550010001234561234567890",
  "numero": "123456",
  "serie": "1",
  "xml": "base64...",
  "pdf": "base64..."
}
```

#### Processamento por Status

**Se `autorizado`**:
1. Faz fetch do XML completo via API Focus (com retry/fallback para base64)
2. Parseia XML para extrair: valor total (`vNF`), número (`nNF`), série, data de emissão (`dhEmi`)
3. Atualiza `notas_fiscais`:
   - `status = 'autorizada'`, `status_focus = 'autorizado'`
   - `chave_acesso`, `numero`, `serie`, `total_value`
   - `xml_base64`
4. Salva XML em `marketplace_orders_presented_new.xml_to_submit`
5. Define `marketplace_submission_status = 'pending'`
6. Atualiza `status_interno = 'subir xml'`

**Se `rejeitado` ou `denegado`**:
1. Atualiza `notas_fiscais.status` correspondente
2. Salva detalhes do erro em `error_details`
3. Atualiza `marketplace_orders_presented_new.status_interno = 'Falha na emissão'`

---

### FASE 8: Envio do XML ao Marketplace

Após a NF ser autorizada e o XML salvo em `xml_to_submit`, o pedido fica com `status_interno = 'subir xml'`.

#### Via Fila `q_submit_xml` (em `emit-queue-consume`)

A edge function `emit-queue-consume` também consome a fila `q_submit_xml`:

**Mercado Livre** → chama `mercado-livre-submit-xml`:
- Envia XML da NFe via API ML (endpoint de notas fiscais do shipment)
- Atualiza `marketplace_submission_status` e `marketplace_submission_response`

**Shopee** → chama `shopee-submit-xml`:
- Envia XML da NFe via API Shopee
- Atualiza status correspondente

Após envio bem-sucedido:
- `marketplace_submission_status = 'sent'`
- O pedido avança para o próximo status (tipicamente `'Impressao'` ou `'Aguardando Coleta'`)

---

## 4. Transições de Status no Fluxo de Emissão

```
┌──────────────┐    Usuário vincula      ┌──────────────┐
│  A vincular  │───todos os itens───────▶│  Emissao NF  │
└──────────────┘                         └──────┬───────┘
                                                │
                                    Usuário clica "Emitir"
                                    (rpc_queues_emit)
                                                │
                                                ▼
                                        ┌───────────────┐
                                        │Processando NF │
                                        └──────┬────────┘
                                               │
                              ┌────────────────┼────────────────┐
                              │                │                │
                              ▼                ▼                ▼
                    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
                    │  autorizada  │  │   rejeitada  │  │    erro      │
                    │  (Focus OK)  │  │  (SEFAZ NOK) │  │  (API fail)  │
                    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
                           │                 │                 │
                           ▼                 ▼                 ▼
                    ┌──────────────┐  ┌──────────────────────────────┐
                    │  subir xml   │  │    Falha na emissão          │
                    │  (xml pronto)│  │    (usuário pode retentar)   │
                    └──────┬───────┘  └──────────────────────────────┘
                           │
                 Envio ao marketplace
                  (submit-xml)
                           │
                           ▼
                    ┌──────────────┐
                    │  Impressao   │
                    │  (imprimir   │
                    │   etiqueta)  │
                    └──────────────┘
```

### Mapeamento `status_interno` ↔ Status Internos

| `status_interno` (marketplace_orders_presented_new) | Quando | Quem define |
|------------------------------------------------------|--------|-------------|
| `'Emissao NF'` | Marketplace reportou `invoice_pending` e itens vinculados | Trigger PL/pgSQL / process-presented |
| `'Processando NF'` | Usuário disparou emissão | `rpc_queues_emit` |
| `'Falha na emissão'` | Focus retornou erro ou SEFAZ rejeitou | `focus-nfe-emit` / `focus-webhook` |
| `'subir xml'` | NF autorizada, XML pronto para envio ao marketplace | `focus-nfe-emit` / `focus-webhook` |
| `'Impressao'` | XML enviado ao marketplace, pronto para imprimir etiqueta | `submit-xml` / trigger |

### Mapeamento `invoices.status`

| Status | Significado |
|--------|-------------|
| `'pending'` | Registro criado, aguardando processamento |
| `'queued'` | Na fila para emissão |
| `'processing'` | Enviado ao Focus, aguardando autorização |
| `'authorized'` | NF autorizada pelo SEFAZ |
| `'error'` | Erro na emissão (pode retentar até 5x) |

### Mapeamento `notas_fiscais.status`

| Status | Significado |
|--------|-------------|
| `'pendente'` | Aguardando processamento |
| `'processando_autorizacao'` | Enviado ao Focus, aguardando SEFAZ |
| `'autorizada'` | NF autorizada |
| `'rejeitada'` | SEFAZ rejeitou |
| `'denegada'` | SEFAZ denegou (irreversível) |
| `'cancelada'` | NF cancelada após autorização |

---

## 5. Idempotência e Proteção contra Duplicatas

O sistema implementa 3 camadas de idempotência:

### Camada 1: Tabela `invoices`
- `idempotency_key` UNIQUE = `{org_id}:{order_id}:{environment}`
- `processEmission()` verifica o status antes de chamar o Focus
- Early return se já autorizada ou em processamento

### Camada 2: Tabela `notas_fiscais`
- `fn_reservar_e_numerar_notas()` verifica NF existente por `(company_id, marketplace_order_id, environment)`
- Reutiliza número se NF existente está em processamento
- Bloqueia emissão se já autorizada ou denegada

### Camada 3: API Focus (referência)
- String `referencia` = `pack-{packId}-order-{orderId}-company-{companyId}`
- Focus rejeita duplicatas pela mesma referência
- `focus-nfe-emit` detecta o erro e busca a NF pela referência para sincronizar

---

## 6. Tratamento de Erros e Retentativas

| Cenário | Comportamento | Retentativas |
|---------|---------------|--------------|
| **Focus retorna erro** | `invoices.status = 'error'`, incrementa `retry_count` | Até 5 tentativas via fila |
| **SEFAZ rejeita** | `notas_fiscais.status = 'rejeitada'`, `status_interno = 'Falha na emissão'` | Usuário precisa corrigir dados e reemitir |
| **SEFAZ denega** | `notas_fiscais.status = 'denegada'` | Irreversível — novo pedido necessário |
| **Timeout na autorização** | Polling de até 10 tentativas, depois `status = 'processing'` | Webhook do Focus resolve async |
| **Produto sem NCM** | Emissão falha com mensagem descritiva | Usuário deve cadastrar NCM no produto |
| **CFOP não configurado** | Emissão falha na validação | Admin deve configurar em company_tax_configs |
| **Token Focus inválido** | Erro 401 da API Focus | Admin deve atualizar token na empresa |
| **Número de NF duplicado** | Advisory lock previne concorrência + referência no Focus | Automático |

---

## 7. Diagrama de Fluxo Completo

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PEDIDO COM status_interno = 'Emissao NF'                          │
 │  (has_unlinked_items = false, shipment: invoice_pending)            │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                   Usuário clica "Emitir"
                   (individual ou em massa)
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  FRONTEND: handleEmitirNfe()                                        │
 │  → emitNfeQueue(orgId, companyId, orderIds[], environment)          │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  RPC: rpc_queues_emit()                                             │
 │  1. UPDATE status_interno = 'Processando NF' (cada order)           │
 │  2. pgmq.send('q_emit_focus', { orderIds, company_id, env })       │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  EDGE FUNCTION: emit-queue-consume                                  │
 │  → Lê mensagens de q_emit_focus                                     │
 │  → Para cada order_id: chama emit-invoice                           │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  EDGE FUNCTION: emit-invoice (idempotente)                          │
 │  1. Construir idempotency_key                                       │
 │  2. Verificar invoice existente (early return se já ok)             │
 │  3. UPSERT invoices com status='queued'                             │
 │  4. Chamar focus-nfe-emit                                           │
 │  5. Atualizar invoices com resultado                                │
 └─────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  EDGE FUNCTION: focus-nfe-emit                                      │
 │                                                                     │
 │  1. Autenticar + carregar config da empresa                         │
 │  2. Buscar dados do pedido (marketplace_orders_presented_new)       │
 │  3. Resolver destinatário (billing + shipping + buyer)              │
 │  4. Resolver produtos (linked_products → products → NCM/CEST)      │
 │  5. Carregar config tributária (company_tax_configs)                │
 │  6. Selecionar CFOP (PF/PJ × dentro/fora do estado)                │
 │  7. Reservar número da NF (fn_reservar_e_numerar_notas)            │
 │  8. Montar payload JSON Focus                                       │
 │  9. POST https://api.focusnfe.com.br/v2/nfe                        │
 │  10. Tratar resposta:                                               │
 │      - Autorizado → salvar XML, atualizar notas_fiscais, subir xml │
 │      - Processando → polling até 10x                                │
 │      - Erro → status_interno = 'Falha na emissão'                  │
 └──────────┬──────────────────────────────────┬───────────────────────┘
            │                                  │
            ▼ (assíncrono)                     ▼ (se autorizado)
 ┌──────────────────────┐           ┌──────────────────────────────────┐
 │  FOCUS WEBHOOK        │           │  status_interno = 'subir xml'    │
 │  focus-webhook        │           │  xml_to_submit = XML da NFe      │
 │  → Recebe status      │           │  marketplace_submission = pending │
 │  → Atualiza DB        │           └──────────────┬───────────────────┘
 └──────────────────────┘                           │
                                                    ▼
                                     ┌──────────────────────────────────┐
                                     │  FILA: q_submit_xml              │
                                     │  → emit-queue-consume            │
                                     │  → mercado-livre-submit-xml      │
                                     │     OU shopee-submit-xml         │
                                     │  → Envia XML ao marketplace      │
                                     │  → marketplace_submission = sent │
                                     └──────────────┬───────────────────┘
                                                    │
                                                    ▼
                                     ┌──────────────────────────────────┐
                                     │  status_interno = 'Impressao'    │
                                     │  (pronto para imprimir etiqueta) │
                                     └──────────────────────────────────┘
```

---

## 8. Referência de Arquivos

| Camada | Arquivo | Papel |
|--------|---------|-------|
| **Frontend: Orders page** | `src/pages/Orders.tsx` | Página principal, handleEmitirNfe() |
| **Frontend: NF filter bar** | `src/components/orders/NfeFilterBar.tsx` | Badges de status + botões de emissão |
| **Frontend: NF emission list** | `src/components/orders/NfeEmissionList.tsx` | Lista de pedidos para emissão |
| **Frontend: NF status hook** | `src/hooks/useNfeStatus.ts` | Monitora status da NF |
| **Frontend: Orders service** | `src/services/orders.service.ts` | `emitNfeQueue()` |
| **Frontend: Invoices service** | `src/services/invoices.service.ts` | `fetchInvoices()`, `fetchRecentInvoicesSummary()` |
| **RPC enfileirar** | `supabase/migrations/20251230_create_rpc_queues_emit.sql` | `rpc_queues_emit()` |
| **Fila pgmq** | `supabase/migrations/20251229_create_queue_q_emit_focus.sql` | Setup fila `q_emit_focus` |
| **Edge: emit-queue-consume** | `supabase/functions/emit-queue-consume/index.ts` | Consome filas q_emit_focus e q_submit_xml |
| **Edge: emit-invoice** | `supabase/functions/emit-invoice/index.ts` | Entry point idempotente |
| **Edge: emit-invoice process** | `supabase/functions/emit-invoice/process-emission.ts` | Algoritmo de 5 passos |
| **Edge: focus-nfe-emit** | `supabase/functions/focus-nfe-emit/index.ts` | Lógica principal (~2000 linhas) |
| **Edge: focus-webhook** | `supabase/functions/focus-webhook/index.ts` | Recebe webhooks do Focus |
| **Edge: focus-nfe-cancel** | `supabase/functions/focus-nfe-cancel/index.ts` | Cancelamento de NF |
| **Edge: focus-nfe-sync** | `supabase/functions/focus-nfe-sync/index.ts` | Sync manual com Focus |
| **Edge: ML submit XML** | `supabase/functions/mercado-livre-submit-xml/index.ts` | Envia XML ao Mercado Livre |
| **Edge: Shopee submit XML** | `supabase/functions/shopee-submit-xml/index.ts` | Envia XML à Shopee |
| **DB: Reservar número NF** | `supabase/migrations/20251231_create_fn_reservar_e_numerar_notas.sql` | `fn_reservar_e_numerar_notas()` |
| **DB: Trigger materialização** | `supabase/migrations/20251205_create_materialize_orders_trigger.sql` | `process_marketplace_order_presented_new()` |
| **DB: Tabela invoices** | `supabase/migrations/20260301_000005_create_invoices_table.sql` | Tabela nova de invoices |
| **DB: Status NF constraint** | `supabase/migrations/20251231_update_notas_fiscais_status_constraint_add_processando.sql` | CHECK constraint |
| **DB: Trigger estoque** | `supabase/migrations/20251223_phase2_triggers_inventory_jobs.sql` | `trg_presented_new_stock_flow()` |
| **DB: Mock emissão NF** | `supabase/migrations/20251229_create_rpc_mock_orders_emissao_nf.sql` | `rpc_create_mock_orders_emissao_nf()` |

---

## 9. Tabelas de Banco — Resumo das Interações

```
marketplace_orders_presented_new
  │ status_interno = 'Emissao NF' (entrada)
  │                → 'Processando NF' (rpc_queues_emit)
  │                → 'Falha na emissão' (erro Focus/SEFAZ)
  │                → 'subir xml' (NF autorizada)
  │                → 'Impressao' (XML enviado ao marketplace)
  │
  ├── xml_to_submit ←── focus-nfe-emit / focus-webhook salvam XML
  ├── marketplace_submission_status ←── submit-xml atualiza
  │
  ├── linked_products → resolve para products.ncm, products.cest
  │
  └── billing_name, billing_doc_number → dados do destinatário

invoices (nova)
  │ status: pending → queued → processing → authorized | error
  │ idempotency_key (UNIQUE): previne emissão duplicada
  └── focus_id, nfe_number, nfe_key → dados retornados pelo Focus

notas_fiscais (legada)
  │ status: pendente → processando_autorizacao → autorizada | rejeitada | denegada | cancelada
  │ numero, serie, chave_acesso → dados da NF
  │ xml_base64, pdf_base64 → documentos
  └── playload_enviado → payload enviado ao Focus (debug)

companies
  │ proxima_nfe → auto-incremento controlado por advisory lock
  │ serie_nfe → série da NF
  │ focus_token_producao / homologacao → tokens API Focus
  └── dados do emitente (CNPJ, razão social, endereço, IE)

company_tax_configs
  │ tax_regime → simples | lucro_presumido | lucro_real
  │ CFOPs → 4 variações (PF/PJ × dentro/fora estado)
  │ ICMS, PIS, COFINS, IPI → alíquotas e CST/CSOSN
  └── impacta diretamente o payload da NF

products
  │ ncm (obrigatório) → código fiscal do produto
  │ tax_origin_code (obrigatório) → origem fiscal
  │ cest → substituição tributária
  └── barcode → código de barras EAN

Filas (pgmq)
  q_emit_focus ← rpc_queues_emit enfileira
              → emit-queue-consume consome → emit-invoice
  q_submit_xml ← focus-nfe-emit enfileira após autorização
               → emit-queue-consume consome → submit-xml
```

---

## 10. Notas Técnicas

### Coexistência de `invoices` e `notas_fiscais`

O sistema mantém **duas tabelas de NF**:
- **`invoices`** (nova): Usada pelo `emit-invoice` para controle de idempotência e rastreamento de status
- **`notas_fiscais`** (legada): Usada pelo `focus-nfe-emit` e `focus-webhook` para armazenar dados completos da NF (XML, PDF, payload)

Ambas são atualizadas durante o fluxo. A tabela `invoices` é o ponto de entrada, e `notas_fiscais` é onde os dados fiscais completos ficam.

### Ambientes (Homologação vs Produção)

- O ambiente é selecionado pelo usuário no frontend (NfeFilterBar)
- Armazenado em `localStorage` (key `nfe_environment`)
- Afeta: URL da API Focus, token utilizado, e numeração de NF
- NFs de homologação **não têm validade fiscal**

### Advisory Lock na Numeração

A função `fn_reservar_e_numerar_notas()` usa `pg_advisory_xact_lock()` para garantir que dois pedidos não recebam o mesmo número de NF, mesmo em processamento concorrente.

### Trigger de Estoque

O trigger `trg_presented_new_stock_flow` (em `marketplace_orders_presented_new`) cria jobs de reserva de estoque quando `status_interno` muda para `'Emissao NF'`, `'Impressao'` ou `'Aguardando Coleta'` — mas **somente se `has_unlinked_items = false`**.

### Vinculação Automática por SKU na Emissão

Mesmo se o trigger considerou um item como "vinculado" por ter `seller_sku`, o `focus-nfe-emit` ainda precisa resolver o produto para obter NCM e dados fiscais. Se não encontrar, a emissão falha.
