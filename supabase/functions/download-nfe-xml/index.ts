// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(req?: Request, extra: Record<string, string> = {}) {
  const requested = req?.headers.get("access-control-request-headers");
  const allowHeaders = requested || "authorization, x-client-info, apikey, content-type";
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}

function json(req: Request, body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders(req) } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const { xml_url, xml_base64, filename, basic_token, company_id, emissao_ambiente } = await req.json();

    if (xml_base64 && typeof xml_base64 === "string" && xml_base64.length > 0) {
      const fname = String(filename || "nfe.xml");
      return json(req, { content_base64: xml_base64, filename: fname });
    }

    if (!xml_url || typeof xml_url !== "string") {
      return json(req, { error: "Missing xml_url or xml_base64" }, 400);
    }

    const headers: Record<string, string> = { Accept: "application/xml" };
    let finalBasic: string | undefined = undefined;
    if (basic_token && typeof basic_token === "string" && basic_token.length > 0) {
      finalBasic = basic_token;
    } else if (company_id) {
      try {
        const url = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(url, serviceKey) as any;
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
      return json(req, { error: "Fetch failed", status: resp.status, message: msg || null }, 200);
    }
    const xmlText = await resp.text();
    const b64 = btoa(xmlText);
    const fname = String(filename || "nfe.xml");
    return json(req, { content_base64: b64, filename: fname }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(req, { error: msg }, 500);
  }
});
