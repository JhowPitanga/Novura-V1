import { invokeFn } from '../shared/invokeFn';
import type { CategorySuggestionDTO } from '../types';

/** Parses mercado-livre-categories-predict edge function response. */
export function parseMLPredictResponse(data: any): CategorySuggestionDTO {
  if (!data || data.error) {
    const msg = String(data?.error || data?.meli?.message || 'Falha ao prever categorias');
    throw new Error(msg);
  }

  const rawPredictions = Array.isArray(data?.predictions) ? data.predictions : [];
  const domainSuggestions = Array.isArray(data?.domain_discovery) ? data.domain_discovery : [];

  // Edge fn wraps single predictor result as [json] when path_from_root exists
  const suggestions = rawPredictions.map((item: any) => {
    const path = Array.isArray(item?.path_from_root) ? item.path_from_root : [];
    const leaf = path.length > 0 ? path[path.length - 1] : null;
    return {
      category_id: String(leaf?.id || item?.id || item?.category_id || ''),
      category_name: String(leaf?.name || item?.name || item?.category_name || 'Categoria'),
      path_from_root: path,
    };
  }).filter((s) => s.category_id);

  return { suggestions, domainSuggestions };
}

export async function fetchMLCategoryPredictions(
  orgId: string,
  title: string,
  siteId: string,
): Promise<CategorySuggestionDTO> {
  const { data, error } = await invokeFn('mercado-livre-categories-predict', {
    organizationId: orgId,
    siteId,
    title: title.trim(),
  });

  if (error) {
    throw error instanceof Error ? error : new Error(String(error?.message || error));
  }

  return parseMLPredictResponse(data);
}
