/**
 * focus-webhook: receives Focus NFe status callbacks.
 * All persistence goes through InvoicesPort/InvoicesAdapter (invoices table).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse as json } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { InvoicesAdapter } from "../_shared/adapters/invoices/invoices-adapter.ts";
import type { InvoicesPort, InvoiceRow } from "../_shared/ports/invoices-port.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { EmitNfeUseCase } from "../_shared/application/orders/EmitNfeUseCase.ts";

const RID = crypto.randomUUID();
function log(step: string, context?: any) {
  try {
    console.log(JSON.stringify({ source: "focus-webhook", rid: RID, ts: new Date().toISOString(), step, context: context ?? null }));
  } catch {}
}

serve(async (req) => {
  try {
    log("request_start", { method: req.method, url: req.url });
  } catch {}
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method === "HEAD") return new Response("", { status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, HEAD, OPTIONS", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" } });
  if (!["POST", "GET"].includes(req.method)) return json({ error: "Method not allowed" }, 405);

  const FOCUS_WEBHOOK_SECRET = Deno.env.get("FOCUS_WEBHOOK_SECRET") || "";
  const admin = createAdminClient() as any;
  const invoicesPort: InvoicesPort = new InvoicesAdapter();

  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const provided = [
      url.searchParams.get("secret"), url.searchParams.get("token"),
      req.headers.get("x-webhook-secret"), req.headers.get("x-webhook-token"),
      req.headers.get("x-focus-webhook-secret"), req.headers.get("x-api-token"),
      req.headers.get("x-focus-token"),
    ].filter(Boolean) as string[];
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    let secretOk = FOCUS_WEBHOOK_SECRET ? provided.some((v) => v === FOCUS_WEBHOOK_SECRET) : true;
    let envFromAuth: "homologacao" | "producao" | null = null;

    if (!secretOk) {
      const result = await authenticateViaCompanyToken(admin, authHeader);
      secretOk = result.ok;
      envFromAuth = result.env;
    }
    if (!secretOk) {
      log("unauthorized");
      return json({ error: "Unauthorized webhook" }, 401);
    }

    // ── Parse body ───────────────────────────────────────────────────
    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    if ((!body || !Object.keys(body).length) && req.method === "GET" && url.search.length > 1) {
      const obj: any = {};
      url.searchParams.forEach((v, k) => { obj[k] = v; });
      const embedded = obj.payload || obj.data || obj.body || null;
      if (embedded && typeof embedded === "string") {
        try { body = { ...obj, ...JSON.parse(embedded) }; } catch { body = obj; }
      } else body = obj;
    }
    if (!body || !Object.keys(body).length) {
      const ct = String(req.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("x-www-form-urlencoded") || (raw?.includes("=") && raw?.includes("&"))) {
        const params = new URLSearchParams(raw || "");
        const obj: any = {};
        params.forEach((v, k) => { obj[k] = v; });
        body = obj;
      }
    }

    // ── Token webhook handling ───────────────────────────────────────
    const tokenResult = await handleTokenWebhook(admin, body, url);
    if (tokenResult) return tokenResult;

    // ── Extract fields ───────────────────────────────────────────────
    const status = String(body?.status || body?.status_sefaz || "").trim();
    const focusId: string | null = body?.uuid || body?.id || null;
    const nfeKey: string | null = body?.chave || body?.chave_nfe || body?.chave_de_acesso || null;
    const nfeNumber: number | null = typeof body?.numero === "number" ? body.numero : null;
    const serieLocal: string | null = body?.serie || null;
    const authorizedAt: string | null = body?.data_autorizacao || null;
    const referenciaStr: string | null = body?.referencia || body?.ref || null;
    const xmlB64: string | null = body?.xml_base64 || null;
    const links = {
      caminho_xml: body?.caminho_xml || body?.caminho_xml_nota_fiscal || null,
      caminho_pdf: body?.caminho_pdf || body?.caminho_pdf_danfe || body?.caminho_danfe || null,
    };
    log("hook_event_meta", { status, focusId, nfeKey, nfeNumber, referencia: referenciaStr });

    // ── Parse referencia ─────────────────────────────────────────────
    const ref = parseReferencia(referenciaStr);
    const companyId: string | null = ref?.companyId || null;
    const marketplace: string | null = ref?.marketplace || null;
    const marketplaceOrderId: string | null = ref?.marketplace_order_id || null;

    // ── Find existing invoice ────────────────────────────────────────
    let invoice: InvoiceRow | null = null;
    if (nfeKey) invoice = await invoicesPort.findByNfeKey(admin, nfeKey);
    if (!invoice && focusId) invoice = await invoicesPort.findByFocusId(admin, focusId);
    if (!invoice && companyId && marketplaceOrderId) {
      const envRaw = resolveEnvironment(body, ref, envFromAuth);
      const idempotencyKey = companyId && ref?.organizationId
        ? `${ref.organizationId}:${ref.orderId || marketplaceOrderId}:${envRaw || "producao"}`
        : null;
      if (idempotencyKey) invoice = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
    }
    log("invoice_found", { invoiceId: invoice?.id ?? null });

    // ── Resolve environment ──────────────────────────────────────────
    const envResolved = resolveEnvironment(body, ref, envFromAuth);

    // ── Normalize XML/PDF URLs ───────────────────────────────────────
    const xmlUrl = normalizeUrl(links.caminho_xml);
    const pdfUrl = normalizeUrl(links.caminho_pdf);

    // ── Build use cases ──────────────────────────────────────────────
    const orderRepo = new SupabaseOrderRepository(admin);
    const inventory = new SupabaseInventoryAdapter(admin);
    const engine = new OrderStatusEngine();
    const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
    const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
    const emitNfeUseCase = new EmitNfeUseCase(admin, orderRepo, invoicesPort, recalculate);

    const stLower = status.toLowerCase();
    const isAuthorized = stLower === "autorizado" || stLower === "autorizada" || stLower === "authorized";
    const isCanceled = stLower === "cancelado" || stLower === "cancelada";
    const isError = stLower === "rejeitado" || stLower === "denegado" || stLower === "erro_autorizacao";

    if (invoice?.id) {
      // ── Update existing invoice ──────────────────────────────────
      const updates: Partial<InvoiceRow> = {};
      if (focusId) updates.focus_id = focusId;
      if (nfeKey) updates.nfe_key = nfeKey;
      if (nfeNumber) updates.nfe_number = nfeNumber;
      if (serieLocal) (updates as any).serie = serieLocal;
      if (xmlUrl) (updates as any).xml_url = xmlUrl;
      if (pdfUrl) (updates as any).pdf_url = pdfUrl;
      if (envResolved) updates.emission_environment = envResolved as any;

      if (isAuthorized) {
        if (nfeKey && nfeNumber) {
          await invoicesPort.markAuthorized(admin, invoice.id, nfeKey, nfeNumber);
        }
        if (Object.keys(updates).length) await invoicesPort.updateFields(admin, invoice.id, updates);

        // Extract total_value from XML if available
        await extractAndUpdateFromXml(admin, invoicesPort, invoice, companyId, xmlUrl, xmlB64, envResolved);

        // Trigger order side-effects
        const orderId = invoice.order_id;
        if (orderId && invoice.organization_id) {
          await emitNfeUseCase.execute({
            orderId, organizationId: invoice.organization_id, companyId: invoice.company_id,
            environment: invoice.emission_environment, focusId, nfeKey, nfeNumber,
            authorized: true, errorMessage: null,
          });
        }
      } else if (isCanceled) {
        await invoicesPort.markCanceled(admin, invoice.id);
        if (Object.keys(updates).length) await invoicesPort.updateFields(admin, invoice.id, updates);
      } else if (isError) {
        const errMsg = body?.mensagem_sefaz || body?.message || body?.error || "Rejected";
        await invoicesPort.markError(admin, invoice.id, errMsg, invoice.retry_count);
        if (Object.keys(updates).length) await invoicesPort.updateFields(admin, invoice.id, updates);

        const orderId = invoice.order_id;
        if (orderId && invoice.organization_id) {
          await emitNfeUseCase.execute({
            orderId, organizationId: invoice.organization_id, companyId: invoice.company_id,
            environment: invoice.emission_environment, focusId, nfeKey: null, nfeNumber: null,
            authorized: false, errorMessage: errMsg,
          });
        }
      } else if (Object.keys(updates).length) {
        await invoicesPort.updateFields(admin, invoice.id, updates);
      }

      log("invoice_updated", { id: invoice.id, status });
      return json({ ok: true, updated_id: invoice.id });
    }

    // ── No existing invoice: resolve order and create ──────────────
    if (!companyId) {
      log("insert_blocked_missing_company");
      return json({ ok: false, error: "Missing company_id for invoice insert" }, 422);
    }

    let orderId: string | null = null;
    let organizationId: string | null = null;
    if (companyId && marketplaceOrderId) {
      const { data: orderRow } = await admin
        .from("orders")
        .select("id, organization_id")
        .eq("marketplace_order_id", marketplaceOrderId)
        .limit(1)
        .maybeSingle();
      orderId = orderRow?.id || null;
      organizationId = orderRow?.organization_id || null;
    }
    if (!organizationId && companyId) {
      const { data: compRow } = await admin.from("companies").select("organization_id").eq("id", companyId).limit(1).maybeSingle();
      organizationId = compRow?.organization_id || null;
    }
    if (!organizationId) {
      log("insert_blocked_no_org");
      return json({ ok: false, error: "Could not resolve organization_id" }, 422);
    }

    const idempotencyKey = `${organizationId}:${orderId || marketplaceOrderId}:${envResolved || "producao"}`;

    // Check again by idempotency key (may have been created between lookups)
    const existingByKey = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
    if (existingByKey?.id) {
      if (isAuthorized && nfeKey && nfeNumber) {
        await invoicesPort.markAuthorized(admin, existingByKey.id, nfeKey, nfeNumber);
      } else if (isCanceled) {
        await invoicesPort.markCanceled(admin, existingByKey.id);
      } else if (isError) {
        const errMsg = body?.mensagem_sefaz || body?.message || "Rejected";
        await invoicesPort.markError(admin, existingByKey.id, errMsg, existingByKey.retry_count);
      }
      return json({ ok: true, updated_id: existingByKey.id });
    }

    // Create new invoice via upsert
    const newInvoice = await invoicesPort.createQueued(admin, {
      organization_id: organizationId,
      order_id: orderId,
      company_id: companyId,
      idempotency_key: idempotencyKey,
      emission_environment: (envResolved || "producao") as any,
      marketplace: marketplace,
      marketplace_order_id: marketplaceOrderId,
      total_value: null,
      payload_sent: {} as any,
    });

    if (isAuthorized && nfeKey && nfeNumber) {
      await invoicesPort.markAuthorized(admin, newInvoice.id, nfeKey, nfeNumber);
      if (orderId) {
        await emitNfeUseCase.execute({
          orderId, organizationId, companyId,
          environment: (envResolved || "producao") as any, focusId, nfeKey, nfeNumber,
          authorized: true, errorMessage: null,
        });
      }
    } else if (isCanceled) {
      await invoicesPort.markCanceled(admin, newInvoice.id);
    } else if (isError) {
      const errMsg = body?.mensagem_sefaz || body?.message || "Rejected";
      await invoicesPort.markError(admin, newInvoice.id, errMsg, 0);
    }

    if (focusId || xmlUrl || pdfUrl) {
      const updates: any = {};
      if (focusId) updates.focus_id = focusId;
      if (nfeKey) updates.nfe_key = nfeKey;
      if (nfeNumber) updates.nfe_number = nfeNumber;
      if (serieLocal) updates.serie = serieLocal;
      if (xmlUrl) updates.xml_url = xmlUrl;
      if (pdfUrl) updates.pdf_url = pdfUrl;
      if (Object.keys(updates).length) await invoicesPort.updateFields(admin, newInvoice.id, updates);
    }

    log("invoice_inserted", { id: newInvoice.id });
    return json({ ok: true, inserted_id: newInvoice.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("exception", { message: msg });
    return json({ error: msg }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

async function authenticateViaCompanyToken(
  admin: any,
  authHeader: string,
): Promise<{ ok: boolean; env: "homologacao" | "producao" | null }> {
  if (!authHeader) return { ok: false, env: null };
  let tokenCandidate = "";
  const lower = authHeader.toLowerCase();
  if (lower.startsWith("basic ")) {
    try {
      const raw = atob(authHeader.slice(6).trim());
      tokenCandidate = (raw.split(":")[0] || "").trim();
    } catch { return { ok: false, env: null }; }
  } else if (lower.startsWith("bearer ")) {
    tokenCandidate = authHeader.slice(7).trim();
  } else if (lower.startsWith("token ")) {
    tokenCandidate = authHeader.slice(6).trim();
  } else {
    tokenCandidate = authHeader.trim();
  }
  if (!tokenCandidate) return { ok: false, env: null };
  const { data: comp } = await admin
    .from("companies")
    .select("id, focus_token_producao, focus_token_homologacao")
    .or(`focus_token_producao.eq.${tokenCandidate},focus_token_homologacao.eq.${tokenCandidate}`)
    .limit(1)
    .maybeSingle();
  if (!comp?.id) return { ok: false, env: null };
  const env = tokenCandidate === comp.focus_token_homologacao ? "homologacao" : "producao";
  return { ok: true, env };
}

async function handleTokenWebhook(admin: any, body: any, url: URL): Promise<Response | null> {
  const tokenProducao = body?.token_producao || body?.api_token || body?.token || null;
  const tokenHomologacao = body?.token_homologacao || null;
  if (!tokenProducao && !tokenHomologacao) return null;

  const refStr = body?.referencia || null;
  let ref: any = null;
  try { ref = refStr ? JSON.parse(refStr) : null; } catch {}
  const companyId = ref?.companyId || null;
  const cnpj = body?.cnpj || body?.cnpj_emitente || null;
  let targetId = companyId;
  if (!targetId && cnpj) {
    const { data } = await admin.from("companies").select("id").eq("cnpj", String(cnpj).replace(/\D/g, "")).limit(1).maybeSingle();
    targetId = data?.id || null;
  }
  if (!targetId) return null;

  const env = body?.environment || body?.ambiente || null;
  const updates: any = {};
  if (!env || String(env).toLowerCase().includes("prod")) updates.focus_token_producao = tokenProducao || null;
  if (!env || String(env).toLowerCase().includes("homolog")) updates.focus_token_homologacao = tokenHomologacao || null;
  if (!Object.keys(updates).length) return null;

  await admin.from("companies").update(updates).eq("id", targetId);
  return json({ ok: true, updated_company_id: targetId, saved: Object.keys(updates) }, 200);
}

function parseReferencia(referenciaStr: string | null): any {
  if (!referenciaStr) return null;
  try { const parsed = JSON.parse(referenciaStr); if (typeof parsed === "object") return parsed; } catch {}
  const rr = referenciaStr;
  const packIdx = rr.indexOf("pack-");
  const orderIdx = rr.indexOf("order-");
  const companyMarker = "-company-";
  const companyIdx = rr.indexOf(companyMarker);
  let packId = null, orderId = null, companyId = null;
  if (packIdx >= 0 && orderIdx > packIdx) packId = rr.substring(packIdx + 5, orderIdx).trim();
  if (orderIdx >= 0 && companyIdx > orderIdx) orderId = rr.substring(orderIdx + 6, companyIdx).trim();
  if (companyIdx >= 0) {
    const start = companyIdx + companyMarker.length;
    const retryIdx = rr.indexOf("-retry-", start);
    companyId = rr.substring(start, retryIdx >= 0 ? retryIdx : rr.length).trim();
  }
  return { companyId, marketplace_order_id: orderId, pack_id: packId };
}

function resolveEnvironment(
  body: any,
  ref: any,
  envFromAuth: "homologacao" | "producao" | null,
): "homologacao" | "producao" | null {
  let envRaw = body?.environment || body?.ambiente || ref?.environment || null;
  if (envRaw) {
    const lower = String(envRaw).toLowerCase();
    return lower.includes("homolog") ? "homologacao" : "producao";
  }
  return envFromAuth;
}

function normalizeUrl(path: string | null): string | null {
  if (!path) return null;
  const p = String(path).trim().replace(/^['"`]\s*|\s*['"`]$/g, "");
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  try { return new URL(p, "https://api.focusnfe.com.br/").toString(); } catch { return p; }
}

async function extractAndUpdateFromXml(
  admin: any,
  invoicesPort: InvoicesPort,
  invoice: InvoiceRow,
  companyId: string | null,
  xmlUrl: string | null,
  xmlB64: string | null,
  envResolved: string | null,
): Promise<void> {
  let xmlText: string | null = null;
  if (xmlUrl && companyId) {
    try {
      const { data: comp } = await admin.from("companies").select("focus_token_producao, focus_token_homologacao").eq("id", companyId).limit(1).maybeSingle();
      const useToken = String(envResolved || "").includes("homolog") ? comp?.focus_token_homologacao : comp?.focus_token_producao;
      const basicAuth = useToken ? "Basic " + btoa(`${String(useToken)}:`) : undefined;
      const resp = await fetch(xmlUrl, { method: "GET", headers: basicAuth ? { Authorization: basicAuth } : undefined });
      if (resp.ok) xmlText = await resp.text();
    } catch {}
  }
  if (!xmlText && xmlB64) {
    try { xmlText = atob(xmlB64); } catch {}
  }
  if (!xmlText) return;

  const updates: any = {};
  const mVNF = xmlText.match(/<vNF>([\d.,]+)<\/vNF>/);
  if (mVNF?.[1]) {
    const num = Number(mVNF[1].replace(/,/g, "."));
    if (Number.isFinite(num)) updates.total_value = num;
  }
  const mNNF = xmlText.match(/<nNF>(\d+)<\/nNF>/);
  if (mNNF?.[1]) updates.nfe_number = Number(mNNF[1]);
  const mSerie = xmlText.match(/<serie>(\d+)<\/serie>/);
  if (mSerie?.[1]) updates.serie = mSerie[1];
  const mDhEmi = xmlText.match(/<dhEmi>([^<]+)<\/dhEmi>/);
  if (mDhEmi?.[1] && !invoice.authorized_at) {
    try { updates.authorized_at = new Date(mDhEmi[1]).toISOString(); } catch {}
  }
  if (Object.keys(updates).length) {
    await invoicesPort.updateFields(admin, invoice.id, updates);
    log("xml_meta_extracted", { invoiceId: invoice.id, fields: Object.keys(updates) });
  }
}
