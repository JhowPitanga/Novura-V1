import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import type { InvoiceRow } from "@/services/invoices.service";
import { extractXmlMeta, normalizeFocusUrl } from "@/utils/nfeUtils";

function resolveXmlFilename(nota: InvoiceRow): string {
  const nfeNumRaw = String(nota?.nfe_number || "").trim();
  const nfeKeyRaw = String(nota?.nfe_key || "").trim();
  return nfeNumRaw ? `nfe_${nfeNumRaw}` : (nfeKeyRaw ? `nfe_${nfeKeyRaw}` : "nfe");
}

function downloadBlob(content: string, filename: string, type = "application/xml") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openBase64Pdf(pdfBase64: string) {
  const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const objUrl = URL.createObjectURL(blob);
  window.open(objUrl, "_blank", "noopener,noreferrer");
}

export function openInvoicePdf(nota: InvoiceRow): boolean {
  const url = normalizeFocusUrl(String(nota?.pdf_url || ""));
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }

  const pdfB64 = String(nota?.pdf_base64 || "");
  if (!pdfB64) return false;

  try {
    openBase64Pdf(pdfB64);
    return true;
  } catch {
    return false;
  }
}

export async function downloadInvoiceXml(nota: InvoiceRow): Promise<boolean> {
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
    return true;
  }

  if (!directUrl) return false;

  const payload = {
    xml_url: directUrl,
    filename: `${base}.xml`,
    company_id: nota?.company_id,
    emissao_ambiente: nota?.emission_environment,
  };
  const { data: { session } } = await (supabase as any).auth.getSession();
  const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

  try {
    const res = await supabase.functions.invoke("download-nfe-xml", { body: payload, headers });
    const b64 = String((res.data as any)?.content_base64 || "");
    if (b64) {
      downloadBlob(atob(b64), `${base}.xml`);
      return true;
    }
  } catch {}

  try {
    const urlFn = `${SUPABASE_URL}/functions/v1/download-nfe-xml`;
    const resp = await fetch(urlFn, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    const b64 = String((data as any)?.content_base64 || "");
    if (!b64) return false;
    downloadBlob(atob(b64), `${base}.xml`);
    return true;
  } catch {
    return false;
  }
}

export async function downloadInvoiceXmlBatch(invoices: InvoiceRow[]): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;

  for (const invoice of invoices) {
    const ok = await downloadInvoiceXml(invoice);
    if (ok) success += 1;
    else failed += 1;
  }

  return { success, failed };
}
