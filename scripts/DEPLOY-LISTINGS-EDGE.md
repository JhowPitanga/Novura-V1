# Deploy — Edge Functions (Módulo Anúncios / PRD)

Projeto: `frwnfukydjwilfobxxhw`

## Funções (10)

| Função | verify_jwt |
|--------|------------|
| listings-sync-one | **true** |
| listings-backfill | false |
| mercado-livre-sync-items | false |
| shopee-sync-items | false |
| mercado-livre-update-metrics | false |
| mercado-livre-update-quality | false |
| mercado-livre-update-reviews | false |
| mercado-livre-sync-prices | false |
| mercado-livre-sync-stock-distribution | false |
| shopee-webhook-items | false |

## 1. Regenerar bundles (após mudar código)

```powershell
cd c:\Users\jonat\OneDrive\Documentos\GitHub\Novura-V1
node scripts/prepare-mcp-deploy.mjs
```

Gera `scripts/mcp-payloads/<fn>.json` (~150–200 KB cada).

## 2. Deploy via PAT (recomendado se CLI falhar)

1. Crie um PAT em https://supabase.com/dashboard/account/tokens (escopo: funções).
2. No PowerShell:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # PAT completo (não o token curto/inválido)
node scripts/mcp-deploy-all-functions.mjs
```

## 3. Deploy via Supabase CLI

```powershell
supabase login
.\scripts\deploy-listing-edge-functions.ps1 -Prepare   # opcional: regenera payloads antes
.\scripts\deploy-listing-edge-functions.ps1
```

## 4. Deploy via Cursor MCP (`user-supabase`)

Para cada função, use a ferramenta **deploy_edge_function** com o conteúdo de `scripts/mcp-payloads/<fn>.json`:

- `name`, `entrypoint_path`, `verify_jwt`, `files[]`

**Nota:** `listings-sync-one` pode estar em versão placeholder no remoto — redeploy obrigatório com bundle completo.

## 5. Após o deploy

```powershell
# Backfill canônico (substitua org UUID)
supabase functions invoke listings-backfill --project-ref frwnfukydjwilfobxxhw --body '{"organizationId":"<org-uuid>","pageSize":100}'
```

Opcional: ativar `config.listings_canonical = true` em `marketplace_integrations`.
