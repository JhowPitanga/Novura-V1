// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { jsonResponse, handleOptions } from "../_shared/adapters/http-utils.ts";
import { createAdminClient } from "../_shared/adapters/supabase-client.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions();
  try {
    const { xml_url, xml_base64, filename, basic_token, company_id, emissao_ambiente } = await req.json();

    if (xml_base64 && typeof xml_base64 === "string" && xml_base64.length > 0) {
      const fname = String(filename || "nfe.xml");
      return jsonResponse({ content_base64: xml_base64, filename: fname });
    }

    if (!xml_url || typeof xml_url !== "string") {
      return jsonResponse({ error: "Missing xml_url or xml_base64" }, 400);
    }

    const headers: Record<string, string> = { Accept: "application/xml" };
    let finalBasic: string | undefined = undefined;
    if (basic_token && typeof basic_token === "string" && basic_token.length > 0) {
      finalBasic = basic_token;
    } else if (company_id) {
      try {
        const admin = createAdminClient() as any;
        const isHomolog = String(emissao_ambiente || "").toLowerCase().includes("homolog");
        const { data: company, error } = await admin.from("companies").select(isHomolog ? "focus_token_homologacao" : "focus_token_producao").eq("id", company_id).single();
        if (!error && company) {
          finalBasic = String((isHomolog ? company.focus_token_homologacao : company.focus_token_producao) || "");
        }
      } catch {}
    }
    if (finalBasic) {
      const basic = btoa(`${finalBasic}:`);
      headers["Authorization"] = `Basic ${basic}`;
    }

    const resp = await fetch(xml_url, { headers });
    if (!resp.ok) {
      const msg = await resp.text().catch(() => "");
      return jsonResponse({ error: "Fetch failed", status: resp.status, message: msg || null }, 200);
    }
    const xmlText = await resp.text();
    const b64 = btoa(xmlText);
    const fname = String(filename || "nfe.xml");
    return jsonResponse({ content_base64: b64, filename: fname }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
