// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";
import { digits as onlyDigits } from "../_shared/domain/focus-status.ts";
import { mapTributacaoToFocus } from "../_shared/domain/focus-tributacao.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const FOCUS_TOKEN = Deno.env.get("FOCUS_API_TOKEN");
    if (!FOCUS_TOKEN) {
      return jsonResponse({ error: "Missing service configuration" }, 500);
    }

    const admin = createAdminClient() as any;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userRes, error: userErr } = await (admin as any).auth.getUser(token);
    if (userErr || !userRes?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const currentUser = userRes.user;

    const raw = await req.text();
    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const company_id: string | undefined = body?.company_id;
    const organization_id_input: string | undefined = body?.organization_id;
    const dry_run: boolean = !!body?.dry_run;
    const arquivo_certificado_base64: string | undefined = body?.arquivo_certificado_base64;
    const senha_certificado: string | undefined = body?.senha_certificado;

    if (!company_id) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    // Resolve company and its organization
    const { data: company, error: compErr } = await admin
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();
    if (compErr || !company) {
      return jsonResponse({ error: compErr?.message || "Company not found" }, 404);
    }

    let organizations_id: string | null = company.organization_id || null;
    if (!organizations_id && organization_id_input) {
      organizations_id = organization_id_input;
    }
    if (!organizations_id) {
      return jsonResponse({ error: "organization_id is required for Focus sync" }, 400);
    }

    // Membership check
    const { data: isMemberData, error: isMemberErr } = await admin.rpc('is_org_member', {
      p_user_id: currentUser.id,
      p_org_id: organizations_id,
    });
    const isMember = (Array.isArray(isMemberData) ? isMemberData?.[0] : isMemberData) === true;
    if (isMemberErr || !isMember) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    // Build Focus payload
    const regime = mapTributacaoToFocus(company.tributacao);
    const serieProd = (() => {
      const s = String(company.numero_serie || "").trim();
      const num = parseInt(s, 10);
      return Number.isFinite(num) && num > 0 ? num : (s || null);
    })();
    const proxNfeProd = (() => {
      const n = parseInt(String(company.proxima_nfe || ""), 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();

    const payload: Record<string, any> = {
      nome: company.razao_social,
      nome_fantasia: company.razao_social,
      cnpj: onlyDigits(company.cnpj),
      inscricao_estadual: onlyDigits(company.inscricao_estadual),
      email: company.email,
      telefone: "",
      logradouro: company.endereco,
      numero: company.numero,
      complemento: company.complemento || "",
      bairro: company.bairro,
      municipio: company.cidade,
      uf: company.estado,
      pais: "Brasil",
      cep: onlyDigits(company.cep),
      habilita_nfe: true,
      orientacao_danfe: "portrait",
      serie_nfe_producao: serieProd,
      proximo_numero_nfe_producao: proxNfeProd,
    };
    if (regime) payload.regime_tributario = regime;
    if (company.logo_url) payload.caminho_logo = company.logo_url;
    if (arquivo_certificado_base64) payload.arquivo_certificado_base64 = arquivo_certificado_base64;
    if (arquivo_certificado_base64 && senha_certificado) payload.senha_certificado = senha_certificado;
    payload.mostrar_danfse_badge = false;
    payload.enviar_email_destinatario = false;

    const url = new URL("https://api.focusnfe.com.br/v2/empresas");

    // Basic Auth: token as username, blank password
    // @ts-ignore
    const basic = btoa(`${FOCUS_TOKEN}:`);
    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }

    if (!resp.ok) {
      return jsonResponse({ ok: false, status: resp.status, error: json?.message || json?.error || "Focus API error", response: json }, resp.status);
    }

    try {
      const prodToken = json?.api_token || json?.token_producao || json?.token || null;
      const homToken = json?.token_homologacao || null;
      if (prodToken || homToken) {
        await admin
          .from("companies")
          .update({
            focus_token_producao: prodToken || null,
            focus_token_homologacao: homToken || null,
          })
          .eq("id", company_id);
      }
    } catch {}

    return jsonResponse({
      ok: true,
      response: json,
    });
  } catch (e: any) {
    const message = e?.message || "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

