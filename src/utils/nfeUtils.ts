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

export function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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
  switch (resolveNotaStatusKey(nota)) {
    case "authorized":
      return "Autorizada";
    case "pending":
      return "Pendente";
    case "processing":
      return "Processando";
    case "queued":
      return "Na fila";
    case "canceled":
      return "Cancelada";
    case "rejected":
      return "Rejeitada";
    case "error":
      return "Erro";
    default:
      return "Sem status";
  }
}

export function resolveNotaStatusKey(nota: any): string {
  const rawStatus = normalizeText(String(nota?.status || ""));
  const rawFocus = normalizeText(String(nota?.status_focus || ""));
  const candidates = [rawStatus, rawFocus].filter(Boolean);

  if (candidates.some((s) => ["authorized", "autorizado", "autorizada", "autorizado_uso"].includes(s))) {
    return "authorized";
  }
  if (candidates.some((s) => ["pending", "pendente"].includes(s))) {
    return "pending";
  }
  if (candidates.some((s) => ["processing", "processando", "processando_autorizacao"].includes(s))) {
    return "processing";
  }
  if (candidates.some((s) => ["queued", "emissao nf", "emissao_nf", "na fila"].includes(s))) {
    return "queued";
  }
  if (candidates.some((s) => ["canceled", "cancelado", "cancelada"].includes(s))) {
    return "canceled";
  }
  if (candidates.some((s) => ["rejected", "rejeitado", "rejeitada", "denegado", "denegada"].includes(s))) {
    return "rejected";
  }
  if (candidates.some((s) => ["error", "erro", "erro_autorizacao", "falha na emissao", "falha_na_emissao"].includes(s))) {
    return "error";
  }

  return rawStatus || rawFocus || "unknown";
}

export function resolveNotaValor(nota: any): number | undefined {
  if (typeof nota?.total_value === "number") return nota.total_value;
  try {
    const xmlText = nota?.xml_base64 ? atob(String(nota.xml_base64)) : "";
    return xmlText ? extractXmlTotal(xmlText) : undefined;
  } catch {}
  return undefined;
}
