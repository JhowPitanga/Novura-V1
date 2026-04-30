/**
 * processEmission: 5-step idempotent NFe emission algorithm.
 * Step 1: build idempotency key (done by caller)
 * Step 2: check existing invoice → early return if authorized/processing/max-retried
 * Step 3: UPSERT invoice row with status='queued' BEFORE calling Focus
 * Step 4: call focus-nfe-emit via HTTP fetch
 * Step 5: update invoice status, return result
 */

import type { SupabaseClient } from '../_shared/adapters/infra/supabase-client.ts'
import type { InvoicesPort, InvoiceRow } from '../_shared/ports/invoices-port.ts'
import type { FocusNfePayload } from '../_shared/domain/focus/focus-nfe-payload.types.ts'

const MAX_RETRIES = 5

export interface ProcessEmissionInput {
  organization_id: string
  order_id: string
  company_id: string
  emission_environment: 'producao' | 'homologacao'
  payload: FocusNfePayload
  marketplace: string | null
  marketplace_order_id: string | null
  total_value: number | null
  idempotency_key: string
}

export interface EmitInvoiceResult {
  success: boolean
  invoice_id: string | null
  status: string
  focus_id: string | null
  error?: string
}

interface FocusEmitResponse {
  ok: boolean
  results?: Array<{ orderId: string; ok: boolean; status?: string; error?: string; response?: { id?: string; uuid?: string } }>
  error?: string
}

export async function processEmission(
  admin: SupabaseClient,
  adapter: InvoicesPort,
  input: ProcessEmissionInput,
): Promise<EmitInvoiceResult> {
  const existing = await adapter.findByIdempotencyKey(admin, input.idempotency_key)

  const earlyReturn = checkEarlyReturn(existing)
  if (earlyReturn !== null) return earlyReturn

  const invoice = await adapter.createQueued(admin, {
    organization_id: input.organization_id,
    order_id: input.order_id,
    company_id: input.company_id,
    idempotency_key: input.idempotency_key,
    emission_environment: input.emission_environment,
    marketplace: input.marketplace,
    marketplace_order_id: input.marketplace_order_id,
    total_value: input.total_value,
    payload_sent: input.payload,
  })

  const focusResult = await callFocusNfeEmit(input)

  if (focusResult.ok) {
    return handleFocusSuccess(admin, adapter, invoice, focusResult)
  }
  return handleFocusError(admin, adapter, invoice, focusResult.error ?? 'Focus emission failed')
}

function checkEarlyReturn(existing: InvoiceRow | null): EmitInvoiceResult | null {
  if (!existing) return null
  if (existing.status === 'authorized') {
    return { success: true, invoice_id: existing.id, status: 'authorized', focus_id: existing.focus_id }
  }
  if (existing.status === 'processing') {
    return { success: true, invoice_id: existing.id, status: 'processing', focus_id: existing.focus_id }
  }
  if (existing.status === 'error' && existing.retry_count >= MAX_RETRIES) {
    return { success: false, invoice_id: existing.id, status: 'error', focus_id: existing.focus_id, error: 'Max retries reached' }
  }
  return null
}

async function callFocusNfeEmit(input: ProcessEmissionInput): Promise<FocusEmitResponse> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const url = `${supabaseUrl}/functions/v1/focus-nfe-emit`

  const body = {
    organizationId: input.organization_id,
    companyId: input.company_id,
    orderIds: [input.order_id],
    environment: input.emission_environment,
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(body),
  })

  const json = await resp.json() as FocusEmitResponse
  if (!resp.ok) return { ok: false, error: json?.error ?? `HTTP ${resp.status}` }
  return json
}

async function handleFocusSuccess(
  admin: SupabaseClient,
  adapter: InvoicesPort,
  invoice: InvoiceRow,
  focusResult: FocusEmitResponse,
): Promise<EmitInvoiceResult> {
  const firstResult = focusResult.results?.[0]
  const focusId = firstResult?.response?.uuid ?? firstResult?.response?.id ?? null
  const focusIdStr = focusId ?? `focus-${invoice.idempotency_key}`

  await adapter.markProcessing(admin, invoice.id, focusIdStr)
  return { success: true, invoice_id: invoice.id, status: 'processing', focus_id: focusIdStr }
}

async function handleFocusError(
  admin: SupabaseClient,
  adapter: InvoicesPort,
  invoice: InvoiceRow,
  errorMessage: string,
): Promise<EmitInvoiceResult> {
  await adapter.markError(admin, invoice.id, errorMessage, invoice.retry_count)
  return { success: false, invoice_id: invoice.id, status: 'error', focus_id: null, error: errorMessage }
}
