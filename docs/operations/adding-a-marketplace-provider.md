# Adding a New Marketplace Provider

This guide explains how to add a new marketplace integration to Novura's universal OAuth adapter.
Thanks to the adapter architecture, **no changes to the three generic Edge Functions** are required.

---

## PRD Consolidado — Aplicativos (Implementado)

Esta seção consolida o que já foi implementado no módulo de Aplicativos para servir como base de release e rollout em branch.

### 1) Arquitetura e banco

- Catálogo de providers em `marketplace_providers` com `refresh_threshold_minutes` por canal.
- `apps` vinculado a provider (`provider_id`) e `apps_public_view` enriquecida com `provider_key`/metadados.
- `marketplace_integrations` estendida com:
  - `provider_id`, `external_account_id`, `store_name`, `connected_at`,
  - `setup_status`, `setup_completed_at`,
  - `deactivated_at`, `last_refresh_at`, `last_refresh_error`,
  - `token_key_version`.
- Bloqueio global de conta duplicada ativo por índice parcial:
  - `provider_id + external_account_id` somente para integrações ativas.
- RPCs operacionais:
  - `list_blocked_companies_for_provider`,
  - `complete_integration_setup`,
  - `deactivate_integration`,
  - `disconnect_marketplace_by_provider`.

### 2) OAuth universal e compatibilidade legada

- Fluxo unificado em:
  - `oauth-start-auth`,
  - `oauth-callback`,
  - `oauth-refresh`,
  - `oauth-refresh-worker`.
- Adapters por provider em registry (`mercado_livre`, `shopee`) com contrato comum.
- `state` assinado com TTL curto (proteção CSRF/callback forging).
- Wrappers legados mantidos para compatibilidade:
  - `mercado-livre-{start-auth,callback,refresh}`,
  - `shopee-{start-auth,callback,refresh}`.
- Defaults de `redirect_uri` por provider ajustados para cenários de console legado:
  - ML -> callback legado de ML,
  - Shopee -> callback legado de Shopee.

### 3) Refresh queue e custo operacional

- Enqueuer (`oauth-refresh`) roda a cada 5 min e enfileira somente integrações dentro da janela de refresh.
- Worker batch com:
  - claim atômico via `FOR UPDATE SKIP LOCKED`,
  - lote padrão de 50 jobs,
  - concorrência controlada (10),
  - time budget de execução (~45s).
- Worker em modo sob demanda:
  - trigger automático pelo enqueuer quando há novos jobs.
- Cron fixo do worker desativado para reduzir invocações/custo.

### 4) Frontend (UX e fluxo)

- Loja de Apps e Conectados alimentados por providers/integrations dinâmicos.
- Fluxo de conexão:
  - `StoreNameDialog` (nome da loja),
  - popup OAuth,
  - modal de configuração.
- Tratamento de erro de popup corrigido:
  - se OAuth falhar/fechar popup, modal destrava (cancelar/fechar sem refresh da página).
- Modal unificado de configurações (reutilizado em callback e em Conectados) com 3 tabs:
  1. Loja (editar nome),
  2. Company (visualização e bloqueio de alteração quando já vinculada),
  3. Armazém (configuração de estoque).
- Ajustes visuais de responsividade:
  - cards com altura consistente,
  - descrições truncadas para manter grid alinhado,
  - botões de ações com altura/direção padronizadas.

### 5) Deploy e status operacional

- Migrações aplicadas no projeto `frwnfukydjwilfobxxhw`.
- Edge Functions deployadas no projeto remoto.
- Jobs do cron validados com execução bem-sucedida após ajuste de URL/JWT.

### 6) Pendências / próximos passos recomendados

- Registrar/validar no console dos canais os `redirect_uri` oficiais de produção.
- Opcional: criar métricas de backlog/latência da fila `oauth_refresh_jobs`.
- Opcional: incluir guardrail anti-burst para trigger sob demanda do worker.

---

## Overview

```
marketplace_providers  (database catalog)
        |
      apps             (display metadata: logo, description, price)
        |
  registry.ts          (_shared/adapters/oauth/registry.ts)
        |
providers/<key>.ts     (implements OAuthProviderAdapter)
```

Once you register the provider in the database and implement the adapter, the generic
`oauth-start-auth`, `oauth-callback`, and `oauth-refresh` Edge Functions will automatically handle
the new marketplace.

---

## Refresh Queue Runtime (Current Production Behavior)

The refresh pipeline is queue-based and batch-oriented:

- `oauth-refresh` (enqueuer) runs every 5 minutes via pg_cron and inserts due jobs in `oauth_refresh_jobs`.
- `oauth-refresh-worker` is triggered on-demand by `oauth-refresh`
  whenever new jobs are enqueued.
- Worker claims jobs atomically with PostgreSQL `FOR UPDATE SKIP LOCKED`
  (via `claim_oauth_refresh_jobs(batch_size)`), so parallel workers do not collide.
- Each worker invocation processes up to `batchSize` jobs (default 50) with controlled
  parallelism (max concurrency 10) and a time budget (~45s).

This design reduces function-invocation overhead and scales better for large numbers
of integrations.

---

## Step-by-step

### 1. Insert a row in `marketplace_providers`

Create a migration file following the naming convention
`YYYYMMDDHHMMSS_add_provider_<key>.sql`.

```sql
INSERT INTO public.marketplace_providers (
  key, display_name, category,
  auth_protocol, auth_url, token_url, refresh_url,
  refresh_threshold_minutes,
  supports_webhook, config, description
) VALUES (
  'amazon',                                -- must be unique, snake_case
  'Amazon',                                -- shown in the UI
  'marketplaces',                          -- marketplaces | logistics | dropshipping | others
  'oauth2_pkce',                           -- oauth2_pkce | oauth2_hmac | api_key
  'https://sellercentral.amazon.com/apps/authorize/consent',
  'https://api.amazon.com/auth/o2/token',
  'https://api.amazon.com/auth/o2/token',
  60,                                      -- refresh 60 minutes before expiry
  true,
  '{"region": "us-east-1"}'::jsonb,
  'Integração Amazon Seller Central (OAuth2 PKCE).'
);
```

### 2. Insert a row in `apps`

```sql
INSERT INTO public.apps (name, description, logo_url, category, price_type, provider_id)
SELECT
  'Amazon',
  'Sincronize anúncios e pedidos da Amazon Seller Central.',
  'https://cdn.novuraerp.com.br/logos/amazon.png',
  'marketplaces',
  'free',
  id
FROM public.marketplace_providers
WHERE key = 'amazon';
```

### 3. Implement the adapter

Copy the template file and fill in the provider-specific logic:

```
supabase/functions/_shared/adapters/oauth/providers/amazon.ts
```

See `_template.ts` in the same folder for the interface to implement.

The adapter must implement `OAuthProviderAdapter`:

| Method | Responsibility |
|--------|---------------|
| `parseCallbackRequest` | Extract `code`, `state`, extras from the raw callback request |
| `buildAuthorizationUrl` | Generate the marketplace auth URL + signed state |
| `exchangeCode` | Trade authorization code for tokens |
| `refreshTokens` | Refresh an existing integration using stored refresh_token |
| `buildPostMessagePayload` | Build the payload sent to the opener window via postMessage |

### 4. Register in the registry

Add one line to `supabase/functions/_shared/adapters/oauth/registry.ts`:

```typescript
import { amazonAdapter } from './providers/amazon.ts';

const REGISTRY = new Map([
  [mercadoLivreAdapter.key, mercadoLivreAdapter],
  [shopeeAdapter.key, shopeeAdapter],
  [amazonAdapter.key, amazonAdapter],          // ← add this
]);
```

### 5. Add credentials to the `apps` table

The `oauth-start-auth` Edge Function reads `client_id` and `client_secret` from the `apps` table
(via `SupabaseAppCredentialsAdapter`). Insert the credentials securely through the Supabase
Dashboard → Table Editor → apps (never commit credentials to git).

```sql
-- Example (replace values with real credentials)
UPDATE public.apps
SET client_id = 'amzn1.application-oa2-client.xxx',
    client_secret = 'your_secret'
WHERE name = 'Amazon';
```

### 6. Deploy

No new Edge Functions are needed. Just deploy the updated functions that include the new adapter:

```bash
supabase functions deploy oauth-start-auth
supabase functions deploy oauth-callback
supabase functions deploy oauth-refresh
supabase functions deploy oauth-refresh-worker
```

If you changed queue/cron migrations, push them as well:

```bash
supabase db push --linked
```

### 7. Test the flow

1. Navigate to `/aplicativos` in the Novura UI.
2. Find the Amazon card (loaded dynamically from `marketplace_providers`).
3. Click "Conectar" → enter store name → OAuth popup opens.
4. Complete authorization → popup closes → QuickSetupModal opens.
5. Select company + warehouse → "Finalizar configuração".
6. Integration appears in `/aplicativos/conectados`.

### 8. Test refresh queue (recommended)

1. Run enqueuer manually:
   - `POST /functions/v1/oauth-refresh`
2. Run worker manually (optional custom batch):
   - `POST /functions/v1/oauth-refresh-worker?batchSize=50`
3. Verify queue:
   - `SELECT status, count(*) FROM public.oauth_refresh_jobs GROUP BY status;`
4. Verify cron runs:
   - Check `cron.job_run_details` for `oauth-refresh-enqueuer`.
   - Worker runs are visible in Edge Function logs and in `oauth_refresh_jobs` status transitions.

---

## Redirect URI registration

Register the **generic** callback URL in the marketplace developer portal:

```
https://<project_ref>.supabase.co/functions/v1/oauth-callback?provider_key=amazon
```

The legacy per-provider redirect URIs (`/functions/v1/mercado-livre-callback`,
`/functions/v1/shopee-callback`) continue to work as thin wrappers while you migrate.

---

## Checklist

- [ ] Migration: `marketplace_providers` row inserted
- [ ] Migration: `apps` row inserted with `provider_id`
- [ ] Adapter: `providers/<key>.ts` implements `OAuthProviderAdapter`
- [ ] Registry: provider registered in `registry.ts`
- [ ] Credentials: `client_id` + `client_secret` stored in `apps` table
- [ ] Edge Functions deployed
- [ ] Queue/cron migrations applied (`claim_oauth_refresh_jobs`, worker schedule tuning)
- [ ] Redirect URI registered in marketplace developer portal
- [ ] End-to-end test completed
