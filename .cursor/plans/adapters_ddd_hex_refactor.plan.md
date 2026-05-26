---
name: Adapters DDD/Hex Refactor
overview: Refatoração de _shared/adapters com Clean/Hexagonal/DDD, dois arquivos para integrações e app credentials, remoção de credentials-adapter e checkAndRefreshToken, e refatoração das Edge Functions que usam tokens, raw orders ou os adapters removidos.
todos:
  - id: phase-1-ports
    content: Criar ports (marketplace-integrations-port, app-credentials-port) e tipos IntegrationRow em domain
    status: pending
  - id: phase-2-adapters-two-files
    content: Criar marketplace-integrations-adapter.ts e app-credentials-adapter.ts (dois arquivos separados)
    status: pending
  - id: phase-3-ml-shopee-token
    content: Refatorar ml-token e shopee-token para usar as portas (sem .from direto)
    status: pending
  - id: phase-4-sync-contexts
    content: Refatorar ml-sync-context e shopee-sync-context para instanciar adapters e injetar portas
    status: pending
  - id: phase-5-remove-credentials-check
    content: Remover credentials-adapter, CredentialsPort e checkAndRefreshToken; atualizar mocks em testing
    status: pending
  - id: phase-6-edge-ml-token
    content: Refatorar mercado-livre-publish-item e mercado-livre-update-item-fields para usar getMlAccessToken
    status: pending
  - id: phase-7-raw-orders-port
    content: Criar MarketplaceOrdersRawPort, adapter único, migrar todas as Edge Functions que usam marketplace_orders_raw
    status: pending
isProject: false
---

# Refatoração Adapters (DDD/Hex) + Edge Functions

## Decisões já acordadas

- **Dois arquivos** para persistência: `marketplace-integrations-adapter.ts` (tabela marketplace_integrations) e `app-credentials-adapter.ts` (tabela apps).
- **Manter** os dois adapters (Integrações + App Credentials): são agregados diferentes (integração do tenant vs credenciais da app).
- **Remover** credentials-adapter.ts e CredentialsPort (nenhum consumidor em produção).
- **Remover** checkAndRefreshToken: lógica de refresh ML fica só em ml-token.ts; as duas Edge Functions que usam checkAndRefreshToken passam a usar getMlAccessToken.

---

## Fase 1: Ports e tipos

- `ports/marketplace-integrations-port.ts`: getIntegration(id, options?), updateTokens(id, payload).
- `ports/app-credentials-port.ts`: getByName(appName) → { client_id, client_secret } | null.
- Tipo `IntegrationRow` em `domain/` (ex. `domain/integration-types.ts` ou em types existente).

---

## Fase 2: Adapters (dois arquivos)

- `adapters/marketplace-integrations-adapter.ts`: implementa MarketplaceIntegrationsPort (único lugar com .from("marketplace_integrations")).
- `adapters/app-credentials-adapter.ts`: implementa AppCredentialsPort (único lugar com .from("apps")).

---

## Fase 3: ml-token e shopee-token

- Remover loadIntegration e qualquer .from("marketplace_integrations") / .from("apps") desses arquivos.
- getMlAccessToken(integrationsPort, appCredentialsPort, integrationId, encKeyB64) — mesma ideia para getShopeeAccessToken.
- Internamente: integrations.getIntegration(id, { marketplaceName }), appCredentials.getByName(...), integrations.updateTokens(...).

---

## Fase 4: Sync contexts

- ml-sync-context: criar SupabaseMarketplaceIntegrationsAdapter e SupabaseAppCredentialsAdapter com admin; chamar getMlAccessToken(integrationsAdapter, appCredentialsAdapter, integrationId, encKey). Opcional: expor portas no ctx para orders-sync-shopee re-chamar getShopeeAccessToken em onRefresh.
- shopee-sync-context: idem; usar getShopeeAccessToken com as portas. Incluir no ctx as portas (integrationsPort, appCredentialsPort) para que orders-sync-shopee possa chamar getShopeeAccessToken(ctx.integrationsPort, ctx.appCredentialsPort, ctx.integrationId, ctx.encKeyB64) no onRefresh.

---

## Fase 5: Remover credentials-adapter e checkAndRefreshToken

- Deletar ou deprecar `adapters/credentials-adapter.ts` e `ports/credentials-port.ts`.
- Remover `checkAndRefreshToken` de `adapters/token-utils.ts`; manter só funções de crypto (importAesGcmKey, aesGcmDecryptFromString, etc.).
- Atualizar `_shared/testing/mocks.ts`: remover mock de CredentialsPort ou deixar mock vazio se algo ainda importar a interface.

---

## Fase 6: Refatorar Edge Functions que usam token ML

### mercado-livre-publish-item

- Hoje: várias chamadas a checkAndRefreshToken(admin, aesKey, integration.id).
- Depois: criar admin, criar SupabaseMarketplaceIntegrationsAdapter e SupabaseAppCredentialsAdapter, obter encKey do env; em cada ponto que hoje chama checkAndRefreshToken, chamar getMlAccessToken(integrationsAdapter, appCredentialsAdapter, integration.id, encKey) e usar result.accessToken.

### mercado-livre-update-item-fields

- Mesmo padrão: substituir todas as chamadas checkAndRefreshToken(admin, aesKey, integration.id) por getMlAccessToken(integrationsAdapter, appCredentialsAdapter, integration.id, encKey) e usar .accessToken.

---

## Fase 7: Raw orders — port, adapter e migração de funções

- Criar `ports/marketplace-orders-raw-port.ts`: upsert(params).
- `adapters/marketplace-orders-raw.ts`: implementar o port; ser o único ponto com .from("marketplace_orders_raw").
- Migrar cada Edge Function que hoje usa .from("marketplace_orders_raw") para usar o port/adapter:

| Função                          | Ação                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| mercado-livre-process-presented | Trocar 2 usos diretos por adapter (upsert via port).                                         |
| shopee-webhook-orders           | Trocar 2 usos por adapter.                                                                   |
| shopee-process-presented        | Trocar 2 usos por adapter.                                                                   |
| mercado-livre-webhook-orders    | Trocar 3 usos por adapter.                                                                   |
| shopee-arrange-shipment         | Trocar 1 uso por adapter.                                                                    |
| shopee-sync-orders              | Trocar 2 usos (upsert + qualquer select) por adapter.                                        |
| orders-sync-ml                  | Já usa upsertMarketplaceOrderRaw; passar a usar o port/adapter (mesma assinatura de params). |

Em cada uma: instanciar o adapter com admin (ou receber via factory) e chamar upsert com os mesmos dados que hoje são passados ao .upsert(...).

---

## Edge Functions que dependem dos sync contexts (sem mudança de assinatura pública)

- **orders-sync-ml**: usa resolveMLSyncContext(body). Após Fase 4, resolveMLSyncContext continua devolvendo { ctx } ou { err }; a mudança é interna (context cria adapters e chama getMlAccessToken com portas). Nenhuma alteração obrigatória no corpo da função.
- **orders-sync-shopee**: usa resolveShopeeSyncContext e, no onRefresh, getShopeeAccessToken(ctx.admin, ctx.integrationId, ctx.encKeyB64). Após Fase 4, o ctx deve incluir integrationsPort e appCredentialsPort (ou o contexto já terá refresh encapsulado). Se o ctx expuser as portas, alterar a linha do onRefresh para getShopeeAccessToken(ctx.integrationsPort, ctx.appCredentialsPort, ctx.integrationId, ctx.encKeyB64). Uma única alteração pontual.

---

## Resumo de arquivos

| Ação               | Arquivo / escopo                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar              | ports/marketplace-integrations-port.ts, ports/app-credentials-port.ts                                                                                                                                 |
| Criar              | domain tipo IntegrationRow (ou em types existente)                                                                                                                                                    |
| Criar              | adapters/marketplace-integrations-adapter.ts, adapters/app-credentials-adapter.ts                                                                                                                     |
| Alterar            | adapters/ml-token.ts, adapters/shopee-token.ts (usar portas)                                                                                                                                          |
| Alterar            | adapters/ml-sync-context.ts, adapters/shopee-sync-context.ts (instanciar adapters, injetar portas; ctx com portas para Shopee onRefresh)                                                              |
| Remover / deprecar | adapters/credentials-adapter.ts, ports/credentials-port.ts                                                                                                                                            |
| Alterar            | adapters/token-utils.ts (remover checkAndRefreshToken)                                                                                                                                                |
| Alterar            | testing/mocks.ts (CredentialsPort)                                                                                                                                                                    |
| Refatorar          | mercado-livre-publish-item/index.ts, mercado-livre-update-item-fields/index.ts (getMlAccessToken)                                                                                                     |
| Criar              | ports/marketplace-orders-raw-port.ts                                                                                                                                                                  |
| Alterar            | adapters/marketplace-orders-raw.ts (implementar port)                                                                                                                                                 |
| Refatorar          | mercado-livre-process-presented, shopee-webhook-orders, shopee-process-presented, mercado-livre-webhook-orders, shopee-arrange-shipment, shopee-sync-orders, orders-sync-ml (usar adapter raw orders) |
| Alterar (pontual)  | orders-sync-shopee/index.ts onRefresh se ctx expuser portas                                                                                                                                           |
