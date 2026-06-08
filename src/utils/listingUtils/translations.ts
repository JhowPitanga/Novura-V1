export function translateSuggestion(text: string): string {
  const s = String(text || "").trim();
  const l = s.toLowerCase();
  const mImg = l.match(/add at least\s*(\d+)\s*images/);
  if (mImg) return `Adicionar pelo menos ${mImg[1]} imagens`;
  const mAttr = l.match(/add at least\s*(\d+)\s*attributes/);
  if (mAttr) return `Adicionar pelo menos ${mAttr[1]} atributos`;
  if (l.includes("add brand info")) return "Adicionar informações de marca";
  if (l.includes("adopt suggested category")) return "Adotar categoria sugerida";
  if (l.includes("add size chart")) return "Adicionar tabela de medidas";
  if (l.includes("adopt the color or size variation")) return "Adotar variações de cor ou tamanho";
  if (l.includes("add at least 100 characters or 1 image for desc"))
    return "Adicionar ao menos 100 caracteres ou 1 imagem na descrição";
  if (l.includes("add characters for name to 25~100")) return "Ajustar nome para 25 a 100 caracteres";
  if (l.includes("adopt suggested weight")) return "Adotar peso sugerido";
  if (l.includes("add video")) return "Adicionar vídeo";
  const tokens: Record<string, string> = {
    "add ": "Adicionar ",
    "adopt ": "Adotar ",
    brand: "marca",
    info: "informações",
    category: "categoria",
    color: "cor",
    size: "tamanho",
    variation: "variação",
    weight: "peso",
    images: "imagens",
    attributes: "atributos",
    video: "vídeo",
    desc: "descrição",
    characters: "caracteres",
    name: "nome",
    chart: "tabela",
  };
  let out = s;
  Object.keys(tokens).forEach((k) => {
    out = out.replace(new RegExp(k, "ig"), tokens[k]);
  });
  return out;
}

export function getImprovementSuggestions(pd: any): string[] {
  const tasks = Array.isArray(pd?.unfinished_task) ? pd.unfinished_task : [];
  return tasks
    .map((t: any) => translateSuggestion(String(t?.suggestion || "")))
    .filter((x: string) => x && x.trim().length > 0);
}

export function translatePauseReason(reason: string | null | undefined): string {
  const r = String(reason || "").toLowerCase();
  if (!r) return "Pausado pelo seller";
  if (r.includes("out_of_stock") || r.includes("no_stock") || r.includes("stock"))
    return "Sem estoque";
  if (r.includes("under_review") || r.includes("review")) return "Em análise";
  if (r.includes("waiting") || r.includes("payment")) return "Pagamento pendente";
  if (r.includes("dispute")) return "Em disputa";
  if (r.includes("violation") || r.includes("policy")) return "Violação de política";
  if (r.includes("claim")) return "Reclamações";
  if (r.includes("expired") || r.includes("out_of_date")) return "Expirado";
  if (r.includes("closed_by_user") || r.includes("closed")) return "Fechado pelo vendedor";
  if (r.includes("inactive")) return "Inativo";
  return "Pausado pelo seller";
}

export function toPublicationLabel(listingTypeId?: string | null): string | null {
  const s = String(listingTypeId || "").toLowerCase();
  if (!s) return null;
  if (s.includes("gold_pro") || s.includes("pro")) return "Premium";
  if (s.includes("gold_special") || s.includes("gold") || s === "silver") return "Clássico";
  if (s === "free") return "Grátis";
  return "Outro";
}

/** Splits title into two display lines of max 30 chars each */
export function getTitleLines(full: string): { line1: string; line2: string } {
  const title = String(full || "").slice(0, 60).trim();
  if (title.length <= 30) return { line1: title, line2: "" };
  const firstPart = title.slice(0, 30);
  const lastSpace = firstPart.lastIndexOf(" ");
  const cut = lastSpace > 15 ? lastSpace : 30;
  return {
    line1: title.slice(0, cut).trim(),
    line2: title.slice(cut).trim().slice(0, 30),
  };
}
