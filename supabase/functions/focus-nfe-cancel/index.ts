/**
 * focus-nfe-cancel: cancels a Focus NFe for a given order.
 * All persistence goes through InvoicesPort/InvoicesAdapter (invoices table).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { digits } from "../_shared/domain/focus/focus-status.ts";
import { InvoicesAdapter } from "../_shared/adapters/invoices/invoices-adapter.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({}, 200);
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const reqId = crypto.randomUUID();
  const log = (step: string, context?: any) => {
    try {
      console.log(JSON.stringify({ source: "focus-nfe-cancel", reqId, ts: new Date().toISOString(), step, context: context ?? null }));
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
    const orderId: string | undefined = body?.orderId || body?.order_id;
    const justificativa: string = String(body?.justificativa || "").trim();
    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
    const useHomolog = environmentInput.includes("homolog") || body?.homologacao === true || body?.homolog === true;
    const environment: "homologacao" | "producao" = useHomolog ? "homologacao" : "producao";

    log("request", { userId: user.id, organizationId, companyId, orderId, environment });

    if (!organizationId) return jsonResponse({ error: "organizationId is required" }, 400);
    if (!companyId) return jsonResponse({ error: "companyId is required" }, 400);
    if (!orderId) return jsonResponse({ error: "orderId is required" }, 400);
    if (!justificativa || justificativa.length < 15 || justificativa.length > 255) {
      return jsonResponse({ error: "justificativa length must be between 15 and 255 characters" }, 400);
    }

    const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", { p_user_id: user.id, p_org_id: organizationId });
    const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
    if (isMemberErr || !isMember) return jsonResponse({ error: "Forbidden" }, 403);
    log("is_member", { ok: true });

    const { data: company, error: compErr } = await admin.from("companies").select("*").eq("id", companyId).single();
    if (compErr || !company) return jsonResponse({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return jsonResponse({ error: "Company not in organization" }, 403);

    const tokenUsed = useHomolog ? (company?.focus_token_homologacao || FOCUS_TOKEN) : (company?.focus_token_producao || FOCUS_TOKEN);
    const tokenForAuth = String(tokenUsed || "").trim();
    let basic = btoa(`${tokenForAuth}:`);
    const apiBase = useHomolog ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";

    // Preflight auth check
    try {
      const cnpjDigits = digits(String(company?.cnpj || ""));
      if (cnpjDigits) {
        const preResp = await fetch(`${apiBase}/v2/empresas/${cnpjDigits}`, {
          method: "GET", headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        });
        if (preResp.status === 401) {
          const globalToken = String(FOCUS_TOKEN || "").trim();
          if (globalToken && globalToken !== tokenForAuth) {
            const basicGlobal = btoa(`${globalToken}:`);
            const retryResp = await fetch(`${apiBase}/v2/empresas/${cnpjDigits}`, {
              method: "GET", headers: { Authorization: `Basic ${basicGlobal}`, Accept: "application/json" },
            });
            if (retryResp.ok) basic = basicGlobal;
            else return jsonResponse({ error: "Focus token unauthorized for company CNPJ" }, 401);
          } else {
            return jsonResponse({ error: "Focus token unauthorized for company CNPJ" }, 401);
          }
        }
      }
    } catch {}

    // Load order from canonical orders table
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, marketplace_order_id, marketplace, organization_id, pack_id, order_shipping(*)")
      .eq("id", orderId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (orderErr || !order) {
      log("order_not_found", { orderId, error: orderErr?.message });
      return jsonResponse({ error: orderErr?.message || "Order not found" }, 404);
    }

    const shipping: any = Array.isArray(order.order_shipping) ? order.order_shipping[0] : order.order_shipping;
    const packId = String(order.pack_id ?? shipping?.pack_id ?? "").trim() || null;
    const packIdRef = packId && packId !== "0" ? packId : String(order.marketplace_order_id || "");
    const refStr = `pack-${packIdRef}-order-${order.marketplace_order_id}-company-${companyId}`;
    log("cancel_start", { orderId, refStr, environment });

    // Call Focus API DELETE
    const focusUrl = new URL(`${apiBase}/v2/nfe/${encodeURIComponent(refStr)}`);
    const resp = await fetch(focusUrl.toString(), {
      method: "DELETE",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ justificativa }),
    });
    const respText = await resp.text();
    let jsonResp: any = {};
    try { jsonResp = respText ? JSON.parse(respText) : {}; } catch { jsonResp = { raw: respText }; }
    log("focus_response", { httpStatus: resp.status, ok: resp.ok, status: jsonResp?.status });

    const invoicesPort = new InvoicesAdapter();
    const idempotencyKey = `${organizationId}:${orderId}:${environment}`;

    if (!resp.ok) {
      const errMsg = jsonResp?.mensagem || jsonResp?.message || `HTTP ${resp.status}`;
      log("cancel_error", { message: errMsg });

      try {
        const existing = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
        if (existing?.id) await invoicesPort.markError(admin, existing.id, errMsg, existing.retry_count);
      } catch (e) {
        console.error("[focus-nfe-cancel] markError failed:", e);
      }
      return jsonResponse({ ok: false, error: errMsg, response: jsonResp }, resp.status >= 400 && resp.status < 500 ? resp.status : 422);
    }

    // Success: find invoice and mark as canceled
    const statusCancel = String(jsonResp?.status || jsonResp?.status_sefaz || "cancelado");
    log("cancel_ok", { refStr, status: statusCancel });

    try {
      let invoiceId: string | null = null;

      const byKey = await invoicesPort.findByIdempotencyKey(admin, idempotencyKey);
      if (byKey?.id) {
        invoiceId = byKey.id;
      } else if (order.marketplace_order_id) {
        // Fallback: find by marketplace_order_id + company_id
        const { data: fallback } = await admin
          .from("invoices")
          .select("id")
          .eq("marketplace_order_id", String(order.marketplace_order_id))
          .eq("company_id", companyId)
          .eq("emission_environment", environment)
          .maybeSingle();
        invoiceId = fallback?.id || null;
      }

      if (invoiceId) {
        await invoicesPort.markCanceled(admin, invoiceId);
      } else {
        log("invoice_not_found_for_cancel", { idempotencyKey });
      }
    } catch (e) {
      console.error("[focus-nfe-cancel] markCanceled failed:", e);
    }

    // Trigger order status recalculation (non-fatal)
    try {
      const orderRepo = new SupabaseOrderRepository(admin);
      const inventory = new SupabaseInventoryAdapter(admin);
      const engine = new OrderStatusEngine();
      const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
      const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
      await recalculate.execute(orderId, "user_action");
      log("recalculate_ok", { orderId });
    } catch (e) {
      console.error("[focus-nfe-cancel] recalculate failed:", e);
    }

    return jsonResponse({ ok: true, status: statusCancel, response: jsonResp }, 200);
  } catch (e: any) {
    log("exception", { message: e?.message || String(e) });
    return jsonResponse({ error: e?.message || "Internal error" }, 500);
  }
});
