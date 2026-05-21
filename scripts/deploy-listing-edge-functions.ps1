# Deploy listing canonical edge functions (PRD modulo anuncios)
# Project ref: frwnfukydjwilfobxxhw
#
# Opcao A (recomendada): PAT valido + Management API
#   $env:SUPABASE_ACCESS_TOKEN = "<PAT em https://supabase.com/dashboard/account/tokens>"
#   node scripts/mcp-deploy-all-functions.mjs
#
# Opcao B: Supabase CLI
#   supabase login
#   .\scripts\deploy-listing-edge-functions.ps1
#
# Opcao C: Cursor MCP user-supabase deploy_edge_function (payloads em scripts/mcp-payloads/)

$ErrorActionPreference = "Stop"
$ProjectRef = "frwnfukydjwilfobxxhw"
$Root = Split-Path -Parent $PSScriptRoot

Set-Location $Root

# Regenera bundles antes do deploy (opcional)
if ($args -contains "-Prepare") {
    node "$Root\scripts\prepare-mcp-deploy.mjs"
    if ($LASTEXITCODE -ne 0) { throw "prepare-mcp-deploy failed" }
}

$functions = @(
    "listings-sync-one",
    "listings-backfill",
    "mercado-livre-sync-items",
    "shopee-sync-items",
    "mercado-livre-update-metrics",
    "mercado-livre-update-quality",
    "mercado-livre-update-reviews",
    "mercado-livre-sync-prices",
    "mercado-livre-sync-stock-distribution",
    "shopee-webhook-items"
)

foreach ($fn in $functions) {
    Write-Host "Deploying $fn ..."
    supabase functions deploy $fn --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Deploy failed for $fn"
    }
}

Write-Host "Done. Run backfill after deploy:"
Write-Host '  supabase functions invoke listings-backfill --project-ref frwnfukydjwilfobxxhw --body ''{"organizationId":"<org-uuid>","pageSize":100}'''
