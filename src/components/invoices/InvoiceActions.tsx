import { Download, Eye, RefreshCw, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { extractXmlMeta, normalizeFocusUrl } from "@/utils/nfeUtils";

async function getAuthContext() {
  const { data: { session } } = await (supabase as any).auth.getSession();
  const token: string | undefined = session?.access_token;
  if (!token) return null;
  let organizationId: string | null = null;
  try {
    const { data: orgId } = await (supabase as any).rpc('get_current_user_organization_id');
    organizationId = (Array.isArray(orgId) ? orgId?.[0] : orgId) || null;
  } catch {}
  if (!organizationId) return null;
  return { token, organizationId, session };
}

async function resolveCompanyId(nota: any, organizationId: string): Promise<string> {
  let companyId = String(nota?.company_id || "");
  if (!companyId) {
    try {
      const { data: companiesForOrg } = await (supabase as any)
        .from('companies')
        .select('id')
        .eq('organization_id', organizationId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1);
      companyId = Array.isArray(companiesForOrg) && companiesForOrg.length > 0 ? String(companiesForOrg[0].id) : "";
    } catch {}
  }
  return companyId;
}

async function resolveOrderId(nota: any, organizationId: string): Promise<string> {
  let orderId = String(nota?.order_id || "");
  if (!orderId) {
    const mpOrderId = String(nota?.marketplace_order_id || "").trim();
    if (mpOrderId) {
      try {
        const { data: row } = await (supabase as any)
          .from('marketplace_orders_presented_new')
          .select('id')
          .eq('organizations_id', organizationId)
          .eq('marketplace_order_id', mpOrderId)
          .limit(1)
          .maybeSingle();
        if ((row as any)?.id) orderId = String((row as any).id);
      } catch {}
    }
  }
  return orderId;
}

async function handleCancelNfe(nota: any) {
  try {
    const justificativa = window.prompt("Justificativa do cancelamento (15 a 255 caracteres):", "");
    if (!justificativa) return;
    const j = justificativa.trim();
    if (j.length < 15 || j.length > 255) return;
    const ctx = await getAuthContext();
    if (!ctx) return;
    const companyId = await resolveCompanyId(nota, ctx.organizationId);
    if (!companyId) return;
    const orderId = await resolveOrderId(nota, ctx.organizationId);
    if (!orderId) return;
    const envSel = String(nota?.emissao_ambiente || "").toLowerCase() || "homologacao";
    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${ctx.token}` };
    const { data, error } = await (supabase as any).functions.invoke('focus-nfe-cancel', {
      body: { organizationId: ctx.organizationId, companyId, orderId, environment: envSel, justificativa: j },
      headers,
    } as any);
    if (!error && data && data.ok) {
      try { nota.status_focus = "cancelado"; } catch {}
    }
  } catch {}
}

async function handleSyncNfe(nota: any) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return;
    const companyId = await resolveCompanyId(nota, ctx.organizationId);
    if (!companyId) return;
    const orderId = await resolveOrderId(nota, ctx.organizationId);
    if (!orderId) return;
    const envSel = String(nota?.emissao_ambiente || "").toLowerCase() || "homologacao";
    const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${ctx.token}` };
    await (supabase as any).functions.invoke('focus-nfe-sync', {
      body: { organizationId: ctx.organizationId, companyId, orderIds: [orderId], environment: envSel },
      headers,
    } as any);
  } catch {}
}

function handleViewPdf(nota: any) {
  const url = String(nota?.pdf_url || "");
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const pdfB64 = String(nota?.pdf_base64 || "");
    if (!pdfB64) return;
    const pdfBytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const objUrl = URL.createObjectURL(blob);
    window.open(objUrl, "_blank", "noopener,noreferrer");
  } catch {}
}

function resolveXmlFilename(nota: any): string {
  const nfeNumRaw = String(nota?.nfe_number || "").trim();
  const nfeKeyRaw = String(nota?.nfe_key || "").trim();
  return nfeNumRaw ? `nfe_${nfeNumRaw}` : (nfeKeyRaw ? `nfe_${nfeKeyRaw}` : "nfe");
}

function downloadBlob(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleDownloadXml(nota: any) {
  try {
    const xmlB64 = String(nota?.xml_base64 || "");
    const linksMeta: any = nota?.marketplace_submission_response || null;
    const directUrl = normalizeFocusUrl(String(nota?.xml_url || (linksMeta?.links?.caminho_xml ?? linksMeta?.caminho_xml) || ""));
    let base = resolveXmlFilename(nota);

    if (xmlB64) {
      const xmlText = atob(xmlB64);
      if (base === "nfe") {
        const meta = extractXmlMeta(xmlText);
        const nfeNum = String(meta.nfeNumber || "").trim();
        const nfeKey = String(meta.nfeKey || "").trim();
        base = nfeNum ? `nfe_${nfeNum}` : (nfeKey ? `nfe_${nfeKey}` : "nfe");
      }
      downloadBlob(xmlText, `${base}.xml`);
      return;
    }

    if (directUrl) {
      const payload = { xml_url: directUrl, filename: `${base}.xml`, company_id: nota?.company_id, emissao_ambiente: nota?.emissao_ambiente };
      const { data: { session } } = await (supabase as any).auth.getSession();
      const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      try {
        const res = await supabase.functions.invoke("download-nfe-xml", { body: payload, headers });
        const b64 = String((res.data as any)?.content_base64 || "");
        if (b64) {
          downloadBlob(atob(b64), `${base}.xml`);
          return;
        }
        throw new Error("no_b64");
      } catch {
        try {
          const urlFn = `${SUPABASE_URL}/functions/v1/download-nfe-xml`;
          let resp = await fetch(urlFn, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
            body: JSON.stringify(payload),
          });
          if (!resp.ok) {
            resp = await fetch(urlFn, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(payload),
            });
          }
          const data = await resp.json().catch(() => ({}));
          const b64 = String((data as any)?.content_base64 || "");
          if (!b64) return;
          downloadBlob(atob(b64), `${base}.xml`);
        } catch {}
      }
    }
  } catch {}
}

interface InvoiceActionsProps {
  nota: any;
  showCancel?: boolean;
}

export function InvoiceActions({ nota, showCancel = true }: InvoiceActionsProps) {
  const isAutorizado = String(nota?.status_focus || "").toLowerCase() === "autorizado";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {showCancel && isAutorizado && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCancelNfe(nota); }}>
            Cancelar NF-e
          </DropdownMenuItem>
        )}
        {showCancel && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleSyncNfe(nota); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sincronizar
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleViewPdf(nota); }}>
          <Eye className="w-4 h-4 mr-2" />
          Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDownloadXml(nota); }}>
          <Download className="w-4 h-4 mr-2" />
          Download XML
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
