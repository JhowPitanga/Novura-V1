-- Backfill invoices from notas_fiscais (best-effort, idempotent).
-- Compatibility version for newer schemas:
-- - notas_fiscais may not have organization_id
-- - notas_fiscais.order_id may not exist in orders anymore
-- Safe to re-run: ON CONFLICT DO NOTHING.

INSERT INTO public.invoices (
  organization_id, order_id, company_id,
  idempotency_key, focus_id, nfe_number, nfe_key, serie,
  status, emission_environment, error_message, marketplace,
  marketplace_order_id, pack_id, total_value, authorized_at, created_at, updated_at
)
SELECT
  COALESCE(c.organization_id, o.organization_id) AS organization_id,
  CASE WHEN o.id IS NOT NULL THEN nf.order_id ELSE NULL END AS order_id,
  nf.company_id,
  COALESCE(c.organization_id, o.organization_id)::text || ':'
  || COALESCE(
      CASE WHEN o.id IS NOT NULL THEN nf.order_id::text END,
      NULLIF(nf.marketplace_order_id::text, ''),
      'nf-' || nf.id::text
    )
  || ':' || COALESCE(nf.emissao_ambiente, 'producao') AS idempotency_key,
  nf.focus_nfe_id::text AS focus_id,
  nf.nfe_number,
  nf.nfe_key,
  nf.serie,
  CASE LOWER(TRIM(COALESCE(nf.status, '')))
    WHEN 'autorizado'        THEN 'authorized'
    WHEN 'autorizada'        THEN 'authorized'
    WHEN 'processando'       THEN 'processing'
    WHEN 'processando_autorizacao' THEN 'processing'
    WHEN 'cancelado'         THEN 'canceled'
    WHEN 'cancelada'         THEN 'canceled'
    WHEN 'falha na emissão'  THEN 'error'
    WHEN 'rejeitada'         THEN 'rejected'
    WHEN 'rejeitado'         THEN 'rejected'
    WHEN 'denegada'          THEN 'rejected'
    WHEN 'denegado'          THEN 'rejected'
    WHEN 'emissao nf'        THEN 'queued'
    WHEN 'emissão nf'        THEN 'queued'
    WHEN 'pendente'          THEN 'pending'
    ELSE 'error'
  END AS status,
  COALESCE(nf.emissao_ambiente, 'producao') AS emission_environment,
  nf.error_details::text AS error_message,
  nf.marketplace,
  nf.marketplace_order_id,
  nf.pack_id::text,
  nf.total_value,
  nf.authorized_at,
  nf.created_at,
  COALESCE(nf.authorized_at, nf.created_at) AS updated_at
FROM public.notas_fiscais nf
LEFT JOIN public.companies c ON c.id = nf.company_id
LEFT JOIN public.orders o ON o.id = nf.order_id
WHERE COALESCE(c.organization_id, o.organization_id) IS NOT NULL
  AND nf.company_id IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;
