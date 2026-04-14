/**
 * Port interface for the invoices table.
 * Contains only interfaces and types — no implementation code, no DB calls.
 */

import type { SupabaseClient } from '../adapters/infra/supabase-client.ts'
import type { FocusNfePayload } from '../domain/focus/focus-nfe-payload.types.ts'

export type InvoiceStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'authorized'
  | 'rejected'
  | 'canceled'
  | 'error'

export type EmissionEnvironment = 'producao' | 'homologacao'

export interface InvoiceRow {
  id: string
  organization_id: string
  order_id: string | null
  company_id: string
  idempotency_key: string
  focus_id: string | null
  nfe_number: number | null
  nfe_key: string | null
  serie: string | null
  status: InvoiceStatus
  emission_environment: EmissionEnvironment
  retry_count: number
  error_message: string | null
  payload_sent: FocusNfePayload | null
  marketplace: string | null
  marketplace_order_id: string | null
  pack_id: string | null
  total_value: number | null
  xml_url: string | null
  pdf_url: string | null
  authorized_at: string | null
  canceled_at: string | null
  marketplace_submission_status: string | null
  marketplace_submission_at: string | null
  marketplace_submission_response: Record<string, unknown> | null
  marketplace_fiscal_document_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateInvoiceInput {
  organization_id: string
  order_id: string | null
  company_id: string
  idempotency_key: string
  emission_environment: EmissionEnvironment
  marketplace: string | null
  marketplace_order_id: string | null
  total_value: number | null
  payload_sent: FocusNfePayload
}

export interface InvoicesPort {
  findByIdempotencyKey(admin: SupabaseClient, key: string): Promise<InvoiceRow | null>
  findByFocusId(admin: SupabaseClient, focusId: string): Promise<InvoiceRow | null>
  findByNfeKey(admin: SupabaseClient, nfeKey: string): Promise<InvoiceRow | null>
  createQueued(admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow>
  markProcessing(admin: SupabaseClient, id: string, focusId: string): Promise<void>
  markError(admin: SupabaseClient, id: string, message: string, retryCount: number): Promise<void>
  markAuthorized(admin: SupabaseClient, id: string, nfeKey: string, nfeNumber: number): Promise<void>
  markCanceled(admin: SupabaseClient, id: string): Promise<void>
  updateFields(admin: SupabaseClient, id: string, fields: Partial<InvoiceRow>): Promise<void>
}
