-- Cycle 0: invoices table (replaces notas_fiscais). idempotency_key UNIQUE.
-- numeric(18,6) for total_value. status and emission_environment as plain text (no CHECK).

CREATE TABLE IF NOT EXISTS invoices (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id                        uuid REFERENCES orders(id) ON DELETE SET NULL,
  company_id                      uuid NOT NULL REFERENCES companies(id),
  idempotency_key                 text NOT NULL,
  focus_id                        text,
  nfe_number                      integer,
  nfe_key                         text,
  serie                           text,
  status                          text NOT NULL DEFAULT 'pending',
  emission_environment            text NOT NULL DEFAULT 'homologacao',
  xml_url                         text,
  pdf_url                         text,
  marketplace                     text,
  marketplace_order_id            text,
  marketplace_submission_status   text,
  marketplace_submission_at       timestamptz,
  total_value                     numeric(18,6),
  payload_sent                    jsonb,
  error_message                   text,
  error_code                      text,
  retry_count                     integer NOT NULL DEFAULT 0,
  emitted_at                      timestamptz,
  authorized_at                   timestamptz,
  canceled_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT invoices_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX invoices_org_id_idx ON invoices (organization_id);
CREATE INDEX invoices_order_id_idx ON invoices (order_id);
CREATE INDEX invoices_status_idx ON invoices (status);
CREATE INDEX invoices_idempotency_idx ON invoices (idempotency_key);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON invoices
  USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
