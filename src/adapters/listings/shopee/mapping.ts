import type { AdapterError } from '../types';

// ─── Error → Step mapping for Shopee ─────────────────────────────────────────
// Steps (create): 1=Marketplace, 2=Título/Categoria, 3=Atributos+Mídia, 4=Variações,
//                 5=Ficha Técnica, 6=Preço, 7=Envio, 8=Revisão

export function mapShopeeErrorToStep(error: AdapterError): { stepId: number; field: string } {
  const merged = [error.message, ...(error.causes || [])].join(' \n ').toLowerCase();
  const find = (kw: string | RegExp) =>
    typeof kw === 'string' ? merged.includes(kw.toLowerCase()) : kw.test(merged);

  if (find(/categor(y|ia)/i)) return { stepId: 2, field: 'Categoria' };
  if (find(/title|título|item_name/i)) return { stepId: 2, field: 'Título' };
  if (find(/description|descri[cç][aã]o/i)) return { stepId: 3, field: 'Descrição' };
  if (find(/image|foto|imagem/i)) return { stepId: 3, field: 'Imagens' };
  if (find(/attribute|atributo/i) && !find(/variation|varia[cç][aã]o/i)) return { stepId: 3, field: 'Atributos' };
  if (find(/tier[_-]?variation|model[_-]?list|variation|varia[cç][aã]o/i)) return { stepId: 4, field: 'Variações' };
  if (find(/price|pre[cç]o/i)) return { stepId: 6, field: 'Preço' };
  if (find(/weight|peso|dimension|dimens[oõ]es|package|pacote/i)) return { stepId: 7, field: 'Envio e dimensões' };
  if (find(/stock|estoque|quantity|quantidade/i)) return { stepId: 4, field: 'Estoque da variação' };
  return { stepId: 8, field: 'Revisão' };
}
