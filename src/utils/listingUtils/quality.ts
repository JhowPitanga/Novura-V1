export function getQualityStrokeColor(level?: any): string {
  if (typeof level === "number") {
    if (level === 1) return "#EF4444";
    if (level === 2) return "#F59E0B";
    if (level === 3) return "#7C3AED";
    return "#6B7280";
  }
  const s = String(level || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "1" || s.includes("bas") || s === "to_be_improved" || s === "low" || s === "incomplete")
    return "#EF4444";
  if (s === "2" || s.includes("satis") || s === "qualified" || s === "good" || s === "medium")
    return "#F59E0B";
  if (s === "3" || s.includes("prof") || s === "excellent") return "#7C3AED";
  return "#6B7280";
}

export function getQualityLabel(level?: any): string {
  if (typeof level === "number") {
    if (level === 1) return "Precisa de Melhoria";
    if (level === 2) return "Qualificado";
    if (level === 3) return "Excelente";
  }
  const s = String(level || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "1" || s.includes("bas") || s === "to_be_improved" || s === "low" || s === "incomplete")
    return "Precisa de Melhoria";
  if (s === "2" || s.includes("satis") || s === "qualified" || s === "good" || s === "medium")
    return "Qualificado";
  if (s === "3" || s.includes("prof") || s === "excellent") return "Excelente";
  return "";
}

/** Maps canonical enum (or Shopee numeric tier) to gauge display tier 1|2|3. */
export function qualityLevelForGauge(
  level: string | number | null | undefined,
  marketplace?: string,
): number | string | null {
  if (level == null) return null;
  const mkt = String(marketplace || "").toLowerCase();
  const num = typeof level === "number" ? level : Number(level);
  if (Number.isFinite(num) && num >= 1 && num <= 3) return num;
  const s = String(level).toLowerCase();
  if (mkt.includes("shopee")) {
    if (s === "excellent") return 3;
    if (s === "good" || s === "medium") return 2;
    if (s === "low" || s === "incomplete") return 1;
  }
  return level;
}

export function extractPerformanceHints(pd: any, ad: any): string[] {
  const hints: string[] = [];
  try {
    if (pd && Array.isArray(pd?.missing_fields) && pd.missing_fields.length) {
      hints.push(`Preencher campos: ${pd.missing_fields.join(", ")}`);
    }
    const recs = Array.isArray(pd?.recommendations) ? pd.recommendations : [];
    recs.slice(0, 3).forEach((r: any) => {
      const t = typeof r === "string" ? r : r?.text || r?.title || r?.message || "";
      if (t) hints.push(t);
    });
    const actions = Array.isArray(pd?.actions) ? pd.actions : [];
    actions.slice(0, 3).forEach((a: any) => {
      const t = typeof a === "string" ? a : a?.text || a?.title || a?.message || "";
      if (t) hints.push(t);
    });
  } catch {}
  try {
    const titleLen = Number(ad?.titleLength) || 0;
    const pictures = Number(ad?.pictureCount) || 0;
    const hasVideo = !!ad?.hasVideo;
    const attrs = Number(ad?.attributeCount) || 0;
    const descLen = Number(ad?.descriptionLength) || 0;
    const freeShip = !!ad?.freeShipping;
    const qualityLevel = String(ad?.qualityLevel || "").toLowerCase();
    const quality = Number(ad?.quality) || 0;
    if (titleLen && titleLen < 45) hints.push("Aumente o título com palavras-chave e atributos.");
    if (pictures < 3) hints.push("Adicione mais fotos (mínimo 3) com diferentes ângulos.");
    if (!hasVideo) hints.push("Inclua um vídeo curto demonstrando o produto.");
    if (attrs < 4) hints.push("Preencha atributos importantes (cor, tamanho, marca, etc.).");
    if (!freeShip) hints.push("Considere oferecer frete grátis para aumentar conversão.");
    if (descLen < 200) hints.push("Amplie a descrição com benefícios e especificações.");
    if (quality < 80 || qualityLevel.includes("bás") || qualityLevel.includes("satis")) {
      hints.push("Siga as recomendações do ML para alcançar nível profissional.");
    }
  } catch {}
  return Array.from(new Set(hints.filter(Boolean))).slice(0, 5);
}
