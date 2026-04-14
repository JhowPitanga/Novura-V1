/**
 * focus-nfe-emit: HTTP entry point for NFe emission.
 * Delegates per-order processing to emit-single-order.ts.
 * All persistence goes through InvoicesPort/InvoicesAdapter (invoices table).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse as json } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";
import { SupabaseOrderRepository } from "../_shared/adapters/orders/SupabaseOrderRepository.ts";
import { SupabaseInventoryAdapter } from "../_shared/adapters/orders/SupabaseInventoryAdapter.ts";
import { InvoicesAdapter } from "../_shared/adapters/invoices/invoices-adapter.ts";
import { OrderStatusEngine } from "../_shared/application/orders/OrderStatusEngine.ts";
import { HandleStockSideEffectsUseCase } from "../_shared/application/orders/HandleStockSideEffectsUseCase.ts";
import { RecalculateOrderStatusUseCase } from "../_shared/application/orders/RecalculateOrderStatusUseCase.ts";
import { EmitNfeUseCase } from "../_shared/application/orders/EmitNfeUseCase.ts";
import { emitSingleOrder } from "./emit-single-order.ts";
import type { EmitSingleOrderResult } from "./emit-single-order.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const reqId = crypto.randomUUID();
    const log = (step: string, context?: any) => {
      try {
        console.log(JSON.stringify({ source: "focus-nfe-emit", reqId, ts: new Date().toISOString(), step, context: context ?? null }));
      } catch (_) {}
    };

    const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
    if (!FOCUS_TOKEN) return json({ error: "Missing service configuration" }, 500);

    const admin = createAdminClient() as any;

    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let user: any = null;
    try {
      const { data: userRes, error: userErr } = await admin.auth.getUser(token);
      if (!userErr && userRes?.user) user = userRes.user;
    } catch (_) {}

    // Parse body
    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const organizationId: string | undefined = body?.organizationId || body?.organization_id;
    const companyId: string | undefined = body?.companyId || body?.company_id;
    const orderIds: string[] = Array.isArray(body?.orderIds) ? body.orderIds.map(String) : [];
    const syncOnly = body?.syncOnly === true || body?.sync_only === true || String(body?.operation || "").toLowerCase() === "sync";
    const forceNewNumber = body?.forceNewNumber === true || body?.force_new_number === true;
    const forceNewRef = body?.forceNewRef === true || body?.force_new_ref === true;
    const refOverride = typeof body?.refOverride === "string" ? body.refOverride.trim() || null : null;

    if (!organizationId) return json({ error: "organizationId is required" }, 400);
    if (!companyId) return json({ error: "companyId is required" }, 400);
    if (!orderIds.length) return json({ error: "orderIds is required" }, 400);

    // Org membership check
    if (user?.id) {
      const { data: isMemberData, error: isMemberErr } = await admin.rpc("is_org_member", { p_user_id: user.id, p_org_id: organizationId });
      const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
      if (isMemberErr || !isMember) return json({ error: "Forbidden" }, 403);
    }

    // Load company
    const { data: company, error: compErr } = await admin.from("companies").select("*").eq("id", companyId).single();
    if (compErr || !company) return json({ error: compErr?.message || "Company not found" }, 404);
    if (String(company.organization_id || "") !== String(organizationId)) return json({ error: "Company not in organization" }, 403);

    // Load default tax config
    const { data: taxConf } = await admin
      .from("company_tax_configs")
      .select("id, organizations_id, payload, is_default, icms, ipi, pis, cofins, adicionais, natureza_saida, natureza_entrada")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();

    // Resolve Focus credentials and environment
    const environmentInput = String(body?.environment || body?.ambiente || "").toLowerCase();
    const useHomolog = environmentInput.includes("homolog") || environmentInput.includes("teste") || body?.homologacao === true;
    const environment: "homologacao" | "producao" = useHomolog ? "homologacao" : "producao";
    const tokenProducao = company?.focus_token_producao || null;
    const tokenHomolog = company?.focus_token_homologacao || null;
    const tokenForAuth = String((useHomolog ? (tokenHomolog || FOCUS_TOKEN) : (tokenProducao || FOCUS_TOKEN)) || "").trim();
    const basic = btoa(`${tokenForAuth}:`);
    const apiBase = useHomolog ? "https://homologacao.focusnfe.com.br" : "https://api.focusnfe.com.br";

    // Build use cases
    const orderRepo = new SupabaseOrderRepository(admin);
    const inventory = new SupabaseInventoryAdapter(admin);
    const invoicesAdapter = new InvoicesAdapter();
    const engine = new OrderStatusEngine();
    const stockUseCase = new HandleStockSideEffectsUseCase(inventory);
    const recalculate = new RecalculateOrderStatusUseCase(orderRepo, engine, stockUseCase);
    const emitNfeUseCase = new EmitNfeUseCase(admin, orderRepo, invoicesAdapter, recalculate);

    // Process each order
    const results: EmitSingleOrderResult[] = [];
    for (const oid of orderIds) {
      const result = await emitSingleOrder({
        admin, invoicesPort: invoicesAdapter, emitNfeUseCase,
        organizationId, companyId, orderId: oid,
        company, taxConf, environment, apiBase, basic,
        forceNewNumber, forceNewRef, refOverride, syncOnly, log,
      });
      results.push(result);
    }

    const allFailed = results.length > 0 && results.every((r) => !r.ok);
    if (allFailed) return json({ ok: false, results, error: "All orders failed" }, 400);
    return json({ ok: true, results });
  } catch (e: any) {
    console.error("focus-nfe-emit", { error: e?.message || "Unknown error" });
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
