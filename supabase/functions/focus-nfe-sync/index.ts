/**
 * focus-nfe-sync: queries Focus NFe status for a list of orders and persists
 * the result to the canonical invoices table.
 * Downloads XML/PDF URLs from Focus API and stores them in invoices.xml_url / pdf_url.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { digits, mapDomainStatus } from "../_shared/domain/focus/focus-status.ts";
import { normalizeFocusUrl } from "../_shared/domain/focus/focus-url.ts";
import { InvoicesAdapter } from "../_shared/adapters/invoices/invoices-adapter.ts";
import type { InvoicesPort, InvoiceRow } from "../_shared/ports/invoices-port.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { EmitNfeUseCase } from "../_shared/application/orders/EmitNfeUseCase.ts";

function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function arrayBufferToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchToBase64(url: string, accept: string, basic: string, token: string): Promise<string | null> {
  try {
    const r = await fetch(url, { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: accept } });
    if (r.ok) return arrayBufferToBase64(await r.arrayBuffer());
    if (r.status === 401 || r.status === 403) {
      const u2 = url.includes("?") ? `${url}&token=${token}` : `${url}?token=${token}`;
      const r2 = await fetch(u2, { method: "GET", headers: { Accept: accept } });
      if (r2.ok) return arrayBufferToBase64(await r2.arrayBuffer());
    }
    return null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({}, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const reqId = crypto.randomUUID();
  const log = (step: string, context?: any) => {
    try {
      console.log(JSON.stringify({ source: "focus-nfe-sync", reqId, ts: new Date().toISOString(), step, context: context ?? null }));
    } catch {}
  };

  try {
    const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
    if (!FOCUS_TOKEN) return jsonResponse({ error: "Missing service configuration" }, 500);

    const admin = createAdminClient() as any;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await (admin as any).auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = userRes.user;

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }

    const organizationId: string | undefined = body?.organizationId || body?.organization_id;
    const companyId: string | undefined = body?.companyId || body?.company_id;
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map((x: any) => String(x)) : [];
    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
    const useHomolog = environmentInput.includes("homolog") || body?.homologacao === true || body?.homolog === true;
    const environment: "homologacao" | "producao" = useHomolog ? "homologacao" : "producao";

    log("request", { userId: user.id, organizationId, companyId, orderIdsCount: orderIds.length, environment });

    if (!organizationId) return jsonResponse({ error: "organizationId is required" }, 400);
    if (!companyId) return jsonResponse({ error: "companyId is required" }, 400);
    if (!orderIds.length) return jsonResponse({ error: "orderIds is required" }, 400);

    const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", { p_user_id: user.id, p_org_id: organizationId });
    const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
    if (isMemberErr || !isMember) return jsonResponse({ error: "Forbidden" }, 403);

    const { data: company, error: compErr } = await admin.from("companies").select("*").eq("id", companyId).single();
    if (compErr || !company) return jsonResponse({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return jsonResponse({ error: "Company not in organization" }, 403);

    const tokenUsed = useHomolog ? (company?.focus_token_homologacao || FOCUS_TOKEN) : (company?.focus_token_producao || FOCUS_TOKEN);
    let tokenForAuth = String(tokenUsed || "").trim();
    let basic = btoa(`${tokenForAuth}:`);
    const apiBase = useHomolog ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";

    // Preflight auth check
    try {
      const cnpjDigits = digits(String(company?.cnpj || ""));
      if (cnpjDigits) {
        let preResp = await fetch(`${apiBase}/v2/empresas/${cnpjDigits}`, {
          method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        if (preResp.status === 401) {
          const globalToken = String(FOCUS_TOKEN || "").trim();
          if (globalToken && globalToken !== tokenForAuth) {
            const basicGlobal = btoa(`${globalToken}:`);
            preResp = await fetch(`${apiBase}/v2/empresas/${cnpjDigits}`, {
              method: "GET", headers: { Authorization: `Basic ${basicGlobal}`, Accept: "application/json" },
            });
            if (preResp.ok) { tokenForAuth = globalToken; basic = basicGlobal; }
            else return jsonResponse({ error: "Focus token unauthorized for company CNPJ" }, 401);
          } else {
            return jsonResponse({ error: "Focus token unauthorized for company CNPJ" }, 401);
          }
        }
      }
    } catch {}

    // Build use cases
    const invoicesPort: InvoicesPort = new InvoicesAdapter();
    const orderRepo = new SupabaseOrderRepository(admin);
    const inventory = new SupabaseInventoryAdapter(admin);
    const engine = new OrderStatusEngine();
    const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
    const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
    const emitNfeUseCase = new EmitNfeUseCase(admin, orderRepo, invoicesPort, recalculate);

    const results: Array<{ orderId: string; packId?: string | null; ok: boolean; status?: string; response?: any; error?: string }> = [];

    for (const oid of orderIds) {
      log("order_start", { oid });

      // Load order from canonical orders table
      const { data: order, error: orderErr } = await admin
        .from("orders")
        .select("id, marketplace_order_id, marketplace, organization_id, pack_id, order_shipping(*)")
        .eq("id", oid)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (orderErr || !order) {
        log("order_not_found", { oid, error: orderErr?.message });
        results.push({ orderId: oid, ok: false, error: orderErr?.message || "Order not found" });
        continue;
      }

      const shipping: any = Array.isArray(order.order_shipping) ? order.order_shipping[0] : order.order_shipping;
      const packId = String(order.pack_id ?? shipping?.pack_id ?? "").trim() || null;
      const packIdRef = packId && packId !== "0" ? packId : String(order.marketplace_order_id || "");
      const refStr = `pack-${packIdRef}-order-${order.marketplace_order_id}-company-${companyId}`;
      const idempotencyKey = `${organizationId}:${oid}:${environment}`;

      try {
        // Query Focus API
        const focusUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
        focusUrl.searchParams.set("completa", "1");
        const resp = await fetch(focusUrl.toString(), {
          method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        const text = await resp.text();
        let jsonResp: any = {};
        try { jsonResp = text ? JSON.parse(text) : {}; } catch { jsonResp = { raw: text }; }

        if (!resp.ok) {
          const errMsg = jsonResp?.mensagem || jsonResp?.message || `HTTP ${resp.status}`;
          log("sync_focus_error", { oid, httpStatus: resp.status, message: errMsg });

          try {
            const existing = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
            if (existing?.id) await invoicesPort.markError(admin, existing.id, errMsg, existing.retry_count);
          } catch {}
          results.push({ orderId: oid, packId, ok: false, status: jsonResp?.status, error: errMsg, response: jsonResp });
          continue;
        }

        let statusSync = String(jsonResp?.status || jsonResp?.status_sefaz || "pendente");
        let focusIdSync: string | null = jsonResp?.uuid || jsonResp?.id || null;
        let nfeKeySync: string | null = jsonResp?.chave || jsonResp?.chave_nfe || jsonResp?.chave_de_acesso || null;
        let nfeNumberSync: number | null = toNumberOrNull(jsonResp?.numero);
        let serieSync: string | null = jsonResp?.serie || null;
        let authorizedAtSync: string | null = null;
        let xmlB64Sync: string | null = jsonResp?.xml || jsonResp?.xml_base64 || null;
        let pdfB64Sync: string | null = jsonResp?.danfe || jsonResp?.pdf || null;
        let linksMeta = {
          caminho_xml: (typeof jsonResp?.caminho_xml_nota_fiscal === "string" ? jsonResp.caminho_xml_nota_fiscal : null) || (typeof jsonResp?.caminho_xml === "string" ? jsonResp.caminho_xml : null) || null,
          caminho_pdf: (typeof jsonResp?.caminho_danfe === "string" ? jsonResp.caminho_danfe : null) || (typeof jsonResp?.caminho_pdf === "string" ? jsonResp.caminho_pdf : null) || null,
        };

        const stLower = statusSync.toLowerCase();
        const isAuthorized = stLower === "autorizado" || stLower === "autorizada";

        if (isAuthorized) {
          authorizedAtSync = jsonResp?.data_autorizacao || new Date().toISOString();

          // Fetch complete data if needed
          if (focusIdSync && (!xmlB64Sync || !pdfB64Sync)) {
            try {
              const detailUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}`);
              detailUrl.searchParams.set("completa", "1");
              const cResp = await fetch(detailUrl.toString(), { method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" } });
              if (cResp.ok) {
                const cText = await cResp.text();
                let cJson: any = {};
                try { cJson = cText ? JSON.parse(cText) : {}; } catch {}
                statusSync = cJson?.status || cJson?.status_sefaz || statusSync;
                xmlB64Sync = cJson?.xml || cJson?.xml_base64 || xmlB64Sync || null;
                pdfB64Sync = cJson?.danfe || cJson?.pdf || pdfB64Sync || null;
                nfeKeySync = cJson?.chave || cJson?.chave_nfe || nfeKeySync || null;
                nfeNumberSync = toNumberOrNull(cJson?.numero) ?? nfeNumberSync;
                authorizedAtSync = cJson?.data_autorizacao || authorizedAtSync;
                linksMeta = {
                  caminho_xml: (typeof cJson?.caminho_xml_nota_fiscal === "string" ? cJson.caminho_xml_nota_fiscal : null) || (typeof cJson?.caminho_xml === "string" ? cJson.caminho_xml : null) || linksMeta.caminho_xml,
                  caminho_pdf: (typeof cJson?.caminho_danfe === "string" ? cJson.caminho_danfe : null) || (typeof cJson?.caminho_pdf === "string" ? cJson.caminho_pdf : null) || linksMeta.caminho_pdf,
                };
              }
            } catch {}
          }

          // Download XML if missing (for caching in URL fields)
          if (!xmlB64Sync) {
            const xmlLink = linksMeta.caminho_xml;
            if (xmlLink) xmlB64Sync = await fetchToBase64(normalizeFocusUrl(apiBase, xmlLink) || xmlLink, "application/xml", basic, tokenForAuth);
            if (!xmlB64Sync && focusIdSync) xmlB64Sync = await fetchToBase64(`${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}/xml`, "application/xml", basic, tokenForAuth);
          }
          if (!pdfB64Sync) {
            const pdfLink = linksMeta.caminho_pdf;
            if (pdfLink) pdfB64Sync = await fetchToBase64(normalizeFocusUrl(apiBase, pdfLink) || pdfLink, "application/pdf", basic, tokenForAuth);
            if (!pdfB64Sync && focusIdSync) pdfB64Sync = await fetchToBase64(`${apiBase}/v2/nfe/${encodeURIComponent(focusIdSync)}/danfe`, "application/pdf", basic, tokenForAuth);
          }
        }

        const xmlUrl: string | null = normalizeFocusUrl(apiBase, linksMeta.caminho_xml);
        const pdfUrl: string | null = normalizeFocusUrl(apiBase, linksMeta.caminho_pdf);

        // Find or create invoice record
        let invoice: InvoiceRow | null = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);

        if (!invoice) {
          // Create invoice record from sync data
          try {
            invoice = await invoicesPort.createQueued(admin, {
              organization_id: organizationId,
              order_id: oid,
              company_id: companyId,
              idempotency_key: idempotencyKey,
              emission_environment: environment,
              marketplace: String(order.marketplace || ""),
              marketplace_order_id: String(order.marketplace_order_id || ""),
              total_value: null,
              payload_sent: {} as any,
            });
          } catch (e) {
            console.error("[focus-nfe-sync] createQueued failed:", e);
          }
        }

        if (invoice?.id) {
          // Apply focused update based on status
          if (isAuthorized && nfeKeySync && nfeNumberSync) {
            await invoicesPort.markAuthorized(admin, invoice.id, nfeKeySync, nfeNumberSync);
          } else if (stLower === "rejeitado" || stLower === "denegado" || stLower === "erro_autorizacao") {
            const errMsg = jsonResp?.mensagem_sefaz || jsonResp?.mensagem || jsonResp?.message || "Rejeitado pela SEFAZ";
            await invoicesPort.markError(admin, invoice.id, errMsg, invoice.retry_count);
          } else if (stLower === "cancelado" || stLower === "cancelada") {
            await invoicesPort.markCanceled(admin, invoice.id);
          } else if (focusIdSync) {
            await invoicesPort.markProcessing(admin, invoice.id, String(focusIdSync));
          }

          // Patch additional fields
          const updates: Partial<InvoiceRow> = {};
          if (focusIdSync) updates.focus_id = focusIdSync;
          if (nfeKeySync) updates.nfe_key = nfeKeySync;
          if (nfeNumberSync) updates.nfe_number = nfeNumberSync;
          if (serieSync) updates.serie = serieSync;
          if (xmlUrl) updates.xml_url = xmlUrl;
          if (pdfUrl) updates.pdf_url = pdfUrl;
          if (isAuthorized) updates.marketplace_submission_status = "pending";
          if (Object.keys(updates).length) await invoicesPort.updateFields(admin, invoice.id, updates);
        }

        log("sync_done", { oid, refStr, status: statusSync, invoiceId: invoice?.id ?? null });

        // Side effects when authorized
        if (isAuthorized) {
          // Update orders.has_invoice and recalculate status
          try {
            await emitNfeUseCase.execute({
              orderId: oid,
              organizationId,
              companyId,
              environment,
              focusId: focusIdSync,
              nfeKey: nfeKeySync,
              nfeNumber: nfeNumberSync,
              authorized: true,
              errorMessage: null,
            });
          } catch (e) {
            console.error("[focus-nfe-sync] EmitNfeUseCase failed:", e);
          }

          // Update presented status for XML submission queue (backward compat)
          try {
            await admin
              .from("marketplace_orders_presented_new")
              .update({ status_interno: "subir xml" })
              .eq("organizations_id", organizationId)
              .eq("company_id", companyId)
              .eq("marketplace_order_id", String(order.marketplace_order_id || ""));
          } catch {}
        }

        results.push({ orderId: oid, packId, ok: true, status: statusSync, response: jsonResp });
      } catch (e: any) {
        log("order_exception", { oid, message: e?.message || String(e) });
        results.push({ orderId: oid, packId, ok: false, error: e?.message || String(e) });
      }
    }

    return jsonResponse({ ok: true, results }, 200);
  } catch (e: any) {
    log("exception", { message: e?.message || String(e) });
    return jsonResponse({ error: e?.message || "Internal error" }, 500);
  }
});
