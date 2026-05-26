# ANN-EDGE-01: deploy all edge functions for listings canonical module.
# Requires: supabase login && project linked (ref frwnfukydjwilfobxxhw)
$ErrorActionPreference = "Stop"
$ref = "frwnfukydjwilfobxxhw"
$functions = @(
  "mercado-livre-sync-items",
  "mercado-livre-update-metrics",
  "mercado-livre-update-quality",
  "mercado-livre-update-reviews",
  "mercado-livre-sync-prices",
  "mercado-livre-sync-stock-distribution",
  "shopee-sync-items",
  "shopee-webhook-items",
  "listings-sync-one",
  "listings-backfill",
  "promotions-add-items"
)
foreach ($fn in $functions) {
  Write-Host "Deploying $fn ..."
  supabase functions deploy $fn --project-ref $ref
}
Write-Host "Done."
