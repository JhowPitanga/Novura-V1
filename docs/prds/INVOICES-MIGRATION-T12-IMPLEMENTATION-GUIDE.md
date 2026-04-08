# INVOICES-MIGRATION-T12 — Guia de Implementação para Agente LLM

> **Objetivo**: Este documento instrui um agente LLM a migrar o sistema de persistência de NF-e do Novura ERP da tabela legada `notas_fiscais` para a tabela canônica `invoices`. Ele contém todo o contexto necessário — arquitetura existente, contratos de tipo, schema de ambas as tabelas, bugs catalogados, e critérios de aceite — para que o agente produza código correto, testável e sem referências à tabela legada.

---

## 0. Premissa Fundamental

**A tabela `invoices` é a única fonte de verdade para NF-e.**

A tabela `notas_fiscais` é **legada** e deve ser removida de todo código novo ou refatorado. A migration `20260301_000005_create_invoices_table.sql` declara explicitamente: _"replaces notas_fiscais"_.

A infraestrutura para `invoices` já existe completa:
- **`_shared/ports/invoices-port.ts`** — `InvoicesPort` (interface)
- **`_shared/adapters/invoices/invoices-adapter.ts`** — `InvoicesAdapter` (implementação)
- **`emit-invoice/index.ts`** — edge function idempotente para emissão
- **`emit-invoice/process-emission.ts`** — algoritmo de 5 passos com deduplicação por `idempotency_key`

O código deve usar `InvoicesPort` / `InvoicesAdapter` em vez de criar nova abstração sobre `notas_fiscais`.

---

## 1. Princípios Obrigatórios

### 1.1 SOLID

| Princípio | Como aplicar neste projeto |
|---|---|
| **S — Single Responsibility** | `focus-nfe-emit` deve apenas montar o payload NFe e chamar a Focus API. Persistência de invoice vai para `InvoicesAdapter`. Status vai para `RecalculateOrderStatusUseCase`. |
| **O — Open/Closed** | Não modificar a interface `InvoicesPort` para adicionar comportamento de `notas_fiscais`. Se houver campo faltante em `invoices`, adicionar via migration SQL. |
| **L — Liskov Substitution** | `InvoicesAdapter` é substituível por mocks (`InvoicesPort`) nos testes sem alterar use cases. |
| **I — Interface Segregation** | O port `INfePort` criado no T11 deve ser **removido** e substituído por `InvoicesPort`. Não coexistir duas abstrações para a mesma coisa. |
| **D — Dependency Inversion** | Use cases dependem de `InvoicesPort` (interface), nunca de `InvoicesAdapter` (classe concreta) ou de queries diretas a `invoices`. |

### 1.2 Regras de Código

1. **Zero referências a `notas_fiscais`** em código novo. Para código refatorado, remover todas as referências.
2. **`idempotency_key`** é obrigatório em toda operação de criação de invoice. Formato: `{organizationId}:{orderId}:{environment}`.
3. **Máximo 150 linhas por arquivo, 50 linhas por função**. `focus-nfe-emit` (1557 linhas) deve ser decomposto.
4. **Zero `catch {}` vazio**. Todo catch deve ter `console.error` e, se possível, um fallback.
5. **`has_invoice` em `orders`** deve ser derivado de `invoices.status = 'authorized'`, não de `notas_fiscais`.
6. **JSDoc em inglês** em toda função pública nova ou alterada no backend.

---

## 2. Estado Atual (Antes da Migração)

### 2.1 Tabela `notas_fiscais` (LEGADA — remover)

Campos relevantes:

```
id, organization_id, company_id, order_id, marketplace_order_id, marketplace,
pack_id, status, status_focus, emissao_ambiente, focus_nfe_id, nfe_key,
nfe_number, serie, authorized_at, xml_base64, pdf_base64, error_details
```

Problemas:
- Sem `idempotency_key` — duplicação por re-emissão
- `xml_base64` / `pdf_base64` armazenam binário em base64 no banco (ineficiente)
- `status_focus` é string livre da API Focus (não normalizado)
- Sem RLS confiável para multi-tenant
- Sequência de `nfe_number` consulta a própria tabela (`MAX(nfe_number)`) — race condition

### 2.2 Tabela `invoices` (CANÔNICA — usar)

Schema (migration `20260301_000005_create_invoices_table.sql`):

```sql
id                              uuid PRIMARY KEY
organization_id                 uuid NOT NULL REFERENCES organizations(id)
order_id                        uuid REFERENCES orders(id)
company_id                      uuid NOT NULL REFERENCES companies(id)
idempotency_key                 text NOT NULL UNIQUE        -- deduplicação
focus_id                        text                        -- ID retornado pela Focus API
nfe_number                      integer
nfe_key                         text
serie                           text
status                          text NOT NULL DEFAULT 'pending'
emission_environment            text NOT NULL DEFAULT 'homologacao'
xml_url                         text                        -- URL (não base64)
pdf_url                         text                        -- URL (não base64)
marketplace                     text
marketplace_order_id            text
marketplace_submission_status   text
marketplace_submission_at       timestamptz
total_value                     numeric(18,6)
payload_sent                    jsonb                       -- payload completo enviado à Focus
error_message                   text
error_code                      text
retry_count                     integer NOT NULL DEFAULT 0
emitted_at                      timestamptz
authorized_at                   timestamptz
canceled_at                     timestamptz
created_at                      timestamptz NOT NULL DEFAULT now()
updated_at                      timestamptz NOT NULL DEFAULT now()
```

Ciclo de vida do `status`:
```
pending → queued → processing → authorized
                              → rejected
                              → canceled
                → error (retry até retry_count = 5)
```

### 2.3 Infraestrutura `invoices` já existente

#### `InvoicesPort` — `_shared/ports/invoices-port.ts`

```typescript
export interface InvoicesPort {
  findByIdempotencyKey(admin: SupabaseClient, key: string): Promise<InvoiceRow | null>
  createQueued(admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow>
  markProcessing(admin: SupabaseClient, id: string, focusId: string): Promise<void>
  markError(admin: SupabaseClient, id: string, message: string, retryCount: number): Promise<void>
  markAuthorized(admin: SupabaseClient, id: string, nfeKey: string, nfeNumber: number): Promise<void>
}
```

#### `InvoiceRow` — `_shared/ports/invoices-port.ts`

```typescript
export interface InvoiceRow {
  id: string
  organization_id: string
  order_id: string | null
  company_id: string
  idempotency_key: string
  focus_id: string | null
  nfe_number: number | null
  nfe_key: string | null
  status: InvoiceStatus           // 'pending' | 'queued' | 'processing' | 'authorized' | 'rejected' | 'canceled' | 'error'
  emission_environment: EmissionEnvironment
  retry_count: number
  error_message: string | null
  payload_sent: FocusNfePayload | null
  marketplace: string | null
  marketplace_order_id: string | null
  total_value: number | null
  created_at: string
  updated_at: string
}
```

#### `InvoicesAdapter` — `_shared/adapters/invoices/invoices-adapter.ts`

Implementa `InvoicesPort`. Já completo e testado. Não modificar.

#### `emit-invoice/index.ts` + `process-emission.ts`

Já usam `invoices` com o padrão idempotente. Servem como referência de uso correto da infraestrutura.

### 2.4 Arquivos com referências a `notas_fiscais` (a migrar)

| Arquivo | Qtd. referências | Complexidade |
|---|---|---|
| `supabase/functions/focus-nfe-emit/index.ts` | 30+ | Alta (1557 linhas, lógica de numeração) |
| `supabase/functions/focus-webhook/index.ts` | 10+ | Média (atualiza status pós-autorização) |
| `supabase/functions/_shared/adapters/orders/SupabaseNfeAdapter.ts` | 4 | Baixa (remover arquivo inteiro) |
| `supabase/functions/_shared/domain/orders/ports/INfePort.ts` | 1 (JSDoc) | Baixa (remover arquivo inteiro) |
| `supabase/functions/_shared/application/orders/EmitNfeUseCase.ts` | 0 (usa INfePort) | Baixa (trocar port) |
| `supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts` | 0 (usa notas_fiscais indiretamente via has_invoice) | Média (mudar fonte de hasInvoice) |
| `docs/FLUXO_EMISSAO_NF.md` | textual | Baixa |

---

## 3. Gaps no Schema de `invoices`

Campos que existem em `notas_fiscais` mas **NÃO existem em `invoices`** e que são necessários para a migração:

| Campo (`notas_fiscais`) | Valor | Ação |
|---|---|---|
| `xml_base64` | XML binário | Ignorar — `invoices` usa `xml_url` (URL externa). Verificar se Focus retorna URL. Se não, omitir por ora. |
| `pdf_base64` | PDF binário | Idem. |
| `pack_id` | ID de pack ML | Adicionar coluna via migration SQL (Task I0). |
| `status_focus` | Status bruto da API Focus | Mapear para `status` normalizado. Ignorar valor bruto. |
| `error_details` | JSON de detalhes de erro SEFAZ | Mapear para `error_message` (texto) + `error_code`. |
| `emissao_ambiente` | `'homologacao'` / `'producao'` | Já existe como `emission_environment`. |
| `focus_nfe_id` | ID numérico Focus | Já existe como `focus_id`. |

**Migration SQL necessária (Task I0)**:
```sql
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pack_id text;
CREATE INDEX IF NOT EXISTS invoices_pack_id_idx ON invoices (pack_id);
```

---

## 4. Mapeamento de Status

| `notas_fiscais.status` (PT) | `invoices.status` (EN) |
|---|---|
| `emissão nf` / `emissao nf` | `queued` |
| `processando` | `processing` |
| `autorizado` | `authorized` |
| `falha na emissão` | `error` |
| `cancelado` / `cancelada` | `canceled` |
| `subir xml` | `authorized` (XML já disponível) |

---

## 5. Tasks de Implementação

### Task I0 — Migration SQL: adicionar `pack_id` à tabela `invoices`

**Arquivo novo**: `supabase/migrations/20260408_000001_invoices_add_pack_id.sql`

```sql
-- Add pack_id to invoices for Mercado Livre pack grouping support.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pack_id text;
CREATE INDEX IF NOT EXISTS invoices_pack_id_idx ON invoices (pack_id);
```

**Não depende de outras tasks. Executar primeiro.**

---

### Task I1 — Remover `INfePort.ts` e `SupabaseNfeAdapter.ts`

**Arquivos a remover**:
- `supabase/functions/_shared/domain/orders/ports/INfePort.ts`
- `supabase/functions/_shared/adapters/orders/SupabaseNfeAdapter.ts`

**Justificativa**: São uma duplicação da infraestrutura `InvoicesPort` / `InvoicesAdapter` que já existe e já está alinhada com a tabela `invoices`. Manter dois ports para a mesma responsabilidade viola ISP e DRY.

**Antes de remover**, verificar todos os importadores:
```bash
grep -r "INfePort\|SupabaseNfeAdapter\|InvoiceRecord" supabase/functions/ --include="*.ts" -l
```

Os únicos importadores conhecidos são `EmitNfeUseCase.ts` e `focus-nfe-emit/index.ts` — ambos serão refatorados nas tasks I2 e I4.

---

### Task I2 — Refatorar `EmitNfeUseCase.ts` para usar `InvoicesPort`

**Arquivo**: `supabase/functions/_shared/application/orders/EmitNfeUseCase.ts`

**Estado atual**: usa `INfePort` (a ser removida). Assinatura de `execute()`:
```typescript
async execute(input: {
  orderId: string;
  invoice: InvoiceRecord;    // ← tipo de notas_fiscais
  authorized: boolean;
}): Promise<EmitNfeResult>
```

**Novo contrato** (alinhar com `InvoicesPort`):

```typescript
import type { InvoicesPort } from '../../ports/invoices-port.ts'
import type { SupabaseClient } from '../../adapters/infra/supabase-client.ts'

export interface EmitNfeInput {
  readonly orderId: string
  readonly organizationId: string
  readonly companyId: string
  readonly environment: 'homologacao' | 'producao'
  readonly focusId: string | null
  readonly nfeKey: string | null
  readonly nfeNumber: number | null
  readonly authorized: boolean
  readonly errorMessage: string | null
}

export interface EmitNfeResult {
  readonly orderId: string
  readonly ok: boolean
  readonly error?: string
}

export class EmitNfeUseCase {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly orderRepo: IOrderRepository,
    private readonly invoicesPort: InvoicesPort,              // ← InvoicesPort (não INfePort)
    private readonly recalculateOrderStatus: RecalculateOrderStatusUseCase,
  ) {}

  async execute(input: EmitNfeInput): Promise<EmitNfeResult> {
    const order = await this.orderRepo.findById(input.orderId)
    if (!order) return { orderId: input.orderId, ok: false, error: 'Order not found' }

    const idempotencyKey = `${input.organizationId}:${input.orderId}:${input.environment}`

    if (input.authorized && input.nfeKey && input.nfeNumber !== null) {
      const existing = await this.invoicesPort.findByIdempotencyKey(this.admin, idempotencyKey)
      if (existing?.id) {
        await this.invoicesPort.markAuthorized(this.admin, existing.id, input.nfeKey, input.nfeNumber)
      }
      await this.orderRepo.updateInternalFlags(input.orderId, { hasInvoice: true })
    } else if (input.errorMessage) {
      const existing = await this.invoicesPort.findByIdempotencyKey(this.admin, idempotencyKey)
      if (existing?.id) {
        await this.invoicesPort.markError(this.admin, existing.id, input.errorMessage, existing.retry_count)
      }
    }

    try {
      await this.recalculateOrderStatus.execute(input.orderId, 'nfe_emission')
    } catch (e) {
      console.error('[EmitNfeUseCase] recalculate failed:', e)
    }

    return { orderId: input.orderId, ok: true }
  }
}
```

**Princípios**: DIP (depende de `InvoicesPort`, não de adapter), SRP (orquestra side-effects, não persiste invoice diretamente).

**Testes** — atualizar `EmitNfeUseCase.test.ts`:
- Mock de `InvoicesPort` substituindo mock de `INfePort`
- Verificar que `markAuthorized` é chamado quando `authorized=true` e `nfeKey` fornecido
- Verificar que `updateInternalFlags({ hasInvoice: true })` é chamado após autorização
- Verificar que `markError` é chamado quando `authorized=false` e `errorMessage` fornecido
- Verificar que `recalculateOrderStatus.execute` sempre é chamado

---

### Task I3 — Migrar `SupabaseOrderRepository` para derivar `hasInvoice` de `invoices`

**Arquivo**: `supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts`

**Problema atual**: O campo `has_invoice` em `orders` é setado manualmente. O `findById` deve refletir se existe uma invoice autorizada na tabela `invoices`.

**Localizar** o método `findById` e o trecho que monta `MarketplaceSignals`. Atualmente pode usar `orders.has_invoice` (coluna) diretamente. Verificar se essa coluna é atualizada via `updateInternalFlags`.

**Ação**: Não alterar a leitura de `has_invoice` — ela já é atualizada por `EmitNfeUseCase.execute()` via `updateInternalFlags({ hasInvoice: true })`. **Verificar** se há algum código que deriva `hasInvoice` consultando `notas_fiscais` diretamente — se houver, remover e confiar em `orders.has_invoice`.

```bash
grep -n "notas_fiscais\|has_invoice" supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts
```

Se encontrar referência a `notas_fiscais`, substituir pela leitura de `orders.has_invoice` (já disponível no JOIN via `orders.*`).

---

### Task I4 — Migrar `focus-nfe-emit/index.ts` de `notas_fiscais` para `invoices`

**Arquivo**: `supabase/functions/focus-nfe-emit/index.ts` (1557 linhas)

Este é o arquivo mais complexo. Deve ser decomposto em múltiplos módulos conforme a regra de 150 linhas.

#### 4.1 Estrutura proposta após refatoração

```
supabase/functions/focus-nfe-emit/
├── index.ts                    # Entry point HTTP (≤80 linhas)
├── build-nfe-payload.ts        # Monta FocusNfePayload a partir de OrderRecord (≤150 linhas)
├── emit-single-order.ts        # Processa um único orderId (≤150 linhas)
└── nfe-sequence.ts             # Lógica de numeração NFe (≤80 linhas)
```

#### 4.2 `index.ts` — Entry point (≤80 linhas)

Responsabilidades:
- Parse do request body (`organizationId`, `companyId`, `orderIds`, `environment`)
- Instanciar dependências (`orderRepo`, `invoicesAdapter`, `emitNfeUseCase`)
- Iterar `orderIds` chamando `emitSingleOrder` para cada um
- Retornar `{ ok: boolean, results: Array<{ orderId, ok, error? }> }`

**Remover**: todas as queries diretas a `notas_fiscais`.

#### 4.3 `emit-single-order.ts` — Processamento por pedido (≤150 linhas)

Responsabilidades:
1. Buscar `OrderRecord` via `IOrderRepository.findById(orderId)`
2. Verificar se `invoices` já tem entry `authorized` para esse pedido (via `InvoicesPort.findByIdempotencyKey`) — early return se sim
3. Chamar `buildNfePayload(order, company)` para montar `FocusNfePayload`
4. Criar entry `queued` em `invoices` via `InvoicesPort.createQueued()`
5. Chamar Focus NFe API (POST para `{apiBase}/v2/nfe?ref={ref}`)
6. Conforme resultado:
   - Sucesso imediato (status `autorizado`): chamar `invoicesPort.markAuthorized()`, depois `emitNfeUseCase.execute({ authorized: true, ... })`
   - Em processamento: chamar `invoicesPort.markProcessing()`
   - Erro: chamar `invoicesPort.markError()`, depois `emitNfeUseCase.execute({ authorized: false, errorMessage: ... })`

**Remover**:
- Toda query a `notas_fiscais`
- Toda lógica de `status_interno` e update de `marketplace_orders_presented_new`
- O hardcoded polling URL `https://api.focusnfe.com.br` — usar variável `apiBase` calculada a partir de `environment`

**`apiBase` correto**:
```typescript
const apiBase = environment === 'producao'
  ? 'https://api.focusnfe.com.br'
  : 'https://homologacao.focusnfe.com.br'
```

#### 4.4 `nfe-sequence.ts` — Numeração NFe (≤80 linhas)

**Problema atual**: A função de numeração consulta `notas_fiscais` para encontrar o `MAX(nfe_number)` — sujeito a race condition.

**Ação**: Migrar para consultar `invoices` no lugar de `notas_fiscais`:

```typescript
/** Returns the next NFe number to use for a company/environment pair. */
export async function resolveNfeNumber(
  admin: SupabaseClient,
  companyId: string,
  environment: 'homologacao' | 'producao',
  proximaNfeFromCompany: number | null,
): Promise<{ nfeNumber: number; serie: string }> {
  // 1. Try fn_reservar_e_numerar_notas RPC first (atomic, avoids races)
  // 2. Fallback: MAX(nfe_number) FROM invoices WHERE company_id = ? AND emission_environment = ?
  //    AND status IN ('authorized', 'processing')
  // 3. Fallback: companies.proxima_nfe
}
```

**Notar**: O RPC `fn_reservar_e_numerar_notas` já existe (criado na migration `20251231_create_fn_reservar_e_numerar_notas.sql`). Verificar se ele usa `notas_fiscais` internamente:

```bash
cat supabase/migrations/20251231_create_fn_reservar_e_numerar_notas.sql
```

Se o RPC internamente usa `notas_fiscais`, criar uma nova versão que usa `invoices` ou simplesmente usar `MAX(nfe_number) FROM invoices` como fallback.

#### 4.5 `build-nfe-payload.ts` — Construção do payload (≤150 linhas)

Extrair toda a lógica de montagem do `FocusNfePayload` a partir de `OrderRecord` + `Company`. Essa lógica não tem dependência de banco — é pura transformação de dados.

**Input**:
```typescript
interface BuildNfePayloadInput {
  order: OrderRecord          // orders + order_items + order_shipping
  company: CompanyRecord      // dados fiscais do emitente
  nfeNumber: number
  serie: string
  environment: 'homologacao' | 'producao'
  packId: string | null
}
```

**Output**: `FocusNfePayload` (tipo já definido em `_shared/domain/focus/focus-nfe-payload.types.ts`)

**Remover**: qualquer referência a `marketplace_orders_presented_new` no mapeamento de campos.

#### 4.6 Campos migrados de `marketplace_orders_presented_new` para `orders`

A refatoração do T11 já mapeou esses campos. Usar exclusivamente:

| Campo antigo (`presented_new`) | Campo novo (`orders` / `order_items` / `order_shipping`) |
|---|---|
| `buyer_name` | `orders.buyer_name` |
| `buyer_document` | `orders.buyer_cpf` ou `orders.buyer_cnpj` |
| `address_*` | `order_shipping.address_*` |
| `logistic_type` | `order_shipping.logistic_type` |
| `items[].title` | `order_items[].title` |
| `items[].quantity` | `order_items[].quantity` |
| `items[].sku` | `order_items[].sku` |
| `total_amount` | `orders.gross_amount` |

---

### Task I5 — Migrar `focus-webhook/index.ts` de `notas_fiscais` para `invoices`

**Arquivo**: `supabase/functions/focus-webhook/index.ts`

O webhook da Focus NFe recebe notificações de mudança de status (ex: NF autorizada, cancelada) e atualmente atualiza `notas_fiscais`.

#### 5.1 Lógica atual (a migrar)

O webhook atualmente:
1. Recebe `{ ref, status, chave_nfe, numero, serie, ... }`
2. Busca a nota em `notas_fiscais` pelo `ref` (que é o `idempotency_key` ou `marketplace_order_id`)
3. Atualiza `status`, `nfe_key`, `nfe_number`, `authorized_at`, etc.
4. Opcionalmente atualiza `marketplace_orders_presented_new.status_interno`

#### 5.2 Ação

1. Substituir busca em `notas_fiscais` por `InvoicesAdapter.findByIdempotencyKey(admin, ref)`
2. Conforme `status` recebido da Focus:
   - `'autorizado'`: `invoicesPort.markAuthorized(admin, id, chave_nfe, numero)` + `emitNfeUseCase.execute({ authorized: true })`
   - `'cancelado'` / `'cancelada'`: UPDATE direto `invoices SET status='canceled', canceled_at=now()` (não existe método no port — adicionar `markCanceled` ao port ou fazer update raw)
   - `'erro'` / `'rejeitado'`: `invoicesPort.markError(admin, id, mensagem, retry_count)`
3. Remover todos os updates a `marketplace_orders_presented_new`
4. Após cada transição: chamar `RecalculateOrderStatusUseCase.execute(orderId, 'focus_webhook')`

#### 5.3 Adicionar `markCanceled` ao `InvoicesPort`

Se necessário para cancelamentos, estender o port:

```typescript
// Em _shared/ports/invoices-port.ts
markCanceled(admin: SupabaseClient, id: string): Promise<void>
```

E implementar em `InvoicesAdapter`:

```typescript
async markCanceled(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from('invoices')
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
    .eq('id', id)
  if (error) throw new Error(error.message)
}
```

#### 5.4 Resolução do `ref` → `orderId`

O webhook Focus usa `ref` como identificador. Verificar o formato atual:
- Se `ref` é o `idempotency_key` (`orgId:orderId:env`) → parsear e extrair `orderId`
- Se `ref` é o `marketplace_order_id` → buscar `orders` por `marketplace_order_id`

Adicionar ao `InvoicesPort` se necessário:
```typescript
findByMarketplaceOrderId(admin: SupabaseClient, marketplaceOrderId: string): Promise<InvoiceRow | null>
```

---

### Task I6 — Atualizar `SupabaseOrderRepository` para derivar `hasInvoice` de `invoices`

**Arquivo**: `supabase/functions/_shared/adapters/orders/SupabaseOrderRepository.ts`

**Ação**: Verificar o método `findById`. Se o campo `orders.has_invoice` não for populado automaticamente pela DB (trigger), garantir que ao montar `MarketplaceSignals` o campo `hasInvoice` reflete o estado real de `invoices`.

Opção A (preferida — sem JOIN adicional): confiar em `orders.has_invoice` que é atualizado por `EmitNfeUseCase` via `updateInternalFlags({ hasInvoice: true })`. Não fazer JOIN com `invoices` no `findById`.

Opção B (mais robusta): adicionar LEFT JOIN com `invoices` para popular `hasInvoice`:
```sql
SELECT o.*,
  EXISTS(
    SELECT 1 FROM invoices i
    WHERE i.order_id = o.id AND i.status = 'authorized'
  ) AS has_invoice
FROM orders o
WHERE o.id = $1
```

**Recomendação**: usar **Opção A** para não aumentar a complexidade do `findById`. O `has_invoice` em `orders` já funciona como cache materializado.

---

### Task I7 — Atualizar documentação

**Arquivos**:
- `docs/FLUXO_EMISSAO_NF.md` — atualizar todas as referências de `notas_fiscais` para `invoices`
- `docs/prds/STATUS-ENGINE-README.md` — atualizar glossário (linha 641: `notas_fiscais` está descrita como "Tabela de invoices" — corrigir)

**No `FLUXO_EMISSAO_NF.md`**, atualizar:
- Diagrama Mermaid: substituir `SupabaseNfeAdapter: upsertInvoice` → `InvoicesAdapter: createQueued / markAuthorized`
- Tabela de componentes: substituir `INfePort` → `InvoicesPort`, `SupabaseNfeAdapter` → `InvoicesAdapter`
- Seção "Estados NFe": alinhar com `InvoiceStatus` enum

---

### Task I8 — Migration de dados (opcional)

**Arquivo novo**: `supabase/migrations/20260408_000002_backfill_invoices_from_notas_fiscais.sql`

Se houver dados históricos em `notas_fiscais` que precisam aparecer em `invoices` para relatórios ou histórico:

```sql
-- Backfill invoices from notas_fiscais (best-effort, idempotent).
-- Only insert rows not already present (by idempotency_key).
INSERT INTO invoices (
  organization_id, order_id, company_id,
  idempotency_key, focus_id, nfe_number, nfe_key, serie,
  status, emission_environment, error_message, marketplace,
  marketplace_order_id, authorized_at, created_at, updated_at
)
SELECT
  nf.organization_id,
  nf.order_id,
  nf.company_id,
  COALESCE(o.organization_id, nf.organization_id) || ':' || nf.order_id::text || ':' || nf.emissao_ambiente AS idempotency_key,
  nf.focus_nfe_id::text AS focus_id,
  nf.nfe_number,
  nf.nfe_key,
  nf.serie,
  CASE nf.status
    WHEN 'autorizado'        THEN 'authorized'
    WHEN 'processando'       THEN 'processing'
    WHEN 'cancelado'         THEN 'canceled'
    WHEN 'cancelada'         THEN 'canceled'
    WHEN 'falha na emissão'  THEN 'error'
    WHEN 'emissao nf'        THEN 'queued'
    ELSE 'error'
  END AS status,
  nf.emissao_ambiente AS emission_environment,
  nf.error_details::text AS error_message,
  nf.marketplace,
  nf.marketplace_order_id,
  nf.authorized_at,
  nf.created_at,
  COALESCE(nf.authorized_at, nf.created_at) AS updated_at
FROM notas_fiscais nf
WHERE nf.order_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;
```

**Esta task é opcional e de baixo risco.** Executar apenas se os dados históricos de `notas_fiscais` forem necessários no dashboard de invoices.

---

## 6. Arquivos a Criar

```
supabase/migrations/
├── 20260408_000001_invoices_add_pack_id.sql          # I0
└── 20260408_000002_backfill_invoices_from_notas_fiscais.sql  # I8 (opcional)

supabase/functions/focus-nfe-emit/
├── build-nfe-payload.ts                              # I4 (extraído)
├── emit-single-order.ts                              # I4 (extraído)
└── nfe-sequence.ts                                   # I4 (extraído)
```

## 7. Arquivos a Modificar

| Arquivo | Task | Tipo de Mudança |
|---|---|---|
| `focus-nfe-emit/index.ts` | I4 | Decompor em módulos, remover notas_fiscais, usar InvoicesPort |
| `focus-webhook/index.ts` | I5 | Substituir notas_fiscais por InvoicesPort/markAuthorized/markCanceled |
| `_shared/application/orders/EmitNfeUseCase.ts` | I2 | Trocar INfePort por InvoicesPort |
| `_shared/application/orders/__tests__/EmitNfeUseCase.test.ts` | I2 | Atualizar mocks |
| `_shared/adapters/orders/SupabaseOrderRepository.ts` | I6 | Verificar + corrigir fonte de hasInvoice |
| `_shared/ports/invoices-port.ts` | I5 | Adicionar markCanceled (se necessário) |
| `_shared/adapters/invoices/invoices-adapter.ts` | I5 | Implementar markCanceled (se necessário) |
| `docs/FLUXO_EMISSAO_NF.md` | I7 | Atualizar referências notas_fiscais → invoices |
| `docs/prds/STATUS-ENGINE-README.md` | I7 | Corrigir glossário |

## 8. Arquivos a Remover

| Arquivo | Task | Motivo |
|---|---|---|
| `_shared/domain/orders/ports/INfePort.ts` | I1 | Duplicação de InvoicesPort |
| `_shared/adapters/orders/SupabaseNfeAdapter.ts` | I1 | Duplicação de InvoicesAdapter |

---

## 9. Ordem de Execução

```
I0 (migration SQL — sem dependências, executar primeiro)
  ↓
I1 (remover INfePort + SupabaseNfeAdapter)
  ↓
I2 (refatorar EmitNfeUseCase → InvoicesPort)
  ↓
I3 (verificar SupabaseOrderRepository)
  ↓
I4 (migrar focus-nfe-emit → invoices)  ←── maior esforço
  ↓
I5 (migrar focus-webhook → invoices)
  ↓
I6 (verificação final SupabaseOrderRepository)
  ↓
I7 (docs)
  ↓
I8 (backfill SQL — opcional, pode ser feito a qualquer momento após I0)
```

---

## 10. Estratégia de Testes

### 10.1 Testes Unitários (Deno — backend)

**Padrão de mock para `InvoicesPort`**:

```typescript
class MockInvoicesAdapter implements InvoicesPort {
  public findCalls: string[] = []
  public createCalls: CreateInvoiceInput[] = []
  public markProcessingCalls: Array<{ id: string; focusId: string }> = []
  public markErrorCalls: Array<{ id: string; message: string; retryCount: number }> = []
  public markAuthorizedCalls: Array<{ id: string; nfeKey: string; nfeNumber: number }> = []

  private existingRow: InvoiceRow | null = null
  givenExisting(row: InvoiceRow) { this.existingRow = row; return this; }

  async findByIdempotencyKey(_admin: any, key: string): Promise<InvoiceRow | null> {
    this.findCalls.push(key)
    return this.existingRow
  }
  async createQueued(_admin: any, input: CreateInvoiceInput): Promise<InvoiceRow> {
    this.createCalls.push(input)
    return { id: 'inv-001', status: 'queued', retry_count: 0, ...input } as InvoiceRow
  }
  async markProcessing(_admin: any, id: string, focusId: string): Promise<void> {
    this.markProcessingCalls.push({ id, focusId })
  }
  async markError(_admin: any, id: string, message: string, retryCount: number): Promise<void> {
    this.markErrorCalls.push({ id, message, retryCount })
  }
  async markAuthorized(_admin: any, id: string, nfeKey: string, nfeNumber: number): Promise<void> {
    this.markAuthorizedCalls.push({ id, nfeKey, nfeNumber })
  }
}
```

**Cobertura mínima por task**:

| Task | Cenários obrigatórios |
|---|---|
| I2 (EmitNfeUseCase) | authorized=true → markAuthorized + hasInvoice=true; authorized=false + errorMessage → markError; order not found → ok=false; recalculate sempre chamado |
| I4 (focus-nfe-emit) | emissão nova → createQueued; emissão já autorizada → early return sem chamar Focus; erro Focus → markError |
| I5 (focus-webhook) | webhook autorizado → markAuthorized + recalculate; webhook cancelado → markCanceled + recalculate; ref inválido → 422 |

### 10.2 Assertion de Ausência de `notas_fiscais`

Para cada arquivo refatorado, incluir um teste que verifica que o código-fonte não contém a string proibida:

```typescript
Deno.test('focus-nfe-emit: no reference to notas_fiscais', async () => {
  const src = await Deno.readTextFile(new URL('../index.ts', import.meta.url))
  assertEquals(src.includes('notas_fiscais'), false,
    'focus-nfe-emit must not reference notas_fiscais')
})
```

Replicar para `focus-webhook/index.ts` e `EmitNfeUseCase.ts`.

---

## 11. Definition of Done

- [ ] Zero ocorrências de `notas_fiscais` em arquivos modificados/criados
- [ ] `INfePort.ts` e `SupabaseNfeAdapter.ts` removidos do repositório
- [ ] `EmitNfeUseCase` usa `InvoicesPort` (não `INfePort`)
- [ ] `focus-nfe-emit` decomposto em ≤4 arquivos, nenhum com >150 linhas
- [ ] `focus-webhook` atualiza `invoices` (não `notas_fiscais`)
- [ ] `has_invoice` em `orders` continua sendo atualizado corretamente após autorização
- [ ] Testes de ausência de `notas_fiscais` passando para os 3 arquivos principais
- [ ] `deno check` sem erros nos arquivos alterados
- [ ] Migration SQL `I0` criada e documentada
- [ ] `docs/FLUXO_EMISSAO_NF.md` sem referências a `notas_fiscais`

---

## 12. Glossário

| Termo | Significado |
|---|---|
| `invoices` | Tabela canônica de NF-e. **Fonte de verdade.** Substituiu `notas_fiscais`. |
| `notas_fiscais` | Tabela **LEGADA**. NÃO usar em código novo. Será dropada após backfill. |
| `idempotency_key` | Chave única de deduplicação: `{organizationId}:{orderId}:{environment}`. Garante que a mesma NF não seja emitida duas vezes. |
| `InvoicesPort` | Interface de persistência de invoices. Vive em `_shared/ports/invoices-port.ts`. |
| `InvoicesAdapter` | Implementação concreta de `InvoicesPort` contra Supabase. Vive em `_shared/adapters/invoices/`. |
| `INfePort` | Port **LEGADO** criado no T11. A ser removido. |
| `SupabaseNfeAdapter` | Adapter **LEGADO** criado no T11. A ser removido. |
| `emit-invoice` | Edge function idempotente que orquestra a emissão via `processEmission`. Usar como referência de padrão correto. |
| `focus-nfe-emit` | Edge function de baixo nível que chama a Focus API. A ser refatorada neste T12. |
| `focus-webhook` | Edge function que recebe callbacks da Focus API pós-autorização. A ser migrada neste T12. |
| `has_invoice` | Flag boolean em `orders.has_invoice`. Setado por `EmitNfeUseCase` quando invoice é autorizada. Alimenta `hasInvoice` em `MarketplaceSignals`. |
| `apiBase` | URL base da Focus API. Dinâmico: `homologacao.focusnfe.com.br` ou `api.focusnfe.com.br`. |
