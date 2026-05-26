/**
 * InvoicesAdapter: implements InvoicesPort. All DB operations for the invoices table.
 * Uses admin client (bypasses RLS). Never deletes invoice rows.
 */

import type { InvoicesPort, InvoiceRow, CreateInvoiceInput } from '../../ports/invoices-port.ts'
import type { SupabaseClient } from '../infra/supabase-client.ts'

const MAX_RETRIES = 5

export class InvoicesAdapter implements InvoicesPort {
  async findByIdempotencyKey(admin: SupabaseClient, key: string): Promise<InvoiceRow | null> {
    const { data, error } = await admin
      .from('invoices')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle()

    if (error) {
      console.error('[invoices-adapter] findByIdempotencyKey failed', { key, error: error.message })
      throw new Error(error.message)
    }

    return (data as InvoiceRow | null) ?? null
  }

  async createQueued(admin: SupabaseClient, input: CreateInvoiceInput): Promise<InvoiceRow> {
    const row = {
      organization_id: input.organization_id,
      order_id: input.order_id,
      company_id: input.company_id,
      idempotency_key: input.idempotency_key,
      emission_environment: input.emission_environment,
      marketplace: input.marketplace,
      marketplace_order_id: input.marketplace_order_id,
      total_value: input.total_value,
      payload_sent: input.payload_sent,
      status: 'queued',
      retry_count: 0,
    }

    const { data, error } = await admin
      .from('invoices')
      .upsert(row as never, {
        onConflict: 'idempotency_key',
        ignoreDuplicates: false,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[invoices-adapter] createQueued failed', { key: input.idempotency_key, error: error.message })
      throw new Error(error.message)
    }

    return data as InvoiceRow
  }

  async markProcessing(admin: SupabaseClient, id: string, focusId: string): Promise<void> {
    const { error } = await admin
      .from('invoices')
      .update({ status: 'processing', focus_id: focusId, updated_at: new Date().toISOString() } as never)
      .eq('id', id)

    if (error) {
      console.error('[invoices-adapter] markProcessing failed', { id, focusId, error: error.message })
      throw new Error(error.message)
    }
  }

  async markError(
    admin: SupabaseClient,
    id: string,
    message: string,
    retryCount: number,
  ): Promise<void> {
    const newCount = Math.min(retryCount + 1, MAX_RETRIES)
    const { error } = await admin
      .from('invoices')
      .update({
        status: 'error',
        error_message: message,
        retry_count: newCount,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', id)

    if (error) {
      console.error('[invoices-adapter] markError failed', { id, message, error: error.message })
      throw new Error(error.message)
    }
  }

  async markAuthorized(
    admin: SupabaseClient,
    id: string,
    nfeKey: string,
    nfeNumber: number,
  ): Promise<void> {
    const { error } = await admin
      .from('invoices')
      .update({
        status: 'authorized',
        nfe_key: nfeKey,
        nfe_number: nfeNumber,
        authorized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', id)

    if (error) {
      console.error('[invoices-adapter] markAuthorized failed', { id, nfeKey, nfeNumber, error: error.message })
      throw new Error(error.message)
    }
  }
}
