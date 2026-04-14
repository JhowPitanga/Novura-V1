/**
 * Processes a single order for NFe emission against the Focus API.
 * Persists results to the invoices table via InvoicesPort.
 */
import type { SupabaseClient } from "../_shared/adapters/infra/supabase-client.ts";
import type { InvoicesPort } from "../_shared/ports/invoices-port.ts";
import type { EmitNfeUseCase } from "../_shared/application/orders/EmitNfeUseCase.ts";
import { digits, mapDomainStatus } from "../_shared/domain/focus/focus-status.ts";
import { resolveNfeNumber } from "./nfe-sequence.ts";
import { buildNfePayload } from "./build-nfe-payload.ts";

export interface EmitSingleOrderParams {
  admin: SupabaseClient;
  invoicesPort: InvoicesPort;
  emitNfeUseCase: EmitNfeUseCase;
  organizationId: string;
  companyId: string;
  orderId: string;
  company: Record<string, any>;
  taxConf: Record<string, any> | null;
  environment: "homologacao" | "producao";
  apiBase: string;
  basic: string;
  forceNewNumber: boolean;
  forceNewRef: boolean;
  refOverride: string | null;
  syncOnly: boolean;
  log: (step: string, context?: any) => void;
}

export interface EmitSingleOrderResult {
  orderId: string;
  packId?: string | null;
  ok: boolean;
  status?: string;
  response?: any;
  error?: string;
}

function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isCpf(s: string | null | undefined): boolean {
  return digits(s).length === 11;
}

function simplifyItems(arr: any[]): any[] {
  const out: any[] = [];
  for (const it of Array.isArray(arr) ? arr : []) {
    const title = typeof it?.item?.title === "string" ? it.item.title : (typeof it?.title === "string" ? it.title : "");
    const qtyRaw = it?.quantity ?? (it?.requested_quantity?.value ?? 1);
    const qty = Number(qtyRaw);
    const priceRaw = it?.unit_price ?? it?.price ?? 0;
    const price = Number(priceRaw);
    const sku = String(it?.item?.seller_sku ?? it?.seller_sku ?? it?.sku ?? "");
    out.push({
      product_name: title,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      price_per_unit: Number.isFinite(price) && price >= 0 ? price : 0,
      sku,
    });
  }
  return out;
}

/** Emits an NFe for a single order. All persistence goes through InvoicesPort. */
export async function emitSingleOrder(p: EmitSingleOrderParams): Promise<EmitSingleOrderResult> {
  const { admin, invoicesPort, emitNfeUseCase, orderId: oid, company, taxConf, log } = p;
  log("order_start", { oid });

  // 1. Load order with items and shipping
  const { data: rawOrder, error: orderErr } = await (admin as any)
    .from("orders")
    .select("*, order_items(*), order_shipping(*)")
    .eq("id", oid)
    .eq("organization_id", p.organizationId)
    .maybeSingle();

  if (orderErr || !rawOrder) {
    log("order_not_found", { oid, error: orderErr?.message });
    return { orderId: oid, ok: false, error: orderErr?.message || "Order not found" };
  }

  const shipping: any = Array.isArray(rawOrder.order_shipping) ? rawOrder.order_shipping[0] : rawOrder.order_shipping;
  const order = rawOrder as any;

  // 2. Check idempotency — skip if already authorized
  const idempotencyKey = `${p.organizationId}:${oid}:${p.environment}`;
  const existing = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
  if (existing?.status === "authorized" && !p.forceNewNumber) {
    log("already_authorized", { oid });
    return { orderId: oid, ok: false, error: "NF-e já emitida para este pedido" };
  }

  // 3. Resolve tax configuration
  const ufDest = String(shipping?.state_uf || "").trim();
  const ufEmpresa = String(company.estado || "").trim();
  const destDoc = String(rawOrder.buyer_document || "").trim();
  const isPessoaFisica = destDoc ? isCpf(destDoc) : true;
  const dentroEstado = !!ufDest && !!ufEmpresa && ufDest.toUpperCase() === ufEmpresa.toUpperCase();
  const pessoaKey = isPessoaFisica ? "PF" : "PJ";
  const abrKey = dentroEstado ? "dentro" : "fora";
  const icmsKey = `saida_${pessoaKey}_${abrKey}`;
  const icmsCfg = (taxConf as any)?.icms?.[icmsKey] || (taxConf?.payload as any)?.icms?.[icmsKey] || {};
  const cfop: string | null = icmsCfg?.cfop || null;
  const sitTribRaw = icmsCfg?.csosn || icmsCfg?.cst || null;
  const origemFallback = icmsCfg?.origem ?? null;

  if (!cfop) return { orderId: oid, ok: false, error: "CFOP não configurado para o cenário de saída" };
  if (sitTribRaw === null || sitTribRaw === undefined) {
    return { orderId: oid, ok: false, error: "Situação tributária ICMS não configurada para cenário de saída" };
  }

  // 4. Parse items
  let itemsArr = simplifyItems(Array.isArray(order.order_items) ? order.order_items : []);
  if (!itemsArr.length) return { orderId: oid, ok: false, error: "Pedido sem itens para emissão" };

  // 5. Map items with tax data from linked products
  const { mappedItems, error: itemError } = await mapItemsWithTax(admin, {
    itemsArr, oid, p, cfop, sitTribRaw, origemFallback,
  });
  if (itemError) return { orderId: oid, ok: false, error: itemError };

  const numeroSerie = company?.numero_serie ?? null;
  if (!numeroSerie) return { orderId: oid, ok: false, error: "Missing NF series" };

  // PIS/COFINS config
  const pisCfg = isPessoaFisica
    ? ((taxConf as any)?.pis?.pf || (taxConf?.payload as any)?.pis?.pf || {})
    : ((taxConf as any)?.pis?.pj || (taxConf?.payload as any)?.pis?.pj || {});
  const cofCfg = isPessoaFisica
    ? ((taxConf as any)?.cofins?.pf || (taxConf?.payload as any)?.cofins?.pf || {})
    : ((taxConf as any)?.cofins?.pj || (taxConf?.payload as any)?.cofins?.pj || {});
  const pisCst = pisCfg?.cst ? String(pisCfg.cst) : null;
  const cofinsCst = cofCfg?.cst ? String(cofCfg.cst) : null;
  if (!pisCst || !cofinsCst) return { orderId: oid, ok: false, error: "Configuração PIS/COFINS ausente para cenário de saída" };

  const pisAliquota = pisCfg?.aliquota != null ? Number(String(pisCfg.aliquota).replace(",", ".")) : null;
  const cofinsAliquota = cofCfg?.aliquota != null ? Number(String(cofCfg.aliquota).replace(",", ".")) : null;

  if (!destDoc || (!isCpf(destDoc) && digits(destDoc).length !== 14)) {
    return { orderId: oid, ok: false, error: "Documento do destinatário não encontrado (CPF/CNPJ)" };
  }

  const packId = String(order.pack_id ?? shipping?.pack_id ?? "").trim() || null;
  const packIdRef = packId && packId !== "0" ? packId : String(order.marketplace_order_id || "");
  let refStr = `pack-${packIdRef}-order-${order.marketplace_order_id}-company-${p.companyId}`;
  if (p.refOverride) refStr = p.refOverride;
  else if (p.forceNewRef) refStr = `${refStr}-retry-${Date.now()}`;

  const naturezaSaidaCol = (taxConf as any)?.natureza_saida || null;
  const naturezaSaidaPayload = (taxConf?.payload as any)?.basics?.naturezaSaida || null;
  const naturezaSaida = naturezaSaidaCol || naturezaSaidaPayload || null;

  // 6. Reserve NFe number via atomic RPC
  const valorProdutos = mappedItems.reduce((acc: number, it: any) =>
    acc + Number((it?.quantidade_comercial || 1) * (it?.valor_unitario_comercial || 0)), 0);

  const seqResult = await resolveNfeNumber(admin, {
    organizationId: p.organizationId,
    companyId: p.companyId,
    orderId: oid,
    environment: p.environment,
    payload: {},
    marketplace: order.marketplace || null,
    marketplaceOrderId: order.marketplace_order_id || null,
    packId: packIdRef,
    totalValue: valorProdutos,
    proximaNfe: company?.proxima_nfe ?? null,
    serie: numeroSerie,
  });

  log("nf_reserved", { oid, nfeNumber: seqResult.nfeNumber, serie: seqResult.serie });

  // 7. Build Focus payload
  const payload = buildNfePayload({
    order: rawOrder,
    shipping,
    company,
    taxConf,
    mappedItems,
    nfeNumber: seqResult.nfeNumber,
    serie: seqResult.serie,
    environment: p.environment,
    packId: packIdRef,
    refStr,
    cfop,
    pisCst,
    cofinsCst,
    pisAliquota,
    cofinsAliquota,
    naturezaSaida,
  });
  log("payload_ready", { oid, items: mappedItems.length, ref: refStr });

  // 8. If sync only, query Focus status without emitting
  if (p.syncOnly) {
    return await syncOnly(p, oid, refStr, packId, order, idempotencyKey);
  }

  // 9. Call Focus API
  const url = new URL(`${p.apiBase}/v2/nfe`);
  url.searchParams.set("ref", refStr);
  log("focus_url", { oid, url: url.toString() });

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Basic ${p.basic}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let jsonResp: any = {};
  try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }
  log("focus_response", { oid, httpStatus: resp.status, ok: resp.ok, status: jsonResp?.status });

  // 10. Handle Focus response
  return await handleFocusResponse({
    p, oid, resp, jsonResp, payload, refStr, packId,
    nfeNumberToUse: seqResult.nfeNumber, serieToUse: seqResult.serie,
    order, idempotencyKey,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function syncOnly(
  p: EmitSingleOrderParams,
  oid: string,
  refStr: string,
  packId: string | null,
  order: any,
  idempotencyKey: string,
): Promise<EmitSingleOrderResult> {
  const cUrl = new URL(`${p.apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
  cUrl.searchParams.set("completa", "1");
  const cResp = await fetch(cUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Basic ${p.basic}`, Accept: "application/json" },
  });
  const cText = await cResp.text();
  let cJson: any = {};
  try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }

  if (!cResp.ok) {
    return { orderId: oid, packId, ok: false, status: cJson?.status, error: cJson?.mensagem || "Falha ao consultar NF-e" };
  }

  const statusSync = cJson?.status || "pendente";
  const nfeKeySync = cJson?.chave || cJson?.chave_nfe || null;
  const nfeNumberSync = typeof cJson?.numero === "number" ? cJson.numero : null;
  const focusIdSync = cJson?.uuid || cJson?.id || null;

  const existing = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
  if (existing?.id) {
    if (String(statusSync).toLowerCase() === "autorizado" && nfeKeySync && nfeNumberSync) {
      await p.invoicesPort.markAuthorized(p.admin, existing.id, nfeKeySync, nfeNumberSync);
    } else if (focusIdSync) {
      await p.invoicesPort.markProcessing(p.admin, existing.id, String(focusIdSync));
    }
  }

  if (String(statusSync).toLowerCase() === "autorizado") {
    await p.emitNfeUseCase.execute({
      orderId: oid,
      organizationId: p.organizationId,
      companyId: p.companyId,
      environment: p.environment,
      focusId: focusIdSync,
      nfeKey: nfeKeySync,
      nfeNumber: nfeNumberSync,
      authorized: true,
      errorMessage: null,
    });
  }

  return { orderId: oid, packId, ok: true, status: statusSync, response: cJson };
}

async function handleFocusResponse(ctx: {
  p: EmitSingleOrderParams;
  oid: string;
  resp: Response;
  jsonResp: any;
  payload: Record<string, unknown>;
  refStr: string;
  packId: string | null;
  nfeNumberToUse: number;
  serieToUse: string | null;
  order: any;
  idempotencyKey: string;
}): Promise<EmitSingleOrderResult> {
  const { p, oid, resp, jsonResp, refStr, packId, nfeNumberToUse, order, idempotencyKey } = ctx;

  if (!resp.ok) {
    const errMsg = jsonResp?.mensagem || jsonResp?.message || `HTTP ${resp.status}`;
    const errCode = String(jsonResp?.codigo || "").toLowerCase();

    // already_processed: fetch and sync
    if (errCode === "already_processed") {
      return await syncAlreadyProcessed(p, oid, refStr, packId, order, idempotencyKey);
    }

    // Record error in invoices
    const existing = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
    if (existing?.id) {
      await p.invoicesPort.markError(p.admin, existing.id, errMsg, existing.retry_count);
    }
    await p.emitNfeUseCase.execute({
      orderId: oid, organizationId: p.organizationId, companyId: p.companyId,
      environment: p.environment, focusId: null, nfeKey: null, nfeNumber: null,
      authorized: false, errorMessage: errMsg,
    });
    return { orderId: oid, packId, ok: false, error: errMsg, response: jsonResp };
  }

  // Success path
  let status = String(jsonResp?.status || "ok").toLowerCase();
  const focusId = jsonResp?.uuid || jsonResp?.id || null;
  let nfeKey = jsonResp?.chave || jsonResp?.chave_nfe || null;
  let nfeNumber = toNumberOrNull(jsonResp?.numero) ?? nfeNumberToUse;

  // Mark processing in invoices
  const existing = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
  if (existing?.id && focusId) {
    await p.invoicesPort.markProcessing(p.admin, existing.id, String(focusId));
  }

  // Poll for authorization if not immediately authorized
  if (status !== "autorizado" && focusId) {
    const pollResult = await pollForAuthorization(p, oid, focusId, idempotencyKey);
    if (pollResult) {
      status = pollResult.status;
      nfeKey = pollResult.nfeKey ?? nfeKey;
      nfeNumber = pollResult.nfeNumber ?? nfeNumber;
    }
  }

  if (status === "autorizado") {
    const inv = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
    if (inv?.id && nfeKey && nfeNumber) {
      await p.invoicesPort.markAuthorized(p.admin, inv.id, nfeKey, nfeNumber);
    }
    await p.emitNfeUseCase.execute({
      orderId: oid, organizationId: p.organizationId, companyId: p.companyId,
      environment: p.environment, focusId, nfeKey, nfeNumber,
      authorized: true, errorMessage: null,
    });
    // Update next nfe number on company
    try {
      const nextSeq = Math.max(Number(p.company?.proxima_nfe || 0), Number(nfeNumber || 0)) + 1;
      await (p.admin as any).from("companies").update({ proxima_nfe: nextSeq }).eq("id", p.companyId);
    } catch (e) { console.error("[emit-single-order] update proxima_nfe failed:", e); }
    return { orderId: oid, packId, ok: true, status, response: { id: focusId, chave: nfeKey } };
  }

  return { orderId: oid, packId, ok: status !== "rejeitado" && status !== "denegado", status, response: jsonResp };
}

async function syncAlreadyProcessed(
  p: EmitSingleOrderParams,
  oid: string,
  refStr: string,
  packId: string | null,
  _order: any,
  idempotencyKey: string,
): Promise<EmitSingleOrderResult> {
  const cUrl = new URL(`${p.apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
  cUrl.searchParams.set("completa", "1");
  const cResp = await fetch(cUrl.toString(), {
    method: "GET",
    headers: { Authorization: `Basic ${p.basic}`, Accept: "application/json" },
  });
  const cText = await cResp.text();
  let cJson: any = {};
  try { cJson = cText ? JSON.parse(cText) : {}; } catch { cJson = { raw: cText }; }

  const stC = String(cJson?.status || "ok").toLowerCase();
  const nfeKeyC = cJson?.chave || cJson?.chave_nfe || null;
  const nfeNumberC = toNumberOrNull(cJson?.numero);
  const focusIdC = cJson?.uuid || cJson?.id || null;

  if (stC === "autorizado" && nfeKeyC && nfeNumberC) {
    const inv = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
    if (inv?.id) await p.invoicesPort.markAuthorized(p.admin, inv.id, nfeKeyC, nfeNumberC);
    await p.emitNfeUseCase.execute({
      orderId: oid, organizationId: p.organizationId, companyId: p.companyId,
      environment: p.environment, focusId: focusIdC, nfeKey: nfeKeyC, nfeNumber: nfeNumberC,
      authorized: true, errorMessage: null,
    });
  }

  return { orderId: oid, packId, ok: true, status: stC, response: cJson };
}

async function pollForAuthorization(
  p: EmitSingleOrderParams,
  oid: string,
  focusId: string,
  idempotencyKey: string,
): Promise<{ status: string; nfeKey: string | null; nfeNumber: number | null } | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const sResp = await fetch(`${p.apiBase}/v2/nfe/${focusId}`, {
      method: "GET",
      headers: { Authorization: `Basic ${p.basic}`, Accept: "application/json" },
    });
    const sText = await sResp.text();
    let sJson: any = {};
    try { sJson = sText ? JSON.parse(sText) : {}; } catch { sJson = { raw: sText }; }
    const st = String(sJson?.status || "").toLowerCase();
    p.log("poll_status", { oid, attempt, status: st });

    if (st === "autorizado") {
      return { status: "autorizado", nfeKey: sJson?.chave || sJson?.chave_nfe || null, nfeNumber: toNumberOrNull(sJson?.numero) };
    }

    if (st === "rejeitado" || st === "denegado") {
      const errMsg = sJson?.message || sJson?.mensagem_sefaz || "Rejeitado";
      const inv = await p.invoicesPort.findByIdempotencyKey(p.admin, idempotencyKey);
      if (inv?.id) await p.invoicesPort.markError(p.admin, inv.id, errMsg, inv.retry_count);
      await p.emitNfeUseCase.execute({
        orderId: oid, organizationId: p.organizationId, companyId: p.companyId,
        environment: p.environment, focusId, nfeKey: null, nfeNumber: null,
        authorized: false, errorMessage: errMsg,
      });
      return { status: st, nfeKey: null, nfeNumber: null };
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function mapItemsWithTax(
  admin: SupabaseClient,
  ctx: { itemsArr: any[]; oid: string; p: EmitSingleOrderParams; cfop: string; sitTribRaw: any; origemFallback: any },
): Promise<{ mappedItems: any[]; error: string | null }> {
  const { itemsArr, oid, p, cfop, sitTribRaw, origemFallback } = ctx;
  const mappedItems: any[] = [];

  for (const it of itemsArr) {
    const sku = String(it?.sku || "").trim();
    let descricao = String(it?.product_name || "").trim() || "Item";
    const qtd = Number(it?.quantity || 1);
    const unitPrice = Number(it?.price_per_unit || 0);
    let ncm: string | null = null;
    let origem: string | null = null;
    let barcode: string | null = null;
    let cest: string | null = null;

    if (sku) {
      const { data: prod } = await (admin as any)
        .from("products")
        .select("id, sku, ncm, tax_origin_code, barcode, cest, name")
        .eq("sku", sku)
        .limit(1)
        .maybeSingle();
      if (prod) {
        ncm = prod?.ncm ? String(prod.ncm) : null;
        origem = prod?.tax_origin_code != null ? String(prod.tax_origin_code) : null;
        barcode = prod?.barcode ? String(prod.barcode) : null;
        cest = prod?.cest ? String(prod.cest) : null;
        if (prod?.name) descricao = String(prod.name);
      }
    }

    if (origem === null && origemFallback !== null) origem = String(origemFallback);
    if (!ncm || !cfop || origem === null) {
      const field = !ncm ? "NCM" : origem === null ? "origem ICMS" : "CFOP";
      return { mappedItems: [], error: `Produto ${sku || descricao} sem ${field} configurado` };
    }

    const sitNum = sitTribRaw !== null ? Number(String(sitTribRaw).replace(/\D/g, "")) : NaN;
    mappedItems.push({
      codigo: sku || descricao,
      descricao,
      ncm,
      cfop,
      unidade_comercial: "un",
      quantidade_comercial: qtd,
      valor_unitario_comercial: unitPrice,
      icms_situacao_tributaria: Number.isFinite(sitNum) ? sitNum : undefined,
      origem: Number(String(origem).replace(/\D/g, "")),
      ean: barcode || undefined,
      cest: cest || undefined,
    });
  }

  return { mappedItems, error: null };
}
