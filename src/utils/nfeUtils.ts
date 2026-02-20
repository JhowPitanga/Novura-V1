export function extractXmlMeta(xml: string): { nfeNumber?: string; nfeKey?: string } {
  let nfeNumber: string | undefined = undefined;
  let nfeKey: string | undefined = undefined;
  try {
    const m = xml.match(/<nNF>(\d+)<\/nNF>/);
    if (m && m[1]) nfeNumber = m[1];
  } catch {}
  try {
    const m2 = xml.match(/Id="NFe(\d{44})"/);
    if (m2 && m2[1]) nfeKey = m2[1];
  } catch {}
  if (!nfeKey) {
    try {
      const m3 = xml.match(/<chNFe>(\d{44})<\/chNFe>/);
      if (m3 && m3[1]) nfeKey = m3[1];
    } catch {}
  }
  return { nfeNumber, nfeKey };
}

export function extractXmlTotal(xml: string): number | undefined {
  try {
    const m = xml.match(/<vNF>([\d.,]+)<\/vNF>/);
    if (m && m[1]) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      const num = parseFloat(raw);
      return isNaN(num) ? undefined : num;
    }
  } catch {}
  return undefined;
}

export function normalizeTipo(tipoRaw: string): string {
  const t = String(tipoRaw || "").trim().toLowerCase();
  if (t === "saida" || t === "saída") return "Saída";
  if (t === "entrada") return "Entrada";
  if (t === "compra") return "Compra";
  return tipoRaw || "-";
}

export function padLeftNum(value: string | number, size: number): string {
  const s = String(value ?? "").replace(/\D/g, "");
  if (!s) return "".padStart(size, "0");
  return s.padStart(size, "0");
}

export function normalizeFocusUrl(path: string | null | undefined): string {
  const p = String(path || "").trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  try {
    const base = new URL("https://api.focusnfe.com.br/");
    return new URL(p, base).toString();
  } catch {
    return p;
  }
}

export function resolveNotaStatusLabel(nota: any): string {
  const sf = String(nota?.status_focus || "").toLowerCase();
  const ss = String(nota?.status || "").toLowerCase();
  if (ss === "cancelada" || ss === "cancelado") return "Cancelada";
  if (sf === "autorizado") return "Autorizada";
  if (sf === "pendente") return "Pendente";
  if (sf === "cancelada" || sf === "cancelado") return "Cancelada";
  if (ss) return ss.charAt(0).toUpperCase() + ss.slice(1);
  return sf || "";
}

export function resolveNotaValor(nota: any): number | undefined {
  if (typeof nota?.total_value === "number") return nota.total_value;
  try {
    const xmlText = nota?.xml_base64 ? atob(String(nota.xml_base64)) : "";
    return xmlText ? extractXmlTotal(xmlText) : undefined;
  } catch {}
  return undefined;
}
