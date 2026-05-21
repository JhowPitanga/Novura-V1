import { invokeFn } from '../shared/invokeFn';
import type { CategoryNode, CategorySuggestionDTO } from '../types';

/** Extracts category_list from Shopee API payload (nested under response/data). */
export function extractShopeeCategoryList(payload: any): any[] {
  if (!payload) return [];
  const api = payload?.data ?? payload;
  const resp = api?.response ?? api;
  if (Array.isArray(resp?.category_list)) return resp.category_list;
  if (Array.isArray(resp?.data?.category_list)) return resp.data.category_list;
  if (Array.isArray(api?.category_list)) return api.category_list;

  const vals = Object.values(resp || {}).filter((v) => Array.isArray(v)) as any[];
  const found = vals.find(
    (arr) => Array.isArray(arr) && arr.some((it: any) => typeof it === 'object' && ('category_id' in it || 'category_name' in it)),
  );
  return Array.isArray(found) ? found : [];
}

/** Builds roots + nameById map from flat Shopee category tree. */
export function buildShopeeCategoryTree(list: any[]): {
  shopeeCategoriesRaw: any[];
  roots: CategoryNode[];
  nameById: Record<string, string>;
} {
  const nameById: Record<string, string> = {};
  for (const c of list) {
    const key = String(c?.category_id ?? c?.id ?? '');
    const val = String(
      c?.display_category_name ?? c?.original_category_name ?? c?.category_name ?? '',
    );
    if (key) nameById[key] = val;
  }
  const roots: CategoryNode[] = list
    .filter((c: any) => Number(c?.parent_category_id || 0) === 0)
    .map((c: any) => ({
      id: String(c?.category_id || ''),
      name: String(
        c?.display_category_name ?? c?.original_category_name ?? c?.category_name ?? 'Categoria',
      ),
    }));
  return { shopeeCategoriesRaw: list, roots, nameById };
}

/** Parses shopee-categories-predict edge envelope (ok / error / data). */
export function parseShopeePredictEnvelope(
  data: any,
  invokeError?: any,
): { ok: boolean; errorCode?: string; errorMessage?: string; apiPayload?: any } {
  if (invokeError) {
    return {
      ok: false,
      errorCode: 'invoke_error',
      errorMessage: String(invokeError?.message || invokeError),
    };
  }

  const ok = data?.ok !== false;
  if (!ok) {
    const api = data?.data ?? {};
    const errorCode = String(
      data?.error ?? api?.error ?? api?.code ?? data?.status ?? '',
    );
    const errorMessage = String(
      api?.message ?? api?.msg ?? api?.error_info ?? data?.error ?? 'Erro na API Shopee',
    );
    return { ok: false, errorCode, errorMessage };
  }

  return { ok: true, apiPayload: data?.data ?? data };
}

export async function fetchShopeeCategoryTree(orgId: string): Promise<{
  shopeeCategoriesRaw: any[];
  roots: CategoryNode[];
  nameById: Record<string, string>;
}> {
  const { data, error } = await invokeFn('shopee-categories-predict', {
    organizationId: orgId,
    action: 'get_category',
    language: 'pt-br',
  });

  const envelope = parseShopeePredictEnvelope(data, error);
  if (!envelope.ok) {
    return { shopeeCategoriesRaw: [], roots: [], nameById: {} };
  }

  const list = extractShopeeCategoryList(envelope.apiPayload);
  return buildShopeeCategoryTree(list);
}

export async function fetchShopeeCategoryRecommendations(
  orgId: string,
  title: string,
): Promise<CategorySuggestionDTO> {
  const { data, error } = await invokeFn('shopee-categories-predict', {
    organizationId: orgId,
    title: title.trim(),
    action: 'recommend',
    language: 'pt-br',
  });

  const envelope = parseShopeePredictEnvelope(data, error);
  if (!envelope.ok) {
    return {
      suggestions: [],
      domainSuggestions: [],
      ok: false,
      errorCode: envelope.errorCode,
      errorMessage: envelope.errorMessage,
    };
  }

  const preds = extractShopeeCategoryList(envelope.apiPayload);
  const tree = await fetchShopeeCategoryTree(orgId);

  const suggestions = preds
    .map((c: any) => {
      const id = String(c?.category_id ?? c?.id ?? '');
      const name =
        tree.nameById[id] ||
        String(c?.category_name ?? c?.name ?? c?.display_category_name ?? '');
      return { category_id: id, category_name: name };
    })
    .filter((c) => c.category_id && c.category_name);

  return {
    suggestions,
    domainSuggestions: [],
    ok: true,
    shopeeCategoriesRaw: tree.shopeeCategoriesRaw,
    roots: tree.roots,
    nameById: tree.nameById,
  };
}
