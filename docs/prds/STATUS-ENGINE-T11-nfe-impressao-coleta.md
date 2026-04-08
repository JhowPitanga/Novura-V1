# STATUS-ENGINE-T11 — Fluxos de Emissão NFe, Impressão e Coleta

**Ciclo:** Correções e melhorias de status operacionais (NFe, impressão, coleta)

**Status:** Planejamento

**Depende de:** STATUS-ENGINE T1–T4 (implementados), T6 (implementado)

**Bloqueia:** Operação diária estável e features do Cycle 1 que dependem desses fluxos

**Relacionado:** [STATUS-ENGINE-README.md](./STATUS-ENGINE-README.md) (T1–T10)

---

## 1. Contexto e diagnóstico

O sistema está em transição do pipeline legado (`marketplace_orders_presented_new` + triggers SQL) para o novo motor de status (`orders` + `OrderStatusEngine`). Os três fluxos operacionais críticos — **Emissão NFe**, **Impressão** e **Coleta** — possuem bugs, inconsistências e condições de corrida que impactam a operação diária.

### Arquitetura atual (dual pipeline)

```mermaid
flowchart TD
    Webhook["Webhook ML/Shopee"] --> Worker["orders-queue-worker"]
    Worker --> Normalize["Normaliza dados"]
    Normalize --> UpsertOrders["Upsert orders + order_items"]
    UpsertOrders --> Recalculate["RecalculateOrderStatusUseCase"]
    Recalculate --> Engine["OrderStatusEngine.calculate()"]
    Engine --> StatusOrders["orders.status (EN slugs)"]

    Webhook --> RawTable["marketplace_orders_raw"]
    RawTable --> Trigger["trigger on_raw_change"]
    Trigger --> ProcessPresented["process_marketplace_order_presented_new()"]
    ProcessPresented --> StatusPresented["presented_new.status_interno (PT strings)"]

    StatusOrders --> Frontend["Frontend lê orders"]
    StatusPresented --> LegacyUI["Componentes legados"]
```

### Ordem das regras no motor (Chain of Responsibility)

```
1. CancelledRule       → cancelled
2. ReturnedRule        → returned
3. FulfillmentRule     → shipped (Full)
4. UnlinkedRule        → unlinked
5. ShippedRule         → shipped
6. AwaitingPickupRule  → awaiting_pickup
7. ReadyToPrintRule    → ready_to_print
8. InvoicePendingRule  → invoice_pending
9. PendingRule         → pending (fallback)
```

**Problema crítico de prioridade:** `ShippedRule` está acima de `AwaitingPickupRule` e `ReadyToPrintRule`. Se o marketplace reportar `shipped` antes do sistema processar a impressão, o pedido pode ir direto para `shipped` sem passar por coleta. A `InvoicePendingRule` está abaixo de `ReadyToPrintRule`, o que pode fazer um pedido ir para "Impressão" mesmo com NF pendente se os sinais forem ambíguos.

---

## 2. Fluxo atual: Emissão NFe

### Caminho feliz

```mermaid
sequenceDiagram
    participant WH as Webhook
    participant QW as orders-queue-worker
    participant ENG as OrderStatusEngine
    participant UI as Frontend
    participant RPC as rpc_queues_emit
    participant EQC as emit-queue-consume
    participant FNE as focus-nfe-emit
    participant FOC as Focus API
    participant WBH as focus-webhook

    WH->>QW: Pedido com shipment_substatus=invoice_pending
    QW->>ENG: calculate(signals, linkState)
    ENG-->>QW: invoice_pending
    QW->>UI: orders.status = invoice_pending

    UI->>RPC: Emitir NFe (orderIds)
    Note over RPC: Atualiza presented_new.status_interno = Processando NF
    RPC->>EQC: pgmq q_emit_focus
    EQC->>FNE: POST focus-nfe-emit
    FNE->>FOC: POST /v2/nfe
    FOC-->>FNE: autorizada
    FNE->>FNE: Grava notas_fiscais
    Note over FNE: Atualiza presented_new.status_interno = subir xml

    FOC->>WBH: Webhook autorização
    WBH->>WBH: Atualiza notas_fiscais
```

### Bugs identificados

| ID | Bug | Impacto | Arquivo(s) |
| --- | --- | --- | --- |
| NFE-B1 | `useNfeStatus.ts` filtra por `internalStatus` em português (`emissao nf`, `subir xml`, `falha na emissao`) mas `orders.status` retorna slugs EN (`invoice_pending`) — o hook pode não encontrar pedidos no pipeline novo | Crítico — badges NFe zerados | `src/hooks/useNfeStatus.ts` |
| NFE-B2 | `useOrderFiltering.ts` calcula `nfeOrdersAll` filtrando por `emissao_nf`, `falha_na_emissao`, `subir_xml` — não inclui `invoice_pending` | Alto — contagens de badges incorretas | `src/hooks/useOrderFiltering.ts` |
| NFE-B3 | `focus-nfe-emit` grava em `notas_fiscais` e `marketplace_orders_presented_new` mas não atualiza `orders.status` nem `invoices` | Crítico — duas fontes de verdade divergem | `supabase/functions/focus-nfe-emit/index.ts` |
| NFE-B4 | `focus-nfe-emit` polling usa URL de produção mesmo em modo homologação | Médio — homologação quebrada | `supabase/functions/focus-nfe-emit/index.ts` |
| NFE-B5 | `emit-queue-consume` agrega batches com `orgForBatch`/`companyForBatch` do primeiro item — mistura organizações se a fila tiver mensagens de orgs diferentes | Alto — risco operacional | `supabase/functions/emit-queue-consume/index.ts` |
| NFE-B6 | Sucesso parcial no batch remove mensagens de pedidos que falharam | Médio — pedidos falhos perdem reprocessamento | `supabase/functions/emit-queue-consume/index.ts` |
| NFE-B7 | `catch { }` vazio em `useNfeStatus.ts` — erros de rede silenciados | Baixo — UX sem feedback | `src/hooks/useNfeStatus.ts` |
| NFE-B8 | `NfeEmissionList.tsx` consulta `orders.status` com valores em PT (`Emissao NF`) — pode retornar zero linhas | Crítico — componente quebrado | `src/components/orders/NfeEmissionList.tsx` |

---

## 3. Fluxo atual: Impressão

### Caminho feliz

```mermaid
sequenceDiagram
    participant WH as Webhook
    participant QW as orders-queue-worker
    participant ENG as OrderStatusEngine
    participant UI as Frontend
    participant MLP as mark-labels-printed
    participant UC as MarkOrderLabelPrintedUseCase

    WH->>QW: shipment_substatus=ready_to_print
    QW->>ENG: calculate(signals, linkState)
    ENG-->>QW: ready_to_print
    QW->>UI: orders.status = ready_to_print

    UI->>UI: Seleciona pedidos, abre PDF etiqueta
    UI->>MLP: POST mark-labels-printed {orderIds}
    MLP->>UC: execute(orderId)
    UC->>UC: updateInternalFlags(isPrintedLabel: true)
    UC->>ENG: recalculate
    ENG-->>UC: awaiting_pickup
    UC->>UC: updateStatus + addStatusHistory
```

### Bugs identificados

| ID | Bug | Impacto | Arquivo(s) |
| --- | --- | --- | --- |
| PRINT-B1 | `mark-labels-printed` atualiza `orders.is_printed_label` mas não atualiza `marketplace_orders_presented_new` — tabela legada dessincronizada | Alto | `supabase/functions/mark-labels-printed/index.ts` |
| PRINT-B2 | `ReadyToPrintRule` aceita `substatus=pending` e `substatus=buffered` além de `ready_to_print` — falso positivo possível | Médio | `supabase/functions/_shared/domain/orders/rules/ReadyToPrintRule.ts` |
| PRINT-B3 | `AwaitingPickupRule` verifica apenas `isPrintedLabel` — regra frágil (depende da posição na cadeia) | Baixo | `supabase/functions/_shared/domain/orders/rules/AwaitingPickupRule.ts` |
| PRINT-B4 | `fetchAllOrders` pode não trazer dados completos de etiqueta — UI sem PDF para impressão | Alto | `src/services/orders.service.ts` |
| PRINT-B5 | `InvoicePendingRule` está abaixo de `ReadyToPrintRule` no engine — Shopee sem invoice pode ir para "Impressão" antes da NF | Alto | `supabase/functions/_shared/application/orders/OrderStatusEngine.ts` |

---

## 4. Fluxo atual: Aguardando coleta

### Caminho feliz

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant MLP as mark-labels-printed
    participant ENG as OrderStatusEngine
    participant WH as Webhook ML/Shopee

    Note over UI: Pedido em ready_to_print
    UI->>MLP: Marca como impresso
    MLP->>ENG: Recalcula com isPrintedLabel=true
    ENG-->>MLP: awaiting_pickup

    Note over WH: Marketplace reporta envio
    WH->>ENG: Recalcula com shipment_status=shipped
    ENG-->>WH: shipped (sai de coleta)
```

### Bugs identificados

| ID | Bug | Impacto | Arquivo(s) |
| --- | --- | --- | --- |
| COLETA-B1 | Não há mecanismo para desfazer impressão — usuário não volta para `ready_to_print` | Médio | `MarkOrderLabelPrintedUseCase.ts` |
| COLETA-B2 | Shopee `retry_ship` deveria mapear para `awaiting_pickup` mas a regra só checa `isPrintedLabel` | Alto | `AwaitingPickupRule.ts` |
| COLETA-B3 | `updateOrdersInternalStatus` no frontend pode sobrescrever status calculado pelo engine | Médio | `src/services/orders.service.ts` |
| COLETA-B4 | Documentação ainda referencia `rpc_marketplace_order_print_label` como caminho ativo | Baixo | `docs/FLUXO_AGUARDANDO_COLETA.md` |

---

## 5. Plano de correções: tasks (N1–N10)

Seguindo o padrão STATUS-ENGINE, cada task foca em uma camada.

### Task N1: Corrigir prioridade das regras no engine

**Camada:** Domínio / aplicação — `OrderStatusEngine.ts`

**Problema:** `InvoicePendingRule` está abaixo de `ReadyToPrintRule`.

**Solução:** Reordenar para: … `ShippedRule` → `AwaitingPickupRule` → `InvoicePendingRule` → `ReadyToPrintRule` → `PendingRule`.

**Justificativa:** NF pendente é mais bloqueante que "pronto para imprimir".

---

### Task N2: Enriquecer AwaitingPickupRule com sinais Shopee

**Camada:** Domínio — `AwaitingPickupRule.ts`

Incluir `marketplace === "shopee"` e `marketplaceStatus === "retry_ship"` além de `isPrintedLabel`.

---

### Task N3: Alinhar `useNfeStatus` com slugs EN

**Camada:** Frontend — `useNfeStatus.ts`

Incluir PT e EN no conjunto de status NFe; tratar erros (sem `catch` vazio).

---

### Task N4: Alinhar contagens de badges em `useOrderFiltering`

**Camada:** Frontend — `useOrderFiltering.ts`

Incluir `invoice_pending` e equivalentes nos filtros de `nfeOrdersAll` e badges.

---

### Task N5: Unificar atualização de status após emissão NFe

**Camada:** Edge — `focus-nfe-emit`, `emit-queue-consume`

Após autorização: atualizar `orders` / recalcular; alinhar `invoices`; corrigir URL de polling em homologação.

---

### Task N6: Corrigir agregação de batches em `emit-queue-consume`

Agrupar por `(organization_id, company_id, environment)`; dequeue mais seguro; dead-letter para `payload_incompleto` após N tentativas.

---

### Task N7: Use case e edge para desfazer impressão

Novo `UnmarkOrderLabelPrintedUseCase` + edge `unmark-labels-printed` + UI opcional na aba Coleta.

---

### Task N8: Sincronizar pipeline legado com `orders`

Bridge: após `mark-labels-printed` e `focus-nfe-emit`, manter `marketplace_orders_presented_new` alinhada onde ainda necessário; documentar remoção futura.

---

### Task N9: Corrigir `NfeEmissionList` com slugs EN

Queries e filtros compatíveis com `invoice_pending` e legado PT.

---

### Task N10: Atualizar documentação dos três fluxos

`FLUXO_EMISSAO_NF.md`, `FLUXO_IMPRESSAO.md`, `FLUXO_AGUARDANDO_COLETA.md` — pipeline novo vs legado, diagramas, referência aos PRDs STATUS-ENGINE.

---

## 6. Ordem de execução e dependências

```mermaid
flowchart LR
    N1["N1: Reordenar regras"] --> N2["N2: AwaitingPickup Shopee"]
    N1 --> N5["N5: Unificar status pós-NFe"]
    N3["N3: useNfeStatus slugs"] --> N4["N4: useOrderFiltering badges"]
    N4 --> N9["N9: NfeEmissionList"]
    N5 --> N8["N8: Sync pipeline legado"]
    N6["N6: emit-queue batches"]
    N7["N7: Desfazer impressão"]
    N8 --> N10["N10: Docs"]
    N9 --> N10
```

- **Fase 1 (crítica):** N1, N3, N4, N9
- **Fase 2 (alta):** N5, N6, N8
- **Fase 3 (média):** N2, N7
- **Fase 4 (baixa):** N10

---

## 7. Definition of Done (por task)

- Testes unitários (Deno) para regras e use cases alterados
- Testes de integração para edge functions alteradas
- Verificação manual: pedido ML e Shopee no fluxo completo
- `orders.status` e `marketplace_orders_presented_new.status_interno` convergem onde aplicável
- Badges no frontend refletem contagens corretas
- Nenhum `catch {}` vazio adicionado sem tratamento
- JSDoc em inglês em funções novas ou alteradas no backend

---

## 8. Checklist de tasks

| ID | Descrição |
| --- | --- |
| N1 | Reordenar regras no `OrderStatusEngine` (`InvoicePending` antes de `ReadyToPrint`) |
| N2 | Enriquecer `AwaitingPickupRule` com sinais Shopee (`retry_ship`) |
| N3 | Alinhar `useNfeStatus.ts` com slugs EN do pipeline novo |
| N4 | Corrigir contagens de badges NFe em `useOrderFiltering.ts` |
| N5 | Unificar atualização de status após emissão NFe (`focus-nfe-emit` → `orders`) |
| N6 | Corrigir agregação de batches no `emit-queue-consume` |
| N7 | Criar use case e edge function para desfazer impressão |
| N8 | Sincronizar pipeline legado com tabela `orders` (bridge bidirecional) |
| N9 | Corrigir `NfeEmissionList.tsx` com slugs EN |
| N10 | Atualizar documentação dos três fluxos |
