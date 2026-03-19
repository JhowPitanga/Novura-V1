/**
 * Tests for emit-invoice processEmission algorithm.
 * Uses a mock InvoicesAdapter to avoid DB dependencies.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { processEmission } from './process-emission.ts'
import type { InvoicesPort, InvoiceRow, CreateInvoiceInput } from '../_shared/ports/invoices-port.ts'
import type { SupabaseClient } from '../_shared/adapters/infra/supabase-client.ts'
import type { FocusNfePayload } from '../_shared/domain/focus/focus-nfe-payload.types.ts'

// --- Stubs ---

const STUB_PAYLOAD: FocusNfePayload = {
  natureza_operacao: 'Venda de mercadorias',
  data_emissao: '2026-03-18T10:00:00-03:00',
  tipo_documento: 1,
  finalidade_emissao: 1,
  nome_emitente: 'Empresa Teste Ltda',
  logradouro_emitente: 'Rua A',
  bairro_emitente: 'Centro',
  municipio_emitente: 'São Paulo',
  uf_emitente: 'SP',
  cep_emitente: '01310000',
  nome_destinatario: 'Cliente Teste',
  logradouro_destinatario: 'Rua B',
  bairro_destinatario: 'Bairro',
  municipio_destinatario: 'Rio de Janeiro',
  uf_destinatario: 'RJ',
  pais_destinatario: 'Brasil',
  valor_frete: 0,
  valor_seguro: 0,
  valor_total: 100,
  valor_produtos: 100,
  modalidade_frete: 2,
  serie: '1',
  numero: 42,
  referencia: '{}',
  ref: 'test-ref',
  items: [],
}

const BASE_INPUT = {
  organization_id: 'org-001',
  order_id: 'order-001',
  company_id: 'company-001',
  emission_environment: 'homologacao' as const,
  payload: STUB_PAYLOAD,
  marketplace: 'mercado_livre',
  marketplace_order_id: 'ML-001',
  total_value: 100,
  idempotency_key: 'org-001:order-001:homologacao',
}

function makeInvoiceRow(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: 'invoice-001',
    organization_id: 'org-001',
    order_id: 'order-001',
    company_id: 'company-001',
    idempotency_key: 'org-001:order-001:homologacao',
    focus_id: null,
    nfe_number: null,
    nfe_key: null,
    status: 'queued',
    emission_environment: 'homologacao',
    retry_count: 0,
    error_message: null,
    payload_sent: STUB_PAYLOAD,
    marketplace: 'mercado_livre',
    marketplace_order_id: 'ML-001',
    total_value: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function makeMockAdapter(overrides: Partial<InvoicesPort> = {}): InvoicesPort {
  return {
    findByIdempotencyKey: (_admin, _key) => Promise.resolve(null),
    createQueued: (_admin, _input) => Promise.resolve(makeInvoiceRow()),
    markProcessing: (_admin, _id, _focusId) => Promise.resolve(),
    markError: (_admin, _id, _msg, _count) => Promise.resolve(),
    markAuthorized: (_admin, _id, _key, _num) => Promise.resolve(),
    ...overrides,
  }
}

const NULL_ADMIN = null as unknown as SupabaseClient

// --- Tests ---

Deno.test('first emission → creates invoices row, calls Focus, returns status: processing', async () => {
  let createCalled = false
  let markProcessingCalled = false

  const adapter = makeMockAdapter({
    findByIdempotencyKey: () => Promise.resolve(null),
    createQueued: (_admin, _input) => {
      createCalled = true
      return Promise.resolve(makeInvoiceRow())
    },
    markProcessing: (_admin, _id, _focusId) => {
      markProcessingCalled = true
      return Promise.resolve()
    },
  })

  // Stub fetch to simulate successful Focus response
  const originalFetch = globalThis.fetch
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, results: [{ orderId: 'order-001', ok: true, response: { uuid: 'focus-uuid-001' } }] }), { status: 200 }))

  const result = await processEmission(NULL_ADMIN, adapter, BASE_INPUT)
  globalThis.fetch = originalFetch

  assertEquals(createCalled, true)
  assertEquals(markProcessingCalled, true)
  assertEquals(result.status, 'processing')
  assertEquals(result.success, true)
})

Deno.test('second emission (same order, same env) → returns existing invoice without calling Focus', async () => {
  let focusCalled = false
  const existingInvoice = makeInvoiceRow({ status: 'processing', focus_id: 'focus-uuid-001' })

  const adapter = makeMockAdapter({
    findByIdempotencyKey: () => Promise.resolve(existingInvoice),
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = () => {
    focusCalled = true
    return Promise.resolve(new Response('{}', { status: 200 }))
  }

  const result = await processEmission(NULL_ADMIN, adapter, BASE_INPUT)
  globalThis.fetch = originalFetch

  assertEquals(focusCalled, false)
  assertEquals(result.invoice_id, 'invoice-001')
  assertEquals(result.status, 'processing')
})

Deno.test('emission when already authorized → returns immediately, Focus NOT called', async () => {
  let focusCalled = false
  const authorizedInvoice = makeInvoiceRow({ status: 'authorized', focus_id: 'focus-uuid-001' })

  const adapter = makeMockAdapter({
    findByIdempotencyKey: () => Promise.resolve(authorizedInvoice),
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = () => {
    focusCalled = true
    return Promise.resolve(new Response('{}', { status: 200 }))
  }

  const result = await processEmission(NULL_ADMIN, adapter, BASE_INPUT)
  globalThis.fetch = originalFetch

  assertEquals(focusCalled, false)
  assertEquals(result.status, 'authorized')
  assertEquals(result.success, true)
})

Deno.test('Focus API fails → returns error, retry_count incremented', async () => {
  let markErrorCalled = false
  let capturedRetryCount = -1

  const adapter = makeMockAdapter({
    findByIdempotencyKey: () => Promise.resolve(null),
    createQueued: () => Promise.resolve(makeInvoiceRow({ retry_count: 0 })),
    markError: (_admin, _id, _msg, count) => {
      markErrorCalled = true
      capturedRetryCount = count
      return Promise.resolve()
    },
  })

  const originalFetch = globalThis.fetch
  globalThis.fetch = () =>
    Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'Focus unavailable' }), { status: 500 }))

  const result = await processEmission(NULL_ADMIN, adapter, BASE_INPUT)
  globalThis.fetch = originalFetch

  assertEquals(markErrorCalled, true)
  assertEquals(result.success, false)
  assertEquals(result.status, 'error')
  // retry_count passed to markError is the current count (0), adapter increments internally
  assertEquals(capturedRetryCount, 0)
})

Deno.test('Focus API fails 5 times → returns error, status stays error (max retries)', async () => {
  const maxRetriedInvoice = makeInvoiceRow({ status: 'error', retry_count: 5 })

  const adapter = makeMockAdapter({
    findByIdempotencyKey: () => Promise.resolve(maxRetriedInvoice),
  })

  const result = await processEmission(NULL_ADMIN, adapter, BASE_INPUT)

  assertEquals(result.success, false)
  assertEquals(result.status, 'error')
  assertEquals(result.error, 'Max retries reached')
})
