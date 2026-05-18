/**
 * emit-invoice: idempotent NFe emission handler.
 * Creates an invoices row BEFORE calling focus-nfe-emit.
 * Duplicate calls return the existing invoice without calling Focus again.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createAdminClient } from '../_shared/adapters/infra/supabase-client.ts'
import { jsonResponse, handleOptions } from '../_shared/adapters/infra/http-utils.ts'
import { InvoicesAdapter } from '../_shared/adapters/invoices/index.ts'
import type { InvoiceRow, InvoicesPort } from '../_shared/ports/invoices-port.ts'
import type { FocusNfePayload } from '../_shared/domain/focus/focus-nfe-payload.types.ts'
import { processEmission } from './process-emission.ts'

interface EmitInvoiceInput {
  organization_id: string
  order_id: string
  company_id: string
  emission_environment: 'producao' | 'homologacao'
  payload: FocusNfePayload
  marketplace?: string
  marketplace_order_id?: string
  total_value?: number
}

function buildIdempotencyKey(
  organizationId: string,
  orderId: string,
  env: string,
): string {
  return `${organizationId}:${orderId}:${env}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions()
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const body = (await req.json()) as EmitInvoiceInput
    const { organization_id, order_id, company_id, emission_environment, payload } = body

    if (!organization_id || !order_id || !company_id || !emission_environment || !payload) {
      return jsonResponse({ error: 'Missing required fields: organization_id, order_id, company_id, emission_environment, payload' }, 400)
    }

    const idempotencyKey = buildIdempotencyKey(organization_id, order_id, emission_environment)
    const admin = createAdminClient()
    const adapter: InvoicesPort = new InvoicesAdapter()

    const result = await processEmission(admin, adapter, {
      organization_id,
      order_id,
      company_id,
      emission_environment,
      payload,
      marketplace: body.marketplace ?? null,
      marketplace_order_id: body.marketplace_order_id ?? null,
      total_value: body.total_value ?? null,
      idempotency_key: idempotencyKey,
    })

    return jsonResponse(result, 200)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[emit-invoice] unexpected_error', message)
    return jsonResponse({ success: false, invoice_id: null, status: 'error', focus_id: null, error: message }, 200)
  }
})
