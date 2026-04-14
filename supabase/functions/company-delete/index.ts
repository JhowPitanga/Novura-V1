// deno-lint-ignore-file no-explicit-any
/**
 * company-delete: validates business rules before soft-deleting a company.
 * Returns { ok: true } on success or { blocked: true, reason: string } when blocked.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/infra/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/infra/supabase-client.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const admin = createAdminClient() as any;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const company_id: string | undefined = body?.company_id;
    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

    // Load company
    const { data: company, error: compErr } = await admin
      .from("companies")
      .select("id, organization_id, is_default, is_active, focus_company_id")
      .eq("id", company_id)
      .single();
    if (compErr || !company) return jsonResponse({ error: "Company not found" }, 404);

    const org_id: string = company.organization_id;

    // Authorize: caller must be member of the org
    const { data: isMember } = await admin.rpc("is_org_member", {
      p_user_id: userRes.user.id,
      p_org_id: org_id,
    });
    if (!isMember) return jsonResponse({ error: "Forbidden" }, 403);

    // --- Business rule validations ---

    // Rule 1: cannot delete the default company
    if (company.is_default) {
      return jsonResponse({
        blocked: true,
        reason: "Defina outra empresa como padrão antes de excluir esta",
      }, 422);
    }

    // Rule 2: cannot delete the only active company
    const { count: activeCount } = await admin
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org_id)
      .eq("is_active", true);
    if ((activeCount ?? 0) <= 1) {
      return jsonResponse({
        blocked: true,
        reason: "Não é possível excluir a única empresa ativa",
      }, 422);
    }

    // Rule 3: cannot delete if there are pending orders
    const { data: hasPendingOrders } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id)
      .not("status", "in", '("shipped","cancelled","returned")');
    if ((hasPendingOrders as any)?.length > 0) {
      return jsonResponse({
        blocked: true,
        reason: "Existem pedidos pendentes vinculados a esta empresa",
      }, 422);
    }

    // Rule 4: cannot delete if there are active marketplace integrations
    const { data: integrations } = await admin
      .from("marketplace_integrations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company_id);
    if (Array.isArray(integrations) && integrations.length > 0) {
      return jsonResponse({
        blocked: true,
        reason: "Desconecte as integrações de marketplace antes de excluir",
      }, 422);
    }

    // Rule 5: cannot delete if there are pending invoices
    const { data: pendingInvoices } = await admin
      .from("invoices")
      .select("id")
      .eq("company_id", company_id)
      .not("status", "in", '("authorized","cancelled","error")');
    if (Array.isArray(pendingInvoices) && pendingInvoices.length > 0) {
      return jsonResponse({
        blocked: true,
        reason: "Existem notas fiscais pendentes de emissão ou cancelamento",
      }, 422);
    }

    // --- All checks passed: soft delete ---
    const { error: deleteErr } = await admin
      .from("companies")
      .update({ is_active: false })
      .eq("id", company_id);
    if (deleteErr) return jsonResponse({ error: deleteErr.message }, 500);

    // Optionally remove from Focus API if the company was synced
    if (company.focus_company_id) {
      const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
      if (FOCUS_TOKEN) {
        try {
          const basic = btoa(`${FOCUS_TOKEN}:`);
          await fetch(`https://api.focusnfe.com.br/v2/empresas/${company.focus_company_id}`, {
            method: "DELETE",
            headers: { "Authorization": `Basic ${basic}` },
          });
        } catch (focusErr: any) {
          // Non-fatal: log but proceed
          console.warn("[company-delete] Focus API delete failed", focusErr?.message);
        }
      }
    }

    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse({ error: e?.message || "Unknown error" }, 500);
  }
});
